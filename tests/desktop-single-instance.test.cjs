const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Electron single-instance lock precedes OBS bridge startup', () => {
  const source = fs.readFileSync(path.join(__dirname, '../desktop-app/main.js'), 'utf8');
  const lock = source.indexOf('app.requestSingleInstanceLock()');
  const start = source.indexOf("server.listen(5222, '127.0.0.1'");
  assert.ok(lock >= 0 && start > lock, 'must acquire lock before opening OBS bridge');
  assert.match(source, /if \(!ownsSingleInstance\)\s*\{\s*app\.quit\(\)/);
  assert.match(source, /app\.on\('second-instance'/);
  const error = source.indexOf("server.on('error'");
  assert.ok(error > 0 && error < start, 'register server error listener before listen');
});
