const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('../extension/core.js');
const network = require('../extension/background.js');

test('channel routes exclude navigation and handle popout/moderator', () => {
  for (const route of ['/', '/directory/game', '/inventory', '/search', '/videos/123', '/popout', '/moderator', '/a-b']) {
    assert.equal(core.channelFromPath(route), '', route);
  }
  assert.equal(core.channelFromPath('/FoRsEn'), 'forsen');
  assert.equal(core.channelFromPath('/popout/forsen/chat'), 'forsen');
  assert.equal(core.channelFromPath('/moderator/forsen'), 'forsen');
});

test('stored settings validate types, bound font size and migrate old settings', () => {
  assert.equal(core.normalizeSettings({ fontSize: 500 }).fontSize, 24);
  assert.equal(core.normalizeSettings({ fontSize: 'bad' }).fontSize, 13);
  assert.equal(core.normalizeSettings({ fontSize: -1 }).fontSize, 11);
  assert.equal(core.normalizeSettings({ enable7TV: 'false' }).enable7TV, true);
  assert.equal(core.normalizeSettings(null).fontSize, 13);
  assert.equal(core.normalizeSettings({ highlightWords: 'x'.repeat(600) }).highlightWords.length, 500);
  assert.equal(core.normalizeSettings({ pauseOnHover: true }).pauseOnHover, true);
  assert.equal(core.normalizeSettings({ messageGap: 30, emoteGap: -3 }).messageGap, 12);
  assert.equal(core.normalizeSettings({ messageGap: 30, emoteGap: -3 }).emoteGap, 0);
  assert.equal(core.normalizeSettings({ showChatSpeed: false, showCopyButton: false }).showCopyButton, false);
  assert.equal(core.normalizeSettings({ ambilightBrightness: 120 }).ambilightBrightness, 100);
  assert.equal(core.normalizeSettings({ ambilightSpread: 120 }).ambilightSpread, 100);
  assert.equal(core.normalizeSettings({ themeEnabled: false }).themeEnabled, false);
  assert.equal(core.normalizeSettings({ ambilightResponse: -5 }).ambilightResponse, 0);
  assert.equal(core.normalizeSettings({ ambilightDimUI: 75, openClipsOverlay: false }).openClipsOverlay, false);
  assert.equal(core.normalizeSettings({ themePreset: 'invalid', chatDensity: 'invalid' }).themePreset, 'aurora');
  assert.equal(core.normalizeSettings({ themePreset: 'orchid', chatDensity: 'compact' }).chatDensity, 'compact');
});

test('recent emotes validate provider, deduplicate and stay bounded', () => {
  const key = '7TV:123:TestEmote';
  assert.deepEqual(core.normalizeRecentEmotes([key, key, 'bad', 'Twitch:1:Kappa']), [key]);
  assert.equal(core.normalizeRecentEmotes(Array.from({ length: 30 }, (_, i) => `BTTV:${i}:Emote`)).length, 24);
});

test('highlights are literal, case insensitive and support Cyrillic phrases', () => {
  assert.equal(core.matchesHighlight('ПРИВЕТ, @viewer!', ' другой, привет, '), true);
  assert.equal(core.matchesHighlight('a.b', 'a.b'), true);
  assert.equal(core.matchesHighlight('axb', 'a.b'), false);
  assert.equal(core.matchesHighlight('hello', ', ,'), false);
});

test('favorites reject malformed backups, deduplicate and retain provider identity', () => {
  const key = core.favoriteKey({ provider: '7TV', id: '123', code: 'Hello' });
  assert.equal(key, '7TV:123:Hello');
  assert.deepEqual(core.normalizeFavorites([key, key, null, 'bad', 'Twitch:123:Hello']), [key]);
  assert.equal(core.normalizeFavorites(Array.from({ length: 400 }, (_, i) => `7TV:${i}:Hello`)).length, 300);
  assert.deepEqual(core.normalizeFavorites({}), []);
});

