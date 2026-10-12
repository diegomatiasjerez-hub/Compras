// Informes: resumen mensual imprimible, exportaciones y cierre/reapertura de mes.
import { state, storeById, periodFor, isClosed, isAdmin, loadAll, closePeriod, reopenPeriod, createBackup, periodEvents } from '../data.js';
import { monthSummary, compareTotals, prevMonth, compareProduct, biggestMovers, monthOf, subtotal } from '../calc.js';
import { monthLabel, formatARS, formatSignedARS, formatPct, formatQty, formatDateTime, formatDate, esc, todayISO } from '../format.js';
import { pageTitle, emptyState, download, toCSV, csvNum, toast, openSheet, confirmDialog, saving } from '../ui.js';
import { ctx, monthBar, wireMonthBar, priceIndex, deltaBadge, storePill } from './shared.js';
import { monthCSV } from './historial.js';

function allPurchasesCSV() {
  const rows = [...state.purchases].sort((a, b) => a.purchased_on.localeCompare(b.purchased_on))
    .map((p) => [p.purchased_on, storeById(p.store_id)?.name ?? '', p.product_name, p.presentation, p.base_unit, csvNum(p.base_qty), csvNum(p.quantity), csvNum(p.unit_price), csvNum(subtotal(p.quantity, p.unit_price)), p.notes ?? '']);
  return toCSV(['Fecha', 'Comercio', 'Producto', 'Presentación', 'Unidad base', 'Cantidad base por presentación', 'Cantidad comprada', 'Precio por presentación', 'Subtotal', 'Notas'], rows);
}
function monthlySummaryCSV() {
  const keys = [...new Set(state.purchases.map((p) => p.purchased_on.slice(0, 7)))].sort();
  const stores = state.stores;
  const rows = keys.map((k) => { const [y, m] = k.split('-').map(Number); const s = monthSummary(state.purchases, y, m);
    return [y, m, csvNum(s.total), ...stores.map((st) => csvNum(s.byStore.find((b) => b.store_id === st.id)?.total ?? 0)), s.lines]; });
  return toCSV(['Año', 'Mes', 'Total', ...stores.map((s) => s.name), 'Compras'], rows);
}

