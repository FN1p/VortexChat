const frame = document.querySelector('iframe');
frame.addEventListener('load', async () => {
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const wait = () => new Promise(resolve => setTimeout(resolve, 100));
  let failures = 0;
  function check(name, ok) {
    const row = document.createElement('li');
    row.className = ok ? 'pass' : 'fail';
    row.textContent = `${ok ? 'PASS' : 'FAIL'} · ${name}`;
    document.getElementById('results').appendChild(row);
    if (!ok) failures++;
  }
  await wait();
  const font = doc.getElementById('font-size');
  font.value = '19';
  font.dispatchEvent(new win.Event('change', { bubbles: true }));
  const provider = doc.querySelector('[data-key="enable7TV"]');
  provider.checked = false;
  provider.dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait();
  let saved = await win.chrome.storage.local.get('vortexSettings');
  check('Rapid changes preserve both edited settings', saved.vortexSettings.fontSize === 19 && saved.vortexSettings.enable7TV === false);
  const palette = doc.querySelector('[data-key="themePreset"]');
  palette.value = 'graphite';
  palette.dispatchEvent(new win.Event('change', { bubbles: true }));
  const density = doc.querySelector('[data-key="chatDensity"]');
  density.value = 'compact';
  density.dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait();
  saved = await win.chrome.storage.local.get('vortexSettings');
  check('Popup saves palette and chat density together', saved.vortexSettings.themePreset === 'graphite' &&
    saved.vortexSettings.chatDensity === 'compact' && doc.documentElement.dataset.vortexPreset === 'graphite');
  const mentionName = doc.querySelector('[data-key="mentionName"]');
  mentionName.value = 'FNIP';
  mentionName.dispatchEvent(new win.Event('change', { bubbles: true }));
  const catchup = doc.querySelector('[data-key="autoCatchup"]');
  catchup.checked = true;
  catchup.dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait();
  saved = await win.chrome.storage.local.get('vortexSettings');
  check('Popup saves mention and live playback options', saved.vortexSettings.mentionName === 'fnip' && saved.vortexSettings.autoCatchup);
  async function importText(text) {
    const data = new win.DataTransfer();
    data.items.add(new win.File([text], 'settings.json', { type: 'application/json' }));
    const input = doc.getElementById('backup-file');
    input.files = data.files;
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait();
  }
  await importText(JSON.stringify({ format: 'vortexchat-settings', schema: 1,
    settings: { fontSize: 21, pauseOnHover: true }, favorites: ['7TV:id:TestEmote'] }));
  saved = await win.chrome.storage.local.get(['vortexSettings', 'vortexFavorites']);
  check('Import updates settings and favorites together', saved.vortexSettings.fontSize === 21 && saved.vortexSettings.pauseOnHover && saved.vortexFavorites[0] === '7TV:id:TestEmote');
  check('Imported values are reflected in the UI', doc.getElementById('font-size-value').textContent === '21 px' && doc.querySelector('[data-key="pauseOnHover"]').checked);
  await importText('{"wrong":"format"}');
  saved = await win.chrome.storage.local.get('vortexSettings');
  check('Invalid imports leave current settings untouched', saved.vortexSettings.fontSize === 21 && doc.getElementById('toast').textContent.includes('Не удалось импортировать'));
  document.getElementById('summary').textContent = `${6 - failures}/6 passed`;
});
