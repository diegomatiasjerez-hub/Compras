// Prueba de interfaz en Chromium real (tamaño de celular) con IndexedDB real, sin servidor.
// Uso: NODE_PATH=<carpeta con playwright> node tests/ui/smoke.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = process.env.SHOTS_DIR || join(root, 'tests', 'ui', 'screens'); mkdirSync(shots, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0], p = join(root, u === '/' ? 'index.html' : u);
  if (!existsSync(p)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/plain' }); res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const results = []; let step = 0;
const ok = (name) => { results.push(name); console.log(`ok ${++step} - ${name}`); };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', acceptDownloads: true, serviceWorkers: 'block' });
await ctx.clock.setFixedTime(new Date('2026-10-12T11:30:00-03:00'));
await ctx.route('**/*', (route) => route.request().url().includes('fonts.g') ? route.abort() : route.continue());
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text())) errors.push(m.text()); });

const text = (sel = 'main') => page.locator(sel).innerText();
const shot = (name) => page.screenshot({ path: join(shots, name + '.png') });
const card = (name) => page.locator('article.prod', { hasText: name });
const dbCount = (store) => page.evaluate((s) => new Promise((res, rej) => { const r = indexedDB.open('compras-mensuales'); r.onerror = () => rej(r.error); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).count(); q.onsuccess = () => { r.result.close(); res(q.result); }; }; }), store);
const wipeBrowserData = async () => { // equivale a «Borrar datos de navegación» en Chrome
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'all' }); await cdp.detach();
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
};

