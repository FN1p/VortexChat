document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const current = chrome.runtime.getManifest().version;
  $('current-version').textContent = current;
  let release;
  function status(message, failed = false) {
    $('status').textContent = message;
    $('status').style.color = failed ? '#ff9999' : '';
  }
  try {
    release = await VortexUpdater.latestRelease();
    $('latest-version').textContent = release.label;
    $('fallback').href = `https://github.com/FN1p/VortexChat/releases/download/${release.tag}/VortexChat-7TV-Extension.zip`;
    if (!VortexUpdater.newerVersion(release.version, current)) {
      status('У тебя уже установлена последняя версия.');
      return;
    }
    if (typeof window.showDirectoryPicker !== 'function') {
      status('Этот браузер не поддерживает обновление через выбор папки.', true);
      $('fallback').hidden = false;
      return;
    }
    status(`Доступна версия ${release.version}. Выбери папку установленного расширения.`);
    $('install').disabled = false;
  } catch (error) {
    status(error.message || 'Не удалось проверить обновления.', true);
    $('fallback').hidden = false;
  }
  $('install').addEventListener('click', async () => {
    // The picker must be called directly from the click gesture.
    let folder;
    try { folder = await window.showDirectoryPicker({ mode: 'readwrite', id: 'vortexchat-update' }); }
    catch (error) {
      if (error?.name !== 'AbortError') status('Не удалось открыть папку: ' + (error.message || 'доступ запрещён'), true);
      return;
    }
    $('install').disabled = true;
    try {
      await VortexUpdater.validateFolder(folder, current);
      status('Получаю список файлов релиза…');
      const entries = await VortexUpdater.releaseFiles(release.tag);
      status(`Загружаю файлы: 0 из ${entries.length}`);
      const files = await VortexUpdater.downloadFiles(release.tag, entries, fetch,
        (done, total) => status(`Загружаю и проверяю файлы: ${done} из ${total}`));
      status('Устанавливаю обновление…');
      await VortexUpdater.writeFiles(folder, files,
        (done, total) => status(`Устанавливаю файлы: ${done} из ${total}`));
      const manifestHandle = await folder.getFileHandle('manifest.json');
      const updated = JSON.parse(await (await manifestHandle.getFile()).text());
      if (updated.version !== release.version) throw new Error('Версия после установки не совпала');
      await chrome.storage.local.set({ vortexUpdateExpected: release.version });
      status(`Версия ${release.version} установлена. Перезапускаю расширение…`);
      setTimeout(() => chrome.runtime.reload(), 800);
    } catch (error) {
      status(error.message || 'Обновление не удалось. Попробуй ещё раз.', true);
      $('install').disabled = false;
      $('fallback').hidden = false;
    }
  });
});