export function render(root) {
  const { year, month } = ctx, closed = isClosed(year, month), period = periodFor(year, month);
  const s = monthSummary(state.purchases, year, month), pm = prevMonth(year, month), ps = monthSummary(state.purchases, pm.year, pm.month);
  const cmpT = compareTotals(s.total, ps.total, ps.lines > 0), idx = priceIndex();
  const movers = biggestMovers(state.products, idx, year, month, 5);
  const byProduct = [...s.byProduct].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const mv = (rows, cls) => rows.length ? rows.map((r) => `<div class="leader"><span>${esc(r.product.name)}</span><span class="${cls}">${formatSignedARS(r.cmp.diff)} · ${formatPct(r.cmp.pct)}</span></div>`).join('') : '<p class="muted small">Sin variaciones.</p>';

  root.innerHTML = `${pageTitle('Informes')}${monthBar()}
    <article class="card" id="report">
      <div class="row between"><h2>Informe de ${esc(monthLabel(year, month))}</h2>${closed ? '<span class="pill closed">🔒 Cerrado</span>' : '<span class="pill">Abierto</span>'}</div>
      ${period?.closed_at ? `<p class="tiny">Cerrado el ${formatDateTime(period.closed_at)}</p>` : ''}
      <div class="leader"><span>Total gastado</span><span class="num" style="font-size:1.4rem">${formatARS(s.total)}</span></div>
      ${state.stores.map((st) => { const t = s.byStore.find((b) => b.store_id === st.id)?.total ?? 0; return t || st.active ? `<div class="leader"><span>${esc(st.name)}</span><span>${formatARS(t)}</span></div>` : ''; }).join('')}
      <div class="leader"><span>Compras registradas</span><span>${s.lines}</span></div>
      <div class="leader"><span>Productos comprados</span><span>${s.distinctProducts}</span></div>
      <div style="margin-top:8px">${ps.lines ? `${deltaBadge(cmpT)} <span class="small muted">frente a ${esc(monthLabel(pm.year, pm.month))} (${formatARS(ps.total)})</span>` : '<span class="muted small">Sin registro del mes anterior</span>'}</div>
      ${s.lines ? `<div class="tablewrap" style="margin-top:12px"><table class="stackable"><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Variación de precio</th><th class="r">Subtotal</th></tr></thead><tbody>
        ${byProduct.map((p) => { const c = compareProduct(idx, p.product_id, year, month);
          return `<tr><td><b>${esc(p.name)}</b><div class="tiny">${esc(p.presentation)} · ${storePill(p.store_id)}</div></td><td class="r" data-l="Cantidad">${formatQty(p.quantity)}</td>
          <td class="r" data-l="Variación">${c.status === 'comparado' ? `<span class="${c.dir === 'up' ? 'up' : c.dir === 'down' ? 'down' : ''}">${formatSignedARS(c.diff)} · ${formatPct(c.pct)}</span>` : c.status === 'sin_anterior' ? '<span class="muted">Sin registro anterior</span>' : '<span class="muted">—</span>'}</td>
          <td class="r" data-l="Subtotal"><b>${formatARS(p.total)}</b></td></tr>`; }).join('')}</tbody></table></div>
        <h3 class="up" style="margin-top:14px">Más aumentaron</h3>${mv(movers.up, 'up')}<h3 class="down" style="margin-top:10px">Más bajaron</h3>${mv(movers.down, 'down')}`
        : emptyState('Sin compras en este mes', 'Cuando registres compras, el informe se arma solo.')}
      <p class="tiny" style="margin-top:12px">Generado el ${formatDateTime(new Date())}</p>
    </article>

    <div class="section-title no-print"><h2>Exportar</h2></div>
    <div class="stack no-print">
      <button class="btn block" data-print>Imprimir o guardar como PDF</button>
      <button class="btn secondary block" data-csv-month>Compras del mes (CSV)</button>
      <button class="btn secondary block" data-csv-all>Todas las compras (CSV)</button>
      <button class="btn secondary block" data-csv-summary>Resumen de todos los meses (CSV)</button>
    </div>

    <div class="section-title no-print"><h2>Cierre del mes</h2></div>
    <div class="card no-print">
      ${closed ? `<p>Este mes está <b>cerrado</b>: sus compras están protegidas contra cambios accidentales.</p>${isAdmin() ? '<button class="btn secondary block" data-reopen>Reabrir mes…</button>' : ''}`
        : `<p>Al cerrar el mes, sus compras quedan protegidas y se guarda el informe. El mes siguiente empieza sin cantidades ni gastos, pero con los precios anteriores a la vista.</p>
           ${isAdmin() ? `<button class="btn block" data-close ${s.lines ? '' : 'disabled'}>Cerrar ${esc(monthLabel(year, month))}</button>${s.lines ? '' : '<p class="tiny">No hay compras para cerrar.</p>'}` : '<p class="tiny">Solo un administrador puede cerrar el mes.</p>'}`}
      <div data-events class="small" style="margin-top:12px"></div>
    </div>`;

  wireMonthBar(root);
  const fname = (x) => `${x}-${year}-${String(month).padStart(2, '0')}`;
  root.querySelector('[data-print]').addEventListener('click', () => window.print());
  root.querySelector('[data-csv-month]').addEventListener('click', () => download(`compras-${year}-${String(month).padStart(2, '0')}.csv`, monthCSV(year, month), 'text/csv;charset=utf-8'));
  root.querySelector('[data-csv-all]').addEventListener('click', () => download(`compras-todas-${todayISO()}.csv`, allPurchasesCSV(), 'text/csv;charset=utf-8'));
  root.querySelector('[data-csv-summary]').addEventListener('click', () => download(`resumen-mensual-${todayISO()}.csv`, monthlySummaryCSV(), 'text/csv;charset=utf-8'));

  root.querySelector('[data-close]')?.addEventListener('click', async () => {
    const yes = await confirmDialog({ title: `Cerrar ${monthLabel(year, month)}`, confirmText: 'Cerrar mes',
      message: `Se guardará una copia de seguridad y el mes quedará protegido. Total: <b>${formatARS(s.total)}</b> en ${s.lines} compras. Podés reabrirlo después indicando un motivo.` });
    if (!yes) return;
    const ok = await saving('No se pudo cerrar el mes', async () => { await createBackup(`Antes de cerrar ${month}/${year}`, 'pre_op'); await closePeriod(year, month); await loadAll(); }, { successMessage: 'Mes cerrado ✓' });
    if (ok) ctx.rerender();
  });
  root.querySelector('[data-reopen]')?.addEventListener('click', () => {
    openSheet({ title: 'Reabrir mes', html: `<p>Reabrir permite modificar compras de <b>${esc(monthLabel(year, month))}</b>. Queda registrado con tu motivo y se guarda una copia de seguridad antes.</p>
      <form novalidate><label class="field"><span>Motivo de la reapertura</span><input type="text" name="reason" maxlength="200" placeholder="Ej: corregir un precio mal cargado"><small class="err" data-err></small></label>
      <button class="btn danger block" type="submit">Reabrir mes</button></form>`,
      onMount(body, close) {
        const f = body.querySelector('form');
        f.addEventListener('submit', async (e) => {
          e.preventDefault(); const reason = f.elements.reason.value.trim();
          if (reason.length < 5) { f.querySelector('[data-err]').textContent = 'Escribí un motivo de al menos 5 caracteres.'; return; }
          const ok = await saving('No se pudo reabrir el mes', async () => { await reopenPeriod(year, month, reason); await loadAll(); }, { successMessage: 'Mes reabierto' });
          if (ok) { close(); ctx.rerender(); }
        });
      } });
  });

  // Constancia de cierres y reaperturas
  if (period) periodEvents().then((all) => {
    const mine = all.filter((e) => e.period_id === period.id); const box = root.querySelector('[data-events]'); if (!box) return;
    box.innerHTML = mine.length ? `<b>Constancia</b>${mine.map((e) => `<div style="padding:5px 0;border-bottom:1px solid var(--line)">${e.action === 'closed' ? '🔒 Cerrado' : '🔓 Reabierto'} · ${formatDateTime(e.at)}${e.reason ? `<br><span class="muted">Motivo: ${esc(e.reason)}</span>` : ''}</div>`).join('')}` : '';
  }).catch(() => {});
}
