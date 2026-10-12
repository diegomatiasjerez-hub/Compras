// Inicio: resumen del mes y gastos.
import { state, storeClass, isClosed, storeById } from '../data.js';
import { monthSummary, compareTotals, prevMonth, biggestMovers } from '../calc.js';
import { monthLabel, formatARS, formatSignedARS, formatPct, formatQty, unitShort, esc } from '../format.js';
import { pageTitle, emptyState } from '../ui.js';
import { ctx, monthBar, wireMonthBar, priceIndex, deltaBadge, storePill } from './shared.js';
import { openSheet } from '../ui.js';
import { purchaseFormHtml, mountPurchaseForm } from './purchaseForm.js';

export function render(root) {
  const { year, month } = ctx, closed = isClosed(year, month);
  const s = monthSummary(state.purchases, year, month);
  const pm = prevMonth(year, month), ps = monthSummary(state.purchases, pm.year, pm.month);
  const cmp = compareTotals(s.total, ps.total, ps.lines > 0);
  const stores = state.stores.filter((st) => st.active || s.byStore.some((b) => b.store_id === st.id));
  const movers = biggestMovers(state.products, priceIndex(), year, month, 3);

  const storeRows = stores.map((st) => `<div class="leader"><span>${esc(st.name)}</span><span>${formatARS(s.byStore.find((b) => b.store_id === st.id)?.total ?? 0)}</span></div>`).join('');
  const prevLine = ps.lines === 0
    ? '<span class="muted small">Sin registro del mes anterior</span>'
    : `${deltaBadge(cmp)} <span class="small muted">frente a ${esc(monthLabel(pm.year, pm.month))} (${formatARS(ps.total)})</span>`;

  const byProduct = [...s.byProduct].sort((a, b) => b.cents - a.cents);
  const moverList = (rows, kind) => rows.length ? rows.map((r) => `<div class="leader"><span>${esc(r.product.name)}</span><span class="${kind}">${formatSignedARS(r.cmp.diff)} · ${formatPct(r.cmp.pct)}</span></div>`).join('') : '<p class="muted small">Sin variaciones para mostrar.</p>';

  root.innerHTML = `${monthBar()}
    <section class="ticket" aria-label="Resumen del mes">
      <div class="when"><span>Total gastado</span>${closed ? '<span class="pill closed">🔒 Cerrado</span>' : ''}</div>
      <div class="total"><span>${formatARS(s.total)}</span></div>
      <div class="small muted">${s.lines} ${s.lines === 1 ? 'compra registrada' : 'compras registradas'}</div>
      <div class="rule"></div>${storeRows}<div class="rule"></div>
      <div class="leader"><span><b>Total del mes</b></span><span>${formatARS(s.total)}</span></div>
      <div style="margin-top:6px">${prevLine}</div>
    </section>
    <div class="stats">
      <div class="stat"><div class="k">Compras registradas</div><div class="v">${s.lines}</div></div>
      <div class="stat"><div class="k">Productos comprados</div><div class="v">${s.distinctProducts}</div></div>
    </div>
    ${closed ? '' : '<button class="btn accent block" style="margin-top:14px" data-add>＋ Registrar una compra</button>'}
    ${s.lines === 0 ? `<div class="card" style="margin-top:14px">${emptyState('Todavía no hay compras en este mes', 'Los productos y sus últimos precios ya están en Compras. Tocá «Agregar» en cada uno cuando compres.')}</div>` : `
    <div class="section-title"><h2>Gasto por producto</h2></div>
    <div class="card flush tablewrap"><table class="stackable"><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Subtotal</th></tr></thead><tbody>
      ${byProduct.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="tiny">${esc(p.presentation)} · ${storePill(p.store_id)}</div></td>
        <td class="r" data-l="Cantidad">${formatQty(p.quantity)}</td><td class="r" data-l="Subtotal"><b>${formatARS(p.total)}</b></td></tr>`).join('')}
    </tbody></table></div>
    <div class="section-title"><h2>Cambios de precio</h2></div>
    <div class="card"><h3 class="up">Más aumentaron</h3>${moverList(movers.up, 'up')}</div>
    <div class="card"><h3 class="down">Más bajaron</h3>${moverList(movers.down, 'down')}</div>`}`;

  wireMonthBar(root);
  root.querySelector('[data-add]')?.addEventListener('click', () => {
    openSheet({ title: 'Nueva compra', html: purchaseFormHtml(), onMount(body, close) { mountPurchaseForm(body, { onSaved: () => { close(); ctx.rerender(); } }); } });
  });
}
