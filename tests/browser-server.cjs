// Run from the repository root: node tests/browser-server.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/popup-preview') {
    response.setHeader('Content-Type', types['.html']);
    response.end(fs.readFileSync(path.join(root, 'extension/popup.html'), 'utf8')
      .replace('<head>', '<head><base href="/extension/">')
      .replace('<script src="core.js">', '<script src="/tests/browser/mock.js"></script><script src="core.js">'));
    return;
  }
  const pathname = url.pathname === '/popup-tests' ? '/tests/browser/popup-tests.html' : url.pathname === '/forsen'
    ? url.searchParams.has('preview') ? '/tests/browser/preview.html' : '/tests/browser/chat.html'
    : url.pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  try {
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(5187, '127.0.0.1', () => console.log('Fixtures: http://127.0.0.1:5187/forsen and /popup-preview'));
