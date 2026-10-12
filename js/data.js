// Capa de datos LOCAL: todo se guarda en IndexedDB, dentro del celular. Sin servidor, sin cuentas, sin costos.
// Reglas equivalentes a las de la versión con base de datos: idempotencia, meses cerrados, historial de cambios
// y restauración atómica. El formato de las copias (JSON) es el mismo en ambas versiones.
import { subtotal as calcSubtotal, round2, monthOf } from './calc.js';

export const configured = true;
export const state = {
  role: 'admin', email: '',
  stores: [], categories: [], products: [], periods: [], purchases: [], settings: {}, meta: {},
  loadedAt: null,
};
export const isAdmin = () => true;

export class AppError extends Error {
  constructor(message, { network = false, code = null } = {}) { super(message); this.network = network; this.code = code; }
}
export function toAppError(e) {
  if (e instanceof AppError) return e;
  const name = e?.name || '', msg = String(e?.message || e || '');
  if (name === 'ConstraintError') return new AppError('Ya existe un registro con esos datos.', { code: name });
  if (name === 'QuotaExceededError') return new AppError('No hay espacio suficiente en el celular para guardar. Liberá espacio y volvé a intentar.', { code: name });
  if (name === 'InvalidStateError' || name === 'UnknownError') return new AppError('El navegador no pudo acceder al almacenamiento del celular. Cerrá y volvé a abrir la app.', { code: name });
  return new AppError(msg || 'Ocurrió un error inesperado.', { code: name || null });
}

// ---------- IndexedDB ----------
const DB_NAME = 'compras-mensuales', DB_VERSION = 1;
const DATA_TABLES = ['stores', 'categories', 'products', 'periods', 'period_events', 'purchases', 'purchase_audit', 'settings'];
let dbPromise;

function openDb() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new AppError('Este navegador no permite guardar datos. Probá con Chrome.'));
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result, t = r.transaction;
      for (const s of ['stores', 'categories', 'products', 'periods', 'period_events', 'purchases', 'backups']) db.createObjectStore(s, { keyPath: 'id' });
      db.createObjectStore('purchase_audit', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('meta', { keyPath: 'key' });
      t.objectStore('purchases').createIndex('client_op_id', 'client_op_id', { unique: true });
      t.objectStore('purchases').createIndex('period_id', 'period_id');
      t.objectStore('periods').createIndex('ym', ['year', 'month'], { unique: true });
      t.objectStore('purchase_audit').createIndex('purchase_id', 'purchase_id');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new AppError('Hay otra pestaña de la app abierta con una versión anterior. Cerrala y recargá.'));
  });
  return dbPromise;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Transacción atómica: si algo falla se deshace TODO. Dentro de fn solo se deben esperar pedidos de IndexedDB. */
async function tx(names, mode, fn) {
  const db = await openDb(), t = db.transaction(names, mode);
  const done = new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new AppError('La operación se canceló. No se guardó nada.')); });
  let result;
  try { result = await fn(t); } catch (e) { try { t.abort(); } catch { /* ya cerrada */ } await done.catch(() => {}); throw toAppError(e); }
  try { await done; } catch (e) { throw toAppError(e); }
  return result;
}
const all = (t, name) => req(t.objectStore(name).getAll());

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

async function bump(t) {   // cuenta cambios desde la última copia descargada
  const m = t.objectStore('meta'), cur = (await req(m.get('changes')))?.value ?? 0;
  await req(m.put({ key: 'changes', value: cur + 1 }));
}

