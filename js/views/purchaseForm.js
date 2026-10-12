// Formulario de compra (se usa en la pantalla "Nueva compra" y en la hoja del botón "Agregar").
import { state, productById, addPurchase, loadAll, isClosed, storeById } from '../data.js';
import { compareProduct, subtotal, validatePurchase, pricePerBase, monthOf } from '../calc.js';
import { parseNumberAR, formatARS, formatQty, todayISO, esc, monthLabel, monthLabelShort, unitLabel, unitShort } from '../format.js';
import { saving } from '../ui.js';
import { ctx, priceIndex, deltaBadge } from './shared.js';

/** Fecha por defecto: hoy si estamos viendo el mes actual; si no, el primer día del mes seleccionado. */
function defaultDate() {
  const t = todayISO(); const m = monthOf(t);
  if (m.year === ctx.year && m.month === ctx.month) return t;
  return `${ctx.year}-${String(ctx.month).padStart(2, '0')}-01`;
}

export function purchaseFormHtml({ productId = null, lockProduct = false } = {}) {
  const products = state.products.filter((p) => p.active || p.id === productId).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const opts = products.map((p) => `<option value="${p.id}" ${p.id === productId ? 'selected' : ''}>${esc(p.name)} — ${esc(p.presentation)}</option>`).join('');
  return `<form class="pf" novalidate>
    <label class="field"><span>Producto</span>
      <select name="product" ${lockProduct ? 'disabled' : ''}>${productId ? '' : '<option value="">Elegí un producto…</option>'}${opts}</select></label>
    <div class="pf-info"></div>
    <label class="field"><span>Fecha de compra</span><input type="date" name="date" value="${defaultDate()}" max="${todayISO()}"><small class="err" data-err="date"></small></label>
    <label class="field"><span>Cantidad comprada <b class="pf-unit muted"></b></span>
      <input type="text" name="qty" inputmode="decimal" autocomplete="off" placeholder="Ej: 4"><small class="err" data-err="quantity"></small></label>
    <label class="field"><span>Precio pagado <b class="pf-punit muted"></b></span>
      <div class="input-money"><input type="text" name="price" inputmode="decimal" autocomplete="off" placeholder="0"></div>
      <small class="pf-hint"></small><small class="err" data-err="price"></small></label>
    <label class="field"><span>Notas (opcional)</span><input type="text" name="notes" maxlength="200" placeholder="Ej: oferta, marca distinta"></label>
    <div class="card pf-total" style="margin-bottom:14px"><div class="row between"><span class="muted">Subtotal</span><span class="num" style="font-size:1.6rem" data-total>$0</span></div><div class="tiny" data-detail></div></div>
    <div class="banner hidden" data-closed>Ese mes está cerrado. Reabrilo desde Informes para cargar compras.</div>
    <button class="btn accent block" type="submit" data-save>Guardar compra</button>
  </form>`;
}

