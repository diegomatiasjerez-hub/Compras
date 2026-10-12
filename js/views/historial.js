// Historial: consultar cualquier mes, buscar productos, comparar dos meses y exportar.
import { state, storeById, isClosed, isAdmin } from '../data.js';
import { monthSummary, compareMonths, monthOf, ym, fromYm, variation, subtotal } from '../calc.js';
import { monthLabel, monthName, capitalize, formatARS, formatSignedARS, formatPct, formatQty, formatDate, esc } from '../format.js';
import { pageTitle, emptyState, download, toCSV, csvNum, toast } from '../ui.js';
import { ctx, setMonth, priceIndex, storePill } from './shared.js';
import { openPurchaseEditor } from './purchaseEdit.js';

const view = { q: '', a: null, b: null };

function monthsWithData() {
  const set = new Set(state.purchases.map((p) => { const m = monthOf(p.purchased_on); return ym(m.year, m.month); }));
  set.add(ym(ctx.year, ctx.month));
  return [...set].sort((x, y) => y - x).map(fromYm);
}
const optMonths = (list, sel) => list.map((m) => `<option value="${m.year}-${m.month}" ${sel && sel.year === m.year && sel.month === m.month ? 'selected' : ''}>${esc(monthLabel(m.year, m.month))}</option>`).join('');
const parseYM = (v) => { const [year, month] = v.split('-').map(Number); return { year, month }; };

export function monthCSV(year, month) {
  const rows = state.purchases.filter((p) => { const m = monthOf(p.purchased_on); return m.year === year && m.month === month; })
    .map((p) => [p.purchased_on, storeById(p.store_id)?.name ?? '', p.product_name, p.presentation, csvNum(p.quantity), csvNum(p.unit_price), csvNum(subtotal(p.quantity, p.unit_price)), p.notes ?? '']);
  return toCSV(['Fecha', 'Comercio', 'Producto', 'Presentación', 'Cantidad', 'Precio por presentación', 'Subtotal', 'Notas'], rows);
}

