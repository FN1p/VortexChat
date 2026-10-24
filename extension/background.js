/* Fetch provider data from the extension origin, with an offline cache. */
'use strict';

const CACHE_NAME = 'vortex-provider-json-v1';
const CACHE_LIMIT = 90;
const CACHE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function allowedRequest(rawUrl, method = 'GET', body = '') {
  let url;
  try { url = new URL(rawUrl); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const path = url.pathname;
  if (method === 'POST') {
    if (url.hostname !== 'gql.twitch.tv' || path !== '/gql' || url.search || typeof body !== 'string' || body.length > 1000) return false;
    try {
      const query = JSON.parse(body);
      return query.query === 'query($login: String!) { user(login: $login) { id } }' &&
        /^[a-z0-9_]{1,25}$/i.test(query.variables?.login || '');
    } catch { return false; }
  }
  if (method !== 'GET') return false;
  if (url.hostname === 'api.7tv.app' || url.hostname === '7tv.io')
    return !url.search && (/^\/v3\/users\/twitch\/\d+$/.test(path) || path === '/v3/emote-sets/global');
  if (url.hostname === 'api.betterttv.net')
    return !url.search && (path === '/3/cached/emotes/global' || /^\/3\/cached\/users\/twitch\/\d+$/.test(path));
  if (url.hostname === 'api.frankerfacez.com')
    return !url.search && (path === '/v1/set/global' || /^\/v1\/room\/id\/\d+$/.test(path) || /^\/v1\/room\/[a-z0-9_]{1,25}$/i.test(path));
  if (url.hostname === 'api.ivr.fi')
    return path === '/v2/twitch/user' && /^\?login=[a-z0-9_]{1,25}$/i.test(url.search);
  return false;
}

function candidates(url) {
  if (url.startsWith('https://7tv.io/')) return [url, url.replace('https://7tv.io/', 'https://api.7tv.app/')];
  if (url.startsWith('https://api.7tv.app/')) return [url, url.replace('https://api.7tv.app/', 'https://7tv.io/')];
  return [url];
}

function trustedSender(sender, runtimeId) {
  if (sender?.id !== runtimeId) return false;
  let source;
  try { source = new URL(sender.origin && sender.origin !== 'null'
    ? sender.origin : sender.url || sender.tab?.url); }
  catch { return false; }
  return source.protocol === 'https:' &&
    (source.hostname === 'twitch.tv' || source.hostname.endsWith('.twitch.tv'));
}

async function readCache(cache, url) {
  const hit = await cache.match(url);
  if (!hit) return null;
  try {
    const saved = await hit.json();
    return Date.now() - saved.at <= CACHE_AGE_MS ? saved.data : null;
  } catch { return null; }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) await cache.delete(key);
}

async function requestProvider(message, deps = { fetch, caches }) {
  const method = message.method || 'GET';
  if (!allowedRequest(message.url, method, message.body)) return { ok: false, error: 'Request not allowed' };
  const options = method === 'POST'
    ? { method, headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: message.body }
    : { method };
  let cache = null;
  if (method === 'GET') {
    try { cache = await deps.caches.open(CACHE_NAME); }
    catch { /* A disabled or full cache must not disable live provider requests. */ }
  }
  let lastError = 'Provider unavailable';
  let missing = false;
  for (const url of candidates(message.url)) {
    try {
      const response = await deps.fetch(url, { ...options,
        signal: AbortSignal.timeout(url.includes('7tv') ? 15000 : 9000), credentials: 'omit' });
      if (response.status === 404) { missing = true; continue; }
      if (!response.ok) { lastError = `HTTP ${response.status}`; continue; }
      const data = await response.json();
      if (cache) {
        try {
          await cache.put(message.url, new Response(JSON.stringify({ at: Date.now(), data }),
            { headers: { 'Content-Type': 'application/json' } }));
          await trimCache(cache);
        } catch { /* A storage quota failure must not discard fresh data. */ }
      }
      return { ok: true, data, cached: false };
    } catch (error) { lastError = error?.message || lastError; }
  }
  if (missing) return { ok: true, data: null, cached: false };
  if (cache) {
    const data = await readCache(cache, message.url);
    if (data !== null) return { ok: true, data, cached: true };
  }
  return { ok: false, error: lastError };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action !== 'VORTEX_FETCH_PROVIDER') return;
    if (!trustedSender(sender, chrome.runtime.id)) {
      sendResponse({ ok: false, error: 'Invalid sender' });
      return;
    }
    requestProvider(message).then(sendResponse, error => sendResponse({ ok: false, error: error?.message || 'Network error' }));
    return true;
  });
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { allowedRequest, candidates, trustedSender, requestProvider };
