/* GitHub Release updater for a user-selected unpacked extension folder. */
(function (root) {
  'use strict';
  const OWNER = 'FN1p';
  const REPO = 'VortexChat';
  const RELEASES = `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=10`;
  const MAX_FILE = 5 * 1024 * 1024;
  const MAX_TOTAL = 25 * 1024 * 1024;

  function versionParts(version) {
    if (!/^\d+\.\d+\.\d+$/.test(version || '')) return null;
    return version.split('.').map(Number);
  }
  function newerVersion(latest, current) {
    const a = versionParts(latest), b = versionParts(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  }
  function releaseTag(releases) {
    const release = releases?.find(item => !item.draft &&
      item.assets?.some(asset => asset.name === 'VortexChat-7TV-Extension.zip') &&
      /^v[\w.-]{1,60}$/.test(item.tag_name || ''));
    return release?.tag_name || '';
  }
  function rawUrl(tag, relativePath) {
    if (!/^v[\w.-]{1,60}$/.test(tag) || !/^extension\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(relativePath) ||
      relativePath.split('/').some(part => part === '.' || part === '..'))
      throw new Error('Некорректный путь файла обновления');
    return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${tag}/${relativePath}`;
  }
  async function checkedFetch(url, fetcher = fetch) {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Не удалось загрузить обновление: HTTP ${response.status}`);
    return response;
  }
  async function latestRelease(fetcher = fetch) {
    const releases = await (await checkedFetch(RELEASES, fetcher)).json();
    const tag = releaseTag(releases);
    if (!tag) throw new Error('Не найден релиз с архивом расширения');
    const manifest = await (await checkedFetch(rawUrl(tag, 'extension/manifest.json'), fetcher)).json();
    if (manifest.name !== '__MSG_extensionName__' || !versionParts(manifest.version))
      throw new Error('Релиз содержит неверный manifest.json');
    return { tag, version: manifest.version, label: manifest.version_name || manifest.version };
  }
  function filesFromTree(tree) {
    if (tree?.truncated || !Array.isArray(tree?.tree)) throw new Error('Список файлов релиза неполный');
    const files = tree.tree.filter(item => item.type === 'blob' && item.path?.startsWith('extension/'));
    if (!files.length || files.length > 100 || !files.some(item => item.path === 'extension/manifest.json'))
      throw new Error('В релизе нет полного расширения');
    let total = 0;
    for (const item of files) {
      rawUrl('v1', item.path);
      if (!/^[0-9a-f]{40}$/i.test(item.sha || '') || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > MAX_FILE)
        throw new Error('В релизе есть недопустимый файл');
      total += item.size;
    }
    if (total > MAX_TOTAL) throw new Error('Обновление слишком большое');
    return files;
  }
  async function releaseFiles(tag, fetcher = fetch) {
    if (!/^v[\w.-]{1,60}$/.test(tag)) throw new Error('Некорректная версия релиза');
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${encodeURIComponent(tag)}?recursive=1`;
    return filesFromTree(await (await checkedFetch(url, fetcher)).json());
  }
  async function verifyBlob(bytes, entry, digest = data => crypto.subtle.digest('SHA-1', data)) {
    if (bytes.byteLength !== entry.size) throw new Error(`Размер файла не совпадает: ${entry.path}`);
    const prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
    const input = new Uint8Array(prefix.length + bytes.byteLength);
    input.set(prefix);
    input.set(bytes, prefix.length);
    const hash = [...new Uint8Array(await digest(input))].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== entry.sha.toLowerCase()) throw new Error(`Проверка файла не прошла: ${entry.path}`);
  }
  async function downloadFiles(tag, entries, fetcher = fetch, onProgress = () => {}) {
    const result = [];
    for (const entry of entries) {
      const bytes = new Uint8Array(await (await checkedFetch(rawUrl(tag, entry.path), fetcher)).arrayBuffer());
      await verifyBlob(bytes, entry);
      result.push({ path: entry.path.slice('extension/'.length), bytes });
      onProgress(result.length, entries.length);
    }
    return result;
  }
  async function validateFolder(folder, currentVersion) {
    let file;
    try { file = await (await folder.getFileHandle('manifest.json')).getFile(); }
    catch { throw new Error('В выбранной папке нет manifest.json расширения VortexChat'); }
    let manifest;
    try { manifest = JSON.parse(await file.text()); }
    catch { throw new Error('Не удалось прочитать manifest.json выбранной папки'); }
    if (manifest.name !== '__MSG_extensionName__' || manifest.author !== 'PFT Studio' || manifest.version !== currentVersion)
      throw new Error('Выбери папку установленной версии VortexChat, а не другого расширения');
  }
  async function writeFiles(folder, files, onProgress = () => {}) {
    const sorted = [...files].sort((a, b) => (a.path === 'manifest.json') - (b.path === 'manifest.json'));
    for (let index = 0; index < sorted.length; index++) {
      const item = sorted[index];
      const parts = item.path.split('/');
      if (!parts.length || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '..'))
        throw new Error('Некорректный путь файла обновления');
      let directory = folder;
      for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
      const writable = await (await directory.getFileHandle(parts.at(-1), { create: true })).createWritable();
      try { await writable.write(item.bytes); await writable.close(); }
      catch (error) { await writable.abort().catch(() => {}); throw error; }
      onProgress(index + 1, sorted.length);
    }
  }
  const api = { newerVersion, releaseTag, rawUrl, latestRelease, filesFromTree, releaseFiles,
    verifyBlob, downloadFiles, validateFolder, writeFiles };
  root.VortexUpdater = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
