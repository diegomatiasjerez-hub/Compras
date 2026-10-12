// Ver, modificar y eliminar compras de un producto en un mes (con historial de cambios).
import { state, updatePurchase, deletePurchase, purchaseHistory, loadAll, isClosed, isAdmin, storeById } from '../data.js';
import { subtotal, validatePurchase, monthOf } from '../calc.js';
import { parseNumberAR, formatARS, formatQty, formatDate, formatDateTime, esc, monthLabel } from '../format.js';
import { openSheet, confirmDialog, saving } from '../ui.js';
import { ctx } from './shared.js';

const num = (n) => String(n).replace('.', ',');

function diffText(oldRow, newRow) {
  const out = [];
  const f = (k, label, fmt) => { if (String(oldRow[k]) !== String(newRow[k])) out.push(`${label}: ${fmt(oldRow[k])} → ${fmt(newRow[k])}`); };
  f('quantity', 'Cantidad', formatQty); f('unit_price', 'Precio', formatARS); f('purchased_on', 'Fecha', formatDate);
  if ((oldRow.notes || '') !== (newRow.notes || '')) out.push(`Notas: «${oldRow.notes || ''}» → «${newRow.notes || ''}»`);
  return out.join(' · ') || 'Sin cambios relevantes';
}

export function openPurchaseEditor(purchase, onDone) {
  const { year, month } = monthOf(purchase.purchased_on);
  const closed = isClosed(year, month) || !isAdmin();
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  openSheet({
    title: 'Modificar compra',
    html: `<p class="muted"><b>${esc(purchase.product_name)}</b> · ${esc(purchase.presentation)}<br><span class="small">${esc(storeById(purchase.store_id)?.name || '')}</span></p>
      ${closed ? `<div class="banner">${isAdmin() ? 'Este mes está cerrado: no se puede modificar. Reabrilo desde Informes.' : 'Solo lectura.'}</div>` : ''}
      <form novalidate>
        <label class="field"><span>Fecha</span><input type="date" name="date" value="${purchase.purchased_on}" min="${first}" max="${last}" ${closed ? 'disabled' : ''}><small class="err" data-err="date"></small></label>
        <label class="field"><span>Cantidad</span><input type="text" name="qty" inputmode="decimal" value="${num(purchase.quantity)}" ${closed ? 'disabled' : ''}><small class="err" data-err="quantity"></small></label>
        <label class="field"><span>Precio por presentación</span><div class="input-money"><input type="text" name="price" inputmode="decimal" value="${num(purchase.unit_price)}" ${closed ? 'disabled' : ''}></div><small class="err" data-err="price"></small></label>
        <label class="field"><span>Notas</span><input type="text" name="notes" maxlength="200" value="${esc(purchase.notes || '')}" ${closed ? 'disabled' : ''}></label>
        <div class="card" style="margin-bottom:12px"><div class="row between"><span class="muted">Subtotal</span><span class="num" style="font-size:1.4rem" data-total>${formatARS(purchase.subtotal)}</span></div></div>
        ${closed ? '' : `<div class="row"><button type="button" class="btn danger secondary grow" data-del>Eliminar</button><button class="btn accent grow" type="submit">Guardar cambios</button></div>`}
      </form>
      <div class="section-title"><h3>Historial de cambios</h3></div><div data-hist class="small muted">Cargando…</div>`,
    async onMount(body, close) {
      const f = body.querySelector('form'); const q = (n) => f.elements[n];
      const read = () => ({ quantity: parseNumberAR(q('qty').value), price: parseNumberAR(q('price').value), date: q('date').value, notes: q('notes').value.trim() });
      const upd = () => { const v = read(); body.querySelector('[data-total]').textContent = formatARS(Number.isFinite(v.quantity) && Number.isFinite(v.price) ? subtotal(v.quantity, v.price) : 0); };
      ['qty', 'price'].forEach((n) => q(n).addEventListener('input', upd));

      f.addEventListener('submit', async (e) => {
        e.preventDefault(); if (closed) return;
        const v = read(); const errs = validatePurchase(v);
        f.querySelectorAll('[data-err]').forEach((s) => { s.textContent = errs[s.dataset.err] || ''; });
        if (Object.keys(errs).length) return;
        const ok = await saving('No se pudo modificar la compra', async () => { await updatePurchase(purchase.id, v); await loadAll(); }, { successMessage: 'Compra modificada ✓' });
        if (ok) { close(); onDone?.(); }
      });
      f.querySelector('[data-del]')?.addEventListener('click', async () => {
        const yes = await confirmDialog({ title: 'Eliminar compra', danger: true, confirmText: 'Eliminar compra',
          message: `Se eliminará <b>${esc(purchase.product_name)}</b> (${formatQty(purchase.quantity)} × ${formatARS(purchase.unit_price)} = ${formatARS(purchase.subtotal)}). Queda registrado en el historial de cambios.` });
        if (!yes) return;
        const ok = await saving('No se pudo eliminar la compra', async () => { await deletePurchase(purchase.id); await loadAll(); }, { successMessage: 'Compra eliminada' });
        if (ok) { close(); onDone?.(); }
      });

      try {
        const hist = await purchaseHistory(purchase.id);
        body.querySelector('[data-hist]').innerHTML = hist.length
          ? hist.map((h) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${h.action === 'insert' ? 'Alta' : h.action === 'update' ? 'Modificación' : 'Eliminación'}</b> · ${formatDateTime(h.at)}<br>${h.action === 'update' ? esc(diffText(h.old_row, h.new_row)) : h.action === 'insert' ? `${formatQty(h.new_row.quantity)} × ${formatARS(h.new_row.unit_price)}` : ''}</div>`).join('')
          : 'Sin cambios registrados.';
      } catch { body.querySelector('[data-hist]').textContent = 'No se pudo cargar el historial.'; }
    },
  });
}

/** Lista de compras de un producto en el mes, con acceso a modificar cada una. */
export function openPurchaseManager(productId, year, month, onDone) {
  const rows = () => state.purchases.filter((p) => p.product_id === productId && monthOf(p.purchased_on).year === year && monthOf(p.purchased_on).month === month);
  const first = rows()[0]; if (!first) return;
  openSheet({
    title: `${first.product_name}`,
    html: `<p class="muted small">${esc(first.presentation)} · ${esc(monthLabel(year, month))}</p><div data-list></div>`,
    onMount(body, close) {
      const list = body.querySelector('[data-list]');
      list.innerHTML = rows().map((r) => `<div class="card row between" style="margin-bottom:8px">
        <div><b>${formatQty(r.quantity)} × ${formatARS(r.unit_price)}</b><div class="small muted">${formatDate(r.purchased_on)}${r.notes ? ' · ' + esc(r.notes) : ''}</div></div>
        <div class="row"><span class="num">${formatARS(r.subtotal)}</span><button class="btn secondary sm" data-edit="${r.id}">Modificar</button></div></div>`).join('');
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-edit]'); if (!b) return;
        const p = state.purchases.find((x) => x.id === b.dataset.edit); close(); openPurchaseEditor(p, onDone);
      });
    },
  });
}
