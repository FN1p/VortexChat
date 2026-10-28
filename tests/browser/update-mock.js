const nextManifest = '{"name":"__MSG_extensionName__","author":"PFT Studio","version":"4.4.12"}';
const nextCode = '// updated';
const fakeFiles = new Map([['manifest.json', '{"name":"__MSG_extensionName__","author":"PFT Studio","version":"4.4.11"}']]);
const writes = [];
window.fixtureWrites = writes;
window.fakeFiles = fakeFiles;
const folder = {
  async getFileHandle(name, options) {
    if (!fakeFiles.has(name) && !options?.create) throw new Error('File missing');
    return {
      async getFile() { return { text: async () => String(fakeFiles.get(name)) }; },
      async createWritable() {
        return { async write(bytes) { fakeFiles.set(name, new TextDecoder().decode(bytes)); writes.push(name); },
          async close() {}, async abort() {} };
      }
    };
  }
};
window.showDirectoryPicker = async options => { window.fixturePickerMode = options.mode; return folder; };
window.chrome = {
  runtime: { getManifest: () => ({ version: '4.4.11' }), reload: () => { window.fixtureReloaded = true; } },
  storage: { local: { set: async value => { window.fixtureExpected = value.vortexUpdateExpected; } } }
};
const hashes = {
  'manifest.json': '7992e6295ed9b2752d7ca3f63db4ec8b4eeea63d',
  'content.js': '1326099d732c5be6e1c64fd109cc907b67faca52'
};
Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: {
  async digest(_algorithm, data) {
    const text = new TextDecoder().decode(data);
    const hash = text.includes(nextCode) ? hashes['content.js'] : hashes['manifest.json'];
    return Uint8Array.from(hash.match(/../g), part => parseInt(part, 16)).buffer;
  }
} });
window.fetch = async url => {
  const text = String(url);
  let data;
  if (text.includes('/releases?')) data = [{ draft: false, tag_name: 'v1.3.14-beta.15', assets: [{ name: 'VortexChat-7TV-Extension.zip' }] }];
  else if (text.includes('/git/trees/')) data = { tree: [
    { path: 'extension/manifest.json', type: 'blob', size: 73, sha: hashes['manifest.json'] },
    { path: 'extension/content.js', type: 'blob', size: 10, sha: hashes['content.js'] }
  ] };
  else if (text.endsWith('/extension/manifest.json')) data = nextManifest;
  else if (text.endsWith('/extension/content.js')) data = nextCode;
  else return { ok: false, status: 404 };
  return { ok: true, json: async () => typeof data === 'string' ? JSON.parse(data) : data,
    arrayBuffer: async () => new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data)).buffer };
};
