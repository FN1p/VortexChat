const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TwitchAuth } = require('../desktop-app/auth');

function fixture(fetchImpl) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-auth-'));
  const safeStorage = { isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const auth = new TwitchAuth({ directory, safeStorage, fetchImpl });
  auth.clientId = 'testclient123';
  auth.session = { accessToken: 'access', refreshToken: 'refresh', userId: '100', login: 'tester' };
  return { auth, directory };
}

test('Twitch chat send uses Helix and does not claim a dropped message was sent', async t => {
  const calls = [];
  const { auth, directory } = fixture(async (url, options) => {
    calls.push({ url, options });
    const data = url.includes('/users?') ? { data: [{ id: '200' }] } :
      { data: [{ is_sent: true, message_id: 'm1' }] };
    return { ok: true, status: 200, json: async () => data };
  });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.deepEqual(await auth.sendMessage('forsen', 'Привет TestEmote'), { messageId: 'm1' });
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).sender_id, '100');
  assert.equal(JSON.parse(calls[1].options.body).broadcaster_id, '200');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer access');
  await assert.rejects(auth.sendMessage('bad\r\nPRIVMSG', 'hello'), /Неверное имя/);
});

test('Twitch auth stores tokens encrypted and preserves only public Client ID after logout', t => {
  const { auth, directory } = fixture(async () => { throw new Error('Unexpected request'); });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  auth.save();
  const saved = fs.readFileSync(path.join(directory, 'twitch-auth.json'), 'utf8');
  assert.equal(saved.includes('"accessToken"'), false);
  assert.equal(saved.includes('testclient123'), true);
  auth.logout();
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'twitch-auth.json'), 'utf8')).encrypted, undefined);
});

test('Twitch rejects dropped messages instead of displaying a local fake', async t => {
  const { auth, directory } = fixture(async url => ({ ok: true, status: 200,
    json: async () => url.includes('/users?') ? { data: [{ id: '200' }] } :
      { data: [{ is_sent: false, drop_reason: { message: 'Вы не подписаны' } }] } }));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await assert.rejects(auth.sendMessage('forsen', 'hello'), /Вы не подписаны/);
});