// ---------- Carga ----------
export async function loadAll() {
  const names = [...DATA_TABLES, 'meta'];
  const d = await tx(names, 'readonly', async (t) => Object.fromEntries(await Promise.all(names.map(async (n) => [n, await all(t, n)]))));
  const byName = (a, b) => a.name.localeCompare(b.name, 'es');
  state.stores = d.stores.sort(byName); state.categories = d.categories.sort(byName); state.products = d.products.sort(byName);
  state.periods = d.periods.sort((a, b) => a.year - b.year || a.month - b.month);
  state.purchases = d.purchases.sort((a, b) => a.purchased_on.localeCompare(b.purchased_on) || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  state.settings = Object.fromEntries(d.settings.map((s) => [s.key, s.value]));
  state.meta = Object.fromEntries(d.meta.map((m) => [m.key, m.value]));
  state.loadedAt = new Date();
}

// ---------- Inicio y datos de ejemplo ----------
export async function isFirstRun() {
  const d = await tx(['meta', 'products', 'stores', 'purchases'], 'readonly', async (t) => ({
    init: (await req(t.objectStore('meta').get('initialized')))?.value, p: await req(t.objectStore('products').count()),
    s: await req(t.objectStore('stores').count()), u: await req(t.objectStore('purchases').count()) }));
  return !d.init && d.p === 0 && d.s === 0 && d.u === 0;
}
export async function seedExample() {
  await tx(['stores', 'categories', 'products', 'meta'], 'readwrite', async (t) => {
    const stores = ['Makro', 'Avícola Lanús'].map((name) => ({ id: uuid(), name, active: true, created_at: now() }));
    const cats = ['Almacén', 'Limpieza', 'Higiene', 'Lácteos', 'Carnes', 'Aceites y condimentos'].map((name) => ({ id: uuid(), name, active: true, created_at: now() }));
    const c = (n) => cats.find((x) => x.name === n).id, s = (n) => stores.find((x) => x.name === n).id;
    const P = (name, cat, st, presentation, base_unit, base_qty) => ({ id: uuid(), name, category_id: c(cat), store_id: s(st), presentation, base_unit, base_qty, reference_price: null, active: true, created_at: now(), updated_at: now() });
    const prods = [P('Papel higiénico', 'Higiene', 'Makro', 'Pack de 4 unidades', 'un', 4), P('Queso fresco', 'Lácteos', 'Makro', 'Kilogramo', 'kg', 1), P('Arroz', 'Almacén', 'Makro', 'Paquete de 1 kg', 'kg', 1),
      P('Aceite', 'Aceites y condimentos', 'Makro', 'Botella de 1,5 litros', 'l', 1.5), P('Carne picada', 'Carnes', 'Avícola Lanús', 'Kilogramo', 'kg', 1), P('Pechuga de pollo', 'Carnes', 'Avícola Lanús', 'Kilogramo', 'kg', 1)];
    for (const [n, rows] of [['stores', stores], ['categories', cats], ['products', prods]]) for (const r of rows) await req(t.objectStore(n).add(r));
    await req(t.objectStore('meta').put({ key: 'initialized', value: true }));
  });
}
export async function markInitialized() { await setMeta('initialized', true); }

// ---------- Meta, respaldo pendiente y almacenamiento ----------
export async function setMeta(key, value) { await tx(['meta'], 'readwrite', (t) => req(t.objectStore('meta').put({ key, value }))); state.meta[key] = value; }
export const backupStatus = () => ({ lastBackupAt: state.meta.lastBackupAt || null, changes: state.meta.changes || 0 });
/** Se llama cuando el usuario guardó/compartió un archivo de copia fuera del navegador. */
export async function markBackedUp() {
  await tx(['meta'], 'readwrite', async (t) => { await req(t.objectStore('meta').put({ key: 'lastBackupAt', value: now() })); await req(t.objectStore('meta').put({ key: 'changes', value: 0 })); });
  await loadAll();
}
export async function requestPersistence() { try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; } }
export async function storageInfo() {
  try { const persisted = (await navigator.storage?.persisted?.()) ?? false; const e = (await navigator.storage?.estimate?.()) || {}; return { persisted, usage: e.usage ?? null, quota: e.quota ?? null }; }
  catch { return { persisted: false, usage: null, quota: null }; }
}