try {
  // ---------- Primer uso ----------
  await page.goto(base); await page.waitForSelector('#w-seed');
  assert.match(await text('#app'), /Recuperar una copia/); ok('primer uso: pantalla de bienvenida con «Recuperar una copia»');
  await shot('00-bienvenida');
  await page.click('#w-seed'); await page.waitForSelector('.ticket');
  assert.match(await text('.ticket'), /\$0/); ok('empezar con ejemplos: Inicio muestra el mes en $0');
  await shot('01-inicio-vacio');

  await page.click('.nav a[data-r=compras]'); await page.waitForSelector('article.prod');
  assert.equal(await page.locator('article.prod').count(), 6); ok('Compras lista los 6 productos de ejemplo');
  assert.match(await card('Papel higiénico').innerText(), /Sin registro anterior/); ok('producto sin historial: «Sin registro anterior»');

  // escenario 1
  await card('Papel higiénico').locator('[data-add]').click(); await page.waitForSelector('form.pf');
  await page.fill('input[name=qty]', '4'); await page.fill('input[name=price]', '1.200');
  assert.match(await text('[data-total]'), /\$4\.800/); assert.match(await text('[data-detail]'), /\$300 por unidad/); ok('escenario 1: 4 × $1.200 = $4.800 y $300 por rollo');
  await page.waitForTimeout(400); await shot('02-form-compra');
  await page.click('[data-save]'); await page.waitForSelector('.toast.ok');
  assert.match(await card('Papel higiénico').locator('.bought').innerText(), /\$4\.800/); ok('la compra queda guardada y visible');
  assert.match(await text('#status'), /Guardado/); ok('confirmación visual «Guardado»');

  // escenarios 2 y 3
  await card('Queso fresco').locator('[data-add]').click(); await page.waitForSelector('form.pf');
  await page.fill('input[name=qty]', '1'); await page.fill('input[name=price]', '30000');
  await page.dblclick('[data-save]'); await page.waitForSelector('.toast.ok'); await page.waitForTimeout(400);
  await page.click('.nav a[data-r=inicio]'); await page.waitForSelector('.ticket');
  const t = await text('.ticket');
  assert.match(t, /\$34\.800/); assert.match(t, /2 compras registradas/); ok('escenarios 2-3: total $34.800 y el doble toque no duplicó (2 compras)');
  assert.equal(await dbCount('purchases'), 2); ok('IndexedDB tiene exactamente 2 compras');
  assert.match(t, /Makro\s*\$34\.800/s); assert.match(t, /Avícola Lanús\s*\$0/s); ok('totales por comercio coinciden con el total general');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300); await shot('03-inicio-ticket');

  // aviso de copia pendiente
  const alert = page.locator('#backup-alert');
  assert.equal(await alert.isVisible(), true); assert.match(await alert.innerText(), /Todavía no guardaste ninguna copia/); ok('aviso: hay datos y todavía no hay copia fuera del celular');

  // escenario 4: recargar
  await page.reload(); await page.waitForSelector('.ticket');
  assert.match(await text('.ticket'), /\$34\.800/); ok('escenario 4: al recargar la app los datos siguen');

  // modificar y ver historial
  await page.click('.nav a[data-r=compras]'); await page.waitForSelector('article.prod');
  await card('Queso fresco').locator('[data-manage]').click(); await page.click('[data-edit]');
  await page.fill('input[name=price]', '31000'); await page.click('form button[type=submit]'); await page.waitForSelector('.toast.ok');
  await page.click('.nav a[data-r=inicio]'); await page.waitForSelector('.ticket'); assert.match(await text('.ticket'), /\$35\.800/);
  await page.click('.nav a[data-r=compras]'); await card('Queso fresco').locator('[data-manage]').click(); await page.click('[data-edit]');
  await page.waitForFunction(() => /Modificación/.test(document.querySelector('[data-hist]')?.innerText || ''));
  ok('modificar una compra recalcula totales y deja historial de cambios');
  await page.fill('input[name=price]', '30000'); await page.click('form button[type=submit]'); await page.waitForSelector('.toast.ok');

  // sin internet también se guarda (todo es local)
  await card('Arroz').locator('[data-add]').click(); await page.waitForSelector('form.pf');
  await page.fill('input[name=qty]', '2'); await page.fill('input[name=price]', '2500');
  await ctx.setOffline(true); await page.click('[data-save]'); await page.waitForSelector('.toast.ok'); await ctx.setOffline(false);
  assert.equal(await dbCount('purchases'), 3); ok('sin conexión a internet la compra se guarda igual (3 compras)');

  // validaciones
  await card('Aceite').locator('[data-add]').click(); await page.waitForSelector('form.pf');
  await page.fill('input[name=qty]', '0'); await page.fill('input[name=price]', '-5'); await page.click('[data-save]');
  assert.match(await text('[data-err=quantity]'), /mayor que 0/); assert.match(await text('[data-err=price]'), /mayor que 0/); ok('validaciones: cantidad y precio inválidos se rechazan');
  await page.keyboard.press('Escape');

  // ---------- Copias de seguridad ----------
  await page.goto(base + '/#/copias'); await page.waitForSelector('[data-save]');
  await shot('04-backups');
  // 1) con hoja de compartir de Android (simulada)
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { name: d.files[0].name, size: d.files[0].size }; }; });
  await page.reload(); await page.waitForSelector('[data-save]');
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { name: d.files[0].name, size: d.files[0].size }; }; });
  await page.click('[data-save]'); await page.waitForSelector('.toast.ok');
  const shared = await page.evaluate(() => window.__shared);
  assert.match(shared.name, /^compras-backup-.*\.json$/); assert.ok(shared.size > 500); ok('«Guardar copia» abre la hoja de compartir con el archivo JSON');
  await page.waitForTimeout(300);
  assert.match(await text('main'), /Última copia guardada: hoy/); assert.equal(await alert.isVisible(), false); ok('tras guardar la copia desaparece el aviso de copia pendiente');
  // 2) descarga (sin hoja de compartir)
  await page.reload(); await page.waitForSelector('[data-save]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-save]')]);
  const bkPath = join(shots, 'backup-test.json'); await dl.saveAs(bkPath);
  const bk = JSON.parse(readFileSync(bkPath, 'utf8')); assert.equal(bk.meta.app, 'compras-mensuales'); assert.equal(bk.data.purchases.length, 3); ok('escenario 7a: el archivo descargado trae las 3 compras');
  await page.waitForSelector('.toast.ok');
  await page.click('[data-create]'); await page.waitForSelector('.toast.ok'); await page.waitForTimeout(300);
  assert.match(await text('main'), /Copia manual/); ok('«Crear copia interna» aparece en el historial');

  // alterar y restaurar desde archivo
  await page.goto(base + '/#/compras'); await page.waitForSelector('article.prod');
  await card('Arroz').locator('[data-manage]').click(); await page.click('[data-edit]'); await page.click('[data-del]');
  await page.click('[data-yes]'); await page.waitForSelector('.toast.ok');
  assert.equal(await dbCount('purchases'), 2);
  await page.goto(base + '/#/copias'); await page.waitForSelector('[data-file]', { state: 'attached' });
  writeFileSync(join(shots, 'bad.json'), JSON.stringify({ hola: 1 }));
  await page.setInputFiles('[data-file]', join(shots, 'bad.json')); await page.waitForSelector('.toast.error');
  assert.match(await text('.toast.error'), /rechazada/i); assert.equal(await dbCount('purchases'), 2); ok('escenario 7b: un archivo inválido se rechaza sin tocar datos');
  const tampered = structuredClone(bk); tampered.data.purchases[0].unit_price = 1; writeFileSync(join(shots, 'tampered.json'), JSON.stringify(tampered));
  await page.setInputFiles('[data-file]', join(shots, 'tampered.json')); await page.waitForSelector('.toast.error:has-text("total")');
  ok('una copia alterada (total que no cierra) se rechaza');
  await page.setInputFiles('[data-file]', bkPath); await page.waitForSelector('#cf-text');
  assert.equal(await page.locator('[data-yes]').isDisabled(), true); ok('restaurar exige escribir RESTAURAR (botón bloqueado)');
  await shot('05-restaurar');
  await page.fill('#cf-text', 'RESTAURAR'); await page.click('[data-yes]'); await page.waitForSelector('.toast.ok'); await page.waitForTimeout(300);
  assert.equal(await dbCount('purchases'), 3); ok('escenario 7c: la restauración devuelve las 3 compras');

  // ---------- Se borran los datos de navegación ----------
  await wipeBrowserData();
  await page.goto(base); await page.waitForSelector('#w-seed');
  assert.equal(await page.locator('.ticket').count(), 0); ok('tras borrar los datos de navegación la app arranca vacía, con la bienvenida');
  await page.setInputFiles('#w-file', join(shots, 'bad.json')); await page.waitForSelector('.toast.error'); ok('en la bienvenida, un archivo inválido se rechaza');
  await page.setInputFiles('#w-file', bkPath); await page.waitForSelector('[data-yes]');
  assert.match(await text('.sheet, [role=dialog]'), /3 compras/); ok('la bienvenida muestra qué contiene la copia antes de recuperar');
  await page.click('[data-yes]'); await page.waitForSelector('.ticket'); await page.waitForTimeout(300);
  assert.match(await text('.ticket'), /\$39\.800/); assert.equal(await dbCount('purchases'), 3);
  ok('RECUPERACIÓN: con el archivo de copia vuelven los datos (total $39.800, 3 compras)');
  await page.click('.nav a[data-r=compras]'); await page.waitForSelector('article.prod');
  assert.equal(await page.locator('article.prod').count(), 6); assert.match(await card('Papel higiénico').locator('.bought').innerText(), /\$4\.800/); ok('los productos y las compras recuperados se ven en Compras');

  // ---------- Cierre de mes ----------
  await page.goto(base + '/#/informes'); await page.waitForSelector('[data-close]');
  await shot('06-informe');
  await page.click('[data-close]'); await page.click('[data-yes]'); await page.waitForSelector('.toast.ok'); await page.waitForTimeout(300);
  await page.goto(base + '/#/compras'); await page.waitForSelector('article.prod');
  assert.equal(await page.locator('[data-add]').count(), 0); assert.match(await text('main'), /cerrado y protegido/); ok('mes cerrado: se oculta «Agregar» y se avisa que está protegido');
  await page.goto(base + '/#/informes'); await page.waitForSelector('[data-reopen]'); await page.click('[data-reopen]');
  await page.click('form button[type=submit]'); assert.match(await text('[data-err]'), /motivo/); ok('reabrir exige motivo');
  await page.fill('input[name=reason]', 'Corregir un precio'); await page.click('form button[type=submit]'); await page.waitForSelector('.toast.ok'); await page.waitForTimeout(300);
  await page.waitForSelector('[data-close]'); ok('mes reabierto con constancia');
  assert.deepEqual(errors, []); ok('sin errores de JavaScript en octubre');

  // ---------- Noviembre (mes nuevo) ----------
  await ctx.clock.setFixedTime(new Date('2026-11-05T10:00:00-03:00'));
  await page.goto(base); await page.waitForSelector('.ticket');
  assert.match(await text('.ticket'), /\$0/); assert.match(await text('.ticket'), /0 compras registradas/); ok('escenario 5a: noviembre empieza sin cantidades ni gastos');
  await page.click('.nav a[data-r=compras]'); await page.waitForSelector('article.prod');
  const pap = await card('Papel higiénico').innerText();
  assert.match(pap, /Mes anterior/); assert.match(pap, /\$1\.200/); assert.match(pap, /Sin compra/); assert.doesNotMatch(pap, /\$4\.800/); ok('escenario 5b: precios del mes anterior sí, cantidades no');
  assert.match(await card('Aceite').innerText(), /Sin registro anterior/); ok('un producto nunca comprado sigue en «Sin registro anterior»');
  await card('Papel higiénico').locator('[data-add]').click(); await page.waitForSelector('form.pf');
  assert.equal(await page.inputValue('input[name=price]'), '1200'); ok('el precio se sugiere con el último conocido');
  await page.fill('input[name=qty]', '4'); await page.fill('input[name=price]', '1.500');
  assert.match(await text('[data-detail]'), /\+\$300/); await page.click('[data-save]'); await page.waitForSelector('.toast.ok');
  const pap2 = await card('Papel higiénico').innerText(); assert.match(pap2, /\+\$300/); assert.match(pap2, /\+25 %/); ok('escenario 6: $1.500 vs $1.200 → +$300, +25 %');
  await shot('07-compras-comparativa');
  await page.click('.nav a[data-r=inicio]'); await page.waitForSelector('.ticket'); assert.match(await text('.ticket'), /\$6\.000/);
  assert.match(await text('main'), /Más aumentaron/); ok('Inicio muestra el gasto del mes y lo que más aumentó');
  await page.goto(base + '/#/comparativas'); await page.waitForSelector('svg.chart'); await shot('08-comparativas'); ok('Comparativas dibuja los gráficos');
  await page.goto(base + '/#/historial'); await page.waitForSelector('#ca'); await shot('09-historial'); ok('Historial permite comparar meses');
  await page.goto(base + '/#/productos'); await page.waitForSelector('article.prod'); await shot('10-productos'); ok('Productos se lista');
  await page.click('article.prod:has-text("Papel higiénico") [data-edit]'); await page.fill('input[name=pres]', 'Pack de 6 unidades'); await page.fill('input[name=qty]', '6');
  await page.click('form button[type=submit]'); await page.waitForSelector('.toast.ok'); await page.waitForTimeout(300);
  await page.goto(base + '/#/historial'); await page.waitForSelector('#ca');
  assert.match(await text('main'), /Pack de 4 unidades/); ok('escenario 8: editar el producto no cambia las compras históricas');
  await page.goto(base + '/#/configuracion'.replace('configuracion', 'config')); await page.waitForSelector('text=Almacenamiento'); await shot('11-configuracion'); ok('Configuración muestra el estado del almacenamiento');
  assert.deepEqual(errors, []); ok('sin errores de JavaScript en noviembre');

  // ---------- Instalación (PWA) ----------
  const man = await (await ctx.request.get(base + '/manifest.webmanifest')).json();
  assert.equal(man.display, 'standalone');
  for (const i of man.icons) assert.equal((await ctx.request.get(base + '/' + i.src)).status(), 200);
  assert.equal((await ctx.request.get(base + '/sw.js')).status(), 200); ok('manifest, iconos y service worker disponibles');
  console.log(`\nUI: ${results.length} comprobaciones OK`);
} catch (e) {
  console.error('\nFALLÓ:', e.message); process.exitCode = 1;
  try { await page.screenshot({ path: join(shots, 'FALLO.png') }); } catch { /* ignorar */ }
} finally { await browser.close(); server.close(); }