/** Conecta el formulario. onSaved se llama después de guardar y recargar los datos. */
export function mountPurchaseForm(root, { onSaved, keepOpen = false } = {}) {
  const f = root.querySelector('form.pf');
  const q = (n) => f.elements[n];
  const opIds = new Map();                       // mismos valores → misma operación (evita duplicados al reintentar)
  const el = (s) => f.querySelector(s);

  const read = () => ({
    productId: q('product').value, date: q('date').value,
    quantity: parseNumberAR(q('qty').value), price: parseNumberAR(q('price').value), notes: q('notes').value.trim(),
  });

  function productContext() {
    const p = productById(q('product').value); if (!p) return null;
    const { year, month } = q('date').value ? monthOf(q('date').value) : ctx;
    return { p, year, month, cmp: compareProduct(priceIndex(), p.id, year, month) };
  }

  function refresh({ prefill = false } = {}) {
    const pc = productContext(); const info = el('.pf-info');
    if (!pc) { info.innerHTML = ''; el('.pf-unit').textContent = ''; return update(); }
    const { p, cmp, year, month } = pc;
    el('.pf-unit').textContent = `· ${p.presentation}`;
    el('.pf-punit').textContent = `· por presentación`;
    const last = cmp.current ?? cmp.reference;
    const lastLabel = cmp.current ? `este mes (${monthLabelShort(year, month)})` : cmp.reference ? `último conocido (${monthLabelShort(cmp.reference.year, cmp.reference.month)})` : null;
    el('.pf-hint').textContent = last ? `Precio ${lastLabel}: ${formatARS(last.price)}. Confirmá o corregí el precio que pagaste.`
      : p.reference_price != null ? `Precio de referencia: ${formatARS(p.reference_price)}.` : 'Todavía no hay precios registrados de este producto.';
    if (prefill) {
      const seed = last?.price ?? p.reference_price;
      q('price').value = seed != null ? String(seed).replace('.', ',') : '';
    }
    info.innerHTML = '';
    f.querySelector('[data-closed]').classList.toggle('hidden', !isClosed(year, month));
    update();
  }

  function update() {
    const v = read(); const pc = productContext();
    const okNums = Number.isFinite(v.quantity) && Number.isFinite(v.price);
    const sub = okNums ? subtotal(v.quantity, v.price) : 0;
    el('[data-total]').textContent = formatARS(sub);
    const parts = [];
    if (pc && Number.isFinite(v.price) && v.price > 0) {
      parts.push(`${formatARS(pricePerBase(v.price, pc.p.base_qty))} por ${unitLabel(pc.p.base_unit)}`);
      const base = pc.cmp.reference;
      if (base && base.base_unit === pc.p.base_unit) {
        const same = base.presentation === pc.p.presentation && Number(base.base_qty) === Number(pc.p.base_qty);
        const a = same ? base.price : pricePerBase(base.price, base.base_qty), b = same ? v.price : pricePerBase(v.price, pc.p.base_qty);
        const diff = b - a, pct = a > 0 ? (diff / a) * 100 : null;
        const dir = diff > 0.004 ? 'up' : diff < -0.004 ? 'down' : 'same';
        parts.push(`vs ${monthLabelShort(base.year, base.month)}: ${deltaBadge({ dir, diff: Math.round(diff * 100) / 100, pct: pct === null ? null : Math.round(pct * 100) / 100 })}`);
      }
    }
    if (pc && okNums) parts.unshift(`${formatQty(v.quantity)} × ${formatARS(v.price)}`);
    el('[data-detail]').innerHTML = parts.join(' · ');
  }

  q('product').addEventListener('change', () => refresh({ prefill: true }));
  q('date').addEventListener('change', () => refresh());
  ['qty', 'price'].forEach((n) => q(n).addEventListener('input', update));

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = read(); const errs = validatePurchase({ quantity: v.quantity, price: v.price, date: v.date });
    if (!v.productId) { errs.product = 'Elegí un producto.'; }
    f.querySelectorAll('[data-err]').forEach((s) => { s.textContent = errs[s.dataset.err] || ''; });
    ['qty', 'price', 'date'].forEach((n) => q(n).removeAttribute('aria-invalid'));
    if (errs.quantity) q('qty').setAttribute('aria-invalid', 'true'); if (errs.price) q('price').setAttribute('aria-invalid', 'true'); if (errs.date) q('date').setAttribute('aria-invalid', 'true');
    if (errs.product) { q('product').focus(); return; }
    if (Object.keys(errs).length) { f.querySelector('[aria-invalid]')?.focus(); return; }
    const { year, month } = monthOf(v.date);
    if (isClosed(year, month)) { el('[data-closed]').classList.remove('hidden'); return; }

    const key = JSON.stringify([v.productId, v.date, v.quantity, v.price, v.notes]);
    if (!opIds.has(key)) opIds.set(key, crypto.randomUUID());
    const btn = el('[data-save]'); btn.disabled = true;
    const row = await saving('No se pudo guardar la compra', async () => {
      const r = await addPurchase({ opId: opIds.get(key), productId: v.productId, quantity: v.quantity, price: v.price, date: v.date, notes: v.notes });
      await loadAll();
      return r;
    }, { retry: true, successMessage: `Compra guardada: ${formatARS(subtotal(v.quantity, v.price))}` });
    btn.disabled = false;
    if (!row) return;
    opIds.clear();
    if (!keepOpen) { onSaved?.(row); return; }
    q('qty').value = ''; q('notes').value = ''; refresh({ prefill: true });
    onSaved?.(row);
  });

  refresh({ prefill: true });
  return { refresh };
}