// ---------- Compras ----------
const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const closedMsg = (p) => `El mes ${p.month}/${p.year} está cerrado: no se puede modificar. Reabrilo primero.`;

export async function addPurchase({ opId, productId, quantity, price, date, notes }) {
  if (!opId) throw new AppError('Falta el identificador de operación');
  const row = await tx(['purchases', 'products', 'periods', 'purchase_audit', 'meta'], 'readwrite', async (t) => {
    const P = t.objectStore('purchases');
    const dup = await req(P.index('client_op_id').get(opId));
    if (dup) return dup;                                   // toque repetido o reintento: devuelve la compra ya guardada
    if (!(quantity > 0)) throw new AppError('La cantidad debe ser mayor que 0');
    if (!(price > 0)) throw new AppError('El precio debe ser mayor que 0');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date > tomorrowISO()) throw new AppError('Fecha inválida');
    const prod = await req(t.objectStore('products').get(productId));
    if (!prod) throw new AppError('Producto inexistente'); if (!prod.active) throw new AppError('El producto está inactivo');
    const { year, month } = monthOf(date);
    let per = await req(t.objectStore('periods').index('ym').get([year, month]));
    if (!per) { per = { id: uuid(), year, month, status: 'open', closed_at: null, closed_by: null, created_at: now() }; await req(t.objectStore('periods').add(per)); }
    if (per.status === 'closed') throw new AppError(closedMsg(per));
    const r = { id: uuid(), client_op_id: opId, period_id: per.id, product_id: prod.id, purchased_on: date, quantity, unit_price: price, subtotal: calcSubtotal(quantity, price),
      product_name: prod.name, presentation: prod.presentation, base_unit: prod.base_unit, base_qty: prod.base_qty, store_id: prod.store_id, notes: (notes || '').trim() || null,
      created_by: null, created_at: now(), updated_at: now() };
    await req(P.add(r));
    await req(t.objectStore('purchase_audit').add({ purchase_id: r.id, action: 'insert', old_row: null, new_row: r, at: now(), by: null }));
    await bump(t);
    return r;
  });
  return row;
}

export async function updatePurchase(id, { quantity, price, date, notes }) {
  return tx(['purchases', 'periods', 'purchase_audit', 'meta'], 'readwrite', async (t) => {
    const P = t.objectStore('purchases'), old = await req(P.get(id));
    if (!old) throw new AppError('La compra no existe.');
    const per = await req(t.objectStore('periods').get(old.period_id));
    if (per.status === 'closed') throw new AppError(closedMsg(per));
    if (!(quantity > 0) || !(price > 0)) throw new AppError('Cantidad y precio deben ser mayores que 0');
    const m = monthOf(date); if (m.year !== per.year || m.month !== per.month) throw new AppError(`La fecha de compra no corresponde al mes ${per.month}/${per.year}.`);
    const row = { ...old, quantity, unit_price: price, purchased_on: date, notes: (notes || '').trim() || null, subtotal: calcSubtotal(quantity, price), updated_at: now() };
    await req(P.put(row));
    await req(t.objectStore('purchase_audit').add({ purchase_id: id, action: 'update', old_row: old, new_row: row, at: now(), by: null }));
    await bump(t);
    return row;
  });
}

export async function deletePurchase(id) {
  await tx(['purchases', 'periods', 'purchase_audit', 'meta'], 'readwrite', async (t) => {
    const P = t.objectStore('purchases'), old = await req(P.get(id));
    if (!old) throw new AppError('La compra no existe.');
    const per = await req(t.objectStore('periods').get(old.period_id));
    if (per.status === 'closed') throw new AppError(closedMsg(per));
    await req(P.delete(id));
    await req(t.objectStore('purchase_audit').add({ purchase_id: id, action: 'delete', old_row: old, new_row: null, at: now(), by: null }));
    await bump(t);
  });
}
export async function purchaseHistory(id) {
  return tx(['purchase_audit'], 'readonly', async (t) => (await req(t.objectStore('purchase_audit').index('purchase_id').getAll(id))).sort((a, b) => a.id - b.id));
}

