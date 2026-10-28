/**
 * 7TV v3 (VortexChat Edition) — Twitch In-Page Content Script
 * Browser chat enhancements for Twitch.tv:
 *
 * • Встраивание смайликов 7TV (Канальные и Глобальные), BetterTTV и FrankerFaceZ прямо внутрь
 *   стандартного меню смайликов Twitch ([data-a-target="emote-picker"]) в 5 колонок + иконки в правой панели.
 * • Живой рендер смайликов 7TV v3, BTTV и FFZ в сообщениях чата + наложение слоев 7TV Zero-Width.
 * • Подключение к 7TV EventAPI v3 (wss://events.7tv.io/v3) для мгновенного обновления сета смайлов канала.
 * • Тултип смайла 7TV (4x превью при наведении) и Карточка смайла 7TV (1x/2x/3x/4x при клике в чате).
 * • Автодополнение смайликов по клавише Tab и через :двоеточие в поле ввода чата.
 * • Размер текста, время сообщений, подсветка слов и группировка повторов одного автора.
 */

(function() {
  'use strict';
  if (globalThis.__vortexContentInstalled) return;
  globalThis.__vortexContentInstalled = true;

  const SEVEN_TV_LOGO_SVG = `<svg viewBox="0 0 28 21" width="18" height="14" fill="#29b6f6"><path d="M20.7465 5.48825L21.9799 3.33745L22.646 2.20024L21.4125 0.0494437V0H14.8259L17.2928 4.3016L17.9836 5.48825H20.7465ZM7.75395 19.9258L14.5546 8.12104L16.0593 5.48825L13.5924 1.18666L12.9017 0H0L2.46693 4.3016L3.133 5.48825H9.13544L3.65882 14.9969L1.50483 18.7392L0.814088 19.9258H7.75395ZM17.4655 19.9258H24.4054L26.3296 16.5919L27.9825 13.7113L25.5156 9.40969L24.8248 8.22304L21.0257 14.8195L19.9403 12.9277L17.4734 8.62611L14.9818 12.9277L16.0672 14.8195L17.4655 17.269V19.9258Z"/></svg>`;
  const VORTEX_LOGO_SVG = `<svg viewBox="0 0 128 128" width="32" height="32" aria-hidden="true"><rect x="4" y="4" width="120" height="120" rx="29" fill="#111827"/><path d="M26 77a40 40 0 1 1 30 25" fill="none" stroke="#37d8ff" stroke-width="12" stroke-linecap="round"/><path d="M103 52a40 40 0 0 1-47 50" fill="none" stroke="#9272ff" stroke-width="12" stroke-linecap="round"/><path d="m28 80-4 28 30-12" fill="#37d8ff"/><path d="M61 45 83 64 61 83" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const ICONS = {
    refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; display:inline-block;"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
    pause: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle; display:inline-block;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
  };

  const { normalizeSettings, escapeHTML, EmoteCatalog } = VortexCore;
  const state = {
    settings: normalizeSettings(),
    currentChannel: getChannelName(),
    activeSettingsTab: 'general'
  };

  let chatTools = null;
  let favoriteCodes = new Set();
  let recentEmoteKeys = [];
  let favoriteSaveQueue = Promise.resolve();
  let recentSaveQueue = Promise.resolve();
  let settingsSaveQueue = Promise.resolve();

  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['vortexSettings', 'vortexFavorites', 'vortexRecentEmotes'], (res) => {
        favoriteCodes = new Set(VortexCore.normalizeFavorites(res?.vortexFavorites));
        recentEmoteKeys = VortexCore.normalizeRecentEmotes(res?.vortexRecentEmotes);
        if (res?.vortexSettings) {
          state.settings = normalizeSettings(res.vortexSettings);
          applySettings();
        }
        refreshOpenEmotePickerUI();
      });
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.vortexFavorites) {
          favoriteCodes = new Set(VortexCore.normalizeFavorites(changes.vortexFavorites.newValue));
          refreshOpenEmotePickerUI();
          updateFavoriteCard();
        }
        if (changes.vortexRecentEmotes) {
          recentEmoteKeys = VortexCore.normalizeRecentEmotes(changes.vortexRecentEmotes.newValue);
          refreshOpenEmotePickerUI();
        }
        if (changes.vortexSettings?.newValue) {
          state.settings = normalizeSettings(changes.vortexSettings.newValue);
          applySettings();
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg) return;
        if (msg.action === 'GET_VORTEXCHAT_STATUS') {
          sendResponse(getExtensionStatus());
        } else if (msg.action === 'OPEN_VORTEXCHAT_MODAL') {
          open7TVSettingsModal();
          sendResponse?.({ ok: true });
        } else if (msg.action === 'RELOAD_7TV_EMOTES') {
          loadLiveChannelEmotes(state.currentChannel, true).then(() => {
            sendResponse({ ok: channelLoadState === 'ready', ...getExtensionStatus() });
          });
          return true;
        } else if (msg.action === 'INSERT_EMOTE_TO_TWITCH_CHAT' && msg.text) {
          insertTextIntoTwitchChat(msg.text);
          sendResponse?.({ ok: true });
        } else if (msg.action === 'SEND_EMOTE_TO_TWITCH_CHAT' && msg.text) {
          sendTextToTwitchChat(msg.text);
          sendResponse?.({ ok: true });
        }
      });
    }
  }

  function saveSettings(patch) {
    state.settings = normalizeSettings({ ...state.settings, ...patch });
    applySettings();
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    settingsSaveQueue = settingsSaveQueue.then(async () => {
      const saved = await chrome.storage.local.get('vortexSettings');
      await chrome.storage.local.set({ vortexSettings: normalizeSettings({ ...saved.vortexSettings, ...patch }) });
    }).catch(() => showToast('Не удалось сохранить настройки'));
  }

  // Only emotes actually returned by providers belong in the catalog.
  const EMOTE_LIBRARY = [];
  const emoteMap = new Map();
  const catalog = new EmoteCatalog();
  let loadedChannelEmotesFor = '';
  let active7TVEventSocket = null;
  let active7TVEmoteSetId = '';
  let active7TVEmoteSetName = '';
  let channelGeneration = 0;
  let channelController = null;
  let channelLoadState = 'idle';
  let channelLoadError = '';
  let nextEmoteRetryAt = 0;
  let eventState = 'idle';
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let globalLoadPromise = null;
  const loadedGlobals = new Set();
  const cachedSources = new Set();
  let renderRevision = 0;

  const KNOWN_TWITCH_IDS = {
    'dmitry_lixxx': '139470326',
    'bratishkinoff': '99899949',
    'buster': '86277097',
    'zubarefff': '777707810',
    'evelone192': '39426641',
    'jesusavgn': '42764687',
    'silvername': '69395439',
    'stray228': '54261430',
    'nix': '84524992',
    'rostislav_999': '490592544',
    'paradeev1ch': '440238797',
    'koreshzy': '437579067',
    'frame_tamer': '164798935',
    'deepins02': '505972219',
    'mazellovvv': '196556051',
    'drakeoffc': '433597468',
    't2x2': '171494923',
    'recrent': '92236765',
    'vovapain': '145859077',
    'xqc': '71092938',
    'shroud': '37402112',
    'kaicenat': '641972806',
    'forsen': '22484632',
    'tarik': '36340781',
    'stintik': '44748026'
  };

  function getChannelName() {
    return VortexCore.channelFromPath(window.location.pathname);
  }

  function showToast(text) {
    document.querySelector('.vortex-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'vortex-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function refreshCatalog() {
    EMOTE_LIBRARY.splice(0, EMOTE_LIBRARY.length, ...catalog.visible(state.settings));
    emoteMap.clear();
    EMOTE_LIBRARY.forEach(emote => emoteMap.set(emote.code, emote));
    renderRevision++;
    hideAutocompletePopup();
    scanExistingChatMessages();
    refreshOpenEmotePickerUI();
  }

  function eventStatusLabel() {
    return ({ idle: 'Не подключено', connecting: 'Подключение…', connected: 'Подключено',
      reconnecting: 'Переподключение…' })[eventState];
  }

  function getExtensionStatus() {
    return { channel: state.currentChannel, loadState: channelLoadState, eventState,
      emoteCount: EMOTE_LIBRARY.length, setName: active7TVEmoteSetName,
      cachedSources: cachedSources.size, error: channelLoadError };
  }

  function isFavorite(emote) { return favoriteCodes.has(VortexCore.favoriteKey(emote)); }

  function updateFavoriteCard() {
    const control = document.querySelector('#vortex-card-favorite');
    if (control) {
      const active = favoriteCodes.has(control.dataset.favoriteKey);
      control.textContent = active ? '★ В избранном' : '☆ В избранное';
      control.setAttribute('aria-pressed', String(active));
    }
  }

  function toggleFavorite(emote) {
    const key = VortexCore.favoriteKey(emote);
    const active = !favoriteCodes.has(key);
    if (active && favoriteCodes.size >= 300) { showToast('В избранном уже 300 смайлов'); return; }
    if (active) favoriteCodes.add(key); else favoriteCodes.delete(key);
    refreshOpenEmotePickerUI();
    updateFavoriteCard();
    showToast(active ? `${emote.code} добавлен в избранное` : `${emote.code} удалён из избранного`);
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    favoriteSaveQueue = favoriteSaveQueue.then(async () => {
      const saved = await chrome.storage.local.get('vortexFavorites');
      const next = new Set(VortexCore.normalizeFavorites(saved.vortexFavorites));
      if (active) next.add(key); else next.delete(key);
      await chrome.storage.local.set({ vortexFavorites: [...next].slice(0, 300) });
    }).catch(() => showToast('Не удалось сохранить избранное'));
  }

  function rememberEmote(emote) {
    const key = VortexCore.favoriteKey(emote);
    recentEmoteKeys = VortexCore.normalizeRecentEmotes([key, ...recentEmoteKeys]);
    queueMicrotask(refreshOpenEmotePickerUI);
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    recentSaveQueue = recentSaveQueue.then(async () => {
      const saved = await chrome.storage.local.get('vortexRecentEmotes');
      await chrome.storage.local.set({ vortexRecentEmotes:
        VortexCore.normalizeRecentEmotes([key, ...VortexCore.normalizeRecentEmotes(saved.vortexRecentEmotes)]) });
    }).catch(() => showToast('Не удалось сохранить недавние смайлы'));
  }

  function clearRecentEmotes() {
    recentEmoteKeys = [];
    refreshOpenEmotePickerUI();
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      recentSaveQueue = recentSaveQueue.then(() => chrome.storage.local.set({ vortexRecentEmotes: [] }))
        .catch(() => showToast('Не удалось очистить недавние смайлы'));
    }
  }

  function applySettings() {
    document.documentElement.toggleAttribute('data-vortex-theme', state.settings.themeEnabled);
    document.documentElement.dataset.vortexPreset = state.settings.themePreset;
    document.documentElement.dataset.vortexDensity = state.settings.chatDensity;
    document.documentElement.style.setProperty('--vortex-chat-font-size', `${state.settings.fontSize}px`);
    document.documentElement.style.setProperty('--vortex-message-gap', `${state.settings.messageGap}px`);
    document.documentElement.style.setProperty('--vortex-emote-gap', `${state.settings.emoteGap}px`);
    document.documentElement.toggleAttribute('data-vortex-message-spacing', state.settings.messageGap > 0);
    refreshCatalog();
    document.querySelectorAll('#seventv-settings-overlay [data-key]').forEach(input => {
      const value = state.settings[input.dataset.key];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
    });
    syncQuickPanel();
    chatTools?.maintain();
    if (!state.settings.enable7TV) stop7TVEvents();
    else if (active7TVEmoteSetId && !active7TVEventSocket) connect7TVEventWebSocket(active7TVEmoteSetId);
  }

  function refreshOpenEmotePickerUI() {
    const nativeSectionsRoot = document.getElementById('vortex-7tv-native-sections');
    if (nativeSectionsRoot) {
      const dialogEl = nativeSectionsRoot.closest('[data-a-target="emote-picker"]') || document.body;
      const nativeSearch = dialogEl.querySelector(
        '[data-a-target="emote-name-filter"], input[type="search"], input[placeholder*="Поиск" i], input[placeholder*="Search" i], input[type="text"]'
      );
      const q = (nativeSearch?.value || '').toLowerCase().trim();
      renderNative7TVSections(nativeSectionsRoot, dialogEl, q);
    }
  }

  async function fetchJSON(url, signal, options = {}) {
    let relayError = null;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      if (signal?.aborted) throw signal.reason || new Error('Aborted');
      try {
        const reply = await new Promise((resolve, reject) => {
          const onAbort = () => reject(signal.reason || new Error('Aborted'));
          signal?.addEventListener('abort', onAbort, { once: true });
          chrome.runtime.sendMessage({ action: 'VORTEX_FETCH_PROVIDER', url,
            method: options.method || 'GET', body: options.body || '' }, result => {
            signal?.removeEventListener('abort', onAbort);
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(result);
          });
        });
        if (!reply?.ok) throw new Error(reply?.error || 'Provider unavailable');
        if (reply.cached) cachedSources.add(url); else cachedSources.delete(url);
        return reply.data;
      } catch (error) {
        if (signal?.aborted) throw error;
        relayError = error;
      }
    }
    try {
      const directSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
      const response = await fetch(url, { ...options, signal: directSignal, credentials: 'omit' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      throw new Error(`${relayError ? `Фон: ${relayError.message}; ` : ''}напрямую: ${error?.message || 'нет ответа'}`);
    }
  }

  function parse7TV(emotes, channel) {
    return VortexCore.parse7TV(emotes, channel);
  }

  function parseBTTV(emotes, channel) {
    return (emotes || []).map(em => ({ code: em.code, id: em.id, provider: 'BTTV', isChannel: channel,
      isGif: em.imageType === 'gif', zeroWidth: false, owner: em.user?.displayName || 'BetterTTV',
      url: `https://cdn.betterttv.net/emote/${em.id}/2x` }));
  }

  function parseFFZ(data, channel) {
    return Object.values(data?.sets || {}).flatMap(set => (set.emoticons || []).flatMap(em => {
      const url = em.urls?.['2'] || em.urls?.['1'];
      return url ? [{ code: em.name, id: String(em.id), provider: 'FFZ', isChannel: channel,
        isGif: false, zeroWidth: false, owner: em.owner?.display_name || 'FrankerFaceZ',
        url: url.startsWith('//') ? `https:${url}` : url }] : [];
    }));
  }

  function loadGlobalEmotesOnce() {
    if (globalLoadPromise) return globalLoadPromise;
    const sources = [
      ['7TV', 'https://7tv.io/v3/emote-sets/global', data => parse7TV(data?.emotes, false)],
      ['BTTV', 'https://api.betterttv.net/3/cached/emotes/global', data => parseBTTV(data, false)],
      ['FFZ', 'https://api.frankerfacez.com/v1/set/global', data => parseFFZ(data, false)]
    ];
    globalLoadPromise = Promise.allSettled(sources.filter(([provider]) => !loadedGlobals.has(provider))
      .map(async ([provider, url, parse]) => {
        const data = await fetchJSON(url);
        parse(data).forEach(emote => catalog.add(emote));
        loadedGlobals.add(provider);
        refreshCatalog();
      })).finally(() => { globalLoadPromise = null; });
    return globalLoadPromise;
  }

  async function resolveTwitchChannelId(channel, signal) {
    if (KNOWN_TWITCH_IDS[channel]) return KNOWN_TWITCH_IDS[channel];
    const lookups = [
      fetchJSON(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(channel)}`, signal)
        .then(data => data?.[0]?.id ? String(data[0].id) : Promise.reject(new Error('IVR: channel not found'))),
      fetchJSON(`https://api.frankerfacez.com/v1/room/${encodeURIComponent(channel)}`, signal)
        .then(data => data?.room?.twitch_id ? String(data.room.twitch_id) : Promise.reject(new Error('FFZ: no room')))
    ];
    try { return await Promise.any(lookups); }
    catch (error) { if (signal.aborted) throw error; }
    try {
      const data = await fetchJSON('https://gql.twitch.tv/gql', signal, {
        method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query($login: String!) { user(login: $login) { id } }', variables: { login: channel } })
      });
      if (data?.data?.user?.id) return String(data.data.user.id);
    } catch (error) { if (signal.aborted) throw error; }
    return null;
  }

  function append7TVEventNotice(actionText, emoteCode, emoteUrl) {
    if (!state.settings.showEventNotices) return;
    const chatList = document.querySelector('.chat-scrollable-area__message-container');
    if (!chatList) return;
    const line = document.createElement('div');
    line.className = 'vortex-7tv-event-line';
    line.textContent = `[7TV] ${actionText}: ${emoteCode}`;
    chatList.appendChild(line);
    const notices = chatList.querySelectorAll('.vortex-7tv-event-line');
    if (notices.length > 20) notices[0].remove();
  }

  function stop7TVEvents() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const oldSocket = active7TVEventSocket;
    active7TVEventSocket = null;
    if (oldSocket) oldSocket.close();
    eventState = 'idle';
  }

  function connect7TVEventWebSocket(emoteSetId) {
    if (!emoteSetId || !state.settings.enable7TV || active7TVEventSocket) return;
    active7TVEmoteSetId = emoteSetId;
    const generation = channelGeneration;
    eventState = 'connecting';
    let ws;
    const reconnect = () => {
      if (generation !== channelGeneration || !state.settings.enable7TV) return;
      eventState = 'reconnecting';
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect7TVEventWebSocket(emoteSetId), Math.min(30000, 1000 * 2 ** reconnectAttempt++));
    };
    try {
      ws = new WebSocket('wss://events.7tv.io/v3');
      active7TVEventSocket = ws;
    } catch { reconnect(); return; }
    ws.onopen = () => {
      if (active7TVEventSocket !== ws || generation !== channelGeneration) return;
      eventState = 'connected';
      reconnectAttempt = 0;
      ws.send(JSON.stringify({ op: 35, d: { type: 'emote_set.update', condition: { object_id: emoteSetId } } }));
    };
    ws.onclose = () => {
      if (active7TVEventSocket !== ws) return;
      active7TVEventSocket = null;
      reconnect();
    };
    ws.onerror = () => ws.close();
    ws.onmessage = event => {
      if (active7TVEventSocket !== ws || generation !== channelGeneration) return;
      try {
        const message = JSON.parse(event.data);
        if (message.op === 4) { ws.close(); return; }
        if (message.op !== 0 || message.d?.type !== 'emote_set.update') return;
        // A full, versioned refresh also handles renames and restores colliding global codes.
        loadLiveChannelEmotes(state.currentChannel, true);
        append7TVEventNotice('Сет канала обновлён', active7TVEmoteSetName);
      } catch { /* Malformed events must not interrupt chat rendering. */ }
    };
  }

  async function loadLiveChannelEmotes(channel, forceReload = false) {
    const cleanChannel = (channel || '').toLowerCase().trim();
    if (!forceReload && cleanChannel === loadedChannelEmotesFor) return;
    const changedChannel = cleanChannel !== loadedChannelEmotesFor;
    loadedChannelEmotesFor = cleanChannel;
    const generation = ++channelGeneration;
    channelController?.abort();
    channelController = new AbortController();
    const signal = AbortSignal.any([channelController.signal, AbortSignal.timeout(45000)]);
    stop7TVEvents();
    if (changedChannel) {
      catalog.clearChannel();
      active7TVEmoteSetId = '';
      active7TVEmoteSetName = '';
      refreshCatalog();
    }
    channelLoadState = cleanChannel ? 'loading' : 'idle';
    channelLoadError = '';
    if (!cleanChannel) return;
    const globals = loadGlobalEmotesOnce();
    try {
      const twitchId = await resolveTwitchChannelId(cleanChannel, signal);
      if (generation !== channelGeneration) return;
      if (!twitchId) throw new Error('Channel ID unavailable');
      KNOWN_TWITCH_IDS[cleanChannel] = twitchId;
      const sources = [
        ['7TV', `https://7tv.io/v3/users/twitch/${twitchId}`, data => parse7TV(data?.emote_set?.emotes, true)],
        ['BTTV', `https://api.betterttv.net/3/cached/users/twitch/${twitchId}`, data => parseBTTV([...(data?.channelEmotes || []), ...(data?.sharedEmotes || [])], true)],
        ['FFZ', `https://api.frankerfacez.com/v1/room/id/${twitchId}`, data => parseFFZ(data, true)]
      ];
      const results = await Promise.allSettled(sources.map(async ([provider, url, parse]) => {
        const data = await fetchJSON(url, signal);
        if (generation !== channelGeneration) return;
        catalog.clearChannel(provider);
        parse(data).forEach(emote => catalog.add(emote));
        if (provider === '7TV') {
          active7TVEmoteSetId = data?.emote_set?.id || '';
          active7TVEmoteSetName = data?.emote_set?.name || '';
        }
      }));
      const globalResults = await globals;
      if (generation !== channelGeneration) return;
      const failed = results.filter(result => result.status === 'rejected').length;
      const failedGlobals = globalResults.filter(result => result.status === 'rejected').length;
      channelLoadState = failed === sources.length ? 'error' : failed || failedGlobals ? 'partial' : 'ready';
      if (failed || failedGlobals) {
        const names = sources.filter((source, index) => results[index].status === 'rejected').map(source => source[0]);
        const firstFailure = [...results, ...globalResults].find(result => result.status === 'rejected');
        const reason = String(firstFailure?.reason?.message || '').slice(0, 100);
        channelLoadError = `Недоступно: ${names.join(', ') || 'глобальные смайлы'}${failedGlobals ? ` · глобальные: ${failedGlobals}` : ''}${reason ? ` · ${reason}` : ''}`;
      }
    } catch (error) {
      if (generation !== channelGeneration) return;
      channelLoadState = 'error';
      channelLoadError = error?.message === 'Channel ID unavailable'
        ? 'Не удалось определить ID канала' : 'Сеть или API временно недоступны';
    }
    if (generation !== channelGeneration) return;
    nextEmoteRetryAt = channelLoadState === 'ready' ? 0 : Date.now() + 30000;
    refreshCatalog();
    connect7TVEventWebSocket(active7TVEmoteSetId);
  }

  // =========================================================================
  // FIND TWITCH CHAT INPUT, SEND BUTTON & NATIVE EMOTE PICKER
  // =========================================================================
  function findTwitchChatInput() {
    const target = document.querySelector('[data-a-target="chat-input"]');
    if (target) {
      if (target.isContentEditable || target.tagName === 'TEXTAREA') return target;
      const nested = target.querySelector('textarea, [contenteditable="true"], [data-slate-editor="true"]');
      if (nested) return nested;
    }
    return (
      document.querySelector('[data-slate-editor="true"]') ||
      document.querySelector('.chat-wysiwyg-input__editor') ||
      document.querySelector('.chat-input [contenteditable="true"]') ||
      document.querySelector('.chat-input textarea') ||
      document.querySelector('textarea[data-a-target="chat-input"]')
    );
  }

  function findTwitchSendButton() {
    return (
      document.querySelector('[data-a-target="chat-send-button"]') ||
      document.querySelector('button[data-test-selector="chat-send-button"]') ||
      document.querySelector('.chat-input__buttons-container button[type="submit"]')
    );
  }

  function findNativeTwitchEmoteButton() {
    return (
      document.querySelector('[data-a-target="emote-picker-button"]') ||
      document.querySelector('[data-test-selector="emote-picker-button"]') ||
      document.querySelector('.chat-input button[aria-label*="смайл" i]') ||
      document.querySelector('.chat-input button[aria-label*="emote" i]') ||
      document.querySelector('.chat-input button[aria-label*="Эмодзи" i]')
    );
  }

  function findNativeTwitchEmotePickerDialog() {
    return (
      document.querySelector('[data-a-target="emote-picker"]') ||
      document.querySelector('.emote-picker') ||
      document.querySelector('[data-test-selector="emote-picker-container"]')
    );
  }

  function getChatInputText(editor) {
    if (!editor) return '';
    if (editor.tagName && editor.tagName.toLowerCase() === 'textarea') {
      return editor.value || '';
    }
    return (editor.innerText || editor.textContent || '').replace(/[\uFEFF\u200B]/g, '').replace(/\n$/, '');
  }

  function ensureMainWorldPageBridge() {
    if (document.getElementById('vortex-main-world-bridge')) return;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        const script = document.createElement('script');
        script.id = 'vortex-main-world-bridge';
        script.src = chrome.runtime.getURL('page-bridge.js');
        (document.head || document.documentElement).appendChild(script);
      }
    } catch {
      // already injected via manifest world: MAIN
    }
  }

  function placeSelectionInsideSlateLeaf(editor, selectAll = false) {
    try {
      if (!editor.isContentEditable) return false;
      editor.focus();
      const sel = window.getSelection();
      if (!sel) return false;
      const range = document.createRange();
      range.selectNodeContents(editor);
      if (!selectAll) range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.anchorNode === editor || editor.contains(sel.anchorNode);
    } catch {
      return false;
    }
  }

  function dispatchToMainBridge(type, text, replaceAll = false) {
    const requestId = `${Date.now()}-${Math.random()}`;
    let handled = false;
    const onResult = event => {
      if (event.detail?.requestId === requestId) handled = event.detail.handled === true;
    };
    window.addEventListener('vortex-chat-bridge-result', onResult);
    try {
      window.dispatchEvent(new CustomEvent('vortex-chat-bridge', { detail: { type, text, replaceAll, requestId } }));
    } finally {
      window.removeEventListener('vortex-chat-bridge-result', onResult);
    }
    return handled;
  }

  function insertTextIntoTwitchChat(text, replaceAll = false) {
    ensureMainWorldPageBridge();
    const editor = findTwitchChatInput();
    if (!editor) return false;

    const cleanText = text.endsWith(' ') ? text : `${text} `;
    if (dispatchToMainBridge('INSERT_TEXT', cleanText, replaceAll)) return true;

    editor.focus();

    if (editor.tagName && editor.tagName.toLowerCase() === 'textarea') {
      const current = replaceAll ? '' : (editor.value || '');
      const nextValue = current && !current.endsWith(' ') ? `${current} ${cleanText}` : `${current}${cleanText}`;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(editor, nextValue);
      } else {
        editor.value = nextValue;
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    try {
      if (!placeSelectionInsideSlateLeaf(editor, replaceAll)) return false;
      const beforeText = getChatInputText(editor);
      const payload = !replaceAll && beforeText && !beforeText.endsWith(' ') ? ` ${cleanText}` : cleanText;
      document.execCommand('insertText', false, payload);
      return true;
    } catch {
      return false;
    }
  }

  function sendTextToTwitchChat(textToSend) {
    const clean = (textToSend || '').trim();
    if (!clean) return;
    ensureMainWorldPageBridge();

    const editor = findTwitchChatInput();
    if (!editor) return;
    const now = performance.now();
    if (lastSendText === clean && now - lastSendAt < 1000) return;
    lastSendText = clean;
    lastSendAt = now;
    if (dispatchToMainBridge('SEND_TEXT', clean)) return;
    if (insertTextIntoTwitchChat(clean, true)) {
      const button = findTwitchSendButton();
      if (button && !button.disabled) button.click();
    } else {
      lastSendAt = 0;
    }
  }
  let lastSendText = '';
  let lastSendAt = 0;

  function syncQuickPanel() {
    const panel = document.getElementById('vortex-quick-panel');
    if (!panel) return;
    panel.querySelectorAll('[data-quick-key]').forEach(input => {
      const value = state.settings[input.dataset.quickKey];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
    });
    panel.querySelector('[data-quick-font-value]').textContent = `${state.settings.fontSize} px`;
  }

  function closeQuickPanel() {
    document.getElementById('vortex-quick-panel')?.remove();
    document.querySelector('.vortex-quick-button')?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onQuickOutside, true);
    document.removeEventListener('keydown', onQuickKey, true);
    window.removeEventListener('resize', positionQuickPanel);
  }

  function onQuickOutside(event) {
    if (event.target.closest?.('#vortex-quick-panel, .vortex-quick-button')) return;
    closeQuickPanel();
  }

  function onQuickKey(event) {
    if (event.key === 'Escape') closeQuickPanel();
  }

  function positionQuickPanel() {
    const panel = document.getElementById('vortex-quick-panel');
    const button = document.querySelector('.vortex-quick-button');
    if (!panel || !button) return;
    const rect = button.getBoundingClientRect();
    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, rect.bottom + 8))}px`;
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))}px`;
  }

  function toggleQuickPanel(button) {
    if (document.getElementById('vortex-quick-panel')) { closeQuickPanel(); return; }
    const panel = document.createElement('aside');
    panel.id = 'vortex-quick-panel';
    panel.className = 'vortex-quick-panel';
    panel.setAttribute('aria-label', 'Быстрые настройки VortexChat');
    panel.innerHTML = `
      <div class="vortex-quick-heading"><strong>Быстрые настройки</strong><button type="button" data-quick-close aria-label="Закрыть">✕</button></div>
      <label class="vortex-quick-row"><span>Тема Twitch</span><input type="checkbox" data-quick-key="themeEnabled"></label>
      <label class="vortex-quick-row"><span>Палитра</span><select data-quick-key="themePreset"><option value="aurora">Аврора</option><option value="graphite">Графит</option><option value="orchid">Орхидея</option></select></label>
      <label class="vortex-quick-row"><span>Плотность чата</span><select data-quick-key="chatDensity"><option value="comfortable">Обычная</option><option value="compact">Компактная</option></select></label>
      <label class="vortex-quick-row vortex-quick-font"><span>Размер текста <output data-quick-font-value></output></span><input type="range" min="11" max="24" data-quick-key="fontSize"></label>
      <label class="vortex-quick-row"><span>Чередование строк</span><input type="checkbox" data-quick-key="alternatingRows"></label>
      <label class="vortex-quick-row"><span>Кнопка копирования</span><input type="checkbox" data-quick-key="showCopyButton"></label>
      <button type="button" class="vortex-quick-all">Все настройки ↗</button>`;
    document.body.appendChild(panel);
    button.setAttribute('aria-expanded', 'true');
    syncQuickPanel();
    positionQuickPanel();
    panel.querySelector('[data-quick-close]').addEventListener('click', closeQuickPanel);
    panel.querySelector('.vortex-quick-all').addEventListener('click', () => { closeQuickPanel(); open7TVSettingsModal(); });
    panel.querySelectorAll('[data-quick-key]').forEach(input => {
      if (input.type === 'range') input.addEventListener('input', () => {
        panel.querySelector('[data-quick-font-value]').textContent = `${input.value} px`;
      });
      input.addEventListener('change', () => {
        saveSettings({ [input.dataset.quickKey]: input.type === 'checkbox' ? input.checked : input.value });
      });
    });
    document.addEventListener('pointerdown', onQuickOutside, true);
    document.addEventListener('keydown', onQuickKey, true);
    window.addEventListener('resize', positionQuickPanel);
  }

  // =========================================================================
  // 1. 7TV Icon Button in Twitch Chat Header (Opens 7TV Settings Modal)
  // =========================================================================
  function injectHeaderButtons() {
    const chatHeader =
      document.querySelector('.stream-chat-header') ||
      document.querySelector('[data-a-target="chat-header"]') ||
      document.querySelector('.chat-room__content');
    if (!chatHeader || document.getElementById('vortex-header-group')) return;

    const group = document.createElement('div');
    group.id = 'vortex-header-group';
    group.className = 'vortex-header-group';

    const btn7tv = document.createElement('button');
    btn7tv.type = 'button';
    btn7tv.className = 'seventv-header-btn';
    btn7tv.title = 'Настройки VortexChat';
    btn7tv.setAttribute('aria-label', 'Настройки VortexChat');
    btn7tv.innerHTML = `
      ${VORTEX_LOGO_SVG.replace('width="32" height="32"', 'width="24" height="24"')}
      <span class="seventv-live-dot"></span>
    `;
    btn7tv.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeQuickPanel();
      open7TVSettingsModal();
    };

    group.appendChild(btn7tv);
    const quickButton = document.createElement('button');
    quickButton.type = 'button';
    quickButton.className = 'seventv-header-btn vortex-quick-button';
    quickButton.title = 'Быстрые настройки чата';
    quickButton.setAttribute('aria-label', 'Быстрые настройки чата');
    quickButton.setAttribute('aria-expanded', 'false');
    quickButton.textContent = '☷';
    quickButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleQuickPanel(quickButton);
    });
    group.appendChild(quickButton);
    chatTools?.mountHeader(group);
    chatHeader.prepend(group);
  }

  // =========================================================================
  // 2. NATIVE TWITCH EMOTE PICKER INTEGRATION (1:1 7TV Emote Menu)
  // =========================================================================
  function hookNativeTwitchEmotePicker() {
    const nativeBtn = findNativeTwitchEmoteButton();
    if (nativeBtn && nativeBtn.getAttribute('data-vortex-hooked') !== '1') {
      nativeBtn.setAttribute('data-vortex-hooked', '1');
      nativeBtn.title = 'Смайлики Twitch + 7TV + BTTV + FFZ';

      nativeBtn.addEventListener('click', () => {
        [50, 140, 280, 500].forEach((delayMs) => {
          setTimeout(() => {
            const nativeDialog = findNativeTwitchEmotePickerDialog();
            if (nativeDialog) {
              injectIntoNativeEmotePickerDialog(nativeDialog);
            }
          }, delayMs);
        });
      });
    }

    const nativeDialog = findNativeTwitchEmotePickerDialog();
    if (nativeDialog) {
      injectIntoNativeEmotePickerDialog(nativeDialog);
    }
  }

  function findNativeEmoteScrollListAndNav(dialogEl) {
    const searchInput = dialogEl.querySelector(
      '[data-a-target="emote-name-filter"], input[type="search"], input[placeholder*="Поиск" i], input[placeholder*="Search" i], input[type="text"]'
    );

    let scrollList = null;

    // Strategy 1: Walk up from an existing native Twitch emote inside the picker
    const sampleEmote = dialogEl.querySelector(
      'img[src*="jtvnw.net/emoticons"], button[data-a-target="emote-name"], .emote-picker__emote-link, [data-test-selector="emote-button"]'
    );
    if (sampleEmote) {
      let curr = sampleEmote.parentElement;
      while (curr && curr !== dialogEl) {
        const st = window.getComputedStyle(curr);
        const isScrollable =
          st.overflowY === 'auto' ||
          st.overflowY === 'scroll' ||
          curr.classList.contains('simplebar-content') ||
          curr.classList.contains('emote-picker__scrollable-content') ||
          curr.getAttribute('data-a-target') === 'emote-picker-scrollable-content';
        if (isScrollable && !(searchInput && curr.contains(searchInput))) {
          scrollList = curr.querySelector('.simplebar-content') || curr;
          break;
        }
        curr = curr.parentElement;
      }
    }

    // Strategy 2: Scan divs inside dialogEl that DO NOT contain searchInput and are scrollable
    if (!scrollList) {
      const explicit = dialogEl.querySelector(
        '.emote-picker__scrollable-content, [data-a-target="emote-picker-scrollable-content"], .simplebar-content'
      );
      if (explicit && !(searchInput && explicit.contains(searchInput))) {
        scrollList = explicit;
      }
    }

    if (!scrollList) {
      const allDivs = Array.from(dialogEl.querySelectorAll('div'));
      for (const d of allDivs) {
        if (searchInput && d.contains(searchInput)) continue;
        const st = window.getComputedStyle(d);
        if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && d.clientHeight > 70 && d.clientWidth > 140) {
          scrollList = d.querySelector('.simplebar-content') || d;
          break;
        }
      }
    }

    // Strategy 3: Walk up from searchInput to the top header block and pick the scrollable pane below it
    if (!scrollList && searchInput) {
      let curr = searchInput.parentElement;
      while (curr && curr !== dialogEl) {
        if (curr.nextElementSibling && curr.nextElementSibling.clientHeight > 80) {
          const bodyArea = curr.nextElementSibling;
          const innerScroll = Array.from(bodyArea.querySelectorAll('div')).find(d => {
            const st = window.getComputedStyle(d);
            return (st.overflowY === 'auto' || st.overflowY === 'scroll') && d.clientWidth > 140;
          });
          scrollList = innerScroll || bodyArea.firstElementChild || bodyArea;
          break;
        }
        curr = curr.parentElement;
      }
    }

    // Locate Twitch's right-hand vertical category navigation sidebar
    let navSidebar = null;
    const allContainers = Array.from(dialogEl.querySelectorAll('div, nav, ul'));
    for (const el of allContainers) {
      if (searchInput && el.contains(searchInput)) continue;
      if (scrollList && (scrollList.contains(el) || el.contains(scrollList))) continue;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w >= 26 && w <= 62 && h >= 80 && el.querySelectorAll('button').length >= 1) {
        const firstBtn = el.querySelector('button');
        navSidebar = (firstBtn && firstBtn.parentElement && firstBtn.parentElement !== el)
          ? (firstBtn.parentElement.parentElement && firstBtn.parentElement.tagName === 'DIV' && firstBtn.parentElement.children.length === 1
              ? firstBtn.parentElement.parentElement
              : firstBtn.parentElement)
          : el;
        break;
      }
    }

    return { scrollList, navSidebar, searchInput };
  }

  function updateNativeBottomBar(dialogEl, em) {
    const bar = dialogEl.querySelector('#vortex-native-bottom-bar');
    if (!bar || !em) return;
    const imgEl = bar.querySelector('.vortex-native-bottom-bar-img');
    const nameEl = bar.querySelector('.vortex-native-bottom-bar-name');
    const subEl = bar.querySelector('.vortex-native-bottom-bar-sub');
    if (imgEl) { imgEl.src = em.url; imgEl.hidden = false; }
    if (nameEl) nameEl.textContent = em.code;
    if (subEl) {
      const catLabel = em.isChannel ? `Канал #${state.currentChannel}` : 'Глобальные';
      subEl.textContent = `${em.provider} • ${catLabel}${em.zeroWidth ? ' • Zero-Width' : ''}`;
    }
  }

  function createNativeEmoteButton(em, dialogEl) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vortex-native-emote-btn';
    btn.setAttribute('data-emote-code', em.code);
    btn.title = `${em.code} (${em.provider}${em.zeroWidth ? ' • Zero-Width' : ''}) · Правый клик: избранное`;
    btn.dataset.favorite = String(isFavorite(em));
    btn.setAttribute('aria-label', `${em.code}${isFavorite(em) ? ', в избранном' : ''}`);
    btn.oncontextmenu = event => { event.preventDefault(); event.stopPropagation(); toggleFavorite(em); };

    btn.innerHTML = `
      <img src="${escapeHTML(em.url)}" alt="${escapeHTML(em.code)}" loading="lazy" />
      ${em.zeroWidth ? `<span class="vortex-native-zw-dot" title="Zero-Width"></span>` : ''}
    `;

    btn.onmouseenter = () => {
      updateNativeBottomBar(dialogEl, em);
    };

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const token = `${em.code} `;
      if (state.settings.sendOnEmoteClick || e.shiftKey) {
        sendTextToTwitchChat(token);
        rememberEmote(em);
      } else {
        if (insertTextIntoTwitchChat(token)) rememberEmote(em);
      }
    };

    return btn;
  }

  function renderNative7TVSections(nativeSectionsRoot, dialogEl, searchQuery = '') {
    if (!nativeSectionsRoot) return;
    nativeSectionsRoot.innerHTML = '';

    const q = (searchQuery || '').toLowerCase().trim();
    const matchesSearch = (em) => !q || em.code.toLowerCase().includes(q);

    const channel7TV = state.settings.enable7TV
      ? EMOTE_LIBRARY.filter(em => em.provider === '7TV' && em.isChannel && matchesSearch(em))
      : [];
    const global7TV = state.settings.enable7TV
      ? EMOTE_LIBRARY.filter(em => em.provider === '7TV' && !em.isChannel && matchesSearch(em))
      : [];
    const bttvEmotes = state.settings.enableBTTV
      ? EMOTE_LIBRARY.filter(em => em.provider === 'BTTV' && matchesSearch(em))
      : [];
    const ffzEmotes = state.settings.enableFFZ
      ? EMOTE_LIBRARY.filter(em => em.provider === 'FFZ' && matchesSearch(em))
      : [];

    const sections = [
      {
        id: 'vortex-sec-recent', title: 'Недавние', badgeHtml: '<span aria-hidden="true">◷</span>',
        items: recentEmoteKeys.map(key => EMOTE_LIBRARY.find(em => VortexCore.favoriteKey(em) === key))
          .filter(em => em && matchesSearch(em)), showRefresh: false, showClear: true
      },
      {
        id: 'vortex-sec-favorites', title: 'Избранное', badgeHtml: '<span aria-hidden="true">★</span>',
        items: EMOTE_LIBRARY.filter(em => isFavorite(em) && matchesSearch(em)), showRefresh: false
      },
      {
        id: 'vortex-sec-7tv-channel',
        title: `${state.currentChannel || 'Channel'} • 7TV`,
        badgeHtml: SEVEN_TV_LOGO_SVG,
        items: channel7TV,
        showRefresh: true
      },
      {
        id: 'vortex-sec-7tv-global',
        title: 'Глобальные смайлики 7TV',
        badgeHtml: SEVEN_TV_LOGO_SVG,
        items: global7TV,
        showRefresh: false
      },
      {
        id: 'vortex-sec-bttv',
        title: 'BetterTTV',
        badgeHtml: `<span style="background:#ef4444; color:#fff; font-size:9px; font-weight:800; padding:1px 4px; border-radius:3px;">BTTV</span>`,
        items: bttvEmotes,
        showRefresh: false
      },
      {
        id: 'vortex-sec-ffz',
        title: 'FrankerFaceZ',
        badgeHtml: `<span style="background:#a855f7; color:#fff; font-size:9px; font-weight:800; padding:1px 4px; border-radius:3px;">FFZ</span>`,
        items: ffzEmotes,
        showRefresh: false
      }
    ];

    sections.forEach(sec => {
      if (sec.items.length === 0 && sec.id !== 'vortex-sec-favorites' && sec.id !== 'vortex-sec-recent') return;

      const secEl = document.createElement('div');
      secEl.className = 'vortex-native-section';
      secEl.id = sec.id;

      const headerEl = document.createElement('div');
      headerEl.className = 'vortex-native-sec-header';
      headerEl.innerHTML = `
        <div class="vortex-native-sec-title">
          ${sec.badgeHtml}
          <span>${escapeHTML(sec.title)}</span>
          <span style="color:#adadb8; font-weight:400; font-size:11px;">(${sec.items.length})</span>
        </div>
        ${sec.showClear && recentEmoteKeys.length ? '<button type="button" class="vortex-native-clear-recent" title="Очистить недавние смайлы" aria-label="Очистить недавние смайлы">Очистить</button>' : ''}
        ${sec.showRefresh ? `
          <button type="button" class="vortex-native-refresh-btn" title="Обновить сет смайликов 7TV" style="background:transparent; border:none; color:#adadb8; cursor:pointer; padding:2px; display:inline-flex; align-items:center;">
            ${ICONS.refresh}
          </button>
        ` : ''}
      `;

      const refreshBtn = headerEl.querySelector('.vortex-native-refresh-btn');
      headerEl.querySelector('.vortex-native-clear-recent')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        clearRecentEmotes();
      });
      if (refreshBtn) {
        refreshBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          showToast(`Обновление смайлов 7TV для #${state.currentChannel}...`);
          loadLiveChannelEmotes(state.currentChannel, true);
        };
      }

      const gridEl = document.createElement('div');
      gridEl.className = 'vortex-native-emote-grid';

      sec.items.forEach(em => {
        gridEl.appendChild(createNativeEmoteButton(em, dialogEl));
      });

      secEl.appendChild(headerEl);
      if (!sec.items.length) {
        const empty = document.createElement('p');
        empty.className = 'vortex-favorites-empty';
        empty.textContent = sec.id === 'vortex-sec-recent'
          ? (q ? 'Нет совпадений среди недавних' : 'Выбранные смайлы появятся здесь')
          : q ? 'Нет совпадений в избранном' : favoriteCodes.size
            ? 'Избранные смайлы недоступны на этом канале или провайдер выключен'
            : 'Правый клик по смайлу или ★ в его карточке — добавить в избранное';
        gridEl.appendChild(empty);
      }
      secEl.appendChild(gridEl);
      nativeSectionsRoot.appendChild(secEl);
    });
  }

  function injectIntoNativeEmotePickerDialog(dialogEl) {
    if (!dialogEl) return;

    const { scrollList, navSidebar, searchInput } = findNativeEmoteScrollListAndNav(dialogEl);
    if (!scrollList) return;

    const currentChan = getChannelName();
    if (currentChan && currentChan !== loadedChannelEmotesFor) {
      state.currentChannel = currentChan;
      loadLiveChannelEmotes(currentChan, true);
    }

    // 1. Inject 7TV / BTTV / FFZ sections directly into Twitch's native emote scrollable list
    let nativeSectionsRoot = dialogEl.querySelector('#vortex-7tv-native-sections');
    if (!nativeSectionsRoot) {
      nativeSectionsRoot = document.createElement('div');
      nativeSectionsRoot.id = 'vortex-7tv-native-sections';
      nativeSectionsRoot.className = 'vortex-7tv-native-sections';

      nativeSectionsRoot.addEventListener('click', (e) => e.stopPropagation());
      nativeSectionsRoot.addEventListener('mousedown', (e) => e.stopPropagation());

      const firstNativeSection = scrollList.firstElementChild;
      if (firstNativeSection && /часто|frequent|recent/i.test(firstNativeSection.textContent || '')) {
        firstNativeSection.insertAdjacentElement('afterend', nativeSectionsRoot);
      } else {
        scrollList.prepend(nativeSectionsRoot);
      }

      renderNative7TVSections(nativeSectionsRoot, dialogEl, '');
    }

    // 2. Inject 7TV / BTTV / FFZ category icons into Twitch's right-hand vertical category sidebar
    if (navSidebar && !dialogEl.querySelector('#vortex-native-sidebar-icons')) {
      const navGroup = document.createElement('div');
      navGroup.id = 'vortex-native-sidebar-icons';
      navGroup.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:2px; padding:4px 0; border-top:1px solid #2f2f35; border-bottom:1px solid #2f2f35; margin:2px 0;';

      const navItems = [
        { targetId: 'vortex-sec-recent', title: 'Недавние смайлы', html: '<span aria-hidden="true" style="font-size:20px;">◷</span>' },
        { targetId: 'vortex-sec-favorites', title: 'Избранное', html: '<span aria-hidden="true">★</span>' },
        { targetId: 'vortex-sec-7tv-channel', title: `7TV Канал #${state.currentChannel}`, html: SEVEN_TV_LOGO_SVG },
        { targetId: 'vortex-sec-7tv-global', title: 'Глобальные 7TV', html: `<span style="font-size:10px; font-weight:900; color:#29b6f6;">7TV</span>` },
        { targetId: 'vortex-sec-bttv', title: 'BetterTTV', html: `<span style="font-size:9px; font-weight:900; color:#f43f5e;">BTTV</span>` },
        { targetId: 'vortex-sec-ffz', title: 'FrankerFaceZ', html: `<span style="font-size:9px; font-weight:900; color:#a855f7;">FFZ</span>` }
      ];

      navItems.forEach(item => {
        const navBtn = document.createElement('button');
        navBtn.type = 'button';
        navBtn.className = 'vortex-native-nav-btn';
        navBtn.title = item.title;
        navBtn.innerHTML = item.html;
        navBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const secEl = dialogEl.querySelector(`#${item.targetId}`);
          if (secEl) {
            secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };
        navGroup.appendChild(navBtn);
      });

      navSidebar.appendChild(navGroup);
    }

    // 3. Inject 7TV bottom hover preview bar inside Twitch Emote Picker
    if (!dialogEl.querySelector('#vortex-native-bottom-bar')) {
      const bottomBar = document.createElement('div');
      bottomBar.id = 'vortex-native-bottom-bar';
      bottomBar.className = 'vortex-native-bottom-bar';
      const defaultEmote = EMOTE_LIBRARY[0] || { url: '', code: 'Наведи на смайл' };
      bottomBar.innerHTML = `
        <img class="vortex-native-bottom-bar-img" ${defaultEmote.url ? `src="${escapeHTML(defaultEmote.url)}"` : 'hidden'} alt="${escapeHTML(defaultEmote.code)}" />
        <div class="vortex-native-bottom-bar-info">
          <div class="vortex-native-bottom-bar-name">${escapeHTML(defaultEmote.code)}</div>
          <div class="vortex-native-bottom-bar-sub">7TV • Канал #${state.currentChannel}</div>
        </div>
        ${SEVEN_TV_LOGO_SVG}
      `;
      bottomBar.addEventListener('click', (e) => e.stopPropagation());
      dialogEl.appendChild(bottomBar);
    }

    // 4. Hook Twitch's native emote search input
    if (searchInput && searchInput.getAttribute('data-vortex-search-hooked') !== '1') {
      searchInput.setAttribute('data-vortex-search-hooked', '1');
      searchInput.addEventListener('input', (e) => {
        const q = (e.target.value || '').toLowerCase().trim();
        const root = dialogEl.querySelector('#vortex-7tv-native-sections');
        if (root) {
          renderNative7TVSections(root, dialogEl, q);
        }
      });
    }
  }

  // =========================================================================
  // 3. 7TV TAB & :COLON: AUTOCOMPLETE IN CHAT INPUT
  // =========================================================================
  let acSelectedIndex = 0;
  let acCurrentMatches = [];
  let acCurrentTokens = [];
  let acLastValue = '';
  let acLastEditor = null;

  function completionAtEnd(editor) {
    if (!editor) return false;
    if (editor.tagName === 'TEXTAREA') {
      return editor.selectionStart === editor.value.length && editor.selectionEnd === editor.value.length;
    }
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.rangeCount || !editor.contains(selection.anchorNode)) return false;
    const tail = selection.getRangeAt(0).cloneRange();
    tail.selectNodeContents(editor);
    tail.setStart(selection.anchorNode, selection.anchorOffset);
    return !tail.toString().replace(/[\uFEFF\u200B\s]/g, '');
  }

  function completionTokens(value) {
    const match = /^(.*?)(\S*)$/s.exec(value);
    return [match[1], match[2]];
  }

  function initTabCompletion() {
    document.addEventListener('keydown', (e) => {
      if (!state.settings.enableAutocomplete) return;
      if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey || (e.key === 'Tab' && e.shiftKey)) return;
      const target = findTwitchChatInput();
      if (!target || !(target === e.target || target.contains(e.target))) return;
      if (!completionAtEnd(target)) { hideAutocompletePopup(); return; }

      const popup = document.getElementById('vortex-autocomplete-popup');

      if (popup && acCurrentMatches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          acSelectedIndex = (acSelectedIndex + 1) % acCurrentMatches.length;
          highlightAutocompleteItem();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          acSelectedIndex = (acSelectedIndex - 1 + acCurrentMatches.length) % acCurrentMatches.length;
          highlightAutocompleteItem();
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          const chosen = acCurrentMatches[acSelectedIndex] || acCurrentMatches[0];
          if (chosen) {
            acCurrentTokens[acCurrentTokens.length - 1] = chosen.code;
            insertTextIntoTwitchChat(acCurrentTokens.join('') + ' ', true);
            hideAutocompletePopup();
          }
          return;
        }
      }

      if (e.key === 'Tab') {
        const val = getChatInputText(target);
        const tokens = completionTokens(val);
        const lastToken = (tokens[tokens.length - 1] || '').replace(/^:/, '');
        if (!lastToken || lastToken.length < 2) return;

        const match = VortexCore.suggestEmotes(EMOTE_LIBRARY, lastToken, 1)[0];
        if (match) {
          e.preventDefault();
          tokens[tokens.length - 1] = match.code;
          insertTextIntoTwitchChat(tokens.join('') + ' ', true);
          hideAutocompletePopup();
        }
      } else if (['Escape', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        hideAutocompletePopup();
      }
    }, true);

    function updateSuggestions() {
      if (!state.settings.enableAutocomplete) { hideAutocompletePopup(); return; }
      const target = findTwitchChatInput();
      const focused = document.activeElement;
      if (!target || !focused || !(target === focused || target.contains(focused))) {
        hideAutocompletePopup();
        return;
      }

      const val = getChatInputText(target);
      if (document.getElementById('vortex-autocomplete-popup') && val === acLastValue && target === acLastEditor) {
        positionAutocompletePopup(target);
        return;
      }
      const tokens = completionTokens(val);
      const rawLast = tokens[tokens.length - 1] || '';
      const matches = VortexCore.suggestEmotes(EMOTE_LIBRARY, rawLast);
      if (matches.length === 0) {
        hideAutocompletePopup();
        return;
      }

      acSelectedIndex = 0;
      acCurrentMatches = matches;
      acCurrentTokens = tokens;
      acLastValue = val;
      acLastEditor = target;
      showAutocompletePopup(matches, tokens, target);
    }
    document.addEventListener('input', e => {
      if (e.isComposing) return;
      queueMicrotask(updateSuggestions);
    }, true);
    document.addEventListener('compositionend', () => queueMicrotask(updateSuggestions), true);
    document.addEventListener('keyup', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      queueMicrotask(updateSuggestions);
    }, true);
    setInterval(updateSuggestions, 200);
  }

  function highlightAutocompleteItem() {
    const box = document.getElementById('vortex-autocomplete-popup');
    if (!box) return;
    box.querySelectorAll('.vortex-ac-item').forEach((btn, idx) => {
      if (idx === acSelectedIndex) {
        btn.style.borderColor = '#29b6f6';
        btn.style.background = 'rgba(41, 182, 246, 0.2)';
      } else {
        btn.style.borderColor = '#2f2f35';
        btn.style.background = '#1f1f23';
      }
    });
  }

  function hideAutocompletePopup() {
    const el = document.getElementById('vortex-autocomplete-popup');
    if (el) el.remove();
    acCurrentMatches = [];
    acLastValue = '';
    acLastEditor = null;
  }

  function positionAutocompletePopup(editor) {
    const box = document.getElementById('vortex-autocomplete-popup');
    if (!box || !editor) return;
    const rect = editor.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    box.style.top = `${Math.max(8, rect.top - 53)}px`;
  }

  function showAutocompletePopup(matches, tokens, editor) {
    let box = document.getElementById('vortex-autocomplete-popup');
    if (!box) {
      box = document.createElement('div');
      box.id = 'vortex-autocomplete-popup';
      box.style.cssText = 'position:fixed; background:#18181b; border:1px solid #2f2f35; border-radius:6px; padding:6px; z-index:2147483000; box-shadow:0 12px 30px rgba(0,0,0,0.85); display:flex; gap:6px; overflow-x:auto; align-items:center;';
      document.body.appendChild(box);
    }
    positionAutocompletePopup(editor);

    box.innerHTML = matches.map((em, idx) => `
      <button type="button" class="vortex-ac-item" data-code="${escapeHTML(em.code)}" style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; background:${idx === acSelectedIndex ? 'rgba(41,182,246,0.2)' : '#1f1f23'}; border:1px solid ${idx === acSelectedIndex ? '#29b6f6' : '#2f2f35'}; border-radius:4px; color:#efeff1; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap;">
        <img src="${escapeHTML(em.url)}" style="width:22px; height:22px; object-fit:contain;" />
        <span>${escapeHTML(em.code)}</span>
        <span style="font-size:9px; color:#29b6f6;">${escapeHTML(em.provider)}</span>
      </button>
    `).join('') + '<span class="vortex-ac-hint">Tab — выбрать</span>';

    box.querySelectorAll('.vortex-ac-item').forEach(btn => {
      btn.onmousedown = event => event.preventDefault();
      btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const code = btn.getAttribute('data-code');
        tokens[tokens.length - 1] = code;
        insertTextIntoTwitchChat(tokens.join('') + ' ', true);
        hideAutocompletePopup();
        editor?.focus();
      };
    });
  }

  // =========================================================================
  // 4. 7TV EMOTE TOOLTIP (4x Preview) & 7TV EMOTE CARD (1x/2x/3x/4x Dialog)
  // =========================================================================
  function get4xUrl(emote) {
    if (!emote || !emote.url) return '';
    return emote.url.replace('/2x.webp', '/4x.webp').replace('/2x', '/3x');
  }

  function showEmoteTooltip(emote, rect, stackedOverlays = []) {
    hideEmoteTooltip();
    const tip = document.createElement('div');
    tip.id = 'vortex-emote-tooltip';
    tip.className = 'vortex-emote-tooltip';
    const overlaysHtml = stackedOverlays.length > 0
      ? `<div style="margin-top:4px; padding-top:4px; border-top:1px solid #2f2f35; font-size:10px; color:#29b6f6;">+ Слои Zero-Width: ${escapeHTML(stackedOverlays.map(o => o.code).join(', '))}</div>`
      : '';
    tip.innerHTML = `
      <img src="${escapeHTML(get4xUrl(emote))}" alt="${escapeHTML(emote.code)}" />
      <div class="vortex-emote-tooltip-code">${escapeHTML(emote.code)}</div>
      ${emote.owner ? `<div class="vortex-emote-tooltip-author">автор: ${escapeHTML(emote.owner)}</div>` : ''}
      <div class="vortex-emote-tooltip-provider">${escapeHTML(emote.provider)} ${emote.isChannel ? 'Channel Emote' : 'Global Emote'}${emote.zeroWidth ? ' • Zero-Width' : ''}</div>
      ${overlaysHtml}
    `;
    document.body.appendChild(tip);
    const top = Math.max(8, rect.top - tip.offsetHeight - 8);
    const left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, rect.left + rect.width / 2 - tip.offsetWidth / 2));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  function hideEmoteTooltip() {
    const existing = document.getElementById('vortex-emote-tooltip');
    if (existing) existing.remove();
  }

  function open7TVEmoteCard(emote) {
    const existing = document.getElementById('seventv-emote-card-modal');
    if (existing) existing.dispatchEvent(new Event('vortex-close-dialog'));

    const base7tvId = emote.id || '01F61B1440000991F7SWQNMVX7';
    const is7TV = emote.provider === '7TV';
    const url1x = is7TV ? `https://cdn.7tv.app/emote/${base7tvId}/1x.webp` : emote.url;
    const url2x = is7TV ? `https://cdn.7tv.app/emote/${base7tvId}/2x.webp` : emote.url;
    const url3x = is7TV ? `https://cdn.7tv.app/emote/${base7tvId}/3x.webp` : emote.url;
    const url4x = is7TV ? `https://cdn.7tv.app/emote/${base7tvId}/4x.webp` : emote.url;

    const overlay = document.createElement('div');
    overlay.id = 'seventv-emote-card-modal';
    overlay.className = 'seventv-card-overlay';
    overlay.innerHTML = `
      <div class="seventv-emote-card">
        <div class="seventv-card-header">
          <div style="display:flex; align-items:center; gap:8px;">
            ${SEVEN_TV_LOGO_SVG}
            <span style="font-weight:700; font-size:13px;">Карточка смайлика ${escapeHTML(emote.provider)}</span>
          </div>
          <button id="seventv-card-close" style="background:none; border:none; color:#adadb8; cursor:pointer; font-size:16px;">✕</button>
        </div>

        <div class="seventv-card-sizes">
          <div class="seventv-size-col">
            <img src="${escapeHTML(url1x)}" alt="1x" style="height:28px; width:auto; object-fit:contain;" />
            <span class="seventv-size-label">1x</span>
          </div>
          <div class="seventv-size-col">
            <img src="${escapeHTML(url2x)}" alt="2x" style="height:48px; width:auto; object-fit:contain;" />
            <span class="seventv-size-label">2x</span>
          </div>
          <div class="seventv-size-col">
            <img src="${escapeHTML(url3x)}" alt="3x" style="height:68px; width:auto; object-fit:contain;" />
            <span class="seventv-size-label">3x</span>
          </div>
          <div class="seventv-size-col">
            <img src="${escapeHTML(url4x)}" alt="4x" style="height:88px; width:auto; object-fit:contain;" />
            <span class="seventv-size-label">4x</span>
          </div>
        </div>

        <div style="padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div style="font-size:16px; font-weight:800; color:#fff;">${escapeHTML(emote.code)}</div>
              <div style="font-size:11px; color:#adadb8; margin-top:2px;">
                Автор: <strong style="color:#efeff1;">${escapeHTML(emote.owner || '7TV')}</strong> • ${emote.isChannel ? `Канал #${state.currentChannel}` : 'Глобальный сет'}
              </div>
            </div>
            ${emote.zeroWidth ? `<span style="background:rgba(41,182,246,0.16); color:#29b6f6; border:1px solid rgba(41,182,246,0.4); font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">Zero-Width</span>` : ''}
          </div>

          <button id="vortex-card-favorite" class="vortex-tool-button" style="margin-top:14px;" aria-pressed="${isFavorite(emote)}">${isFavorite(emote) ? '★ В избранном' : '☆ В избранное'}</button>
          <div style="display:flex; gap:6px; margin-top:14px;">
            <button id="seventv-card-insert" style="flex:1; padding:8px; border-radius:6px; border:none; background:#29b6f6; color:#000; font-weight:700; font-size:11.5px; cursor:pointer;">Вставить в чат</button>
            <button id="seventv-card-copy" style="flex:1; padding:8px; border-radius:6px; border:1px solid #2f2f35; background:#26262c; color:#efeff1; font-weight:600; font-size:11.5px; cursor:pointer;">Копировать код</button>
            ${is7TV ? `<a href="https://7tv.app/emotes/${encodeURIComponent(base7tvId)}" target="_blank" rel="noreferrer" style="padding:8px 10px; border-radius:6px; border:1px solid #2f2f35; background:#1f1f23; color:#29b6f6; font-weight:700; font-size:11.5px; text-decoration:none; display:inline-flex; align-items:center;">7tv.app ↗</a>` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const closeDialog = VortexChatTools.enhanceDialog(overlay, `Смайл ${emote.code}`);
    const favorite = overlay.querySelector('#vortex-card-favorite');
    favorite.dataset.favoriteKey = VortexCore.favoriteKey(emote);
    favorite.onclick = () => toggleFavorite(emote);
    overlay.querySelector('#seventv-card-close').onclick = () => closeDialog();
    overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };
    overlay.querySelector('#seventv-card-insert').onclick = () => {
      insertTextIntoTwitchChat(`${emote.code} `);
      closeDialog(false);
    };
    overlay.querySelector('#seventv-card-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(emote.code); showToast(`Код смайла скопирован: ${emote.code}`); closeDialog(); }
      catch { showToast('Не удалось скопировать код'); }
    };
  }

  // =========================================================================
  // 5. LIVE CHAT MESSAGE ENRICHER (7TV Emotes, Zero-Width Stacking, Cosmetics)
  // =========================================================================
  const CHAT_LINE_SELECTOR = '.chat-line__message, [data-a-target="chat-line-message"]';
  const TEXT_SELECTOR = '.text-fragment, [data-a-target="chat-message-text"], .vortex-fallback-fragment';
  const parsedFragments = new WeakMap();
  const seenLines = new WeakMap();
  const seenMessageIds = new WeakMap();
  const originalUsernameStyles = new WeakMap();
  function lineLogin(line) {
    const username = line.querySelector('[data-a-target="chat-message-username"], .chat-line__username');
    return (username?.getAttribute('data-a-user') || username?.querySelector('[data-a-user]')?.getAttribute('data-a-user') ||
      username?.textContent || '').trim().toLowerCase();
  }
  const cosmetics = VortexCosmetics.create(async login => {
    const reply = await chrome.runtime.sendMessage({ action: 'VORTEX_GET_COSMETICS', login });
    if (!reply?.ok) throw new Error(reply?.error || '7TV cosmetics unavailable');
    return reply.data;
  }, login => {
    document.querySelectorAll(CHAT_LINE_SELECTOR).forEach(line => {
      if (lineLogin(line) === login) render7TVCosmetics(line);
    });
  });
  const originalMessages = new Map();
  let observedChatList = null;
  let chatObserver = null;
  let pendingChatFrame = null;
  const pendingLines = new Set();

  function messageText(line) {
    const content = line.querySelector('[data-a-target="chat-line-message-body"], .chat-line__message--content') || line;
    // Include native Twitch emotes in duplicate/highlight matching without changing their DOM.
    const clone = content.cloneNode(true);
    const originalFragments = [...content.querySelectorAll(TEXT_SELECTOR)];
    const copiedFragments = [...clone.querySelectorAll(TEXT_SELECTOR)];
    originalFragments.forEach((fragment, index) => {
      const original = parsedFragments.get(fragment);
      if (original && original.html === fragment.innerHTML && copiedFragments[index]) copiedFragments[index].textContent = original.text;
    });
    clone.querySelectorAll('.vortex-message-time, .vortex-repeat-badge, .vortex-user-history-button, .vortex-message-copy, .vortex-message-quote, .chat-line__timestamp, [data-a-target="chat-message-username"], .chat-line__username').forEach(el => el.remove());
    clone.querySelectorAll('img[alt]').forEach(img => img.replaceWith(document.createTextNode(img.alt)));
    return (clone.textContent || '').trim();
  }

  function messageKey(line) {
    const carrier = line.closest('[data-id], [data-message-id]') || line;
    return line.dataset.vortexMessageId || carrier.getAttribute('data-id') || carrier.getAttribute('data-message-id') || '';
  }

  function readTwitchMessageMetadata(line) {
    line.dispatchEvent(new Event('vortex-chat-metadata-request', { bubbles: true }));
  }

  function preserveModeratedMessage(line) {
    const key = messageKey(line);
    const body = line.querySelector('[data-a-target="chat-line-message-body"], .chat-line__message--content, .text-fragment');
    if (body?.querySelector('.vortex-restored-message')) return;
    const text = body?.textContent || line.textContent || '';
    const deleted = line.dataset.vortexDeleted === 'true' || /message deleted by a moderator|message deleted|сообщение удалено модератором|сообщение удалено/i.test(text) ||
      line.matches('[data-deleted="true"], .chat-line__message--deleted') ||
      Boolean(line.querySelector('[data-a-target="chat-deleted-message"], [data-a-target="chat-deleted-message-placeholder"]'));
    if (!deleted) {
      if (key && body && text.trim()) {
        originalMessages.delete(key);
        originalMessages.set(key, body.cloneNode(true));
        if (originalMessages.size > 500) originalMessages.delete(originalMessages.keys().next().value);
      }
      line.classList.remove('vortex-moderated-line');
      line.classList.remove('vortex-banned-line');
      return;
    }
    line.classList.add('vortex-moderated-line');
    line.classList.toggle('vortex-banned-line', line.dataset.vortexBanned === 'true');
    const placeholder = line.querySelector('[data-a-target="chat-deleted-message-placeholder"], [data-a-target="chat-deleted-message"]');
    if (line.querySelector('.vortex-restored-message')) return;
    const saved = key && originalMessages.get(key);
    const originalText = line.dataset.vortexOriginalBody;
    if (!saved && !originalText) return;
    const restored = document.createElement('span');
    restored.className = 'vortex-restored-message';
    if (saved) restored.append(...saved.cloneNode(true).childNodes);
    else restored.textContent = originalText;
    if (placeholder) placeholder.replaceWith(restored);
    else if (body) body.replaceChildren(restored);
  }

  function markFirstMessage(line) {
    // Detect only explicit first-time chatter markers provided by Twitch.
    // Do not guess from the first message observed in this browser session.
    const markers = '[data-a-target*="first-message"], [data-test-selector*="first-message"], [data-first-msg="true"], [data-first-message="true"], [data-first-time-chatter="true"], .first-time-chatter, .first-message-highlight, [data-a-target="chat-first-message-indicator"]';
    const nativeMarker = line.matches(markers) || Boolean(line.querySelector(markers)) ||
      Boolean(line.parentElement?.matches(markers));
    const label = line.querySelector('[data-a-target="chat-message-first-message"], [data-test-selector="first-message-indicator"], [data-a-target="first-message-indicator"]');
    const first = line.dataset.vortexFirstMsg === 'true' || nativeMarker || Boolean(label);
    line.classList.toggle('vortex-first-message-line', first);
    let badge = line.querySelector('.vortex-first-message-badge');
    if (!first) { badge?.remove(); return; }
    if (!badge) {
      const username = line.querySelector('[data-a-target="chat-message-username"], .chat-line__username');
      if (!username) return;
      badge = document.createElement('span');
      badge.className = 'vortex-first-message-badge';
      badge.textContent = 'FM';
      badge.title = 'Первое сообщение пользователя в чате';
      username.after(badge);
    }
  }

  function render7TVCosmetics(line) {
    const username = line.querySelector('[data-a-target="chat-message-username"], .chat-line__username');
    if (!username) return;
    const oldBadge = line.querySelector('.vortex-7tv-badge');
    if (!state.settings.enable7TV || !state.settings.enable7TVCosmetics) {
      oldBadge?.remove();
      if (originalUsernameStyles.has(username)) {
        username.style.cssText = originalUsernameStyles.get(username);
        originalUsernameStyles.delete(username);
      }
      username.classList.remove('vortex-7tv-paint');
      return;
    }
    const login = lineLogin(line);
    const data = cosmetics.get(login);
    if (!data) return;
    const paint = VortexCosmetics.paintStyle(data.paint);
    if (paint && !username.classList.contains('seventv-paint')) {
      if (!originalUsernameStyles.has(username)) originalUsernameStyles.set(username, username.style.cssText);
      username.classList.add('vortex-7tv-paint');
      username.style.backgroundImage = paint.backgroundImage;
      username.style.backgroundClip = paint.backgroundImage ? 'text' : '';
      username.style.webkitBackgroundClip = paint.backgroundImage ? 'text' : '';
      username.style.webkitTextFillColor = paint.backgroundImage ? 'transparent' : '';
      if (paint.color) username.style.color = paint.color;
      username.style.textShadow = paint.textShadow;
      username.style.fontWeight = paint.fontWeight;
      username.style.textTransform = paint.textTransform;
      username.style.webkitTextStroke = paint.stroke;
    }
    const badgeUrl = VortexCosmetics.badgeUrl(data.badge);
    if (badgeUrl && !line.querySelector('.seventv-badge')) {
      let badge = oldBadge;
      if (!badge) {
        badge = document.createElement('img');
        badge.className = 'vortex-7tv-badge';
        badge.alt = '7TV';
        username.before(badge);
      }
      if (badge.src !== badgeUrl) badge.src = badgeUrl;
      badge.title = data.badge.tooltip || data.badge.name || '7TV Badge';
    } else oldBadge?.remove();
  }

  function scanExistingChatMessages() {
    const lines = document.querySelectorAll(CHAT_LINE_SELECTOR);
    lines.forEach(enrichChatLine);
    updateLineGroups(lines);
  }

  function updateLineGroups(lines = document.querySelectorAll(CHAT_LINE_SELECTOR)) {
    let previous = null;
    let previousUser = '';
    let previousText = '';
    const counts = new Map();
    lines.forEach((line, index) => {
      line.classList.toggle('vortex-alt-row-even', state.settings.alternatingRows && index % 2 === 1);
      const username = line.querySelector('[data-a-target="chat-message-username"], .chat-line__username')?.textContent || '';
      const text = messageText(line);
      const duplicate = Boolean(state.settings.collapseSpam && username && text && previous &&
        previousUser === username && VortexCore.sameSpamMessage(previousText, text, state.settings.fuzzySpam));
      line.classList.toggle('vortex-duplicate-line', duplicate);
      if (duplicate) counts.set(previous, (counts.get(previous) || 1) + 1);
      else { previous = line; previousUser = username; previousText = text; }
    });
    lines.forEach(line => {
      const count = counts.get(line);
      let badge = line.querySelector('.vortex-repeat-badge');
      if (!count) { badge?.remove(); return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'vortex-repeat-badge';
        line.appendChild(badge);
      }
      if (badge.textContent !== `×${count}`) badge.textContent = `×${count}`;
    });
  }

  function ensureChatEnricher() {
    const chatList = document.querySelector('.chat-scrollable-area__message-container') ||
      document.querySelector('[data-a-target="chat-scroller"]');
    if (chatList === observedChatList) return;
    chatObserver?.disconnect();
    observedChatList = chatList;
    chatTools?.attach(chatList);
    pendingLines.clear();
    if (!chatList) return;
    scanExistingChatMessages();
    chatObserver = new MutationObserver(mutations => {
      let removedLines = false;
      for (const mutation of mutations) {
        for (const removed of mutation.removedNodes) {
          if (removed.nodeType === 1 && (removed.matches(CHAT_LINE_SELECTOR) || removed.querySelector(CHAT_LINE_SELECTOR))) removedLines = true;
        }
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        const parentLine = target?.closest(CHAT_LINE_SELECTOR);
        if (parentLine) pendingLines.add(parentLine);
        for (const added of mutation.addedNodes) {
          if (added.nodeType !== 1) continue;
          if (added.matches(CHAT_LINE_SELECTOR)) pendingLines.add(added);
          added.querySelectorAll(CHAT_LINE_SELECTOR).forEach(line => pendingLines.add(line));
        }
      }
      if ((!pendingLines.size && !removedLines) || pendingChatFrame !== null) return;
      pendingChatFrame = requestAnimationFrame(() => {
        pendingChatFrame = null;
        const lines = [...pendingLines];
        pendingLines.clear();
        lines.filter(line => line.isConnected).forEach(enrichChatLine);
        updateLineGroups();
      });
    });
    chatObserver.observe(chatList, { childList: true, characterData: true, subtree: true });
  }

  function enrichChatLine(node) {
    if (!node?.matches?.(CHAT_LINE_SELECTOR)) return;
    readTwitchMessageMetadata(node);
    preserveModeratedMessage(node);
    markFirstMessage(node);
    render7TVCosmetics(node);
    const messageId = node.getAttribute('data-id') || node.getAttribute('data-message-id');
    if (!seenLines.has(node) || seenMessageIds.get(node) !== messageId) {
      seenLines.set(node, new Date());
      seenMessageIds.set(node, messageId);
    }
    node.classList.add('vortex-chat-line');
    // Earlier versions applied simulated 7TV paints; remove only our own class.
    node.querySelectorAll('.seventv-paint-cyan').forEach(el => el.classList.remove('seventv-paint-cyan'));
    // Twitch sometimes nests chat-message-text inside text-fragment. Render the
    // innermost matching element, otherwise the outer element is skipped below.
    const messageBody = node.querySelector('[data-a-target="chat-line-message-body"], .chat-line__message--content') || node;
    // Twitch changes its text wrappers. Find unmatched text nodes in the message
    // body so emotes still render when neither known selector covers the text.
    if (emoteMap.size) {
      const walker = document.createTreeWalker(messageBody, NodeFilter.SHOW_TEXT);
      const pending = [];
      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const parent = textNode.parentElement;
        if (!parent || parent.closest('a, button, [contenteditable], .vortex-zw-stack, .vortex-message-time, .vortex-repeat-badge, .vortex-user-history-button, .vortex-message-copy, .chat-line__timestamp, [data-a-target="chat-message-username"], .chat-line__username')) continue;
        const known = parent.closest(TEXT_SELECTOR);
        if (known && known.childElementCount === 0) continue;
        if (textNode.textContent.split(/\s+/).some(word => emoteMap.has(word))) pending.push(textNode);
      }
      pending.forEach(textNode => {
        const wrapper = document.createElement('span');
        wrapper.className = 'vortex-fallback-fragment';
        textNode.replaceWith(wrapper);
        wrapper.appendChild(textNode);
      });
    }
    const textFragments = [...messageBody.querySelectorAll(TEXT_SELECTOR)]
      .filter(fragment => !fragment.querySelector(TEXT_SELECTOR));
    const fullText = messageText(node);
    const usernameLogin = lineLogin(node);
    const matchingBadge = [...node.querySelectorAll('.chat-badge img, [data-a-target*="chat-badge"] img, .vortex-7tv-badge')]
      .some(badge => VortexCore.matchesExactList(badge.title || badge.alt, state.settings.highlightBadges));
    node.classList.toggle('vortex-highlight-line',
      VortexCore.matchesHighlight(fullText, state.settings.highlightWords) ||
      VortexCore.matchesExactList(usernameLogin, state.settings.highlightUsers) || matchingBadge);
    let timestamp = node.querySelector('.vortex-message-time');
    const nativeTimestamp = node.querySelector('.chat-line__timestamp, [data-a-target="chat-timestamp"]');
    if (state.settings.showTimestamps && !nativeTimestamp) {
      if (!timestamp) {
        timestamp = document.createElement('time');
        timestamp.className = 'vortex-message-time';
        timestamp.title = 'Время появления сообщения в расширении';
        node.prepend(timestamp);
      }
      const received = seenLines.get(node);
      timestamp.dateTime = received.toISOString();
      const display = received.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (timestamp.textContent !== display) timestamp.textContent = display;
    } else timestamp?.remove();

    textFragments.forEach(frag => {
      const previous = parsedFragments.get(frag);
      const unchanged = previous && frag.innerHTML === previous.html;
      if (unchanged && previous.revision === renderRevision) return;
      const text = unchanged ? previous.text : frag.textContent || '';
      if (!unchanged && frag.childElementCount > 0) return;
      if (!text.trim()) return;

      const tokens = text.split(/(\s+)/);
      let hasReplacement = false;

      const fragmentContainer = document.createDocumentFragment();
      let lastRenderedEmoteStack = null;

      tokens.forEach(tok => {
        const cleanTok = tok.trim();
        if (!cleanTok) {
          fragmentContainer.appendChild(document.createTextNode(tok));
          return;
        }

        const matchedEmote = emoteMap.get(cleanTok);
        const providerEnabled =
          matchedEmote &&
          ((matchedEmote.provider === '7TV' && state.settings.enable7TV) ||
           (matchedEmote.provider === 'BTTV' && state.settings.enableBTTV) ||
           (matchedEmote.provider === 'FFZ' && state.settings.enableFFZ));

        if (matchedEmote && providerEnabled) {
          hasReplacement = true;

          // 7TV Zero-Width Stacking
          if (matchedEmote.zeroWidth && state.settings.enableZeroWidth && lastRenderedEmoteStack) {
            const zwImg = document.createElement('img');
            zwImg.src = matchedEmote.url;
            zwImg.alt = matchedEmote.code;
            zwImg.className = 'vortex-zw-overlay';
            lastRenderedEmoteStack.container.appendChild(zwImg);
            lastRenderedEmoteStack.overlays.push(matchedEmote);
            return;
          }

          const stackWrap = document.createElement('span');
          stackWrap.className = 'vortex-zw-stack';
          stackWrap.tabIndex = 0;
          stackWrap.setAttribute('role', 'button');
          stackWrap.setAttribute('aria-label', `Смайл ${matchedEmote.code}, открыть карточку`);
          stackWrap.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); stackWrap.click(); }
          });

          const img = document.createElement('img');
          img.src = matchedEmote.url;
          img.alt = matchedEmote.code;
          img.className = 'vortex-chat-emote';

          const stackRecord = {
            base: matchedEmote,
            overlays: [],
            container: stackWrap
          };

          stackWrap.addEventListener('mouseenter', () => {
            showEmoteTooltip(stackRecord.base, stackWrap.getBoundingClientRect(), stackRecord.overlays);
          });
          stackWrap.addEventListener('mouseleave', () => {
            hideEmoteTooltip();
          });

          // Click opens 7TV Emote Card (like in official 7TV extension)
          stackWrap.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.shiftKey) {
              const allCodes = [stackRecord.base.code, ...stackRecord.overlays.map(o => o.code)].join(' ');
              insertTextIntoTwitchChat(`${allCodes} `);
            } else {
              open7TVEmoteCard(stackRecord.base);
            }
          });

          stackWrap.appendChild(img);
          fragmentContainer.appendChild(stackWrap);
          lastRenderedEmoteStack = stackRecord;
          return;
        }

        const mention = tok.match(/^([^a-z0-9_@]*)@([a-z0-9_]{1,25})([^a-z0-9_].*)?$/i);
        if (mention) {
          hasReplacement = true;
          if (mention[1]) fragmentContainer.appendChild(document.createTextNode(mention[1]));
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'vortex-chat-mention';
          button.textContent = `@${mention[2]}`;
          button.setAttribute('aria-label', `Открыть карточку ${mention[2]}`);
          button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            chatTools?.openUser(mention[2], button);
          });
          fragmentContainer.appendChild(button);
          if (mention[3]) fragmentContainer.appendChild(document.createTextNode(mention[3]));
          lastRenderedEmoteStack = null;
          return;
        }

        lastRenderedEmoteStack = null;
        fragmentContainer.appendChild(document.createTextNode(tok));
      });

      if (hasReplacement) {
        frag.replaceChildren(fragmentContainer);
      } else if (unchanged && frag.innerHTML !== escapeHTML(text)) {
        frag.textContent = text;
      }
      parsedFragments.set(frag, { text, html: frag.innerHTML, revision: renderRevision });
    });
    chatTools?.capture(node, seenLines.get(node), fullText);
  }

  // =========================================================================
  // 6. 7TV SETTINGS MODAL (1:1 7TV v3 Settings Window)
  // =========================================================================
  function open7TVSettingsModal() {
    const existing = document.getElementById('seventv-settings-overlay');
    if (existing) {
      existing.dispatchEvent(new Event('vortex-close-dialog'));
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'seventv-settings-overlay';
    overlay.className = 'seventv-settings-overlay';

    overlay.innerHTML = `
      <div class="seventv-settings-modal">
        <div class="seventv-settings-sidebar">
          <div class="seventv-sidebar-brand">
            ${VORTEX_LOGO_SVG}
            <div>
              <div style="font-weight:800; font-size:14px; color:#fff;">VortexChat</div>
              <div style="font-size:10px; color:#adadb8;">VortexChat v4.1.0</div>
            </div>
          </div>

          <button class="seventv-nav-btn active" data-tab="general">⚙️ Общие</button>
          <button class="seventv-nav-btn" data-tab="emotes">😊 Смайлики и Меню</button>
          <button class="seventv-nav-btn" data-tab="chat">💬 Чат и Ввод</button>
          <button class="seventv-nav-btn" data-tab="interface">✨ Интерфейс</button>
          <button class="seventv-nav-btn" data-tab="status">📡 Статус EventAPI</button>
        </div>

        <div class="seventv-settings-main">
          <div class="seventv-main-header">
            <span id="seventv-tab-heading" style="font-weight:800; font-size:15px;">Настройки VortexChat</span>
            <button id="seventv-settings-close" style="background:none; border:none; color:#adadb8; font-size:18px; cursor:pointer;">✕</button>
          </div>
          <div class="seventv-main-body" id="seventv-main-body"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const closeDialog = VortexChatTools.enhanceDialog(overlay, 'Настройки VortexChat');

    overlay.querySelector('#seventv-settings-close').onclick = () => closeDialog();
    overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };

    const navBtns = overlay.querySelectorAll('.seventv-nav-btn');
    navBtns.forEach(btn => {
      btn.onclick = () => {
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeSettingsTab = btn.getAttribute('data-tab');
        render7TVSettingsTab(overlay);
      };
    });

    render7TVSettingsTab(overlay);
  }

  function render7TVSettingsTab(overlay) {
    const body = overlay.querySelector('#seventv-main-body');
    const heading = overlay.querySelector('#seventv-tab-heading');
    if (!body) return;

    const tab = state.activeSettingsTab;

    if (tab === 'general') {
      heading.textContent = 'Настройки VortexChat';
      body.innerHTML = `
        <div class="seventv-setting-group">
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Смайлики 7TV (Канальные и Глобальные)</div>
              <div class="seventv-setting-desc">Включить рендер смайликов 7TV v3 в чате и в стандартном меню смайликов Twitch</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="enable7TV" ${state.settings.enable7TV ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Пейнты и бейджи пользователей 7TV</div>
              <div class="seventv-setting-desc">Показывать выбранную косметику 7TV рядом с именами пользователей в чате Twitch</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="enable7TVCosmetics" ${state.settings.enable7TVCosmetics ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Наложение слоев 7TV Zero-Width</div>
              <div class="seventv-setting-desc">Автоматически накладывать Zero-Width смайлы (RainTime, cvHazmat, PartyHat) поверх предыдущего смайла</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="enableZeroWidth" ${state.settings.enableZeroWidth ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Уведомления EventAPI v3 в чате</div>
              <div class="seventv-setting-desc">Показывать системные сообщения [7TV] при добавлении или удалении смайлов на канале</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="showEventNotices" ${state.settings.showEventNotices ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
        </div>
      `;
    } else if (tab === 'emotes') {
      heading.textContent = 'Смайлики и Стандартное меню Twitch';
      body.innerHTML = `
        <div class="seventv-setting-group">
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Провайдер BetterTTV (BTTV)</div>
              <div class="seventv-setting-desc">Отображать смайлики BetterTTV в чате и отдельной секцией в меню смайликов Twitch</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="enableBTTV" ${state.settings.enableBTTV ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Провайдер FrankerFaceZ (FFZ)</div>
              <div class="seventv-setting-desc">Отображать смайлики FrankerFaceZ в чате и в меню смайликов Twitch</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="enableFFZ" ${state.settings.enableFFZ ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Отправлять смайлик в чат сразу при клике в меню</div>
              <div class="seventv-setting-desc">Если выключено — смайлик вставляется в поле ввода чата (как в стандартном 7TV)</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="sendOnEmoteClick" ${state.settings.sendOnEmoteClick ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
        </div>
      `;
    } else if (tab === 'chat') {
      heading.textContent = 'Чат и Ввод';
      body.innerHTML = `
        <div class="seventv-setting-group">
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Автодополнение смайликов по Tab и :двоеточию</div>
              <div class="seventv-setting-desc">Всплывающее меню подсказок 7TV при наборе названия смайла в чате</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="enableAutocomplete" ${state.settings.enableAutocomplete ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Чередование фона сообщений (Alternating Background)</div>
              <div class="seventv-setting-desc">Подсвечивать каждую вторую строку в чате для удобного чтения</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="alternatingRows" ${state.settings.alternatingRows ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row">
            <div>
              <div class="seventv-setting-title">Группировка одинаковых сообщений (x2, x3...)</div>
              <div class="seventv-setting-desc">Показывать счетчик повторов рядом с одинаковыми сообщениями</div>
            </div>
            <label class="vortex-switch">
              <input type="checkbox" data-key="collapseSpam" ${state.settings.collapseSpam ? 'checked' : ''} />
              <span class="vortex-slider"></span>
            </label>
          </div>
          <div class="seventv-setting-row"><div><div class="seventv-setting-title">Считать похожие сообщения повторами</div><div class="seventv-setting-desc">Допускает до двух изменений в длинных сообщениях одного автора</div></div><label class="vortex-switch"><input type="checkbox" data-key="fuzzySpam" ${state.settings.fuzzySpam ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><label for="vortex-mention-name">Мой ник для упоминаний</label><input id="vortex-mention-name" class="vortex-setting-input" data-key="mentionName" maxlength="25" value="${escapeHTML(state.settings.mentionName)}" placeholder="ник Twitch" /></div>
          <div class="seventv-setting-row"><div class="seventv-setting-title">Звук при упоминании</div><label class="vortex-switch"><input type="checkbox" data-key="mentionSound" ${state.settings.mentionSound ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><label for="vortex-mention-color">Цвет упоминания</label><input id="vortex-mention-color" type="color" data-key="mentionColor" value="${state.settings.mentionColor}" /></div>
          <div class="seventv-setting-row"><div><div class="seventv-setting-title">История введённых сообщений</div><div class="seventv-setting-desc">Стрелки ↑ и ↓ в поле ввода</div></div><label class="vortex-switch"><input type="checkbox" data-key="inputHistory" ${state.settings.inputHistory ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row">
            <label for="vortex-font-size" class="seventv-setting-title">Размер текста</label>
            <select id="vortex-font-size" class="vortex-setting-input" data-key="fontSize">
              ${Array.from({ length: 14 }, (_, index) => index + 11).map(size => `<option value="${size}" ${state.settings.fontSize === size ? 'selected' : ''}>${size} px</option>`).join('')}
            </select>
          </div>
          <div class="seventv-setting-row">
            <div><div class="seventv-setting-title">Время сообщений</div>
              <div class="seventv-setting-desc">Время появления в расширении. Встроенные метки Twitch сохраняются.</div></div>
            <label class="vortex-switch"><input type="checkbox" data-key="showTimestamps" ${state.settings.showTimestamps ? 'checked' : ''} /><span class="vortex-slider"></span></label>
          </div>
          <div class="seventv-setting-row" style="display:block;">
            <label for="vortex-highlight-words" class="seventv-setting-title">Подсветка слов и упоминаний</label>
            <div class="seventv-setting-desc">Слова или фразы через запятую, например: твой ник, привет</div>
            <input id="vortex-highlight-words" class="vortex-setting-input" data-key="highlightWords" maxlength="500" placeholder="ник, слово, фраза" style="width:100%; margin-top:8px;" />
          </div>
          <div class="seventv-setting-row" style="display:block;">
            <label for="vortex-highlight-users" class="seventv-setting-title">Подсветка пользователей</label>
            <div class="seventv-setting-desc">Точные Twitch-имена через запятую</div>
            <input id="vortex-highlight-users" class="vortex-setting-input" data-key="highlightUsers" maxlength="500" placeholder="ник1, ник2" style="width:100%; margin-top:8px;" />
          </div>
          <div class="seventv-setting-row" style="display:block;">
            <label for="vortex-highlight-badges" class="seventv-setting-title">Подсветка бейджей</label>
            <div class="seventv-setting-desc">Названия бейджей через запятую</div>
            <input id="vortex-highlight-badges" class="vortex-setting-input" data-key="highlightBadges" maxlength="500" placeholder="VIP, Модератор" style="width:100%; margin-top:8px;" />
          </div>
          <div class="seventv-setting-row">
            <div><div class="seventv-setting-title">Пауза чата при наведении</div><div class="seventv-setting-desc">Фиксировать видимую ленту для чтения. Кнопка Ⅱ в шапке включает ручную паузу.</div></div>
            <label class="vortex-switch"><input type="checkbox" data-key="pauseOnHover" ${state.settings.pauseOnHover ? 'checked' : ''} /><span class="vortex-slider"></span></label>
          </div>
        </div>
      `;
    } else if (tab === 'interface') {
      heading.textContent = 'Интерфейс и видео';
      body.innerHTML = `
        <div class="seventv-setting-group">
          <div class="seventv-setting-row"><div><div class="seventv-setting-title">Тема VortexChat на Twitch</div><div class="seventv-setting-desc">Оформление навигации, чата, полей ввода и окон расширения. Можно выключить в любой момент.</div></div><label class="vortex-switch"><input type="checkbox" data-key="themeEnabled" ${state.settings.themeEnabled ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><label for="vortex-theme-preset">Цветовая палитра</label><select id="vortex-theme-preset" class="vortex-setting-input" data-key="themePreset"><option value="aurora">Аврора · бирюзовый и фиолетовый</option><option value="graphite">Графит · спокойный тёмный</option><option value="orchid">Орхидея · фиолетовый и розовый</option></select></div>
          <div class="seventv-setting-row"><label for="vortex-chat-density">Плотность сообщений</label><select id="vortex-chat-density" class="vortex-setting-input" data-key="chatDensity"><option value="comfortable">Обычная</option><option value="compact">Компактная</option></select></div>
          <div class="seventv-setting-row"><div><div class="seventv-setting-title">Ambilight вокруг плеера</div><div class="seventv-setting-desc">Кнопка ✦ в плеере. Цвета берутся из текущего кадра, если браузер разрешает чтение видео.</div></div><label class="vortex-switch"><input type="checkbox" data-key="ambilightEnabled" ${state.settings.ambilightEnabled ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><label for="vortex-ambilight-brightness">Яркость Ambilight</label><input id="vortex-ambilight-brightness" type="range" min="0" max="100" data-key="ambilightBrightness" value="${state.settings.ambilightBrightness}" /></div>
          <div class="seventv-setting-row"><label for="vortex-ambilight-spread">Размах свечения</label><input id="vortex-ambilight-spread" type="range" min="0" max="100" data-key="ambilightSpread" value="${state.settings.ambilightSpread}" /></div>
          <div class="seventv-setting-row"><label for="vortex-ambilight-response">Отклик Ambilight</label><input id="vortex-ambilight-response" type="range" min="0" max="100" data-key="ambilightResponse" value="${state.settings.ambilightResponse}" /></div>
          <div class="seventv-setting-row"><label for="vortex-ambilight-dim">Затемнение интерфейса</label><input id="vortex-ambilight-dim" type="range" min="0" max="100" data-key="ambilightDimUI" value="${state.settings.ambilightDimUI}" /></div>
          <div class="seventv-setting-row"><div><div class="seventv-setting-title">Открывать клипы поверх страницы</div><div class="seventv-setting-desc">Обычный клик по ссылке. Ctrl, Shift и средняя кнопка сохраняют поведение браузера.</div></div><label class="vortex-switch"><input type="checkbox" data-key="openClipsOverlay" ${state.settings.openClipsOverlay ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><div><div class="seventv-setting-title">Кнопка «В эфир»</div><div class="seventv-setting-desc">Возврат к прямому эфиру при отставании</div></div><label class="vortex-switch"><input type="checkbox" data-key="liveControls" ${state.settings.liveControls ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><div><div class="seventv-setting-title">Догонять эфир</div><div class="seventv-setting-desc">Ускоряет видео до 1.05× при отставании; выключено по умолчанию</div></div><label class="vortex-switch"><input type="checkbox" data-key="autoCatchup" ${state.settings.autoCatchup ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><div class="seventv-setting-title">Быстрые ссылки канала</div><label class="vortex-switch"><input type="checkbox" data-key="channelQuickLinks" ${state.settings.channelQuickLinks ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
          <div class="seventv-setting-row"><div class="seventv-setting-title">Превью каналов в боковом меню</div><label class="vortex-switch"><input type="checkbox" data-key="sidebarPreview" ${state.settings.sidebarPreview ? 'checked' : ''} /><span class="vortex-slider"></span></label></div>
        </div>`;
    } else if (tab === 'status') {
      const chCount = EMOTE_LIBRARY.filter(e => e.isChannel && e.provider === '7TV').length;
      const glCount = EMOTE_LIBRARY.filter(e => !e.isChannel && e.provider === '7TV').length;
      heading.textContent = 'Статус 7TV EventAPI v3 и Сета канала';
      body.innerHTML = `
        <div class="seventv-setting-group" style="padding:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#adadb8;">Канал Twitch:</span>
            <strong style="color:#29b6f6;">#${state.currentChannel}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#adadb8;">Активный сет смайлов 7TV:</span>
            <strong style="color:#efeff1;">${escapeHTML(active7TVEmoteSetName || 'Нет сета')}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#adadb8;">Смайликов 7TV (Канал / Глобальные):</span>
            <strong style="color:#10b981;">${chCount} / ${glCount}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:14px;">
            <span style="color:#adadb8;">7TV EventAPI v3 (wss://events.7tv.io/v3):</span>
            <strong data-vortex-event-state>${escapeHTML(eventStatusLabel())}</strong>
          </div>
          <button id="seventv-force-reload-btn" style="width:100%; padding:9px; border-radius:6px; border:none; background:#29b6f6; color:#000; font-weight:700; cursor:pointer;">
            Перезагрузить сет смайликов канала
          </button>
        </div>
      `;
      const reloadBtn = body.querySelector('#seventv-force-reload-btn');
      if (reloadBtn) {
        reloadBtn.onclick = () => {
          loadLiveChannelEmotes(state.currentChannel, true);
          showToast(`Загрузка смайликов для #${state.currentChannel}`);
        };
      }
    }

    for (const key of ['highlightWords', 'highlightUsers', 'highlightBadges']) {
      const field = body.querySelector(`[data-key="${key}"]`);
      if (field) field.value = state.settings[key];
    }
    body.querySelectorAll('[data-key]').forEach(input => {
      if (input.type !== 'checkbox') input.value = state.settings[input.dataset.key];
      input.onchange = () => {
        const key = input.getAttribute('data-key');
        saveSettings({ [key]: input.type === 'checkbox' ? input.checked : input.value });
      };
      if (input.type === 'checkbox') input.setAttribute('aria-label', input.closest('.seventv-setting-row')?.querySelector('.seventv-setting-title')?.textContent || input.dataset.key);
    });
  }

  // =========================================================================
  // MAIN INITIALIZATION LOOP
  // =========================================================================
  function init() {
    chatTools = VortexChatTools.create({ settings: () => state.settings, channel: () => state.currentChannel,
      getText: messageText, insertText: insertTextIntoTwitchChat, toast: showToast, saveSettings,
      openEmote: code => { const emote = emoteMap.get(code); if (emote) open7TVEmoteCard(emote); else showToast('Этот смайл больше не доступен на канале'); } });
    loadSettings();
    applySettings();
    ensureMainWorldPageBridge();
    initTabCompletion();
    loadLiveChannelEmotes(state.currentChannel);

    const maintain = () => {
      const ch = getChannelName();
      if (ch !== state.currentChannel) {
        state.currentChannel = ch;
        loadLiveChannelEmotes(ch);
      }
      if (ch && nextEmoteRetryAt && Date.now() >= nextEmoteRetryAt && channelLoadState !== 'loading') {
        nextEmoteRetryAt = Date.now() + 30000;
        loadLiveChannelEmotes(ch, true);
      }
      injectHeaderButtons();
      hookNativeTwitchEmotePicker();
      ensureChatEnricher();
      chatTools.maintain();
      const status = document.querySelector('[data-vortex-event-state]');
      if (status) status.textContent = eventStatusLabel();
      const dot = document.querySelector('.seventv-live-dot');
      if (dot) dot.dataset.connected = String(eventState === 'connected');
    };
    maintain();
    setInterval(maintain, 900);
    window.addEventListener('pagehide', () => {
      channelController?.abort();
      stop7TVEvents();
      chatObserver?.disconnect();
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted) { observedChatList = null; loadLiveChannelEmotes(state.currentChannel, true); maintain(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