test('session history tracks edits and preserves separate users and channels', () => {
  const history = new core.MessageHistory();
  history.add('one', { id: '1', user: 'Alice', text: 'before', at: 'now' });
  history.add('one', { id: '1', user: 'Alice', text: 'after', at: 'now' });
  history.add('one', { id: '2', user: 'Bob', text: 'after', at: 'now' });
  history.add('two', { id: '1', user: 'Alice', text: 'other channel', at: 'now' });
  assert.deepEqual(history.forUser('one', 'ALICE').map(record => record.text), ['after']);
  assert.deepEqual(history.forUser('one', 'alice', 'BEFORE'), []);
  assert.equal(history.forUser('two', 'alice').length, 1);
});

test('history memory stays bounded and returns the latest 100 matches', () => {
  const history = new core.MessageHistory(150, 2);
  for (let i = 0; i < 300; i++) history.add('one', { id: String(i), user: 'Alice', text: String(i) });
  assert.equal(history.channels.get('one').size, 150);
  assert.equal(history.forUser('one', 'Alice').length, 100);
  assert.equal(history.forUser('one', 'Alice')[0].id, '299');
  history.add('two', { id: 'x', user: 'Alice', text: 'two' });
  history.add('three', { id: 'x', user: 'Alice', text: 'three' });
  assert.equal(history.channels.size, 2);
  assert.equal(history.forUser('one', 'Alice').length, 0);
});

test('settings backups validate schema and sanitize imported values', () => {
  const data = core.parseBackup(JSON.stringify({ format: 'vortexchat-settings', schema: 1,
    settings: { fontSize: 99, highlightWords: 'привет', pauseOnHover: true }, favorites: ['7TV:id:Code', 'bad'] }));
  assert.equal(data.vortexSettings.fontSize, 24);
  assert.equal(data.vortexSettings.pauseOnHover, true);
  assert.deepEqual(data.vortexFavorites, ['7TV:id:Code']);
  for (const text of ['{}', 'null', 'bad json', JSON.stringify({ format: 'vortexchat-settings', schema: 2 }), 'x'.repeat(100001)]) {
    assert.throws(() => core.parseBackup(text));
  }
});

function emote(provider, isChannel, id = provider, code = 'Shared') {
  return { provider, isChannel, id, code, url: `https://cdn.example/${id}.webp` };
}

test('catalog priority is independent of network completion order', () => {
  for (const reverse of [false, true]) {
    const catalog = new core.EmoteCatalog();
    const entries = [emote('7TV', false, 'global'), emote('BTTV', true, 'bttv'), emote('7TV', true, 'channel')];
    (reverse ? entries.reverse() : entries).forEach(value => catalog.add(value));
    assert.equal(catalog.visible(core.defaults)[0].id, 'channel');
    assert.equal(catalog.visible({ ...core.defaults, enable7TV: false })[0].id, 'bttv');
    catalog.clearChannel();
    assert.equal(catalog.visible(core.defaults)[0].id, 'global');
  }
});

test('refresh/removal restores global aliases and excludes unsafe image URLs', () => {
  const catalog = new core.EmoteCatalog();
  catalog.add(emote('7TV', false, 'global'));
  catalog.add(emote('7TV', true, 'channel'));
  catalog.add({ ...emote('FFZ', false, 'unsafe', 'Unsafe'), url: 'javascript:alert(1)' });
  catalog.clearChannel('7TV');
  catalog.add(emote('7TV', true, 'renamed', 'NewCode'));
  assert.deepEqual(catalog.visible(core.defaults).map(value => value.id).sort(), ['global', 'renamed']);
  assert.equal(core.escapeHTML('<img src="x" onerror="x">'), '&lt;img src=&quot;x&quot; onerror=&quot;x&quot;&gt;');
});

