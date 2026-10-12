// La app instalada abre sin internet (service worker) y conserva los datos.
import { createRequire } from 'node:module'; import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((q, s) => { const u = q.url.split('?')[0], p = join(root, u === '/' ? 'index.html' : u); if (!existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/plain' }); s.end(readFileSync(p)); });
await new Promise((r) => server.listen(0, r)); const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/fonts.g*/**', (r) => r.abort());
const page = await ctx.newPage();
try {
  await page.goto(base); await page.waitForSelector('#w-seed'); await page.click('#w-seed'); await page.waitForSelector('.ticket');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.ticket');
  await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.ticket', { timeout: 10000 });
  await page.click('.nav a[data-r=compras]'); await page.waitForSelector('article.prod');
  assert.equal(await page.locator('article.prod').count(), 6);
  console.log('ok - sin internet la app abre desde el service worker y muestra los datos');
} catch (e) { console.error('FALLÓ:', e.message); process.exitCode = 1; } finally { await browser.close(); server.close(); }
