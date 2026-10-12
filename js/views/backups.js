// Copias de seguridad: guardar fuera del celular, historial interno, restaurar con validación.
import { state, loadAll, exportData, createBackup, listBackups, backupPayload, validateBackup, restoreBackup, backupStatus, markBackedUp } from '../data.js';
import { formatARS, formatDateTime, esc } from '../format.js';
import { pageTitle, emptyState, download, toast, confirmDialog, saving, setStatus } from '../ui.js';
import { ctx } from './shared.js';
import { APP_VERSION } from '../config.js';

const KINDS = { manual: 'Manual', auto: 'Automática diaria', pre_restore: 'Antes de restaurar', pre_op: 'Antes de una operación' };
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

/**
 * Entrega el archivo fuera del navegador: hoja de compartir de Android (Drive, WhatsApp, mail…)
 * si existe, y si no, descarga común. Devuelve true si el archivo salió del navegador.
 */
export async function saveBackupFile(data, { share = true } = {}) {
  const name = `compras-backup-${stamp()}.json`, text = JSON.stringify(data, null, 2);
  if (share && navigator.canShare && navigator.share) {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Copia de Compras mensuales' }); return 'shared'; }
      catch (e) { if (e?.name === 'AbortError') return 'cancelled'; /* otro error: se descarga */ }
    }
  }
  download(name, text, 'application/json');
  return 'downloaded';
}

