/**
 * VortexChat Desktop — Twitch IRC Client, 7TV v3 / BTTV / FFZ Emote Resolver & Multi-Split Controller
 * Разработано студией PFT Studio
 */

class VortexChatDesktopClient {
  constructor() {
    this.ws = null;
    const saved = this.readPreferences();
    this.channels = saved.channels;
    this.activeChannel = saved.activeChannel;
    this.settings = saved.settings;
    this.emotesCache = new Map();
    this.channelEmotes = new Map();
    this.messageHistory = new Map();
    this.auth = { connected: false, login: '', clientId: '' };
    this.paused = false;
    this.unread = new Map();
    this.isPinned = false;
    this.reconnectTimer = null;
    this.pingTimer = null;

    this.globalBadges = {
      broadcaster: { title: 'Стример', url: 'https://static-cdn.jtvnw.net/badges/v1/5527c08c-d341-4003-9691-e2b3003c4221/2' },
      moderator: { title: 'Модератор', url: 'https://static-cdn.jtvnw.net/badges/v1/32685ec2-acf8-42e0-b747-e88e9ffc139e/2' },
      vip: { title: 'VIP', url: 'https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/2' },
      founder: { title: 'Основатель канала', url: 'https://static-cdn.jtvnw.net/badges/v1/511b78a9-037b-42b4-b44c-2236a2872659/2' },
      subscriber: { title: 'Подписчик', url: 'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2aa4b60e408d/2' },
      partner: { title: 'Партнер Twitch', url: 'https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/2' },
      turbo: { title: 'Twitch Turbo', url: 'https://static-cdn.jtvnw.net/badges/v1/9384c43f-4ce7-4e94-b2a1-3875617c4e49/2' },
      premium: { title: 'Prime Gaming', url: 'https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a98a-422e-ac7a-33758b975005/2' },
      bits: { title: 'Bits', url: 'https://static-cdn.jtvnw.net/badges/v1/73b5c3fb-245e-4f5c-bac5-bdae84d76049/2' }
    };

    this.initUI();
    this.initAuth();
    this.initTwitchIRC();
    this.loadGlobalEmotes();
  }