function harness(fetcher, runtimeChrome) {
  const sockets = [];
  const timers = [];
  class Socket {
    constructor() { sockets.push(this); }
    close() { this.onclose?.(); }
    send(data) { this.sent = JSON.parse(data); }
  }
  const context = vm.createContext({
    VortexCore: core, URL, AbortController, AbortSignal, console,
    fetch: fetcher, WebSocket: Socket, chrome: runtimeChrome,
    setTimeout: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cancelled = true; },
    window: { location: { pathname: '/' } },
    document: { readyState: 'loading', addEventListener() {}, querySelector: () => null,
      querySelectorAll: () => [], getElementById: () => null,
      documentElement: { dataset: {}, style: { setProperty() {} }, toggleAttribute() {} } }
  });
  let source = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
  source = source.replace(/\}\)\(\);\s*$/, `globalThis.inspect = { state, catalog, loadLiveChannelEmotes, getExtensionStatus, applySettings };\n})();`);
  vm.runInContext(source, context);
  return { ...context.inspect, sockets, timers };
}

function response(data, status = 200) { return { ok: status < 400, status, json: async () => data }; }
function providerResponse(url) {
  if (url.includes('emote-sets/global')) return response({ emotes: [] });
  if (url.includes('emotes/global')) return response([]);
  if (url.includes('/set/global')) return response({ sets: {} });
  if (url.includes('betterttv')) return response({ channelEmotes: [], sharedEmotes: [] });
  if (url.includes('frankerfacez')) return response({ sets: {} });
  return response({ emote_set: { id: 'set', emotes: [] } });
}
function channelData(name) { return { emote_set: { id: `set-${name}`, name,
  emotes: [{ name, id: name, flags: 0, data: { host: { url: `//cdn.7tv.app/emote/${name}`,
    files: [{ name: '1x.webp' }, { name: '2x.webp' }] } } }] } }; }

test('7TV API host and file metadata produce a usable channel emote URL', () => {
  const parsed = core.parse7TV(channelData('GAMBA').emote_set.emotes, true);
  assert.equal(parsed[0].code, 'GAMBA');
  assert.equal(parsed[0].url, 'https://cdn.7tv.app/emote/GAMBA/2x.webp');
  assert.equal(core.parse7TV([{ name: 'Single', id: 'one', data: { host: {
    url: '//cdn.7tv.app/emote/one', files: [{ name: '1x.webp' }] } } }], false)[0].url,
  'https://cdn.7tv.app/emote/one/1x.webp');
  assert.equal(core.parse7TV([{ name: 'Bad', id: 'x', data: { host: {
    url: '//evil.example/emote/x', files: [{ name: '2x.webp' }] } } }], false).length, 0);
});

test('clip links accept Twitch clip routes and reject unrelated links', () => {
  assert.equal(core.clipSlug('https://clips.twitch.tv/AnimatedOptimisticWasabiVoteNay'), 'AnimatedOptimisticWasabiVoteNay');
  assert.equal(core.clipSlug('https://www.twitch.tv/streamer/clip/AnimatedOptimisticWasabiVoteNay'), 'AnimatedOptimisticWasabiVoteNay');
  assert.equal(core.clipSlug('https://clips.twitch.tv/embed?clip=AnimatedOptimisticWasabiVoteNay'), 'AnimatedOptimisticWasabiVoteNay');
  assert.equal(core.clipSlug('https://evil.example/streamer/clip/AnimatedOptimisticWasabiVoteNay'), '');
});

test('Ambilight letterbox areas follow the video aspect ratio', () => {
  assert.deepEqual(core.videoLetterbox(1920, 1080, 1920, 1080), { left: 0, right: 0, top: 0, bottom: 0 });
  assert.deepEqual(core.videoLetterbox(1920, 1080, 1440, 1080), { left: 240, right: 240, top: 0, bottom: 0 });
  assert.deepEqual(core.videoLetterbox(1920, 1080, 1920, 800), { left: 0, right: 0, top: 140, bottom: 140 });
  assert.deepEqual(core.videoLetterbox(0, 1080, 1920, 1080), { left: 0, right: 0, top: 0, bottom: 0 });
});