// ---------- Maestros ----------
const lc = (s) => String(s).trim().toLowerCase();
export async function saveProduct(p) {
  return tx(['products', 'stores', 'meta'], 'readwrite', async (t) => {
    const S = t.objectStore('products'), list = await all(t, 'products');
    if (!(await req(t.objectStore('stores').get(p.store_id)))) throw new AppError('Elegí un comercio.');
    if (list.some((x) => x.id !== p.id && lc(x.name) === lc(p.name) && lc(x.presentation) === lc(p.presentation))) throw new AppError('Ya existe un registro con esos datos (nombre o presentación repetidos).');
    const prev = p.id ? list.find((x) => x.id === p.id) : null;
    const row = { ...(prev || { id: uuid(), created_at: now() }), name: p.name.trim(), category_id: p.category_id || null, store_id: p.store_id, presentation: p.presentation.trim(),
      base_unit: p.base_unit, base_qty: p.base_qty, reference_price: p.reference_price ?? null, active: p.active, updated_at: now() };
    await req(S.put(row)); await bump(t); return row;
  });
}
export async function setProductActive(id, active) {
  await tx(['products', 'meta'], 'readwrite', async (t) => {
    const S = t.objectStore('products'), r = await req(S.get(id)); if (!r) throw new AppError('No se pudo actualizar el producto.');
    await req(S.put({ ...r, active, updated_at: now() })); await bump(t);
  });
}
export async function saveNamed(table, { id, name, active = true }) {
  if (!['stores', 'categories'].includes(table)) throw new AppError('Tabla no permitida');
  return tx([table, 'meta'], 'readwrite', async (t) => {
    const S = t.objectStore(table), list = await all(t, table);
    if (list.some((x) => x.id !== id && lc(x.name) === lc(name))) throw new AppError('Ya existe un registro con ese nombre.');
    const row = { ...(id ? list.find((x) => x.id === id) : { id: uuid(), created_at: now() }), name: name.trim(), active };
    await req(S.put(row)); await bump(t); return row;
  });
}
export async function saveSetting(key, value) { await tx(['settings'], 'readwrite', (t) => req(t.objectStore('settings').put({ key, value, updated_at: now() }))); }

