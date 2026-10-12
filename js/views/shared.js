// Piezas compartidas por las pantallas: mes seleccionado, índice de precios y bloques de comparación.
import { state, storeById, storeClass, isClosed } from '../data.js';
import { buildPriceIndex, prevMonth, nextMonth, ym } from '../calc.js';
import { monthLabel, monthLabelShort, formatARS, formatSignedARS, formatPct, unitShort, esc } from '../format.js';
import { icon } from '../ui.js';

const now = new Date();
export const ctx = { year: now.getFullYear(), month: now.getMonth() + 1, rerender: () => {}, go: () => {} };

export function setMonth(year, month) { ctx.year = year; ctx.month = month; ctx.rerender(); }
export const isCurrentMonth = (y = ctx.year, m = ctx.month) => y === now.getFullYear() && m === now.getMonth() + 1;

let cache = { key: null, idx: null };
/** Índice de precios de todo el histórico; se recalcula solo cuando cambian los datos. */
export function priceIndex() {
  const key = `${state.loadedAt?.getTime()}|${state.purchases.length}`;
  if (cache.key !== key) cache = { key, idx: buildPriceIndex(state.purchases) };
  return cache.idx;
}

export function storePill(storeId) {
  const s = storeById(storeId); if (!s) return '';
  return `<span class="pill ${storeClass(storeId)}">${esc(s.name)}</span>`;
}

export function monthBar(year = ctx.year, month = ctx.month) {
  const closed = isClosed(year, month);
  return `<div class="monthbar no-print">
    <button class="icon-btn" data-month="prev" aria-label="Mes anterior">${icon('left')}</button>
    <div class="label">${esc(monthLabel(year, month))}<small>${closed ? '🔒 Mes cerrado' : isCurrentMonth(year, month) ? 'Mes actual' : 'Mes abierto'}</small></div>
    <button class="icon-btn" data-month="next" aria-label="Mes siguiente" ${ym(year, month) >= ym(now.getFullYear(), now.getMonth() + 1) ? 'disabled style="opacity:.35"' : ''}>${icon('right')}</button></div>`;
}
export function wireMonthBar(root) {
  root.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.month === 'prev' ? prevMonth(ctx.year, ctx.month) : nextMonth(ctx.year, ctx.month);
    setMonth(n.year, n.month);
  }));
}

export function deltaBadge(cmp) {
  if (cmp.dir === null) return '';
  const arrow = cmp.dir === 'up' ? '▲' : cmp.dir === 'down' ? '▼' : '＝';
  const pct = cmp.pct === null ? '' : ` · ${formatPct(cmp.pct)}`;
  return `<span class="delta ${cmp.dir}" title="${cmp.dir === 'up' ? 'Aumento' : cmp.dir === 'down' ? 'Disminución' : 'Sin cambios'}">${arrow} ${formatSignedARS(cmp.diff)}${pct}</span>`;
}

/** Bloque de precios de un producto: este mes, mes anterior (o último conocido, con su mes) y variación. */
export function priceBlock(product, cmp) {
  const cur = cmp.current, ref = cmp.reference;
  const showUnit = state.settings.prefs?.showUnitPrice !== false;
  const perBase = (rec) => (showUnit && rec && Number(rec.base_qty) !== 1 ?`<small class="tiny"> · ${formatARS(rec.price / rec.base_qty)} por ${unitShort(rec.base_unit)}</small>` : '');
  const refLabel = !ref ? '' : cmp.refIsPrevMonth ? 'Mes anterior' : `Último precio conocido · ${monthLabelShort(ref.year, ref.month)}`;
  let a, b, c = '';

  if (cur) a = `<span class="k">Este mes</span><span class="v">${formatARS(cur.price)}${perBase(cur)}</span>`;
  else a = `<span class="k">Este mes</span><span class="v muted">Sin compra</span>`;

  if (ref) b = `<span class="k">${esc(refLabel)}</span><span class="v">${formatARS(ref.price)}${perBase(ref)}</span>`;
  else if (!cur && product.reference_price != null) b = `<span class="k">Precio de referencia</span><span class="v">${formatARS(product.reference_price)}</span>`;
  else b = `<span class="k">Mes anterior</span><span class="v muted">Sin registro anterior</span>`;

  if (cmp.status === 'comparado') {
    c = `${deltaBadge(cmp)}${cmp.normalized ? '<div class="tiny">Cambió la presentación: se compara por precio unitario.</div>' : ''}${!cmp.refIsPrevMonth ? `<div class="tiny">Comparado con ${esc(monthLabelShort(ref.year, ref.month))}</div>` : ''}`;
  } else if (cmp.status === 'no_comparable') c = '<span class="pill warn">No comparable: cambió la unidad de medida</span>';
  else if (cmp.status === 'sin_anterior') c = '<span class="pill">Sin registro anterior</span>';
  else if (cmp.status === 'sin_compra_mes' && ref) c = '<span class="pill warn">No se compró este mes</span>';

  return `<div class="prices"><div>${a}</div><div>${b}</div></div>${c ? `<div style="margin-top:8px">${c}</div>` : ''}`;
}
