// Componentes de interfaz compartidos.
import { esc } from './format.js';
import { toAppError } from './data.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ---------- Avisos ----------
export function toast(message, kind = '') {
  const box = $('#toasts'); if (!box) return;
  box.replaceChildren();                       // un solo aviso a la vez: no se apilan
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3000);
}

// ---------- Indicador de guardado ----------
let statusTimer;
export function setStatus(kind, text) {
  const el = $('#status'); if (!el) return;
  el.className = `status ${kind}`; el.textContent = text;
  clearTimeout(statusTimer);
  if (kind === 'ok') statusTimer = setTimeout(() => { el.className = 'status'; el.textContent = ''; }, 5000);
}

let busy = false;
/**
 * Ejecuta una operación de escritura con:
 *  - bloqueo contra toques repetidos (una operación a la vez),
 *  - estado "Guardando…" / "Guardado" / "Error",
 *  - reintentos automáticos SOLO si la operación es idempotente (retry:true) y falló la red.
 * Devuelve el resultado, o undefined si falló (el error ya se mostró).
 */
export async function saving(label, fn, { retry = false, successMessage = 'Guardado ✓' } = {}) {
  if (busy) return undefined;
  busy = true; setStatus('saving', 'Guardando…');
  try {
    let lastErr;
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt++) {
      try {
        const result = await fn();
        const hhmm = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        setStatus('ok', `Guardado ${hhmm}`);
        if (successMessage) toast(successMessage, 'ok');
        return result === undefined ? true : result;
      } catch (e) {
        lastErr = toAppError(e);
        if (!lastErr.network) break;
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
    setStatus('error', 'No se guardó');
    toast(`${label}: ${lastErr.message}`, 'error');
    return undefined;
  } finally { busy = false; }
}

// ---------- Hoja inferior (modal) ----------
export function openSheet({ title, html, onMount }) {
  const back = document.createElement('div'); back.className = 'backdrop';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div>
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
    <div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(back);
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
  const close = () => { back.remove(); document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  const body = back.querySelector('.sheet-body');
  onMount?.(body, close);
  const first = body.querySelector('input, select, textarea'); if (first && matchMedia('(pointer:fine)').matches) first.focus();
  return close;
}

/** Confirmación para acciones destructivas. requireText obliga a escribir una palabra. */
export function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false, requireText = null }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, close) => { if (done) return; done = true; close(); resolve(v); };
    openSheet({
      title,
      html: `<p>${message}</p>
        ${requireText ? `<label class="field"><span>Para continuar, escribí <b>${esc(requireText)}</b></span><input type="text" id="cf-text" autocomplete="off" autocapitalize="characters"></label>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn secondary grow" data-no>Cancelar</button>
        <button class="btn ${danger ? 'danger' : ''} grow" data-yes ${requireText ? 'disabled' : ''}>${esc(confirmText)}</button></div>`,
      onMount(body, close) {
        const yes = body.querySelector('[data-yes]'); const input = body.querySelector('#cf-text');
        input?.addEventListener('input', () => { yes.disabled = input.value.trim() !== requireText; });
        yes.addEventListener('click', () => finish(true, close));
        body.querySelector('[data-no]').addEventListener('click', () => finish(false, close));
        const obs = new MutationObserver(() => { if (!document.body.contains(body)) { obs.disconnect(); finish(false, () => {}); } });
        obs.observe(document.body, { childList: true });
      },
    });
  });
}

// ---------- Descargas ----------
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV con separador ; y BOM, para que Excel (configuración regional argentina) lo abra bien. */
export function toCSV(headers, rows) {
  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}
export const csvNum = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

export function pageTitle(title, rightHtml = '') {
  return `<div class="page-title"><h1>${esc(title)}</h1>${rightHtml}</div>`;
}
export function emptyState(title, text) { return `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`; }
