// Ручная проверка, не часть обычного прогона (npm run check / test / build).
// Запускает Chromium — только по явному указанию: npm run manual:scroll-360.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  let filePath = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(DIST, '404.html');
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const PAGES = ['/', '/napravleniya/', '/obekty/', '/dopuski/', '/kontakty/', '/404.html'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 } });

let allOk = true;
for (const p of PAGES) {
  await page.goto(`http://127.0.0.1:${port}${p}`, { waitUntil: 'networkidle' });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const ok = scrollWidth === clientWidth;
  allOk = allOk && ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${p}  scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
}

await browser.close();
server.close();
process.exit(allOk ? 0 : 1);