// ---------- Meses ----------
export async function ensurePeriod(year, month) {
  return tx(['periods'], 'readwrite', async (t) => {
    const S = t.objectStore('periods'); let p = await req(S.index('ym').get([year, month]));
    if (!p) { p = { id: uuid(), year, month, status: 'open', closed_at: null, closed_by: null, created_at: now() }; await req(S.add(p)); }
    return p;
  });
}
export async function closePeriod(year, month) {
  return tx(['periods', 'purchases', 'stores', 'period_events', 'meta'], 'readwrite', async (t) => {
    const per = await req(t.objectStore('periods').index('ym').get([year, month]));
    if (!per) throw new AppError('El mes no tiene compras registradas');
    if (per.status === 'closed') throw new AppError('El mes ya está cerrado');
    const prevYM = month === 1 ? [year - 1, 12] : [year, month - 1];
    const prevP = await req(t.objectStore('periods').index('ym').get(prevYM));
    const rows = await req(t.objectStore('purchases').index('period_id').getAll(per.id));
    const prevRows = prevP ? await req(t.objectStore('purchases').index('period_id').getAll(prevP.id)) : [];
    const stores = await all(t, 'stores');
    const sum = (rs) => round2(rs.reduce((a, r) => a + Number(r.subtotal), 0));
    const total = sum(rows), prevTotal = prevP ? sum(prevRows) : null;
    const report = { year, month, total, lines: rows.length, distinct_products: new Set(rows.map((r) => r.product_id)).size,
      by_store: stores.filter((s) => rows.some((r) => r.store_id === s.id)).sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => ({ store_id: s.id, store: s.name, total: sum(rows.filter((r) => r.store_id === s.id)), lines: rows.filter((r) => r.store_id === s.id).length })),
      prev_total: prevTotal, diff: prevTotal === null ? null : round2(total - prevTotal), pct: prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 10000) / 100 : null, generated_at: now() };
    await req(t.objectStore('periods').put({ ...per, status: 'closed', closed_at: now(), closed_by: null }));
    await req(t.objectStore('period_events').add({ id: uuid(), period_id: per.id, action: 'closed', reason: null, report, at: now(), by: null }));
    await bump(t);
    return report;
  });
}
export async function reopenPeriod(year, month, reason) {
  if (!reason || reason.trim().length < 5) throw new AppError('Indicá el motivo de la reapertura (mínimo 5 caracteres)');
  await createBackup(`Antes de reabrir ${month}/${year}`, 'pre_op');
  await tx(['periods', 'period_events', 'meta'], 'readwrite', async (t) => {
    const per = await req(t.objectStore('periods').index('ym').get([year, month]));
    if (!per) throw new AppError('Mes inexistente'); if (per.status !== 'closed') throw new AppError('El mes no está cerrado');
    await req(t.objectStore('periods').put({ ...per, status: 'open', closed_at: null, closed_by: null }));
    await req(t.objectStore('period_events').add({ id: uuid(), period_id: per.id, action: 'reopened', reason: reason.trim(), report: null, at: now(), by: null }));
    await bump(t);
  });
}
export async function periodEvents() { return tx(['period_events'], 'readonly', async (t) => (await all(t, 'period_events')).sort((a, b) => b.at.localeCompare(a.at))); }

// ---------- Copias de seguridad ----------
function buildExport(d) {
  const data = {
    stores: d.stores.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id)),
    categories: d.categories.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id)),
    products: d.products.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id)),
    periods: d.periods.sort((a, b) => a.year - b.year || a.month - b.month),
    period_events: d.period_events.sort((a, b) => a.at.localeCompare(b.at)),
    purchases: d.purchases.sort((a, b) => a.purchased_on.localeCompare(b.purchased_on) || String(a.created_at).localeCompare(String(b.created_at))),
    purchase_audit: d.purchase_audit.sort((a, b) => a.id - b.id),
    settings: d.settings.sort((a, b) => a.key.localeCompare(b.key)),
  };
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { meta: { app: 'compras-mensuales', version: 1, exported_at: now(), counts, total_spent: round2(data.purchases.reduce((a, r) => a + Number(r.subtotal), 0)) }, data };
}
const readAll = (t) => Promise.all(DATA_TABLES.map(async (n) => [n, await all(t, n)])).then(Object.fromEntries);

export async function exportData() { return buildExport(await tx(DATA_TABLES, 'readonly', readAll)); }

const KEEP = { auto: 14, pre_op: 20, pre_restore: 10 };
async function snapshot(kind, note) {
  const payload = await exportData(), id = uuid();
  await tx(['backups'], 'readwrite', async (t) => {
    const S = t.objectStore('backups');
    await req(S.add({ id, created_at: now(), created_by: null, kind, status: 'ok', note: note || null, counts: payload.meta.counts, total_spent: payload.meta.total_spent, payload }));
    const mine = (await all(t, 'backups')).filter((b) => b.kind === kind).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (KEEP[kind]) for (const old of mine.slice(KEEP[kind])) await req(S.delete(old.id));
  });
  return id;
}
export async function createBackup(note = null, kind = 'manual') { return snapshot(kind, note); }
/** Copia interna automática, una por día como máximo (solo si hay compras). */
export async function dailySnapshot() {
  const list = await listBackups(); const today = new Date().toDateString();
  if (list.some((b) => b.kind === 'auto' && new Date(b.created_at).toDateString() === today)) return null;
  if (!state.purchases.length) return null;
  return snapshot('auto', 'Copia automática diaria');
}
export async function listBackups() {
  const rows = await tx(['backups'], 'readonly', (t) => all(t, 'backups'));
  return rows.map(({ payload, ...r }) => r).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 60);
}
export async function backupPayload(id) { const r = await tx(['backups'], 'readonly', (t) => req(t.objectStore('backups').get(id))); if (!r) throw new AppError('La copia no existe.'); return r.payload; }

