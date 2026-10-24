const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedProviderUrl, fetchProviderJson } = require('../desktop-app/provider');

test('desktop provider bridge accepts only fixed emote API routes', () => {
  assert.equal(allowedProviderUrl('https://7tv.io/v3/emote-sets/global'), true);
  assert.equal(allowedProviderUrl('https://api.frankerfacez.com/v1/room/forsen'), true);
  assert.equal(allowedProviderUrl('https://api.ivr.fi/v2/twitch/user?login=forsen'), true);
  for (const url of ['http://7tv.io/v3/emote-sets/global', 'https://7tv.io.evil.test/v3/emote-sets/global',
    'https://api.ivr.fi/v2/twitch/user?login=forsen&url=x', 'https://api.frankerfacez.com/v1/room/../admin']) {
    assert.equal(allowedProviderUrl(url), false, url);
  }
});

test('desktop provider bridge rejects oversized responses', async () => {
  await assert.rejects(fetchProviderJson('https://7tv.io/v3/emote-sets/global', async () => ({
    ok: true, headers: { get: () => '6000000' }, text: async () => '{}'
  })), /слишком большой/);
});

test('desktop provider bridge retries 7TV on its alternate API host', async () => {
  const urls = [];
  const result = await fetchProviderJson('https://7tv.io/v3/emote-sets/global', async url => {
    urls.push(url);
    if (urls.length === 1) throw new Error('Network unavailable');
    return { ok: true, headers: { get: () => null }, text: async () => '{"emotes":[]}' };
  });
  assert.deepEqual(result, { emotes: [] });
  assert.equal(urls[1], 'https://api.7tv.app/v3/emote-sets/global');
});
