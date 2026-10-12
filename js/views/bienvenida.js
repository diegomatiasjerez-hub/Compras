// Primera vez (o datos del navegador borrados): empezar con ejemplos o recuperar una copia.
import { seedExample, validateBackup, restoreBackup, markBackedUp, toAppError } from '../data.js';
import { formatARS, formatDateTime, esc } from '../format.js';
import { confirmDialog, saving, toast, $ } from '../ui.js';

export function renderWelcome(root, onDone) {
  root.innerHTML = `<div class="login welcome">
    <h1>Compras mensuales</h1>
    <p>Tus datos se guardan en este celular, sin internet y sin cuenta. Para no perderlos si se borran los datos del navegador, guardá copias de seguridad desde <b>Más → Copias de seguridad</b>.</p>
    <div class="banner info">¿Borraste los datos del navegador o instalaste la app de nuevo? Elegí <b>Recuperar una copia</b> y buscá el archivo <code>compras-backup-….json</code> que guardaste.</div>
    <div class="stack">
      <label class="btn accent block" style="cursor:pointer">Recuperar una copia (archivo .json)<input type="file" accept="application/json,.json" id="w-file" hidden></label>
      <button class="btn secondary block" id="w-seed">Empezar de cero con productos de ejemplo</button>
    </div></div>`;

  $('#w-seed', root).addEventListener('click', async () => {
    const ok = await saving('No se pudo preparar la aplicación', () => seedExample(), { successMessage: null });
    if (ok) onDone();
  });

  $('#w-file', root).addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    let payload, info;
    try { payload = JSON.parse(await file.text()); } catch { toast('El archivo no es un JSON válido. No se tocó nada.', 'error'); return; }
    try { info = await validateBackup(payload); } catch (err) { toast(`Copia rechazada: ${toAppError(err).message.replace(/^.*?:\s*/, '')}`, 'error'); return; }
    const c = info.counts || {};
    const yes = await confirmDialog({
      title: 'Recuperar copia', confirmText: 'Recuperar datos',
      message: `Copia del ${esc(formatDateTime(info.exported_at))}: ${c.purchases} compras, ${c.products} productos, ${c.periods} meses, total ${formatARS(info.total_spent)}.`,
    });
    if (!yes) return;
    const ok = await saving('No se pudo recuperar la copia', async () => { await restoreBackup(payload, 'RESTAURAR'); await markBackedUp(); }, { successMessage: 'Datos recuperados ✓' });
    if (ok) onDone();
  });
}
