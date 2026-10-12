// Configuración: comercios, categorías, usuarios y preferencias.
import { state, isAdmin, saveNamed, saveSetting, loadAll, storageInfo, requestPersistence } from '../data.js';
import { esc } from '../format.js';
import { pageTitle, openSheet, saving, toast, confirmDialog } from '../ui.js';
import { ctx } from './shared.js';
import { APP_VERSION } from '../config.js';

export async function render(root) {
  const prefs = { showUnitPrice: true, ...(state.settings.prefs || {}) };
  const st = await storageInfo();
  const mb = (n) => (n == null ? '—' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB');

  const named = (title, table, items) => `<div class="section-title"><h2>${title}</h2>${isAdmin() ? `<button class="btn secondary sm" data-new="${table}">＋ Agregar</button>` : ''}</div>
    <div class="card flush">${items.map((i) => `<div class="row between" style="padding:10px 14px;border-bottom:1px solid var(--line)">
      <span class="${i.active ? '' : 'muted'}">${esc(i.name)}${i.active ? '' : ' <span class="pill">Inactivo</span>'}</span>
      ${isAdmin() ? `<button class="btn ghost sm" data-edit="${table}:${i.id}">Editar</button>` : ''}</div>`).join('') || '<p class="muted" style="padding:14px">Sin elementos.</p>'}</div>`;

  root.innerHTML = `${pageTitle('Configuración')}
    ${named('Comercios', 'stores', state.stores)}
    ${named('Categorías', 'categories', state.categories)}
    <p class="tiny" style="margin-top:6px">Los comercios y categorías no se borran: se desactivan, y el historial se conserva.</p>

    <div class="section-title"><h2>Preferencias</h2></div>
    <div class="card"><label class="switch"><input type="checkbox" id="pref-unit" ${prefs.showUnitPrice ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'}> Mostrar el precio por unidad, kilo o litro junto al precio de cada presentación</label></div>

    <div class="section-title"><h2>Almacenamiento en este celular</h2></div>
    <div class="card"><p><b>Datos protegidos:</b> ${st.persisted ? 'sí — el navegador no los borra solo' : 'no — el navegador podría borrarlos si falta espacio'}</p>
      <p class="small muted">Espacio usado: ${mb(st.usage)}</p>
      ${st.persisted ? '' : '<button class="btn secondary block" data-persist>Pedir protección de datos</button><p class="tiny">Funciona mejor si instalás la app: en Chrome, menú ⋮ → «Agregar a pantalla principal» / «Instalar app».</p>'}
      <p class="tiny" style="margin-top:8px">Aun así, <b>el navegador puede borrar los datos</b> (si limpiás datos de navegación, desinstalás la app o se llena la memoria). La única protección real es una copia guardada fuera del celular: <a href="#/copias">Copias de seguridad</a>.</p></div>

    <p class="tiny" style="margin-top:16px">Versión ${esc(APP_VERSION)}</p>`;

  root.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => nameEditor(b.dataset.new, null)));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const [table, id] = b.dataset.edit.split(':'); nameEditor(table, state[table].find((x) => x.id === id));
  }));
  root.querySelector('#pref-unit').addEventListener('change', async (e) => {
    const ok = await saving('No se pudo guardar la preferencia', async () => { await saveSetting('prefs', { ...prefs, showUnitPrice: e.target.checked }); await loadAll(); });
    if (!ok) e.target.checked = !e.target.checked;
  });
  root.querySelector('[data-persist]')?.addEventListener('click', async () => {
    const ok = await requestPersistence();
    toast(ok ? 'Datos protegidos ✓' : 'El navegador no lo concedió. Instalá la app e intentá de nuevo.', ok ? '' : 'error');
    ctx.rerender();
  });
}

function nameEditor(table, item) {
  const label = table === 'stores' ? 'comercio' : 'categoría';
  openSheet({
    title: item ? `Editar ${label}` : `Nuevo ${label}`,
    html: `<form novalidate><label class="field"><span>Nombre</span><input type="text" name="name" maxlength="60" value="${esc(item?.name || '')}"><small class="err" data-err></small></label>
      <label class="switch"><input type="checkbox" name="active" ${item?.active === false ? '' : 'checked'}> Activo</label>
      <button class="btn accent block" type="submit" style="margin-top:12px">Guardar</button></form>`,
    onMount(body, close) {
      const f = body.querySelector('form');
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const name = f.elements.name.value.trim();
        if (!name) { f.querySelector('[data-err]').textContent = 'Escribí un nombre.'; return; }
        const ok = await saving(`No se pudo guardar el ${label}`, async () => { await saveNamed(table, { id: item?.id, name, active: f.elements.active.checked }); await loadAll(); });
        if (ok) { close(); ctx.rerender(); }
      });
    },
  });
}
