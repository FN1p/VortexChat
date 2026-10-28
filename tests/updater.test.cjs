const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const updater = require('../extension/updater.js');

function memoryFolder(files = {}) {
  const entries = new Map(Object.entries(files));
  const writes = [];
  const folder = {
    writes,
    entries,
    async getDirectoryHandle(name, options) {
      if (!entries.has(name) && options?.create) entries.set(name, memoryFolder());
      const value = entries.get(name);
      if (!value?.getFileHandle) throw new Error('Not a directory');
      return value;
    },
    async getFileHandle(name, options) {
      if (!entries.has(name) && !options?.create) throw new Error('Missing file');
      return {
        async getFile() { return { text: async () => String(entries.get(name)) }; },
        async createWritable() {
          return { async write(bytes) { entries.set(name, bytes); writes.push(name); },
            async close() {}, async abort() {} };
        }
      };
    }
  };
  return folder;
}

test('updater compares versions and chooses a published extension release', () => {
  assert.equal(updater.newerVersion('4.4.12', '4.4.11'), true);
  assert.equal(updater.newerVersion('4.4.9', '4.4.11'), false);
  assert.equal(updater.newerVersion('invalid', '4.4.11'), false);
  assert.equal(updater.releaseTag([
    { draft: true, tag_name: 'v9.9.9', assets: [{ name: 'VortexChat-7TV-Extension.zip' }] },
    { draft: false, tag_name: 'v1.3.14-beta.14', assets: [{ name: 'VortexChat-7TV-Extension.zip' }] }
  ]), 'v1.3.14-beta.14');
});

test('updater rejects incomplete and unsafe release trees', () => {
  const manifest = { path: 'extension/manifest.json', type: 'blob', size: 10, sha: 'a'.repeat(40) };
  assert.deepEqual(updater.filesFromTree({ tree: [manifest] }), [manifest]);
  assert.throws(() => updater.filesFromTree({ truncated: true, tree: [manifest] }), /неполный/);
  assert.throws(() => updater.filesFromTree({ tree: [manifest, { ...manifest, path: 'extension/../outside.js' }] }), /путь/);
  assert.throws(() => updater.filesFromTree({ tree: [{ ...manifest, size: 6 * 1024 * 1024 }] }), /недопустимый/);
});

test('updater validates the selected extension folder and writes manifest last', async () => {
  const oldManifest = JSON.stringify({ name: '__MSG_extensionName__', author: 'PFT Studio', version: '4.4.11' });
  const folder = memoryFolder({ 'manifest.json': oldManifest });
  await updater.validateFolder(folder, '4.4.11');
  await assert.rejects(updater.validateFolder(folder, '4.4.10'), /папку установленной/);
  const files = [
    { path: 'manifest.json', bytes: new TextEncoder().encode('new manifest') },
    { path: 'content.js', bytes: new TextEncoder().encode('new code') },
    { path: 'icons/icon16.png', bytes: new Uint8Array([1, 2, 3]) }
  ];
  await updater.writeFiles(folder, files);
  assert.equal(folder.writes.at(-1), 'manifest.json');
  assert.deepEqual([...folder.entries.get('icons').entries.get('icon16.png')], [1, 2, 3]);
});

test('updater verifies downloaded bytes against Git blob hashes before writing', async () => {
  const bytes = new TextEncoder().encode('hello');
  const sha = createHash('sha1').update(Buffer.concat([Buffer.from('blob 5\0'), Buffer.from(bytes)])).digest('hex');
  const entry = { path: 'extension/manifest.json', type: 'blob', size: 5, sha };
  const fetcher = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer });
  const result = await updater.downloadFiles('v1.3.14-beta.14', [entry], fetcher);
  assert.equal(result[0].path, 'manifest.json');
  await assert.rejects(updater.downloadFiles('v1.3.14-beta.14', [{ ...entry, sha: '0'.repeat(40) }], fetcher), /Проверка файла/);
});