test('autocomplete suggests loaded codes and prioritizes an exact match', () => {
  const emotes = [{ code: 'PogChamp', isChannel: false }, { code: 'Pog', isChannel: true },
    { code: 'MegaPog', isChannel: true }];
  assert.deepEqual(core.suggestEmotes(emotes, 'Pog').map(item => item.code), ['Pog', 'PogChamp', 'MegaPog']);
  assert.deepEqual(core.suggestEmotes(emotes, ':p').map(item => item.code), ['Pog', 'PogChamp', 'MegaPog']);
  assert.deepEqual(core.suggestEmotes(emotes, 'p'), []);
});

test('three identical bridge send requests click Twitch send only once', () => {
  const listeners = new Map();
  const timers = [];
  let sends = 0;
  const editor = { tagName: 'TEXTAREA', value: '', focus() {}, dispatchEvent() {} };
  const button = { disabled: false, click() { sends++; } };
  const window = {
    HTMLTextAreaElement: class { set value(value) { editor.value = value; } },
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); }
  };
  const document = { querySelector(selector) {
    if (selector === '[data-a-target="chat-input"]') return editor;
    if (selector === '[data-a-target="chat-send-button"]') return button;
    return null;
  } };
  class FakeEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/page-bridge.js'), 'utf8'), {
    window, document, Event: FakeEvent, CustomEvent: FakeEvent, KeyboardEvent: FakeEvent,
    performance: { now: () => 100 }, setTimeout: callback => timers.push(callback)
  });
  for (let index = 0; index < 3; index++) {
    window.dispatchEvent(new FakeEvent('vortex-chat-bridge', {
      detail: { type: 'SEND_TEXT', text: 'TestEmote', requestId: String(index) }
    }));
  }
  timers.forEach(callback => callback());
  assert.equal(sends, 1);
});

test('contenteditable emote insertion invokes one native edit', () => {
  const listeners = new Map();
  let edits = 0;
  const editor = { tagName: 'DIV', isContentEditable: true, innerText: '', focus() {},
    contains(node) { return node === this; }, querySelectorAll: () => [], dispatchEvent() {} };
  const selection = { anchorNode: editor, removeAllRanges() {}, addRange() {} };
  const window = { addEventListener(name, listener) { listeners.set(name, listener); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); }, getSelection: () => selection };
  const document = { querySelector: selector => selector === '[data-a-target="chat-input"]' ? editor : null,
    createRange: () => ({ selectNodeContents() {}, collapse() {} }),
    execCommand(_command, _ui, value) { edits++; editor.innerText += value; return true; } };
  class FakeEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/page-bridge.js'), 'utf8'), {
    window, document, Event: FakeEvent, CustomEvent: FakeEvent, performance: { now: () => 100 }
  });
  window.dispatchEvent(new FakeEvent('vortex-chat-bridge', {
    detail: { type: 'INSERT_TEXT', text: 'EBLAN ', requestId: 'one' }
  }));
  assert.equal(edits, 1);
  assert.equal(editor.innerText, 'EBLAN ');
  selection.anchorNode = { outside: true };
  window.dispatchEvent(new FakeEvent('vortex-chat-bridge', {
    detail: { type: 'INSERT_TEXT', text: 'EBLAN ', requestId: 'outside' }
  }));
  assert.equal(edits, 1, 'an editor selection outside chat must never insert into the page');
});