export async function render(root) {
  let rows = [], loadError = null;
  root.innerHTML = `${pageTitle('Copias de seguridad')}<p class="boot">Cargando copias…</p>`;
  try { rows = await listBackups(); } catch (e) { loadError = e.message; }

  const { lastBackupAt, changes } = backupStatus();
  const days = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt)) / 864e5) : null;
  const stale = days === null || (changes > 0 && days >= 7);
  const canShare = !!(navigator.canShare && navigator.share);

  root.innerHTML = `${pageTitle('Copias de seguridad')}
    <div class="banner ${stale ? '' : 'info'}">${days === null ? 'Todavía no guardaste ninguna copia fuera del celular.' : stale ? `Última copia guardada: hace ${days} días, con ${changes} cambios después.` : `Última copia guardada: ${days === 0 ? 'hoy' : 'hace ' + days + ' días'}${changes ? `, con ${changes} cambios después` : ', sin cambios después'}.`}</div>
    <div class="card small" style="margin-bottom:12px"><b>Por qué hace falta:</b> los datos viven solo en este celular. Si borrás los datos de navegación de Chrome, o desinstalás la app, se pierden. Con el archivo de copia los recuperás en 1 minuto desde la pantalla de inicio de la app.</div>
    ${loadError ? `<div class="banner error">No se pudo cargar el historial: ${esc(loadError)}</div>` : ''}
    <div class="stack">
      <button class="btn accent block" data-save>${canShare ? '⬆ Guardar copia en Drive u otra app' : '⬇ Descargar copia (archivo JSON)'}</button>
      ${canShare ? '<button class="btn secondary block" data-download>⬇ Descargar al celular</button>' : ''}
      <button class="btn block" data-create>Crear copia interna ahora</button>
      <label class="btn secondary block" style="cursor:pointer">Restaurar desde un archivo…<input type="file" accept="application/json,.json" data-file hidden></label>
    </div>
    <p class="tiny" style="margin-top:8px">${canShare ? 'En «Guardar copia» elegí <b>Drive</b> (o mandátela por WhatsApp/mail a vos mismo): así queda fuera del celular. «Descargar» la deja en la carpeta Descargas, que también se pierde si se borra el teléfono.' : 'Guardá el archivo descargado en Drive o en tu computadora.'} Incluye comercios, categorías, productos, meses, compras e historial de cambios. En Informes podés exportar a CSV para Excel.</p>

    <div class="section-title"><h2>Copias dentro de la app</h2></div>
    <p class="tiny" style="margin:-4px 0 8px">Sirven para deshacer un error, pero <b>se borran junto con los datos del navegador</b>. No reemplazan al archivo.</p>
    ${rows.length ? rows.map((b) => `<div class="card" style="margin-bottom:8px">
      <div class="row between"><b>${formatDateTime(b.created_at)}</b><span class="pill ${b.status === 'ok' ? 'down' : 'up'}">${b.status === 'ok' ? 'Correcta' : 'Con error'}</span></div>
      <div class="small muted">${KINDS[b.kind] || b.kind}${b.note ? ' · ' + esc(b.note) : ''}</div>
      <div class="small">${b.counts?.purchases ?? 0} compras · ${b.counts?.products ?? 0} productos · total ${formatARS(b.total_spent ?? 0)}</div>
      <div class="actions row" style="margin-top:8px"><button class="btn secondary sm grow" data-dl="${b.id}">Descargar</button><button class="btn ghost sm" data-restore="${b.id}">Restaurar</button></div></div>`).join('')
      : `<div class="card">${emptyState('Todavía no hay copias internas', 'Tocá «Crear copia interna ahora» para guardar la primera.')}</div>`}
    <p class="tiny" style="margin-top:8px">Se crean solas una vez por día, antes de cerrar o reabrir un mes, antes de restaurar y al abrir una versión nueva de la app (v${esc(APP_VERSION)}).</p>`;

  root.querySelector('[data-save]').addEventListener('click', async () => {
    let res;
    const ok = await saving('No se pudo preparar la copia', async () => {
      res = await saveBackupFile(await exportData());
      if (res !== 'cancelled') await markBackedUp();
    }, { successMessage: null });
    if (ok) { if (res !== 'cancelled') toast(res === 'shared' ? 'Copia enviada ✓' : 'Copia descargada ✓ (revisá la carpeta Descargas)', 'ok'); ctx.rerender(); }
  });
  root.querySelector('[data-download]')?.addEventListener('click', async () => {
    const ok = await saving('No se pudo preparar la copia', async () => { await saveBackupFile(await exportData(), { share: false }); await markBackedUp(); }, { successMessage: 'Copia descargada ✓' });
    if (ok) ctx.rerender();
  });
  root.querySelector('[data-create]').addEventListener('click', async () => {
    const ok = await saving('No se pudo crear la copia', async () => { await createBackup('Copia manual'); }, { successMessage: 'Copia interna creada ✓' });
    if (ok) ctx.rerender();
  });
  root.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await saving('No se pudo descargar', async () => { download(`compras-backup-${stamp()}.json`, JSON.stringify(await backupPayload(b.dataset.dl), null, 2), 'application/json'); }, { successMessage: 'Archivo descargado ✓' });
    if (ok) ctx.rerender();
  }));
  root.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
    let payload; const ok = await saving('No se pudo leer la copia', async () => { payload = await backupPayload(b.dataset.restore); }, { successMessage: null });
    if (ok && payload) startRestore(payload, 'copia interna');
  }));
  root.querySelector('[data-file]').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    let payload;
    try { payload = JSON.parse(await file.text()); } catch { toast('El archivo no es un JSON válido. No se tocó ningún dato.', 'error'); return; }
    startRestore(payload, `archivo «${file.name}»`);
  });
}

/** Validar → mostrar qué contiene → confirmación explícita → restaurar. */
async function startRestore(payload, origin) {
  let info; setStatus('saving', 'Validando…');
  try { info = await validateBackup(payload); setStatus('', ''); } catch (e) {
    setStatus('error', 'Archivo inválido'); toast(`Copia rechazada: ${e.message.replace(/^.*?:\s*/, '') || e.message}. No se tocó ningún dato.`, 'error'); return;
  }
  const c = info.counts || {};
  const yes = await confirmDialog({
    title: 'Restaurar copia', danger: true, confirmText: 'Restaurar y reemplazar datos', requireText: 'RESTAURAR',
    message: `Vas a <b>reemplazar todos los datos actuales</b> por los de este ${esc(origin)}, creado el ${formatDateTime(info.exported_at)}: ${c.purchases} compras, ${c.products} productos, ${c.periods} meses, total ${formatARS(info.total_spent)}.<br><br>Antes se guarda automáticamente una copia de lo actual.`,
  });
  if (!yes) return;
  const ok = await saving('No se pudo restaurar (no se modificó nada)', async () => { await restoreBackup(payload, 'RESTAURAR'); await loadAll(); }, { successMessage: 'Copia restaurada ✓' });
  if (ok) ctx.rerender();
}
