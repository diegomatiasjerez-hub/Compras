// Compras: lista fija de productos con precios, comparativa mensual y botón «Agregar».
import { state, isClosed, isAdmin, storeClass } from '../data.js';
import { monthSummary, compareProduct } from '../calc.js';
import { formatARS, formatQty, esc } from '../format.js';
import { pageTitle, emptyState, openSheet } from '../ui.js';
import { ctx, monthBar, wireMonthBar, priceIndex, priceBlock, storePill } from './shared.js';
import { purchaseFormHtml, mountPurchaseForm } from './purchaseForm.js';
import { openPurchaseManager } from './purchaseEdit.js';

const filters = { store: 'all', q: '', onlyPending: false };

export function render(root) {
  const { year, month } = ctx, closed = isClosed(year, month), idx = priceIndex();
  const sum = monthSummary(state.purchases, year, month);
  const bought = new Map(sum.byProduct.map((p) => [p.product_id, p]));
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const list = state.products
    .filter((p) => p.active || bought.has(p.id))
    .filter((p) => filters.store === 'all' || p.store_id === filters.store)
    .filter((p) => !filters.q || norm(`${p.name} ${p.presentation}`).includes(norm(filters.q)))
    .filter((p) => !filters.onlyPending || !bought.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const cards = list.map((p) => {
    const cmp = compareProduct(idx, p.id, year, month), b = bought.get(p.id);
    return `<article class="prod s-${storeClass(p.store_id)} ${p.active ? '' : 'inactive'}">
      <div class="head"><div><div class="name">${esc(p.name)}</div><div class="pres">${esc(p.presentation)}</div></div>${storePill(p.store_id)}</div>
      ${priceBlock(p, cmp)}
      ${b ? `<button class="bought" data-manage="${p.id}"><span><b>Comprado: ${formatQty(b.quantity)}</b> <span class="small muted">${b.lines > 1 ? `(${b.lines} compras)` : ''}</span></span><span class="num">${formatARS(b.total)}</span></button>` : ''}
      ${closed || !p.active ? '' : `<div class="actions"><button class="btn ${b ? 'secondary' : 'accent'} block" data-add="${p.id}">＋ Agregar</button></div>`}
    </article>`;
  }).join('');

  root.innerHTML = `${monthBar()}
    ${closed ? '<div class="banner">🔒 Este mes está cerrado y protegido. Para corregir algo, reabrilo desde Informes.</div>' : ''}
    <div class="stack">
      <input type="search" id="q" placeholder="Buscar producto…" value="${esc(filters.q)}" aria-label="Buscar producto">
      <div class="seg" role="group" aria-label="Comercio">
        <button data-store="all" aria-pressed="${filters.store === 'all'}">Todos</button>
        ${state.stores.filter((s) => s.active).map((s) => `<button data-store="${s.id}" aria-pressed="${filters.store === s.id}">${esc(s.name)}</button>`).join('')}
        <button data-pending aria-pressed="${filters.onlyPending}">Falta comprar</button>
      </div>
    </div>
    <div style="margin-top:12px">${cards || `<div class="card">${emptyState('No hay productos para mostrar', 'Probá con otro filtro o agregá productos desde Más → Productos.')}</div>`}</div>
    <p class="tiny" style="margin-top:12px">Total del mes: <b>${formatARS(sum.total)}</b> · Los precios del mes anterior son los de la última compra registrada; si no se compró, se indica el mes del último precio conocido.</p>`;

  wireMonthBar(root);
  const q = root.querySelector('#q');
  q.addEventListener('input', () => { filters.q = q.value; const pos = q.selectionStart; render(root); const n = root.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-store]').forEach((b) => b.addEventListener('click', () => { filters.store = b.dataset.store; render(root); }));
  root.querySelector('[data-pending]').addEventListener('click', () => { filters.onlyPending = !filters.onlyPending; render(root); });
  root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    openSheet({ title: 'Agregar compra', html: purchaseFormHtml({ productId: b.dataset.add, lockProduct: true }),
      onMount(body, close) { mountPurchaseForm(body, { onSaved: () => { close(); ctx.rerender(); } }); } });
  }));
  root.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => openPurchaseManager(b.dataset.manage, year, month, () => ctx.rerender())));
}
