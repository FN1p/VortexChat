/**
 * VortexChat Desktop — Twitch IRC Client, 7TV v3 / BTTV / FFZ Emote Resolver & Multi-Split Controller
 * Разработано студией PFT Studio
 */

class VortexChatDesktopClient {
  constructor() {
    this.ws = null;
    this.channels = ['xqc', 'bratishkinoff'];
    this.activeChannel = 'xqc';
    this.emotesCache = new Map();
    this.isPinned = false;

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
    this.initTwitchIRC();
    this.loadGlobalEmotes();
  }

  initUI() {
    this.renderTabs();
    this.renderSplits();

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

    document.getElementById('btn-obs-link')?.addEventListener('click', () => {
      const obsUrl = `http://localhost:5222/overlay?channel=${this.activeChannel}&fade=15&fontSize=16`;
      navigator.clipboard.writeText(obsUrl);
      this.showToast(`Ссылка OBS скопирована: ${obsUrl}`);
    });

    document.getElementById('btn-add-tab')?.addEventListener('click', () => {
      const channel = prompt('Введите имя канала Twitch (например: bratishkinoff, xqc, forsen):');
      if (channel) {
        this.addChannel(channel.trim().toLowerCase());
      }
    });
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
      tab.innerHTML = `
        <span>#${chan}</span>
        ${this.channels.length > 1 ? '<span class="tab-close">×</span>' : ''}
      `;

      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          this.removeChannel(chan);
        } else {
          this.activeChannel = chan;
          this.renderTabs();
        }
      });

      tabsContainer.appendChild(tab);
    });
  }

  renderSplits() {
    const container = document.getElementById('splits-container');
    if (!container) return;
    container.innerHTML = '';

    this.channels.forEach((chan) => {
      const split = document.createElement('div');
      split.className = 'chat-split';
      split.id = `split-${chan}`;
      split.innerHTML = `
        <div class="split-header">
          <span>#${chan}</span>
          <span style="color:#10b981;font-size:11px;">● LIVE</span>
        </div>
        <div class="messages-container" id="messages-${chan}"></div>
        <form class="chat-input-bar" id="form-${chan}">
          <input type="text" class="chat-input" placeholder="Отправить в #${chan}..." autocomplete="off">
          <button type="submit" class="btn-send">Чат</button>
        </form>
      `;

      split.querySelector('form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = split.querySelector('.chat-input');
        const text = input.value.trim();
        if (text) {
          this.sendChatMessage(chan, text);
          input.value = '';
        }
      });

      container.appendChild(split);
    });
  }

  addChannel(chan) {
    if (!this.channels.includes(chan)) {
      this.channels.push(chan);
      this.activeChannel = chan;
      this.renderTabs();
      this.renderSplits();
      this.joinChannel(chan);
      this.loadChannelEmotes(chan);
    }
  }

  removeChannel(chan) {
    this.channels = this.channels.filter((c) => c !== chan);
    if (this.activeChannel === chan) {
      this.activeChannel = this.channels[0] || 'xqc';
    }
    this.renderTabs();
    this.renderSplits();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(`PART #${chan}`);
    }
  }

  initTwitchIRC() {
    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.ws.onopen = () => {
      this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      this.ws.send('PASS SCHMOOPIIE');
      this.ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);

      this.channels.forEach((chan) => {
        this.joinChannel(chan);
        this.loadChannelEmotes(chan);
      });

      setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('PING :tmi.twitch.tv');
        }
      }, 60000);
    };

    this.ws.onmessage = (event) => {
      const data = event.data;
      if (data.startsWith('PING')) {
        this.ws.send('PONG :tmi.twitch.tv');
        return;
      }
      this.parseIrcMessages(data);
    };

    this.ws.onclose = () => {
      setTimeout(() => this.initTwitchIRC(), 3000);
    };
  }

  joinChannel(chan) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(`JOIN #${chan}`);
    }
  }

  sendChatMessage(chan, text) {
    const localMsg = {
      channel: chan,
      username: 'You',
      displayName: 'You',
      color: '#06b6d4',
      badges: [],
      text: text,
      timestamp: Date.now()
    };
    this.appendMessage(localMsg);
    window.electronAPI?.broadcastChatMessage(localMsg);
  }

  parseIrcMessages(raw) {
    const lines = raw.split('\r\n');
    lines.forEach((line) => {
      if (!line.includes('PRIVMSG')) return;

      const match = line.match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #([^ ]+) :(.+)$/);
      if (match) {
        const rawTags = match[1];
        const user = match[2];
        const channel = match[3].toLowerCase();
        const text = match[4];

        const tags = {};
        rawTags.split(';').forEach((p) => {
          const [k, v] = p.split('=');
          if (k) tags[k] = v || '';
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
    try {
      const res = await fetch('https://7tv.io/v3/emote-sets/global');
      const data = await res.json();
      (data.emotes || []).forEach((e) => {
        if (e.data && e.data.name) {
          this.emotesCache.set(e.data.name, `https://cdn.7tv.app/emote/${e.data.id}/2x.webp`);
        }
      });
    } catch (e) {}

    try {
      const res = await fetch('https://api.betterttv.net/3/cached/emotes/global');
      const list = await res.json();
      if (Array.isArray(list)) {
        list.forEach((e) => {
          this.emotesCache.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
        });
      }
    } catch (e) {}
  }

  async loadChannelEmotes(chan) {
    try {
      const uRes = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(chan)}`);
      if (!uRes.ok) return;
      const uData = await uRes.json();
      const userObj = Array.isArray(uData) ? uData[0] : uData;
      const twitchId = userObj?.id;
      if (!twitchId) return;

      const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`);
      if (!res.ok) return;
      const data = await res.json();
      (data?.emote_set?.emotes || []).forEach((e) => {
        const id = e.id || e.data?.id;
        const name = e.name || e.data?.name;
        if (id && name) {
          this.emotesCache.set(name, `https://cdn.7tv.app/emote/${id}/2x.webp`);
        }
      });
    } catch (e) {}
  }

  appendMessage(msg) {
    const container = document.getElementById(`messages-${msg.channel}`);
    if (!container) return;

    const line = document.createElement('div');
    line.className = 'message-line';

    const time = new Date(msg.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

    let html = `<span class="msg-time">${timeStr}</span>`;

    if (msg.badges && msg.badges.length > 0) {
      msg.badges.forEach((b) => {
        const badgeInfo = this.globalBadges[b.name] || {
          title: b.name,
          url: `https://static-cdn.jtvnw.net/badges/v1/${b.name}/1`
        };
        html += `<img class="badge-img" src="${badgeInfo.url}" alt="${badgeInfo.title}" title="${badgeInfo.title}" onerror="this.style.display='none'">`;
      });
    }

    html += `<span class="msg-username" style="color:${msg.color}">${msg.displayName || msg.username}</span><span class="msg-colon">:</span>`;

    const words = msg.text.split(' ');
    const parsedWords = words.map((w) => {
      if (this.emotesCache.has(w)) {
        return `<img class="chat-emote" src="${this.emotesCache.get(w)}" alt="${w}" title="${w}">`;
      }
      return this.escapeHtml(w);
    });

    html += `<span class="msg-text">${parsedWords.join(' ')}</span>`;
    line.innerHTML = html;

    container.appendChild(line);
    container.scrollTop = container.scrollHeight;

    while (container.childNodes.length > 200) {
      container.removeChild(container.firstChild);
    }
  }

  escapeHtml(str) {
    return str.replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.vortexChat = new VortexChatDesktopClient();
});