export async function validateBackup(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new AppError('Archivo inválido: no es un backup');
  if (p.meta?.app !== 'compras-mensuales') throw new AppError('Archivo inválido: no es un backup de Compras Mensuales');
  if (p.meta.version !== 1) throw new AppError('Versión de backup no soportada');
  for (const k of DATA_TABLES) {
    const a = p.data?.[k];
    if (!Array.isArray(a)) throw new AppError(`Backup incompleto: falta la sección ${k}`);
    if (a.length !== p.meta.counts?.[k]) throw new AppError(`Backup corrupto: la sección ${k} no coincide con el conteo declarado`);
  }
  const sum = round2(p.data.purchases.reduce((a, r) => a + calcSubtotal(r.quantity, r.unit_price), 0));
  if (!Number.isFinite(sum) || Math.abs(sum - Number(p.meta.total_spent)) > 0.01) throw new AppError(`Backup corrupto: el total gastado no coincide (${sum} vs ${p.meta.total_spent})`);
  const ids = (k) => new Set(p.data[k].map((r) => r.id));
  const prod = ids('products'), per = ids('periods'), sto = ids('stores');
  if (p.data.purchases.some((r) => !prod.has(r.product_id))) throw new AppError('Backup corrupto: hay compras que apuntan a productos inexistentes');
  if (p.data.purchases.some((r) => !per.has(r.period_id))) throw new AppError('Backup corrupto: hay compras que apuntan a meses inexistentes');
  if (p.data.products.some((r) => !sto.has(r.store_id))) throw new AppError('Backup corrupto: hay productos que apuntan a comercios inexistentes');
  return { ok: true, counts: p.meta.counts, total_spent: p.meta.total_spent, exported_at: p.meta.exported_at };
}

/** Reemplaza TODO en una sola transacción: si algo falla, los datos actuales quedan intactos. */
export async function restoreBackup(payload, confirm) {
  if (confirm !== 'RESTAURAR') throw new AppError('Falta la confirmación explícita (escribir RESTAURAR)');
  const check = await validateBackup(payload);
  const pre = await snapshot('pre_restore', 'Copia automática antes de restaurar');
  await tx([...DATA_TABLES, 'meta'], 'readwrite', async (t) => {
    for (const n of [...DATA_TABLES].reverse()) await req(t.objectStore(n).clear());
    for (const n of DATA_TABLES) for (const r of payload.data[n]) await req(t.objectStore(n).put(structuredClone(r)));
    await req(t.objectStore('meta').put({ key: 'initialized', value: true }));
    await req(t.objectStore('meta').put({ key: 'changes', value: 0 }));
  });
  return { restored: true, pre_restore_backup: pre, counts: check.counts, total_spent: check.total_spent };
}

// ---------- Lectura ----------
export const storeById = (id) => state.stores.find((s) => s.id === id);
export const productById = (id) => state.products.find((p) => p.id === id);
export const categoryById = (id) => state.categories.find((c) => c.id === id);
export const periodFor = (year, month) => state.periods.find((p) => p.year === year && p.month === month) || null;
export const isClosed = (year, month) => periodFor(year, month)?.status === 'closed';
export function storeClass(storeId) {
  const n = (storeById(storeId)?.name || '').toLowerCase();
  return n.includes('makro') ? 'makro' : n.includes('av') ? 'avicola' : '';
}