test('7TV click updates Slate state once instead of only drawing text in the DOM', () => {
  const listeners = new Map();
  let slateEdits = 0;
  let nativeEdits = 0;
  const editor = { tagName: 'DIV', isContentEditable: true, innerText: '', focus() {},
    contains(node) { return node === this; }, querySelectorAll: () => [] };
  const slate = { children: [{ children: [{ text: '' }] }], selection: null,
    apply(operation) { this.selection = operation.newProperties; },
    insertText(value) { slateEdits++; editor.innerText += value; }
  };
  editor.__reactFiber$test = { memoizedProps: { editor: slate }, return: null };
  const selection = { anchorNode: editor, removeAllRanges() {}, addRange() {} };
  const window = { addEventListener(name, listener) { listeners.set(name, listener); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); }, getSelection: () => selection };
  const document = { querySelector: selector => selector === '[data-a-target="chat-input"]' ? editor : null,
    createRange: () => ({ selectNodeContents() {}, collapse() {} }),
    execCommand() { nativeEdits++; return true; } };
  class FakeEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/page-bridge.js'), 'utf8'), {
    window, document, Event: FakeEvent, CustomEvent: FakeEvent, performance: { now: () => 100 }
  });
  window.dispatchEvent(new FakeEvent('vortex-chat-bridge', {
    detail: { type: 'INSERT_TEXT', text: 'PartyParrot ', requestId: 'slate' }
  }));
  assert.equal(slateEdits, 1);
  assert.equal(nativeEdits, 0);
  assert.equal(editor.innerText, 'PartyParrot ');
  assert.equal(slate.selection.anchor.offset, 0);
});
const turn = () => new Promise(resolve => setImmediate(resolve));

test('late responses from a previous channel cannot contaminate current emotes', async () => {
  let resolveOld;
  const app = harness(async url => {
    if (url === 'https://7tv.io/v3/users/twitch/22484632') return new Promise(resolve => { resolveOld = resolve; });
    if (url === 'https://7tv.io/v3/users/twitch/36340781') return response(channelData('NewChannel'));
    return providerResponse(url);
  });
  app.state.currentChannel = 'forsen';
  const first = app.loadLiveChannelEmotes('forsen');
  await turn();
  app.state.currentChannel = 'tarik';
  await app.loadLiveChannelEmotes('tarik');
  resolveOld(response(channelData('OldChannel')));
  await first;
  assert.deepEqual(app.catalog.visible(core.defaults).map(value => value.code), ['NewChannel']);
  assert.equal(app.getExtensionStatus().setName, 'NewChannel');
});

test('a refresh removes deleted emotes and reconnects the same set', async () => {
  let name = 'OldCode';
  const app = harness(async url => url === 'https://7tv.io/v3/users/twitch/22484632' ? response(channelData(name)) : providerResponse(url));
  await app.loadLiveChannelEmotes('forsen');
  assert.equal(app.sockets.length, 1);
  name = 'NewCode';
  await app.loadLiveChannelEmotes('forsen', true);
  assert.deepEqual(app.catalog.visible(core.defaults).map(value => value.code), ['NewCode']);
  assert.equal(app.sockets.length, 2);
});

test('channel ID resolves through IVR when the channel has no FFZ room', async () => {
  const calls = [];
  const app = harness(async url => {
    calls.push(url);
    if (url.includes('/v1/room/noffz')) return response({}, 404);
    if (url.includes('/v2/twitch/user?login=noffz')) return response([{ id: '123456' }]);
    if (url === 'https://7tv.io/v3/users/twitch/123456') return response(channelData('Working'));
    return providerResponse(url);
  });
  await app.loadLiveChannelEmotes('noffz');
  assert.equal(app.getExtensionStatus().loadState, 'ready');
  assert.equal(app.catalog.visible(core.defaults)[0].code, 'Working');
  assert.equal(calls.some(url => url === 'https://gql.twitch.tv/gql'), false);
});

