/* VortexChat popup: settings persist across tabs; status comes from the active tab. */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  let settings = VortexCore.normalizeSettings();
  let tabId = null;
  let toastTimer;
  let saveQueue = Promise.resolve();
  const labels = { idle: '7TV: нет событий', connecting: '7TV: подключение…', connected: '7TV: события подключены', reconnecting: '7TV: переподключение…' };
  const loadLabels = { idle: 'Открой канал Twitch', loading: 'Загрузка смайлов…', ready: 'Смайлы загружены', partial: 'Часть провайдеров недоступна', error: 'Ошибка загрузки — попробуй обновить' };

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 3500);
  }
  function syncUI() {
    document.documentElement.dataset.vortexPreset = settings.themePreset;
    document.querySelectorAll('[data-key]').forEach(input => {
      if (input.type === 'checkbox') input.checked = settings[input.dataset.key];
      else input.value = settings[input.dataset.key];
    });
    $('font-size-value').textContent = `${settings.fontSize} px`;
    $('ambilight-brightness-value').textContent = `${settings.ambilightBrightness}%`;
    $('ambilight-spread-value').textContent = `${settings.ambilightSpread}%`;
  }
  function showUnavailable() {
    $('detected-channel').textContent = 'Нет активного канала';
    $('connection-state').textContent = 'Нет связи с Twitch';
    $('connection-state').dataset.connected = 'false';
    $('emote-status').textContent = 'Открой Twitch. После установки обнови вкладку.';
    $('btn-reload-emotes').disabled = true;
    $('btn-open-settings').disabled = true;
  }
  async function updateStatus() {
    if (!tabId) return showUnavailable();
    try {
      const status = await chrome.tabs.sendMessage(tabId, { action: 'GET_VORTEXCHAT_STATUS' });
      if (!status) return showUnavailable();
      $('detected-channel').textContent = status.channel ? `#${status.channel}` : 'Открой канал Twitch';
      $('connection-state').textContent = labels[status.eventState] || labels.idle;
      $('connection-state').dataset.connected = String(status.eventState === 'connected');
      $('emote-status').textContent = `${loadLabels[status.loadState] || ''}${status.error ? ` · ${status.error}` : ''}${status.emoteCount ? ` · ${status.emoteCount} смайлов` : ''}${status.cachedSources ? ` · из кэша: ${status.cachedSources}` : ''}`;
      $('btn-reload-emotes').disabled = !status.channel || status.loadState === 'loading';
      $('btn-open-settings').disabled = false;
    } catch { showUnavailable(); }
  }
  document.querySelectorAll('[data-key]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.key;
      const value = input.type === 'checkbox' ? input.checked : input.value;
      settings = VortexCore.normalizeSettings({ ...settings, [key]: value });
      syncUI();
      // Serialize local edits and merge a single field, so rapid toggles cannot overwrite each other.
      saveQueue = saveQueue.then(async () => {
        const saved = await chrome.storage.local.get('vortexSettings');
        const next = VortexCore.normalizeSettings({ ...saved.vortexSettings, [key]: value });
        await chrome.storage.local.set({ vortexSettings: next });
        toast('Настройки сохранены');
      }).catch(() => { toast('Не удалось сохранить настройки'); });
    });
  });
  $('font-size').addEventListener('input', event => { $('font-size-value').textContent = `${event.target.value} px`; });
  for (const key of ['ambilight-brightness', 'ambilight-spread']) {
    $(key).addEventListener('input', event => { $(`${key}-value`).textContent = `${event.target.value}%`; });
  }
  $('btn-export').addEventListener('click', async () => {
    try {
      await saveQueue;
      const saved = await chrome.storage.local.get(['vortexSettings', 'vortexFavorites']);
      const data = { format: 'vortexchat-settings', schema: 1,
        settings: VortexCore.normalizeSettings(saved.vortexSettings), favorites: VortexCore.normalizeFavorites(saved.vortexFavorites) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'VortexChat-settings.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Экспортированы настройки и избранные смайлы');
    } catch { toast('Не удалось экспортировать настройки'); }
  });
  $('btn-import').addEventListener('click', () => $('backup-file').click());
  $('backup-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 100000) throw new Error('Файл настроек слишком большой');
      const data = VortexCore.parseBackup(await file.text());
      await saveQueue;
      await chrome.storage.local.set(data);
      settings = data.vortexSettings;
      syncUI();
      toast('Настройки и избранное импортированы');
    } catch { toast('Не удалось импортировать: нужен JSON-файл настроек VortexChat'); }
    event.target.value = '';
  });
  $('btn-open-settings').addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'OPEN_VORTEXCHAT_MODAL' });
      window.close();
    } catch { toast('Обнови вкладку Twitch и попробуй снова'); }
  });
  $('btn-reload-emotes').addEventListener('click', async () => {
    $('btn-reload-emotes').disabled = true;
    toast('Загрузка смайлов…');
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'RELOAD_7TV_EMOTES' });
      toast(response?.ok ? 'Смайлы обновлены' : 'Загружены не все данные. Попробуй ещё раз.');
    } catch { toast('Нет связи с вкладкой Twitch'); }
    await updateStatus();
  });
  document.querySelectorAll('[data-key]').forEach(input => { input.disabled = true; });
  try {
    const saved = await chrome.storage.local.get('vortexSettings');
    settings = VortexCore.normalizeSettings(saved.vortexSettings);
    syncUI();
    document.querySelectorAll('[data-key]').forEach(input => { input.disabled = false; });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const host = new URL(tab.url).hostname;
      if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) tabId = tab.id;
    }
  } catch { toast('Не удалось прочитать настройки'); }
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  await updateStatus();
  setInterval(updateStatus, 1500);
});
