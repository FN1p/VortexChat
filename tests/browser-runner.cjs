const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.html': 'text/html' };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  let failed = false;
  try {
    for (const entry of ['/forsen', '/popup-tests']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const requestPath = new URL(route.request().url()).pathname;
        if (requestPath === '/popup-preview') {
          const html = fs.readFileSync(path.join(root, 'extension/popup.html'), 'utf8')
            .replace('<head>', '<head><base href="/extension/">')
            .replace('<script src="core.js">', '<script src="/tests/browser/mock.js"></script><script src="core.js">');
          return route.fulfill({ body: html, contentType: 'text/html' });
        }
        const localPath = requestPath === '/forsen' ? '/tests/browser/chat.html' :
          requestPath === '/popup-tests' ? '/tests/browser/popup-tests.html' : requestPath;
        const file = path.resolve(root, `.${localPath}`);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
        return route.fulfill({ body: fs.readFileSync(file), contentType: contentTypes[path.extname(file)] || 'application/octet-stream' });
      });
      await page.goto(`http://vortex-fixture.test${entry}`);
      await page.waitForFunction(() => !document.querySelector('#summary').textContent.includes('Running'), { timeout: 15000 }).catch(() => {});
      const summary = await page.locator('#summary').innerText();
      const failures = await page.locator('li.fail').allInnerTexts();
      if (entry === '/forsen' && !failures.length && !errors.length) {
        const input = page.locator('textarea[data-a-target="chat-input"]');
        await input.fill('History test');
        await input.press('Enter');
        await input.fill('');
        await input.press('ArrowUp');
        if (!(await input.inputValue()).includes('History test')) {
          console.log('FAIL · Chat input history did not restore the previous draft');
          failed = true;
        }
      }
      console.log(`${entry}: ${summary}`);
      for (const line of failures) console.log(line);
      for (const error of errors) console.log(`Page error: ${error}`);
      failed ||= failures.length > 0 || errors.length > 0 || summary.includes('Running');
      await page.close();
    }
  } finally { await browser.close(); }
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
