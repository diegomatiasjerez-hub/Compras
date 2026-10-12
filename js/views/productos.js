// Productos: administración de la lista maestra (agregar, editar, activar/desactivar). Nunca se borran.
import { state, saveProduct, setProductActive, loadAll, isAdmin, storeById, categoryById, storeClass } from '../data.js';
import { parseNumberAR, formatARS, formatQty, unitLabel, esc } from '../format.js';
import { pricePerBase } from '../calc.js';
import { pageTitle, emptyState, openSheet, saving, confirmDialog } from '../ui.js';
import { ctx, storePill } from './shared.js';

const filters = { store: 'all', status: 'active', q: '' };
const UNITS = [['un', 'Unidades sueltas'], ['kg', 'Kilogramos'], ['l', 'Litros']];

export function render(root) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = state.products
    .filter((p) => (filters.status === 'all') || (filters.status === 'active' ? p.active : !p.active))
    .filter((p) => filters.store === 'all' || p.store_id === filters.store)
    .filter((p) => !filters.q || norm(`${p.name} ${p.presentation}`).includes(norm(filters.q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const cards = list.map((p) => `<article class="prod s-${storeClass(p.store_id)} ${p.active ? '' : 'inactive'}">
    <div class="head"><div><div class="name">${esc(p.name)}</div><div class="pres">${esc(p.presentation)}</div></div>${storePill(p.store_id)}</div>
    <div class="small muted" style="margin-top:6px">${esc(categoryById(p.category_id)?.name || 'Sin categoría')} · compara por ${unitLabel(p.base_unit)}${Number(p.base_qty) !== 1 ? ` (trae ${formatQty(p.base_qty)})` : ''}${p.reference_price != null ? ` · referencia ${formatARS(p.reference_price)}` : ''}${p.active ? '' : ' · <b>Inactivo</b>'}</div>
    ${isAdmin() ? `<div class="actions"><button class="btn secondary sm grow" data-edit="${p.id}">Editar</button>
      <button class="btn ghost sm" data-toggle="${p.id}">${p.active ? 'Desactivar' : 'Activar'}</button></div>` : ''}</article>`).join('');

  root.innerHTML = `${pageTitle('Productos', isAdmin() ? '<button class="btn accent sm" data-new>＋ Nuevo</button>' : '')}
    <div class="stack">
      <input type="search" id="q" placeholder="Buscar producto…" value="${esc(filters.q)}" aria-label="Buscar producto">
      <div class="seg" role="group" aria-label="Estado">
        ${[['active', 'Activos'], ['inactive', 'Inactivos'], ['all', 'Todos']].map(([k, l]) => `<button data-status="${k}" aria-pressed="${filters.status === k}">${l}</button>`).join('')}
      </div>
      <div class="seg" role="group" aria-label="Comercio"><button data-store="all" aria-pressed="${filters.store === 'all'}">Todos los comercios</button>
        ${state.stores.map((s) => `<button data-store="${s.id}" aria-pressed="${filters.store === s.id}">${esc(s.name)}</button>`).join('')}</div>
    </div>
    <div style="margin-top:12px">${cards || `<div class="card">${emptyState('No hay productos', 'Tocá «Nuevo» para agregar el primero.')}</div>`}</div>
    <p class="tiny" style="margin-top:12px">Los productos no se borran: al desactivarlos desaparecen de la lista de compras, pero su historial se conserva.</p>`;

  const q = root.querySelector('#q');
  q.addEventListener('input', () => { filters.q = q.value; const pos = q.selectionStart; render(root); const n = root.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { filters.status = b.dataset.status; render(root); }));
  root.querySelectorAll('[data-store]').forEach((b) => b.addEventListener('click', () => { filters.store = b.dataset.store; render(root); }));
  root.querySelector('[data-new]')?.addEventListener('click', () => openEditor(null));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(state.products.find((p) => p.id === b.dataset.edit))));
  root.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const p = state.products.find((x) => x.id === b.dataset.toggle);
    if (p.active && !(await confirmDialog({ title: 'Desactivar producto', message: `«${esc(p.name)}» dejará de aparecer en la lista de compras. Su historial se conserva y podés volver a activarlo.`, confirmText: 'Desactivar' }))) return;
    const ok = await saving('No se pudo actualizar el producto', async () => { await setProductActive(p.id, !p.active); await loadAll(); }, { successMessage: p.active ? 'Producto desactivado' : 'Producto activado' });
    if (ok) ctx.rerender();
  }));
}

