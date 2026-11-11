const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reconnectDelay, CONNECT_TIMEOUT_MS, IDLE_TIMEOUT_MS } = require('../desktop-app/irc-reconnect');

test('IRC reconnect policy uses exponential backoff with bounded jitter', () => {
  assert.equal(reconnectDelay(0, () => 0.5), 1000);
  assert.equal(reconnectDelay(1, () => 0.5), 2000);
  assert.equal(reconnectDelay(2, () => 0.5), 4000);
  assert.equal(reconnectDelay(4, () => 0.5), 16000);
  assert.equal(reconnectDelay(30, () => 0.5), 30000);
  assert.equal(reconnectDelay(2, () => 0), 3200);
  assert.equal(reconnectDelay(2, () => 1), 4800);
  assert.ok(reconnectDelay(1000, () => 1) <= 36000);
  assert.equal(reconnectDelay(-10, () => 0.5), 1000);
  assert.equal(CONNECT_TIMEOUT_MS, 15000);
  assert.equal(IDLE_TIMEOUT_MS, 120000);
});

test('desktop IRC connection handles offline and teardown without duplicate live sockets', () => {
  const js = fs.readFileSync(path.join(__dirname, '../desktop-app/twitch.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../desktop-app/index.html'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../desktop-app/package.json'), 'utf8'));
  assert.ok(html.indexOf('irc-reconnect.js') < html.indexOf('twitch.js'));
  assert.ok(pkg.build.files.includes('irc-reconnect.js'));
  assert.match(js, /socket\.onerror\s*=/);
  assert.match(js, /socket\.onclose\s*=/);
  assert.match(js, /this\.ws\.readyState === WebSocket\.CONNECTING/);
  assert.match(js, /this\.reconnectAttempt = 0/);
  assert.match(js, /window\.addEventListener\('pagehide'/);
  assert.match(js, /window\.addEventListener\('offline'/);
  assert.match(js, /VortexIRC\.IDLE_TIMEOUT_MS/);
});
