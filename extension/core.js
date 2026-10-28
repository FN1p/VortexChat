/* Shared, dependency-free extension logic. Also loaded by the Node regression tests. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({
    enable7TV: true, enable7TVCosmetics: true, enableZeroWidth: true, enableBTTV: true, enableFFZ: true,
    enableAutocomplete: true, alternatingRows: true, collapseSpam: false, fuzzySpam: false,
    showEventNotices: true, sendOnEmoteClick: false,
    fontSize: 13, messageGap: 0, emoteGap: 2, showTimestamps: false,
    highlightWords: '', highlightUsers: '', highlightBadges: '', pauseOnHover: false, showChatSpeed: true, showCopyButton: true,
    mentionName: '', mentionSound: false, mentionColor: '#29b6f6', mentionIgnoreUsers: '', mentionMuteChannels: '', inputHistory: true,
    liveControls: true, autoCatchup: false, channelQuickLinks: true, sidebarPreview: false,
    ambilightEnabled: false, ambilightBrightness: 70, ambilightSpread: 65, ambilightResponse: 50,
    ambilightDimUI: 0, openClipsOverlay: true, themeEnabled: true,
    themePreset: 'aurora', chatDensity: 'comfortable', chatOpacity: 100, visualBlurEnabled: false, visualBlur: 8, visualAmbilightEnabled: false, youtubeAmbientEnabled: true, visualAmbilightIntensity: 50, performanceMode: false, visualAccentEnabled: false, visualAccent: '#32d4da', visualCornerRadius: 8
  });
  const reserved = new Set(['directory', 'settings', 'subscriptions', 'videos', 'downloads',
    'inventory', 'wallet', 'drops', 'search', 'following', 'friends', 'messages',
    'login', 'signup', 'turbo', 'prime', 'jobs', 'p', 'products', 'store', 'payments',
    'activate', 'moderator', 'popout', 'collections', 'dashboard', 'broadcast', 'u']);

  function channelFromPath(path) {
    const parts = path.toLowerCase().split('/').filter(Boolean);
    const name = ['popout', 'moderator'].includes(parts[0]) ? parts[1] : parts[0];
    return name && /^[a-z0-9_]{1,25}$/.test(name) && !reserved.has(name) ? name : '';
  }

  function sameSpamMessage(first, second, fuzzy = false) {
    if (first === second) return true;
    if (!fuzzy) return false;
    const normalize = value => String(value || '').toLocaleLowerCase().trim()
      .replace(/[\s\p{P}\p{S}]+/gu, ' ').replace(/(.)\1{3,}/gu, '$1$1$1');
    const a = normalize(first), b = normalize(second);
    if (a.length < 12 || b.length < 12 || Math.abs(a.length - b.length) > 2) return false;
    let edits = 0, i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 2) return false;
      if (a[i + 1] === b[j]) i++;
      else if (a[i] === b[j + 1]) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 2;
  }

  function normalizeSettings(value = {}) {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'boolean' && typeof value?.[key] === 'boolean') result[key] = value[key];
    }
    const size = Number(value?.fontSize ?? defaults.fontSize);
    result.fontSize = Number.isFinite(size) ? Math.min(24, Math.max(11, Math.round(size))) : defaults.fontSize;
    for (const [key, maximum] of [['messageGap', 12], ['emoteGap', 8]]) {
      const number = Number(value?.[key] ?? defaults[key]);
      result[key] = Number.isFinite(number) ? Math.min(maximum, Math.max(0, Math.round(number))) : defaults[key];
    }
    for (const key of ['ambilightBrightness', 'ambilightSpread', 'ambilightResponse', 'ambilightDimUI', 'chatOpacity', 'visualAmbilightIntensity']) {
      const number = Number(value?.[key] ?? defaults[key]);
      result[key] = Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : defaults[key];
    }
    { const blur = Number(value?.visualBlur ?? defaults.visualBlur); result.visualBlur = Number.isFinite(blur) ? Math.min(24,Math.max(0,Math.round(blur))) : defaults.visualBlur; }
    { const radius=Number(value?.visualCornerRadius??defaults.visualCornerRadius);result.visualCornerRadius=Number.isFinite(radius)?Math.min(28,Math.max(0,Math.round(radius))):defaults.visualCornerRadius; }
    if (typeof value?.visualAccent === 'string' && /^#[a-f0-9]{6}$/i.test(value.visualAccent)) result.visualAccent=value.visualAccent;
    if (typeof value?.mentionColor === 'string' && /^#[a-f0-9]{6}$/i.test(value.mentionColor)) result.mentionColor = value.mentionColor;
    if (typeof value?.mentionName === 'string' && /^[a-z0-9_]{0,25}$/i.test(value.mentionName)) result.mentionName = value.mentionName.toLowerCase();
    if (['aurora', 'graphite', 'orchid'].includes(value?.themePreset)) result.themePreset = value.themePreset;
    if (['comfortable', 'compact'].includes(value?.chatDensity)) result.chatDensity = value.chatDensity;
    result.highlightWords = typeof value?.highlightWords === 'string' ? value.highlightWords.slice(0, 500) : '';
    for (const key of ['highlightUsers', 'highlightBadges', 'mentionIgnoreUsers', 'mentionMuteChannels'])
      result[key] = typeof value?.[key] === 'string' ? value[key].slice(0, 500) : '';
    return result;
  }

  function providerEnabled(emote, settings) {
    return Boolean(settings[{ '7TV': 'enable7TV', BTTV: 'enableBTTV', FFZ: 'enableFFZ' }[emote.provider]]);
  }

  function suggestEmotes(emotes, rawToken, limit = 7) {
    const token = String(rawToken || '');
    const query = token.replace(/^:/, '').toLocaleLowerCase();
    if (query.length < (token.startsWith(':') ? 1 : 2)) return [];
    return emotes.filter(emote => emote.code.toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        const rank = emote => emote.code.toLocaleLowerCase() === query ? 0
          : emote.code.toLocaleLowerCase().startsWith(query) ? 1 : 2;
        return rank(a) - rank(b) || Number(b.isChannel) - Number(a.isChannel) || a.code.localeCompare(b.code);
      }).slice(0, limit);
  }

  function matchesHighlight(text, words) {
    const normalized = text.toLocaleLowerCase();
    return words.split(/[,\n]/).map(word => word.trim().toLocaleLowerCase()).filter(Boolean)
      .some(word => normalized.includes(word));
  }

  function matchesExactList(value, list) {
    const target = String(value || '').trim().toLocaleLowerCase();
    return Boolean(target) && String(list || '').split(/[;,\n]/).some(item => item.trim().toLocaleLowerCase() === target);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function parse7TV(emotes, isChannel) {
    if (!Array.isArray(emotes)) return [];
    return emotes.flatMap(emote => {
      if (typeof emote?.name !== 'string' || !emote.name.trim() || typeof emote.id !== 'string') return [];
      const host = emote.data?.host;
      const files = Array.isArray(host?.files) ? host.files : [];
      const file = ['2x.webp', '1x.webp', '3x.webp', '2x.avif', '1x.avif']
        .map(name => files.find(item => item?.name === name)).find(Boolean);
      let url;
      try {
        const base = new URL(host?.url?.startsWith('//') ? `https:${host.url}` : host?.url);
        if (base.protocol !== 'https:' || base.hostname !== 'cdn.7tv.app') return [];
        if (!file || !/^[1-4]x\.(webp|avif)$/.test(file.name)) return [];
        url = `${base.href.replace(/\/$/, '')}/${file.name}`;
      } catch { return []; }
      return [{ code: emote.name, id: emote.id, provider: '7TV', isChannel: Boolean(isChannel),
        isGif: Boolean(emote.data?.animated), zeroWidth: Boolean((emote.flags & 1) || (emote.data?.flags & 256)),
        owner: emote.data?.owner?.display_name || '7TV', url }];
    });
  }

  function clipSlug(raw, base = 'https://www.twitch.tv/') {
    let url;
    try { url = new URL(raw, base); } catch { return ''; }
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return '';
    let slug = '';
    if (url.hostname === 'clips.twitch.tv') {
      slug = url.pathname === '/embed' ? url.searchParams.get('clip') || '' : url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(url.hostname)) {
      slug = url.pathname.match(/^\/(?:[^/]+\/)?clip\/([^/]+)\/?$/i)?.[1] || '';
    }
    return /^[A-Za-z0-9_-]{3,100}$/.test(slug) ? slug : '';
  }

  function videoLetterbox(width, height, sourceWidth, sourceHeight) {
    if (![width, height, sourceWidth, sourceHeight].every(value => Number.isFinite(value) && value > 0))
      return { left: 0, right: 0, top: 0, bottom: 0 };
    const containerRatio = width / height;
    const sourceRatio = sourceWidth / sourceHeight;
    if (containerRatio > sourceRatio) {
      const side = Math.max(0, (width - height * sourceRatio) / 2);
      return { left: side, right: side, top: 0, bottom: 0 };
    }
    const side = Math.max(0, (height - width / sourceRatio) / 2);
    return { left: 0, right: 0, top: side, bottom: side };
  }

  class EmoteCatalog {
    constructor() { this.entries = new Map(); }
    key(emote) { return `${emote.provider}:${Boolean(emote.isChannel)}:${emote.code}`; }
    add(emote) {
      if (!emote?.code || !emote.url || !['7TV', 'BTTV', 'FFZ'].includes(emote.provider)) return;
      try {
        const url = new URL(emote.url);
        if (url.protocol !== 'https:') return;
      } catch { return; }
      this.entries.set(this.key(emote), emote);
    }
    clearChannel(provider) {
      for (const [key, emote] of this.entries) {
        if (emote.isChannel && (!provider || provider === emote.provider)) this.entries.delete(key);
      }
    }
    visible(settings) {
      const rank = { '7TV': 3, BTTV: 2, FFZ: 1 };
      const result = new Map();
      for (const emote of this.entries.values()) {
        if (!providerEnabled(emote, settings)) continue;
        const previous = result.get(emote.code);
        const priority = item => (item.isChannel ? 10 : 0) + rank[item.provider];
        if (!previous || priority(emote) > priority(previous)) result.set(emote.code, emote);
      }
      return [...result.values()].sort((a, b) => Number(b.isChannel) - Number(a.isChannel) || a.code.localeCompare(b.code));
    }
  }

  function favoriteKey(emote) { return `${emote.provider}:${emote.id}:${emote.code}`; }

  function normalizeFavorites(value) {
    return Array.isArray(value) ? [...new Set(value.filter(key => typeof key === 'string' &&
      /^(7TV|BTTV|FFZ):[^:]+:.+$/s.test(key) && key.length <= 300))].slice(0, 300) : [];
  }

  function normalizeRecentEmotes(value) {
    return Array.isArray(value) ? [...new Set(value.filter(key => typeof key === 'string' &&
      /^(7TV|BTTV|FFZ):[^:]+:.+$/s.test(key) && key.length <= 300))].slice(0, 24) : [];
  }

  function parseBackup(text) {
    if (typeof text !== 'string' || text.length > 100000) throw new Error('Файл настроек слишком большой');
    const data = JSON.parse(text);
    if (data?.format !== 'vortexchat-settings' || data.schema !== 1 || !data.settings ||
      typeof data.settings !== 'object' || Array.isArray(data.settings) || !Array.isArray(data.favorites)) {
      throw new Error('Это не поддерживаемый файл настроек VortexChat');
    }
    return { vortexSettings: normalizeSettings(data.settings), vortexFavorites: normalizeFavorites(data.favorites) };
  }

  // Session-only, bounded history. DOM edits replace a record instead of duplicating it.
  class MessageHistory {
    constructor(limit = 1200, maxChannels = 5) {
      this.limit = limit;
      this.maxChannels = maxChannels;
      this.channels = new Map();
    }
    add(channel, record) {
      if (!channel || !record?.id || !record.user || !record.text) return;
      if (!this.channels.has(channel)) {
        this.channels.set(channel, new Map());
        if (this.channels.size > this.maxChannels) this.channels.delete(this.channels.keys().next().value);
      }
      const records = this.channels.get(channel);
      records.set(record.id, { ...record, text: String(record.text).slice(0, 10000) });
      while (records.size > this.limit) records.delete(records.keys().next().value);
    }
    forUser(channel, user, query = '') {
      const login = user.toLocaleLowerCase();
      const term = query.toLocaleLowerCase();
      return [...(this.channels.get(channel)?.values() || [])]
        .filter(record => record.user.toLocaleLowerCase() === login && record.text.toLocaleLowerCase().includes(term))
        .slice(-100).reverse();
    }
  }

  const api = { defaults, channelFromPath, normalizeSettings, sameSpamMessage, providerEnabled, suggestEmotes, matchesHighlight, matchesExactList, escapeHTML, parse7TV, clipSlug, videoLetterbox,
    EmoteCatalog, favoriteKey, normalizeFavorites, normalizeRecentEmotes, MessageHistory, parseBackup };
  root.VortexCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