  readPreferences() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem('vortexDesktopSettings') || '{}'); } catch { /* Ignore invalid settings. */ }
    const channels = Array.isArray(data.channels) ? [...new Set(data.channels.filter(value =>
      typeof value === 'string' && /^[a-z0-9_]{3,25}$/.test(value)))].slice(0, 12) : [];
    if (!channels.length) channels.push('xqc');
    const settings = { fontSize: Math.max(11, Math.min(22, Number(data.settings?.fontSize) || 13)),
      theme: ['aurora', 'graphite', 'orchid'].includes(data.settings?.theme) ? data.settings.theme : 'aurora',
      compact: data.settings?.compact === true, timestamps: data.settings?.timestamps !== false,
      highlights: typeof data.settings?.highlights === 'string' ? data.settings.highlights.slice(0, 300) : '' };
    return { channels, activeChannel: channels.includes(data.activeChannel) ? data.activeChannel : channels[0], settings };
  }

  savePreferences() {
    localStorage.setItem('vortexDesktopSettings', JSON.stringify({ channels: this.channels,
      activeChannel: this.activeChannel, settings: this.settings }));
  }

  initUI() {
    this.renderTabs();
    this.renderSplits();
    this.applySettings();
    document.getElementById('chat-search')?.addEventListener('input', () => this.applySearch());
    document.getElementById('btn-pause')?.addEventListener('click', () => {
      this.paused = !this.paused;
      document.getElementById('btn-pause').setAttribute('aria-pressed', String(this.paused));
      document.getElementById('btn-pause').textContent = this.paused ? 'Продолжить' : 'Пауза';
      document.querySelectorAll('.chat-split').forEach(split => split.classList.toggle('paused', this.paused));
      if (!this.paused) {
        document.querySelectorAll('.messages-container').forEach(container => { container.scrollTop = container.scrollHeight; });
        this.unread.clear();
        this.updateUnread();
      }
    });
    document.getElementById('btn-settings')?.addEventListener('click', () => document.getElementById('settings-dialog').showModal());
    for (const [id, key] of [['setting-theme', 'theme'], ['setting-font', 'fontSize'], ['setting-compact', 'compact'],
      ['setting-timestamps', 'timestamps'], ['setting-highlights', 'highlights']]) {
      document.getElementById(id)?.addEventListener(id === 'setting-font' ? 'input' : 'change', event => {
        this.settings[key] = event.target.type === 'checkbox' ? event.target.checked :
          event.target.type === 'range' ? Number(event.target.value) : event.target.value;
        this.applySettings();
        this.savePreferences();
      });
    }

    document.getElementById('btn-minimize')?.addEventListener('click', () => {
      window.electronAPI?.minimize();
    });

    document.getElementById('btn-maximize')?.addEventListener('click', () => {
      window.electronAPI?.maximize();
    });

    document.getElementById('btn-close')?.addEventListener('click', () => {
      window.electronAPI?.close();
    });

    const pinBtn = document.getElementById('btn-pin');
    pinBtn?.addEventListener('click', () => {
      this.isPinned = !this.isPinned;
      window.electronAPI?.toggleAlwaysOnTop(this.isPinned);
      pinBtn.classList.toggle('pinned', this.isPinned);
    });

    window.electronAPI?.onAlwaysOnTopChanged((state) => {
      this.isPinned = state;
      pinBtn?.classList.toggle('pinned', state);
    });

    window.electronAPI?.onObsServerError((code) => {
      this.showToast(`OBS-сервер недоступен: порт 5222 (${code})`);
    });

    document.getElementById('btn-obs-link')?.addEventListener('click', () => {
      const obsUrl = `http://127.0.0.1:5222/overlay?channel=${this.activeChannel}&fade=15&fontSize=16`;
      window.electronAPI?.copyText(obsUrl);
      this.showToast(`Ссылка OBS скопирована: ${obsUrl}`);
    });

    const channelForm = document.getElementById('add-channel-form');
    const channelInput = document.getElementById('new-channel');
    document.getElementById('btn-add-tab')?.addEventListener('click', () => {
      channelForm.hidden = !channelForm.hidden;
      if (!channelForm.hidden) channelInput.focus();
    });
    document.getElementById('cancel-channel')?.addEventListener('click', () => { channelForm.hidden = true; });
    channelForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const channel = channelInput.value.trim().replace(/^#/, '').toLowerCase();
      if (this.addChannel(channel)) {
        channelInput.value = '';
        channelForm.hidden = true;
      }
    });
    channelForm?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') channelForm.hidden = true;
    });
  }

  applySettings() {
    document.documentElement.dataset.theme = this.settings.theme;
    document.body.classList.toggle('compact', this.settings.compact);
    document.body.classList.toggle('hide-times', !this.settings.timestamps);
    document.querySelectorAll('.messages-container').forEach(container => {
      container.style.fontSize = `${this.settings.fontSize}px`;
    });
    document.getElementById('setting-font').value = this.settings.fontSize;
    document.getElementById('setting-theme').value = this.settings.theme;
    document.getElementById('setting-font-value').textContent = `${this.settings.fontSize} px`;
    document.getElementById('setting-compact').checked = this.settings.compact;
    document.getElementById('setting-timestamps').checked = this.settings.timestamps;
    document.getElementById('setting-highlights').value = this.settings.highlights;
    document.querySelectorAll('.message-line').forEach(line => this.applyHighlight(line));
  }

  applyHighlight(line) {
    const words = this.settings.highlights.split(',').map(word => word.trim().toLocaleLowerCase()).filter(Boolean);
    const text = (line.dataset.messageText || '').toLocaleLowerCase();
    const author = (line.dataset.author || '').toLocaleLowerCase();
    line.classList.toggle('highlighted', words.some(word => text.includes(word) || author === word.replace(/^@/, '')));
  }

  applySearch(target = null) {
    const query = document.getElementById('chat-search').value.trim().toLocaleLowerCase();
    (target ? [target] : document.querySelectorAll('.message-line')).forEach(line => {
      line.classList.toggle('search-hidden', Boolean(query) &&
        !(line.dataset.messageText || '').toLocaleLowerCase().includes(query) &&
        !(line.dataset.author || '').toLocaleLowerCase().includes(query));
    });
  }

  updateUnread() {
    document.querySelectorAll('.chat-split').forEach(split => {
      const badge = split.querySelector('.split-unread');
      if (badge) badge.textContent = this.unread.get(split.id.slice(6)) ? `+${this.unread.get(split.id.slice(6))}` : '';
    });
  }

  async initAuth() {
    const dialog = document.getElementById('account-dialog');
    const clientId = document.getElementById('client-id');
    document.getElementById('btn-account')?.addEventListener('click', () => {
      clientId.value = this.auth.clientId || '';
      dialog.showModal();
    });
    document.getElementById('btn-login')?.addEventListener('click', async () => {
      const button = document.getElementById('btn-login');
      button.disabled = true;
      try {
        const result = await window.electronAPI.startTwitchLogin(clientId.value.trim());
        const code = document.getElementById('device-code');
        code.hidden = false;
        code.textContent = `Код: ${result.code} · Подтвердите вход в открывшемся браузере Twitch`;
      } catch (error) { this.showToast(error.message); }
      finally { button.disabled = false; }
    });
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      this.setAuth(await window.electronAPI.logoutTwitch());
    });
    window.electronAPI?.onTwitchAuthChanged(status => this.setAuth(status));
    window.electronAPI?.onTwitchAuthError(message => this.showToast(message));
    try { this.setAuth(await window.electronAPI.getTwitchAuth()); }
    catch { this.showToast('Не удалось получить состояние входа Twitch'); }
  }

  setAuth(status) {
    this.auth = status || { connected: false, login: '', clientId: '' };
    document.getElementById('btn-account').textContent = this.auth.connected ? this.auth.login : 'Войти';
    document.getElementById('account-info').textContent = this.auth.connected
      ? `Вы вошли как ${this.auth.login}. Сообщения отправляются через Twitch.`
      : 'Чтобы отправлять сообщения, нужен Client ID вашего приложения Twitch.';
    document.getElementById('btn-logout').hidden = !this.auth.connected;
    if (this.auth.connected) document.getElementById('device-code').hidden = true;
    document.querySelectorAll('.chat-input').forEach(input => {
      input.placeholder = this.auth.connected ? 'Написать сообщение…' : 'Войдите в Twitch для отправки…';
    });
    document.querySelectorAll('.btn-send').forEach(button => { button.disabled = !this.auth.connected; });
  }

  showToast(text) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  renderTabs() {
    const tabsContainer = document.getElementById('channel-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    this.channels.forEach((chan) => {
      const tab = document.createElement('div');
      tab.className = `tab ${chan === this.activeChannel ? 'active' : ''}`;
      const label = document.createElement('span');
      label.textContent = `#${chan}`;
      tab.appendChild(label);
      if (this.channels.length > 1) {
        const close = document.createElement('span');
        close.className = 'tab-close';
        close.textContent = '×';
        tab.appendChild(close);
      }

      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          this.removeChannel(chan);
        } else {
          this.activeChannel = chan;
          this.renderTabs();
          this.savePreferences();
        }
      });

      tabsContainer.appendChild(tab);
    });
  }

  renderSplits() {
    const container = document.getElementById('splits-container');
    if (!container) return;
    this.channels.forEach((chan) => {
      if (document.getElementById(`split-${chan}`)) return;
      const split = document.createElement('div');
      split.className = 'chat-split';
      split.id = `split-${chan}`;
      split.innerHTML = `
        <div class="split-header">
          <span>#${chan}</span>
          <span><span class="split-unread"></span> <span style="color:#10b981;font-size:11px;">● Чат</span></span>
        </div>
        <div class="messages-container" id="messages-${chan}"></div>
        <form class="chat-input-bar" id="form-${chan}">
          <div class="emote-suggestions" hidden></div>
          <input type="text" class="chat-input" placeholder="Войдите в Twitch для отправки…" autocomplete="off">
          <button type="submit" class="btn-send" disabled title="Вход в Twitch пока не подключён">Чат</button>
        </form>
      `;

      split.querySelector('form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = split.querySelector('.chat-input');
        const text = input.value.trim();
        if (text) {
          const button = split.querySelector('.btn-send');
          button.disabled = true;
          try {
            await this.sendChatMessage(chan, text);
            input.value = '';
          } catch (error) { this.showToast(error.message); }
          finally { button.disabled = !this.auth.connected; }
        }
      });

      const input = split.querySelector('.chat-input');
      const suggestions = split.querySelector('.emote-suggestions');
      input.addEventListener('input', () => this.updateEmoteSuggestions(chan, input));
      input.addEventListener('keydown', event => {
        if (suggestions.hidden) return;
        const buttons = [...suggestions.querySelectorAll('button')];
        if (!buttons.length) return;
        const selected = buttons.findIndex(button => button.classList.contains('selected'));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next = (selected + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons.forEach((button, index) => button.classList.toggle('selected', index === next));
        } else if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault();
          this.chooseEmoteSuggestion(input, buttons[Math.max(selected, 0)].dataset.code);
        } else if (event.key === 'Escape') {
          suggestions.hidden = true;
        }
      });

      container.appendChild(split);
    });
    container.querySelectorAll('.chat-split').forEach(split => {
      if (!this.channels.includes(split.id.slice(6))) split.remove();
    });
    this.applySettings();
    this.setAuth(this.auth);
  }

  updateEmoteSuggestions(chan, input) {
    const box = input.closest('.chat-input-bar').querySelector('.emote-suggestions');
    const match = input.value.slice(0, input.selectionStart).match(/(?:^|\s)([^\s]{2,})$/);
    if (!match) { box.hidden = true; return; }
    const prefix = match[1].toLocaleLowerCase();
    const catalog = new Map([...this.emotesCache, ...(this.channelEmotes.get(chan) || new Map())]);
    const matches = [...catalog].filter(([code]) => code.toLocaleLowerCase().startsWith(prefix)).slice(0, 8);
    box.replaceChildren();
    for (const [code, url] of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.code = code;
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      button.append(image, document.createTextNode(code));
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => this.chooseEmoteSuggestion(input, code));
      box.appendChild(button);
    }
    box.hidden = matches.length === 0;
    box.firstElementChild?.classList.add('selected');
  }

  chooseEmoteSuggestion(input, code) {
    const before = input.value.slice(0, input.selectionStart);
    const after = input.value.slice(input.selectionEnd);
    const match = before.match(/(?:^|\s)([^\s]+)$/);
    if (!match) return;
    const start = before.length - match[1].length;
    input.value = `${before.slice(0, start)}${code} ${after}`;
    input.setSelectionRange(start + code.length + 1, start + code.length + 1);
    input.closest('.chat-input-bar').querySelector('.emote-suggestions').hidden = true;
    input.focus();
  }

  addChannel(chan) {
    if (!/^[a-z0-9_]{3,25}$/.test(chan)) {
      this.showToast('Имя канала: 3–25 латинских букв, цифр или _');
      return false;
    }
    if (!this.channels.includes(chan)) {
      this.channels.push(chan);
      this.activeChannel = chan;
      this.renderTabs();
      this.renderSplits();
      this.joinChannel(chan);
      this.loadChannelEmotes(chan);
      this.savePreferences();
    }
    return true;
  }

  removeChannel(chan) {
    this.channels = this.channels.filter((c) => c !== chan);
    if (this.activeChannel === chan) {
      this.activeChannel = this.channels[0] || 'xqc';
    }
    this.renderTabs();
    this.renderSplits();
    this.savePreferences();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(`PART #${chan}`);
    }
  }

  initTwitchIRC() {
    clearTimeout(this.reconnectTimer);
    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.ws.onopen = () => {
      const status = document.getElementById('connection-status');
      status.textContent = '● Чат подключён';
      status.classList.add('connected');
      this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      this.ws.send('PASS SCHMOOPIIE');
      this.ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);

      this.channels.forEach((chan) => {
        this.joinChannel(chan);
        this.loadChannelEmotes(chan);
      });

      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('PING :tmi.twitch.tv');
        }
      }, 60000);
    };

    this.ws.onmessage = (event) => {
      this.parseIrcMessages(event.data);
    };

    this.ws.onclose = () => {
      const status = document.getElementById('connection-status');
      status.textContent = '● Переподключение…';
      status.classList.remove('connected');
      clearInterval(this.pingTimer);
      this.reconnectTimer = setTimeout(() => this.initTwitchIRC(), 3000);
    };
  }

  joinChannel(chan) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(`JOIN #${chan}`);
    }
  }

  sendChatMessage(chan, text) {
    if (!this.auth.connected) return Promise.reject(new Error('Войдите в Twitch для отправки сообщений'));
    return window.electronAPI.sendTwitchMessage(chan, text);
  }

  parseIrcMessages(raw) {
    const lines = raw.split('\r\n');
    lines.forEach((line) => {
      if (line.startsWith('PING')) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('PONG :tmi.twitch.tv');
        return;
      }
      if (!line.includes('PRIVMSG')) return;

      const match = line.match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #([^ ]+) :(.+)$/);
      if (match) {
        const rawTags = match[1];
        const user = match[2];
        const channel = match[3].toLowerCase();
        const text = match[4];

        const tags = {};
        rawTags.split(';').forEach((p) => {
          const index = p.indexOf('=');
          if (index > 0) tags[p.slice(0, index)] = p.slice(index + 1);
        });

        const badges = [];
        if (tags.badges) {
          tags.badges.split(',').forEach((b) => {
            const [n, v] = b.split('/');
            if (n) badges.push({ name: n, version: v });
          });
        }

        const msgObj = {
          id: tags.id || `m_${Date.now()}`,
          channel: channel,
          username: user,
          displayName: tags['display-name'] || user,
          color: tags.color || '#38bdf8',
          badges: badges,
          text: text,
          timestamp: tags['tmi-sent-ts'] ? parseInt(tags['tmi-sent-ts'], 10) : Date.now(),
          emotesTag: tags.emotes
        };

        this.appendMessage(msgObj);
        window.electronAPI?.broadcastChatMessage(msgObj);
      }
    });
  }

  async loadGlobalEmotes() {
    await Promise.allSettled([
      (async () => {
        const data = await window.electronAPI.fetchEmoteProvider('https://7tv.io/v3/emote-sets/global');
        for (const e of data.emotes || []) {
          const id = e.id || e.data?.id;
          const name = e.name || e.data?.name;
          if (/^[a-f0-9]{24}$/i.test(id) && name) this.emotesCache.set(name, `https://cdn.7tv.app/emote/${id}/2x.webp`);
        }
      })(),
      (async () => {
        const data = await window.electronAPI.fetchEmoteProvider('https://api.betterttv.net/3/cached/emotes/global');
        for (const e of Array.isArray(data) ? data : []) {
          if (/^[a-f0-9]{24}$/i.test(e.id) && e.code) this.emotesCache.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
        }
      })(),
      (async () => {
        const data = await window.electronAPI.fetchEmoteProvider('https://api.frankerfacez.com/v1/set/global');
        for (const set of Object.values(data.sets || {})) this.addFfzEmotes(this.emotesCache, set.emoticons);
      })()
    ]);
  }

  addFfzEmotes(target, emotes) {
    for (const emote of emotes || []) {
      const source = emote.urls?.['2'] || emote.urls?.['1'];
      const url = typeof source === 'string' && source.startsWith('//') ? `https:${source}` : source;
      if (emote.name && /^https:\/\//.test(url)) target.set(emote.name, url);
    }
  }

  async loadChannelEmotes(chan) {
    const target = new Map();
    this.channelEmotes.set(chan, target);
    const tasks = [];
    tasks.push((async () => {
      const data = await window.electronAPI.fetchEmoteProvider(`https://api.frankerfacez.com/v1/room/${encodeURIComponent(chan)}`);
      for (const set of Object.values(data.sets || {})) this.addFfzEmotes(target, set.emoticons);
    })());
    tasks.push((async () => {
    try {
      const uData = await window.electronAPI.fetchEmoteProvider(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(chan)}`);
      const userObj = Array.isArray(uData) ? uData[0] : uData;
      const twitchId = userObj?.id;
      if (!twitchId) return;

      await Promise.allSettled([
        (async () => {
          const data = await window.electronAPI.fetchEmoteProvider(`https://7tv.io/v3/users/twitch/${twitchId}`);
          for (const e of data?.emote_set?.emotes || []) {
            const id = e.id || e.data?.id;
            const name = e.name || e.data?.name;
            if (/^[a-f0-9]{24}$/i.test(id) && name) target.set(name, `https://cdn.7tv.app/emote/${id}/2x.webp`);
          }
        })(),
        (async () => {
          const data = await window.electronAPI.fetchEmoteProvider(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
          for (const e of [...(data.channelEmotes || []), ...(data.sharedEmotes || [])]) {
            if (/^[a-f0-9]{24}$/i.test(e.id) && e.code) target.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
          }
        })()
      ]);
    } catch (e) {}
    })());
    await Promise.allSettled(tasks);
  }

  appendMessage(msg) {
    const container = document.getElementById(`messages-${msg.channel}`);
    if (!container) return;

    const line = document.createElement('div');
    line.className = 'message-line';
    line.dataset.messageText = msg.text;
    line.dataset.author = msg.username;

    const time = new Date(msg.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

    const timeNode = document.createElement('span');
    timeNode.className = 'msg-time';
    timeNode.textContent = timeStr;
    line.appendChild(timeNode);

    if (msg.badges && msg.badges.length > 0) {
      msg.badges.forEach((b) => {
        const badgeInfo = this.globalBadges[b.name];
        if (!badgeInfo) return;
        const image = document.createElement('img');
        image.className = 'badge-img';
        image.src = badgeInfo.url;
        image.alt = badgeInfo.title;
        image.title = badgeInfo.title;
        image.onerror = () => { image.style.display = 'none'; };
        line.appendChild(image);
      });
    }

    const author = document.createElement('span');
    author.className = 'msg-username';
    author.style.color = /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#38bdf8';
    author.textContent = msg.displayName || msg.username;
    author.title = `История ${msg.displayName || msg.username}`;
    author.addEventListener('click', () => this.showUserCard(msg.username, msg.channel));
    line.appendChild(author);
    const colon = document.createElement('span');
    colon.className = 'msg-colon';
    colon.textContent = ':';
    line.appendChild(colon);

    const textNode = document.createElement('span');
    textNode.className = 'msg-text';
    const ranges = [];
    for (const group of (msg.emotesTag || '').split('/')) {
      const [id, positions] = group.split(':');
      if (!/^\d+$/.test(id) || !positions) continue;
      for (const position of positions.split(',')) {
        const match = position.match(/^(\d+)-(\d+)$/);
        if (!match) continue;
        const start = Number(match[1]);
        const end = Number(match[2]) + 1;
        if (start >= 0 && end > start && end <= msg.text.length) ranges.push({ id, start, end });
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const range of ranges) {
      if (range.start < cursor) continue;
      this.appendProviderText(textNode, msg.text.slice(cursor, range.start), msg.channel);
      const image = document.createElement('img');
      image.className = 'chat-emote';
      image.src = `https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/2.0`;
      image.alt = msg.text.slice(range.start, range.end);
      image.title = image.alt;
      textNode.appendChild(image);
      cursor = range.end;
    }
    this.appendProviderText(textNode, msg.text.slice(cursor), msg.channel);
    line.appendChild(textNode);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'msg-copy';
    copy.title = 'Копировать сообщение';
    copy.setAttribute('aria-label', 'Копировать сообщение');
    copy.textContent = '⧉';
    copy.addEventListener('click', async () => {
      if (await window.electronAPI.copyText(msg.text)) this.showToast('Сообщение скопировано');
    });
    line.appendChild(copy);

    container.appendChild(line);
    this.applyHighlight(line);
    this.applySearch(line);
    const historyKey = `${msg.channel}:${msg.username.toLowerCase()}`;
    const history = this.messageHistory.get(historyKey) || [];
    history.push({ text: msg.text, timestamp: msg.timestamp });
    if (history.length > 100) history.shift();
    this.messageHistory.set(historyKey, history);
    if (this.messageHistory.size > 1000) this.messageHistory.delete(this.messageHistory.keys().next().value);
    if (this.paused) {
      this.unread.set(msg.channel, (this.unread.get(msg.channel) || 0) + 1);
      this.updateUnread();
    } else {
      container.scrollTop = container.scrollHeight;
    }

    while (container.childNodes.length > 500) {
      container.removeChild(container.firstChild);
    }
  }

  appendProviderText(textNode, text, channel) {
    const channelEmotes = this.channelEmotes.get(channel);
    text.split(/(\s+)/).forEach(w => {
      const emoteUrl = channelEmotes?.get(w) || this.emotesCache.get(w);
      if (emoteUrl) {
        const image = document.createElement('img');
        image.className = 'chat-emote';
        image.src = emoteUrl;
        image.alt = w;
        image.title = w;
        textNode.appendChild(image);
      } else if (/^@[a-z0-9_]{3,25}[.,!?;:]?$/i.test(w)) {
        const mention = document.createElement('span');
        mention.className = 'msg-mention';
        mention.textContent = w;
        mention.addEventListener('click', () => this.showUserCard(w.slice(1).replace(/[.,!?;:]$/, ''), channel));
        textNode.appendChild(mention);
      } else {
        textNode.appendChild(document.createTextNode(w));
      }
    });
  }

  showUserCard(username, channel) {
    const dialog = document.getElementById('user-dialog');
    document.getElementById('user-dialog-name').textContent = `${username} · #${channel}`;
    const list = document.getElementById('user-dialog-history');
    list.replaceChildren();
    const messages = this.messageHistory.get(`${channel}:${username.toLowerCase()}`) || [];
    for (const msg of messages.slice(-30).reverse()) {
      const item = document.createElement('div');
      item.className = 'user-history-item';
      const time = document.createElement('time');
      time.textContent = new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      item.append(time, document.createTextNode(msg.text));
      list.appendChild(item);
    }
    if (!messages.length) list.textContent = 'Сообщений в текущем сеансе пока нет.';
    dialog.showModal();
  }

}

window.addEventListener('DOMContentLoaded', () => {
  window.vortexChat = new VortexChatDesktopClient();
});
