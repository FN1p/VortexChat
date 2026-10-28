document.querySelector('iframe').addEventListener('load', async event => {
  const win = event.target.contentWindow;
  const doc = event.target.contentDocument;
  const results = document.getElementById('results');
  let failures = 0;
  const check = (name, ok) => {
    const row = document.createElement('li');
    row.className = ok ? 'pass' : 'fail';
    row.textContent = `${ok ? 'PASS' : 'FAIL'} · ${name}`;
    results.append(row);
    if (!ok) failures++;
  };
  for (let i = 0; i < 30 && doc.getElementById('install').disabled; i++) await new Promise(resolve => setTimeout(resolve, 100));
  check('Updater finds a newer GitHub Release', !doc.getElementById('install').disabled && doc.getElementById('latest-version').textContent.includes('4.4.12'));
  doc.getElementById('install').click();
  for (let i = 0; i < 40 && !win.fixtureReloaded; i++) await new Promise(resolve => setTimeout(resolve, 100));
  check('Updater requests write access to the selected extension folder', win.fixturePickerMode === 'readwrite');
  check('Updater installs code before the manifest and records expected version',
    win.fixtureWrites.join(',') === 'content.js,manifest.json' && win.fixtureExpected === '4.4.12');
  check('Updater reloads the extension after writing files', win.fixtureReloaded === true && win.fakeFiles.get('content.js') === '// updated');
  document.getElementById('summary').textContent = `${4 - failures}/4 passed`;
});
