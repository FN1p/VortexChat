function allowedProviderUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
  const path = url.pathname;
  if (url.hostname === '7tv.io' || url.hostname === 'api.7tv.app') return !url.search &&
    (path === '/v3/emote-sets/global' || /^\/v3\/users\/twitch\/\d+$/.test(path));
  if (url.hostname === 'api.betterttv.net') return !url.search &&
    (path === '/3/cached/emotes/global' || /^\/3\/cached\/users\/twitch\/\d+$/.test(path));
  if (url.hostname === 'api.frankerfacez.com') return !url.search &&
    (path === '/v1/set/global' || /^\/v1\/room\/[a-z0-9_]{3,25}$/.test(path));
  if (url.hostname === 'api.ivr.fi') return path === '/v2/twitch/user' &&
    [...url.searchParams.keys()].join() === 'login' && /^[a-z0-9_]{3,25}$/.test(url.searchParams.get('login') || '');
  return false;
}

async function fetchProviderJson(raw, fetchImpl = fetch) {
  if (!allowedProviderUrl(raw)) throw new Error('Адрес провайдера не разрешён');
  const candidates = raw.startsWith('https://7tv.io/') ? [raw, raw.replace('https://7tv.io/', 'https://api.7tv.app/')] : [raw];
  let lastError;
  for (const url of candidates) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Провайдер вернул ${response.status}`);
      const length = Number(response.headers.get('content-length'));
      if (length > 5_000_000) throw new Error('Ответ провайдера слишком большой');
      const text = await response.text();
      if (text.length > 5_000_000) throw new Error('Ответ провайдера слишком большой');
      return JSON.parse(text);
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

module.exports = { allowedProviderUrl, fetchProviderJson };
