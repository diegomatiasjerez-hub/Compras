// Arranque de la aplicación, navegación y estructura general.
import { state, loadAll, createBackup, toAppError, isFirstRun, requestPersistence, dailySnapshot, backupStatus, setMeta } from './data.js';
import { APP_VERSION } from './config.js';
import { $, icon, openSheet, setStatus, toast } from './ui.js';
import { ctx } from './views/shared.js';
import { renderWelcome } from './views/bienvenida.js';
import * as inicio from './views/inicio.js';
import * as compras from './views/compras.js';
import * as nueva from './views/nuevaCompra.js';
import * as comparativas from './views/comparativas.js';
import * as productos from './views/productos.js';
import * as historial from './views/historial.js';
import * as informes from './views/informes.js';
import * as backups from './views/backups.js';
import * as configuracion from './views/configuracion.js';

const ROUTES = {
  inicio: { m: inicio, label: 'Inicio' }, compras: { m: compras, label: 'Compras' }, nueva: { m: nueva, label: 'Nueva compra' },
  comparativas: { m: comparativas, label: 'Comparativas' }, productos: { m: productos, label: 'Productos' },
  historial: { m: historial, label: 'Historial' }, informes: { m: informes, label: 'Informes' },
  copias: { m: backups, label: 'Copias de seguridad' }, config: { m: configuracion, label: 'Configuración' },
};
const MAIN_NAV = ['inicio', 'compras', 'nueva', 'comparativas'];
const MORE = [['productos', 'box', 'Productos'], ['historial', 'clock', 'Historial'], ['informes', 'doc', 'Informes'], ['copias', 'shield', 'Copias de seguridad'], ['config', 'gear', 'Configuración']];

const app = () => $('#app');
const currentRoute = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES[r] ? r : 'inicio'; };

function shell() {
  app().innerHTML = `<header class="topbar"><div class="brand">Compras<small>mensuales</small></div><span id="status" class="status" role="status"></span></header>
    <a id="backup-alert" class="banner backup-alert" href="#/copias" hidden></a>
    <main id="view"></main>
    <nav class="nav" aria-label="Navegación principal">
      <a href="#/inicio" data-r="inicio">${icon('home')}Inicio</a>
      <a href="#/compras" data-r="compras">${icon('list')}Compras</a>
      <a href="#/nueva" data-r="nueva" class="nav-add" aria-label="Nueva compra"><span class="disc">${icon('plus')}</span>Nueva</a>
      <a href="#/comparativas" data-r="comparativas">${icon('chart')}Comparar</a>
      <button id="more" aria-haspopup="dialog">${icon('more')}Más</button></nav>`;
  $('#more').addEventListener('click', () => openSheet({
    title: 'Más opciones',
    html: `<div class="stack">${MORE.map(([r, ic, l]) => `<a class="btn secondary block" style="justify-content:flex-start" href="#/${r}" data-go>${icon(ic).replace('<svg ', '<svg width="22" height="22" ')} ${l}</a>`).join('')}</div>`,
    onMount(body, close) { body.addEventListener('click', (e) => { if (e.target.closest('[data-go]')) close(); }); },
  }));
}

async function renderRoute() {
  const view = $('#view'); if (!view) return;
  const r = currentRoute(), y = window.scrollY;
  document.title = `${ROUTES[r].label} · Compras mensuales`;
  document.querySelectorAll('.nav [data-r]').forEach((a) => { if (a.dataset.r === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const more = $('#more'); if (more) { if (MORE.some(([k]) => k === r)) more.setAttribute('aria-current', 'page'); else more.removeAttribute('aria-current'); }
  try { await ROUTES[r].m.render(view); }
  catch (e) {
    console.error(e);
    view.innerHTML = `<div class="banner error">No se pudo mostrar esta pantalla: ${toAppError(e).message}</div><button class="btn block" id="retry">Reintentar</button>`;
    $('#retry').addEventListener('click', () => renderRoute());
  }
  updateAlert();
  window.scrollTo(0, y);
}

/** Aviso cuando hay cambios sin copia guardada fuera del navegador. */
function updateAlert() {
  const el = $('#backup-alert'); if (!el) return;
  const { lastBackupAt, changes } = backupStatus();
  const days = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt)) / 864e5) : null;
  let msg = '';
  if (state.purchases.length && changes > 0) {
    if (days === null) msg = 'Todavía no guardaste ninguna copia fuera del celular. Tocá acá para hacerlo.';
    else if (days >= 7 || changes >= 20) msg = `Hay ${changes} cambios sin copia (última hace ${days} ${days === 1 ? 'día' : 'días'}). Tocá acá para guardar una.`;
  }
  el.hidden = !msg || currentRoute() === 'copias'; el.textContent = msg;
}

/** Copia automática la primera vez que se abre una versión nueva de la aplicación. */
async function backupOnUpdate() {
  try {
    const seen = state.meta.seenVersion;
    if (seen === APP_VERSION) return;
    if (seen) await createBackup(`Antes de actualizar a la versión ${APP_VERSION}`, 'pre_op');
    await setMeta('seenVersion', APP_VERSION);
  } catch { /* no es crítico */ }
}

function startApp() {
  shell();
  ctx.rerender = renderRoute;
  ctx.go = (r) => { location.hash = `#/${r}`; };
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
  requestPersistence();
  backupOnUpdate().then(() => dailySnapshot()).catch(() => {});
}

async function boot() {
  try {
    if (await isFirstRun()) return renderWelcome(app(), async () => { await loadAll(); startApp(); });
    await loadAll();
    startApp();
  } catch (e) {
    app().innerHTML = `<div class="login"><h1>No se pudo abrir la aplicación</h1><p>${toAppError(e).message}</p>
      <p class="muted">Si usás el navegador en modo incógnito o bloqueaste los datos del sitio, la app no puede guardar nada. Probá en una pestaña normal.</p><button class="btn block" id="retry">Reintentar</button></div>`;
    $('#retry').addEventListener('click', () => location.reload());
  }
}
boot();

// Instalación sin conexión (solo en https o localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