test('socket failures reconnect; disabling 7TV cancels reconnects', async () => {
  const app = harness(async url => providerResponse(url));
  await app.loadLiveChannelEmotes('forsen');
  const socket = app.sockets[0];
  socket.onopen();
  assert.equal(app.getExtensionStatus().eventState, 'connected');
  assert.equal(socket.sent.op, 35);
  socket.close();
  assert.equal(app.getExtensionStatus().eventState, 'reconnecting');
  const retry = app.timers.at(-1);
  retry.fn();
  assert.equal(app.sockets.length, 2);
  app.sockets[1].close();
  const pending = app.timers.at(-1);
  app.state.settings.enable7TV = false;
  app.applySettings();
  assert.equal(pending.cancelled, true);
  assert.equal(app.getExtensionStatus().eventState, 'idle');
});

test('partial provider failures preserve successful emotes and expose partial status', async () => {
  const app = harness(async url => {
    if (url.includes('betterttv') && url.includes('/users/')) throw new Error('offline');
    if (url === 'https://7tv.io/v3/users/twitch/22484632') return response(channelData('Available'));
    return providerResponse(url);
  });
  await app.loadLiveChannelEmotes('forsen');
  assert.equal(app.getExtensionStatus().loadState, 'partial');
  assert.match(app.getExtensionStatus().error, /BTTV/);
  assert.equal(app.catalog.visible(core.defaults)[0].code, 'Available');
});

test('global provider failures also produce a partial status and can be retried', async () => {
  let offline = true;
  const app = harness(async url => {
    if (url.includes('emote-sets/global') && offline) throw new Error('offline');
    return providerResponse(url);
  });
  await app.loadLiveChannelEmotes('forsen');
  assert.equal(app.getExtensionStatus().loadState, 'partial');
  offline = false;
  await app.loadLiveChannelEmotes('forsen', true);
  assert.equal(app.getExtensionStatus().loadState, 'ready');
});

test('leaving a channel clears its emotes and closes the live socket', async () => {
  const app = harness(async url => url === 'https://7tv.io/v3/users/twitch/22484632' ? response(channelData('Channel')) : providerResponse(url));
  await app.loadLiveChannelEmotes('forsen');
  await app.loadLiveChannelEmotes('');
  assert.equal(app.catalog.visible(core.defaults).length, 0);
  assert.equal(app.getExtensionStatus().eventState, 'idle');
  assert.equal(app.getExtensionStatus().loadState, 'idle');
});

test('provider relay only accepts fixed public API routes and a fixed Twitch query', () => {
  assert.equal(network.allowedRequest('https://7tv.io/v3/users/twitch/22484632'), true);
  assert.equal(network.allowedRequest('https://api.7tv.app/v3/emote-sets/global'), true);
  assert.equal(network.allowedRequest('https://api.frankerfacez.com/v1/room/forsen'), true);
  assert.equal(network.allowedRequest('https://api.ivr.fi/v2/twitch/user?login=forsen'), true);
  for (const url of ['http://7tv.io/v3/emote-sets/global', 'https://evil.example/',
    'https://7tv.io.evil.example/v3/emote-sets/global', 'https://7tv.io/v3/users/twitch/forsen',
    'https://api.ivr.fi/v2/twitch/user?login=forsen&extra=1']) {
    assert.equal(network.allowedRequest(url), false, url);
  }
  const body = JSON.stringify({ query: 'query($login: String!) { user(login: $login) { id } }', variables: { login: 'forsen' } });
  assert.equal(network.allowedRequest('https://gql.twitch.tv/gql', 'POST', body), true);
  assert.equal(network.allowedRequest('https://gql.twitch.tv/gql', 'POST', '{"query":"mutation { bad }"}'), false);
});

test('provider relay accepts Twitch content-script senders with absent or opaque origin', () => {
  assert.equal(network.trustedSender({ id: 'extension', origin: 'https://www.twitch.tv', url: 'https://www.twitch.tv/stintik' }, 'extension'), true);
  assert.equal(network.trustedSender({ id: 'extension', origin: 'null', url: 'https://www.twitch.tv/stintik' }, 'extension'), true);
  assert.equal(network.trustedSender({ id: 'extension', tab: { url: 'https://www.twitch.tv/stintik' } }, 'extension'), true);
  assert.equal(network.trustedSender({ id: 'other', origin: 'https://www.twitch.tv' }, 'extension'), false);
  assert.equal(network.trustedSender({ id: 'extension', origin: 'https://evil.example', url: 'https://www.twitch.tv/stintik' }, 'extension'), false);
});

