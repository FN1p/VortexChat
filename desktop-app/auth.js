const fs = require('node:fs');
const path = require('node:path');

class TwitchAuth {
  constructor({ directory, safeStorage, fetchImpl = fetch, notify = () => {} }) {
    this.file = path.join(directory, 'twitch-auth.json');
    this.safeStorage = safeStorage;
    this.fetch = fetchImpl;
    this.notify = notify;
    this.session = null;
    this.clientId = '';
    this.pendingId = 0;
    this.userIds = new Map();
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.clientId = /^[a-z0-9]{10,80}$/i.test(saved.clientId) ? saved.clientId : '';
      if (saved.encrypted && this.safeStorage.isEncryptionAvailable()) {
        const decoded = this.safeStorage.decryptString(Buffer.from(saved.encrypted, 'base64'));
        const session = JSON.parse(decoded);
        if (session.accessToken && session.refreshToken && session.userId && session.login) this.session = session;
      }
    } catch { /* First run or unreadable credentials. */ }
  }

  save() {
    const payload = { clientId: this.clientId };
    if (this.session && this.safeStorage.isEncryptionAvailable()) {
      payload.encrypted = this.safeStorage.encryptString(JSON.stringify(this.session)).toString('base64');
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(payload), { mode: 0o600 });
  }

  status() {
    return { connected: Boolean(this.session), login: this.session?.login || '', clientId: this.clientId };
  }

  async request(url, options = {}) {
    const response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async validate() {
    if (!this.session) return this.status();
    try {
      const { response, data } = await this.request('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `Bearer ${this.session.accessToken}` }
      });
      if (response.status === 401) {
        await this.refresh();
      } else if (response.ok && data.client_id === this.clientId && data.user_id === this.session.userId) {
        this.session.login = data.login;
        this.save();
      } else if (response.ok) {
        this.logout();
      }
    } catch { /* Keep local credentials while offline. */ }
    this.notify('auth-changed', this.status());
    return this.status();
  }

  async startDeviceLogin(clientId) {
    if (!/^[a-z0-9]{10,80}$/i.test(clientId)) throw new Error('Введите корректный Twitch Client ID');
    this.pendingId++;
    this.clientId = clientId;
    this.save();
    const body = new URLSearchParams({ client_id: clientId, scopes: 'user:write:chat' });
    const { response, data } = await this.request('https://id.twitch.tv/oauth2/device', { method: 'POST', body });
    if (!response.ok || !data.device_code || !data.user_code || !data.verification_uri) {
      throw new Error(data.message || 'Twitch не выдал код входа');
    }
    const url = new URL(data.verification_uri);
    if (url.protocol !== 'https:' || url.hostname !== 'www.twitch.tv' || !url.pathname.startsWith('/activate')) {
      throw new Error('Twitch вернул неизвестный адрес входа');
    }
    const pendingId = this.pendingId;
    this.pollDevice(clientId, data, pendingId).catch(error => {
      if (pendingId === this.pendingId) this.notify('auth-error', error.message);
    });
    return { code: data.user_code, url: url.toString(), expiresIn: data.expires_in };
  }

  async pollDevice(clientId, device, pendingId) {
    const expiresAt = Date.now() + Math.min(Number(device.expires_in) || 1800, 1800) * 1000;
    let interval = Math.max(5, Number(device.interval) || 5) * 1000;
    while (pendingId === this.pendingId && Date.now() < expiresAt) {
      await new Promise(resolve => setTimeout(resolve, interval));
      if (pendingId !== this.pendingId) return;
      const body = new URLSearchParams({ client_id: clientId, device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      const { response, data } = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
      if (data.message === 'authorization_pending') continue;
      if (data.message === 'slow_down') { interval += 5000; continue; }
      if (!response.ok || !data.access_token || !data.refresh_token) throw new Error(data.message || 'Не удалось войти в Twitch');
      const identity = await this.validateToken(data.access_token, clientId);
      if (pendingId !== this.pendingId) return;
      this.session = { accessToken: data.access_token, refreshToken: data.refresh_token,
        userId: identity.user_id, login: identity.login };
      this.save();
      this.notify('auth-changed', this.status());
      return;
    }
    if (pendingId === this.pendingId) throw new Error('Время входа истекло. Попробуйте ещё раз.');
  }

  async validateToken(token, clientId) {
    const { response, data } = await this.request('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok || data.client_id !== clientId || !data.user_id || !data.login ||
      !data.scopes?.includes('user:write:chat')) throw new Error('Twitch не подтвердил доступ к отправке чата');
    return data;
  }

  async refresh() {
    if (!this.session?.refreshToken) throw new Error('Требуется повторный вход в Twitch');
    const body = new URLSearchParams({ client_id: this.clientId, grant_type: 'refresh_token',
      refresh_token: this.session.refreshToken });
    const { response, data } = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
    if (!response.ok || !data.access_token || !data.refresh_token) {
      this.logout();
      throw new Error('Сессия Twitch истекла. Войдите снова.');
    }
    const identity = await this.validateToken(data.access_token, this.clientId);
    this.session = { accessToken: data.access_token, refreshToken: data.refresh_token,
      userId: identity.user_id, login: identity.login };
    this.save();
    this.notify('auth-changed', this.status());
  }

  logout() {
    this.pendingId++;
    this.session = null;
    this.userIds.clear();
    this.save();
    this.notify('auth-changed', this.status());
  }

  async authorizedRequest(url, options = {}, retry = true) {
    if (!this.session) throw new Error('Войдите в Twitch');
    const { response, data } = await this.request(url, {
      ...options, headers: { ...options.headers, Authorization: `Bearer ${this.session.accessToken}`,
        'Client-Id': this.clientId }
    });
    if (response.status === 401 && retry) {
      await this.refresh();
      return this.authorizedRequest(url, options, false);
    }
    if (!response.ok) throw new Error(data.message || `Ошибка Twitch ${response.status}`);
    return data;
  }

  async sendMessage(channel, message) {
    if (!/^[a-z0-9_]{3,25}$/.test(channel)) throw new Error('Неверное имя канала');
    if (typeof message !== 'string' || !message.trim() || message.length > 500 || /[\r\n]/.test(message)) {
      throw new Error('Сообщение должно содержать от 1 до 500 символов без переносов');
    }
    let broadcasterId = this.userIds.get(channel);
    if (!broadcasterId) {
      const user = await this.authorizedRequest(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`);
      broadcasterId = user.data?.[0]?.id;
      if (!broadcasterId) throw new Error('Канал Twitch не найден');
      this.userIds.set(channel, broadcasterId);
    }
    const result = await this.authorizedRequest('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: this.session.userId, message: message.trim() })
    });
    const sent = result.data?.[0];
    if (!sent?.is_sent) throw new Error(sent?.drop_reason?.message || 'Twitch отклонил сообщение');
    return { messageId: sent.message_id };
  }
}

module.exports = { TwitchAuth };