function openEditor(p) {
  const cats = state.categories.filter((c) => c.active || c.id === p?.category_id);
  const stores = state.stores.filter((s) => s.active || s.id === p?.store_id);
  openSheet({
    title: p ? 'Editar producto' : 'Nuevo producto',
    html: `<form novalidate>
      ${p ? '<div class="banner info">Los cambios no modifican las compras ya registradas: cada compra conserva el nombre, la presentación y el comercio de cuando se hizo.</div>' : ''}
      <label class="field"><span>Nombre</span><input type="text" name="name" value="${esc(p?.name || '')}" maxlength="80" placeholder="Ej: Papel higiénico"><small class="err" data-err="name"></small></label>
      <label class="field"><span>Comercio habitual</span><select name="store">${stores.map((s) => `<option value="${s.id}" ${s.id === p?.store_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Categoría</span><select name="category"><option value="">Sin categoría</option>${cats.map((c) => `<option value="${c.id}" ${c.id === p?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><small>Las categorías se administran en Más → Configuración.</small></label>
      <label class="field"><span>Presentación comercial</span><input type="text" name="pres" value="${esc(p?.presentation || '')}" maxlength="80" placeholder="Ej: Pack de 4 unidades, Kilogramo, Botella de 1,5 litros"><small class="err" data-err="pres"></small></label>
      <label class="field"><span>Unidad de comparación</span><select name="unit">${UNITS.map(([v, l]) => `<option value="${v}" ${v === (p?.base_unit || 'un') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span data-qtylabel>¿Cuántas unidades trae cada presentación?</span><input type="text" name="qty" inputmode="decimal" value="${p ? String(p.base_qty).replace('.', ',') : '1'}"><small data-qtyhint></small><small class="err" data-err="qty"></small></label>
      <label class="field"><span>Precio de referencia (opcional)</span><div class="input-money"><input type="text" name="ref" inputmode="decimal" value="${p?.reference_price != null ? String(p.reference_price).replace('.', ',') : ''}"></div><small>Solo se usa mientras el producto no tenga compras registradas.</small><small class="err" data-err="ref"></small></label>
      <label class="switch"><input type="checkbox" name="active" ${p?.active === false ? '' : 'checked'}> Producto activo</label>
      <button class="btn accent block" type="submit" style="margin-top:12px">Guardar producto</button></form>`,
    onMount(body, close) {
      const f = body.querySelector('form'); const q = (n) => f.elements[n];
      const hint = () => {
        const u = q('unit').value, n = parseNumberAR(q('qty').value);
        body.querySelector('[data-qtylabel]').textContent = u === 'un' ? '¿Cuántas unidades trae cada presentación?' : `¿Cuántos ${u === 'kg' ? 'kilogramos' : 'litros'} trae cada presentación?`;
        body.querySelector('[data-qtyhint]').textContent = n > 0 ? `Ejemplo: si pagás ${formatARS(1200)} por la presentación, cada ${unitLabel(u)} sale ${formatARS(pricePerBase(1200, n))}.` : '';
      };
      q('unit').addEventListener('change', hint); q('qty').addEventListener('input', hint); hint();
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = { name: q('name').value.trim(), pres: q('pres').value.trim(), qty: parseNumberAR(q('qty').value), ref: q('ref').value.trim() === '' ? null : parseNumberAR(q('ref').value) };
        const errs = {};
        if (!v.name) errs.name = 'Escribí el nombre del producto.';
        if (!v.pres) errs.pres = 'Indicá la presentación (ej: Kilogramo).';
        if (!Number.isFinite(v.qty) || v.qty <= 0 || Math.round(v.qty * 1000) / 1000 !== v.qty) errs.qty = 'Ingresá un número mayor que 0 (hasta 3 decimales).';
        if (v.ref !== null && (!Number.isFinite(v.ref) || v.ref < 0)) errs.ref = 'Ingresá un precio válido.';
        f.querySelectorAll('[data-err]').forEach((s) => { s.textContent = errs[s.dataset.err] || ''; });
        if (Object.keys(errs).length) return;
        const ok = await saving('No se pudo guardar el producto', async () => {
          await saveProduct({ id: p?.id, name: v.name, category_id: q('category').value, store_id: q('store').value, presentation: v.pres, base_unit: q('unit').value, base_qty: v.qty, reference_price: v.ref, active: q('active').checked });
          await loadAll();
        }, { successMessage: 'Producto guardado ✓' });
        if (ok) { close(); ctx.rerender(); }
      });
    },
  });
}