test('7TV host fallback saves provider JSON and uses it when temporarily offline', async () => {
  const entries = new Map();
  const cache = {
    match: async key => entries.get(key)?.clone(),
    put: async (key, value) => { entries.set(key, value.clone()); },
    keys: async () => [...entries.keys()],
    delete: async key => entries.delete(key)
  };
  const caches = { open: async () => cache };
  const target = 'https://7tv.io/v3/emote-sets/global';
  const attempts = [];
  const online = await network.requestProvider({ url: target }, { caches, fetch: async url => {
    attempts.push(url);
    if (url.startsWith('https://7tv.io/')) throw new Error('Unavailable');
    return new Response(JSON.stringify({ emotes: [{ id: 'one' }] }), { status: 200 });
  } });
  assert.deepEqual(attempts, [target, 'https://api.7tv.app/v3/emote-sets/global']);
  assert.deepEqual(online, { ok: true, data: { emotes: [{ id: 'one' }] }, cached: false });
  const offline = await network.requestProvider({ url: target }, { caches, fetch: async () => { throw new Error('Offline'); } });
  assert.equal(offline.cached, true);
  assert.deepEqual(offline.data, online.data);
  assert.equal((await network.requestProvider({ url: 'https://example.com/' }, { caches,
    fetch: async () => { throw new Error('Must not fetch'); } })).ok, false);
});

test('provider requests still work when CacheStorage is unavailable', async () => {
  const result = await network.requestProvider({ url: 'https://7tv.io/v3/emote-sets/global' }, {
    caches: { open: async () => { throw new Error('Cache disabled'); } },
    fetch: async () => new Response(JSON.stringify({ emotes: [] }), { status: 200 })
  });
  assert.equal(result.ok, true);
  assert.equal(result.cached, false);
});

test('content script falls back to provider fetch when extension relay fails', async () => {
  const runtimeChrome = { runtime: { lastError: null, sendMessage(_message, callback) {
    callback({ ok: false, error: 'Invalid sender' });
  } } };
  const calls = [];
  const app = harness(async url => {
    calls.push(url);
    if (url === 'https://7tv.io/v3/users/twitch/22484632') return response(channelData('Fallback'));
    return providerResponse(url);
  }, runtimeChrome);
  await app.loadLiveChannelEmotes('forsen');
  assert.equal(app.getExtensionStatus().loadState, 'ready');
  assert.equal(app.catalog.visible(core.defaults)[0].code, 'Fallback');
  assert.ok(calls.length >= 6);
});

test('content script uses the extension relay and reports cached data', async () => {
  const calls = [];
  const runtimeChrome = { runtime: { lastError: null, sendMessage(message, callback) {
    calls.push(message);
    callback({ ok: true, cached: true, data: message.url.includes('emote-sets/global')
      ? { emotes: [] } : message.url.includes('emotes/global') ? []
      : message.url.includes('/set/global') ? { sets: {} }
      : message.url.includes('betterttv') ? { channelEmotes: [], sharedEmotes: [] }
      : message.url.includes('frankerfacez') ? { sets: {} }
      : channelData('Cached') });
  } } };
  const app = harness(async () => { throw new Error('Content fetch should not run'); }, runtimeChrome);
  await app.loadLiveChannelEmotes('forsen');
  assert.equal(calls.length, 6);
  assert.equal(app.getExtensionStatus().cachedSources, 6);
  assert.equal(app.catalog.visible(core.defaults)[0].code, 'Cached');
});
