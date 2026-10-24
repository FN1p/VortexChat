// Local regression fixture only. No real Twitch requests or messages are sent.
const listeners = [];
const messageListeners = [];
let savedFavorites = [];
let savedSettings = { showTimestamps: true, fontSize: 16, highlightWords: 'привет', collapseSpam: true };
window.chrome = {
  storage: {
    local: {
      get: (_keys, callback) => {
        const result = { vortexSettings: savedSettings, vortexFavorites: savedFavorites };
        if (callback) queueMicrotask(() => callback(result));
        return Promise.resolve(result);
      },
      set: async value => {
        const changes = {};
        if ('vortexSettings' in value) { savedSettings = value.vortexSettings; changes.vortexSettings = { newValue: savedSettings }; }
        if ('vortexFavorites' in value) { savedFavorites = value.vortexFavorites; changes.vortexFavorites = { newValue: savedFavorites }; }
        listeners.forEach(listener => listener(changes, 'local'));
      }
    },
    onChanged: { addListener: listener => listeners.push(listener) }
  },
  runtime: {
    getManifest: () => ({ version: '4.0.0' }),
    onMessage: { addListener: listener => messageListeners.push(listener) }
  },
  tabs: {
    query: async () => [{ id: 1, url: 'https://www.twitch.tv/forsen' }],
    sendMessage: async (_tab, message) => {
      if (messageListeners.length) return new Promise(resolve => messageListeners[0](message, {}, resolve));
      return { channel: 'forsen', loadState: 'ready', eventState: 'connected', emoteCount: 246 };
    }
  }
};
const actualFetch = window.fetch.bind(window);
window.fetch = async (url, options) => {
  if (!String(url).startsWith('https://')) return actualFetch(url, options);
  let data = {};
  if (url.includes('7tv.io/v3/users')) data = { emote_set: { id: 'fixture', name: 'Test channel', emotes: [
    { id: 'base', name: 'TestEmote', data: { host: { url: '//cdn.7tv.app/emote/base', files: [{ name: '2x.webp' }] } } },
    { id: 'layer', name: 'Overlay', flags: 1, data: { host: { url: '//cdn.7tv.app/emote/layer', files: [{ name: '2x.webp' }] } } }
  ] } };
  else if (url.includes('emote-sets/global')) data = { emotes: [] };
  else if (url.includes('betterttv') && url.includes('/global')) data = [];
  else if (url.includes('betterttv')) data = { channelEmotes: [], sharedEmotes: [] };
  else if (url.includes('frankerfacez')) data = { sets: {} };
  return { ok: true, status: 200, json: async () => data };
};
window.WebSocket = class {
  constructor() { setTimeout(() => this.onopen?.(), 5); }
  send() {}
  close() { this.onclose?.(); }
};
window.fixtureSettings = async patch => chrome.storage.local.set({ vortexSettings: { ...savedSettings, ...patch } });