export function render(root) {
  const list = monthsWithData();
  if (!view.a) { view.a = list[1] ?? list[0]; view.b = list[0]; }
  const { year, month } = ctx, s = monthSummary(state.purchases, year, month), closed = isClosed(year, month);
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rows = s.rows.filter((r) => !view.q || norm(r.product_name).includes(norm(view.q))).sort((a, b) => b.purchased_on.localeCompare(a.purchased_on) || a.product_name.localeCompare(b.product_name, 'es'));
  const years = [...new Set([...list.map((m) => m.year), new Date().getFullYear()])].sort((a, b) => b - a);

  const idx = priceIndex();
  const prods = state.products.filter((p) => idx.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const cmpRows = prods.map((p) => ({ p, c: compareMonths(idx, p.id, view.a, view.b) })).filter((r) => r.c.a || r.c.b);
  const sa = monthSummary(state.purchases, view.a.year, view.a.month), sb2 = monthSummary(state.purchases, view.b.year, view.b.month);
  const tv = variation(sa.total, sb2.total);

  root.innerHTML = `${pageTitle('Historial')}
    <div class="card"><div class="row">
      <label class="field grow" style="margin:0"><span>Mes</span><select id="m">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === month ? 'selected' : ''}>${capitalize(monthName(i + 1))}</option>`).join('')}</select></label>
      <label class="field" style="margin:0;width:110px"><span>Año</span><select id="y">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div></div>

    <div class="section-title"><h2>${esc(monthLabel(year, month))} ${closed ? '🔒' : ''}</h2><button class="btn secondary sm" data-csv>Exportar CSV</button></div>
    <div class="card"><div class="leader"><span>Total del mes</span><span class="num">${formatARS(s.total)}</span></div>
      ${state.stores.map((st) => { const t = s.byStore.find((b) => b.store_id === st.id)?.total ?? 0; return t || st.active ? `<div class="leader"><span>${esc(st.name)}</span><span>${formatARS(t)}</span></div>` : ''; }).join('')}</div>

    <div class="stack" style="margin-top:12px"><input type="search" id="q" placeholder="Buscar producto en este mes…" value="${esc(view.q)}" aria-label="Buscar producto"></div>
    <div class="card flush tablewrap" style="margin-top:10px">${rows.length ? `<table class="stackable"><thead><tr><th>Fecha</th><th>Producto</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r">Subtotal</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-id="${r.id}" style="cursor:pointer"><td data-l="Fecha">${formatDate(r.purchased_on)}</td><td><b>${esc(r.product_name)}</b><div class="tiny">${esc(r.presentation)} · ${storePill(r.store_id)}</div></td>
        <td class="r" data-l="Cantidad">${formatQty(r.quantity)}</td><td class="r" data-l="Precio">${formatARS(r.unit_price)}</td><td class="r" data-l="Subtotal"><b>${formatARS(r.subtotal)}</b></td></tr>`).join('')}</tbody></table>`
      : emptyState(view.q ? 'Sin resultados' : 'No hay compras en este mes', view.q ? 'Probá con otro nombre.' : 'Elegí otro mes o registrá una compra.')}</div>

    <div class="section-title"><h2>Comparar dos meses</h2></div>
    <div class="card">
      <div class="row"><label class="field grow" style="margin:0"><span>Mes base</span><select id="ca">${optMonths(list, view.a)}</select></label>
      <label class="field grow" style="margin:0"><span>Comparar con</span><select id="cb">${optMonths(list, view.b)}</select></label></div>
      <div class="leader" style="margin-top:10px"><span>Gasto total: ${formatARS(sa.total)} → ${formatARS(sb2.total)}</span><span class="${tv.dir === 'up' ? 'up' : tv.dir === 'down' ? 'down' : ''}">${sa.lines && sb2.lines ? `${formatSignedARS(tv.diff)} · ${formatPct(tv.pct)}` : '—'}</span></div>
      <div class="tablewrap"><table class="stackable"><thead><tr><th>Producto</th><th class="r">${esc(monthLabel(view.a.year, view.a.month))}</th><th class="r">${esc(monthLabel(view.b.year, view.b.month))}</th><th class="r">Variación</th></tr></thead><tbody>
      ${cmpRows.map(({ p, c }) => `<tr><td><b>${esc(p.name)}</b></td><td class="r" data-l="Mes base">${c.a ? formatARS(c.a.price) : '<span class="muted">Sin registro</span>'}</td><td class="r" data-l="Comparado">${c.b ? formatARS(c.b.price) : '<span class="muted">Sin registro</span>'}</td>
        <td class="r" data-l="Variación">${c.status === 'ok' ? `<span class="${c.dir === 'up' ? 'up' : c.dir === 'down' ? 'down' : ''}">${formatSignedARS(c.diff)} · ${formatPct(c.pct)}${c.normalized ? '*' : ''}</span>` : c.status === 'no_comparable' ? '<span class="muted">No comparable</span>' : '<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin datos para comparar.</td></tr>'}
      </tbody></table></div>
      <p class="tiny">* Cambió la presentación: la variación se calcula por precio unitario (kg, litro o unidad).</p></div>`;

  const go = () => setMonth(Number(root.querySelector('#y').value), Number(root.querySelector('#m').value));
  root.querySelector('#m').addEventListener('change', go); root.querySelector('#y').addEventListener('change', go);
  const q = root.querySelector('#q');
  q.addEventListener('input', () => { view.q = q.value; const pos = q.selectionStart; render(root); const n = root.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelector('#ca').addEventListener('change', (e) => { view.a = parseYM(e.target.value); render(root); });
  root.querySelector('#cb').addEventListener('change', (e) => { view.b = parseYM(e.target.value); render(root); });
  root.querySelector('[data-csv]').addEventListener('click', () => { download(`compras-${year}-${String(month).padStart(2, '0')}.csv`, monthCSV(year, month), 'text/csv;charset=utf-8'); toast('CSV descargado'); });
  root.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openPurchaseEditor(state.purchases.find((p) => p.id === tr.dataset.id), () => ctx.rerender())));
}
