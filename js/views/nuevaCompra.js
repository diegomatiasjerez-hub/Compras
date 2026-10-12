// Nueva compra: formulario completo para registrar varias compras seguidas.
import { state, storeById } from '../data.js';
import { formatARS, formatQty, formatDate, esc } from '../format.js';
import { pageTitle, emptyState } from '../ui.js';
import { purchaseFormHtml, mountPurchaseForm } from './purchaseForm.js';
import { ctx } from './shared.js';
import { openPurchaseEditor } from './purchaseEdit.js';

export function render(root) {
  const recent = () => [...state.purchases].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
  root.innerHTML = `${pageTitle('Nueva compra')}
    <div class="card">${purchaseFormHtml()}</div>
    <div class="section-title"><h2>Últimas cargadas</h2></div><div data-recent></div>`;

  const paint = () => {
    const box = root.querySelector('[data-recent]'); const rows = recent();
    box.innerHTML = rows.length ? rows.map((r) => `<button class="card row between" style="width:100%;text-align:left;margin-bottom:8px;cursor:pointer" data-id="${r.id}">
      <span><b>${esc(r.product_name)}</b><br><span class="small muted">${formatQty(r.quantity)} × ${formatARS(r.unit_price)} · ${formatDate(r.purchased_on)} · ${esc(storeById(r.store_id)?.name || '')}</span></span>
      <span class="num">${formatARS(r.subtotal)}</span></button>`).join('') : `<div class="card">${emptyState('Todavía no cargaste compras', 'Elegí un producto, indicá la cantidad y confirmá el precio.')}</div>`;
  };
  paint();
  root.querySelector('[data-recent]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    openPurchaseEditor(state.purchases.find((p) => p.id === b.dataset.id), paint);
  });
  mountPurchaseForm(root, { keepOpen: true, onSaved: paint });
}
