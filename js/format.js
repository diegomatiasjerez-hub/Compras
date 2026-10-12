// Formato y lectura de números en estilo argentino. Sin dependencias (se prueba en Node).

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const monthName = (m) => MESES[m - 1];
export const monthShort = (m) => MESES_CORTOS[m - 1];
export const monthLabel = (y, m) => `${capitalize(MESES[m - 1])} ${y}`;
export const monthLabelShort = (y, m) => `${MESES_CORTOS[m - 1]} ${y}`;
export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const nf = (min, max) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: min, maximumFractionDigits: max });
const nf0 = nf(0, 0), nf2 = nf(2, 2), nfQty = nf(0, 3), nfPct = nf(0, 2);

/** $1.200 — muestra centavos solo si hacen falta. */
export function formatARS(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const cents = Math.round(Math.abs(v) * 100);
  const body = cents % 100 === 0 ? nf0.format(cents / 100) : nf2.format(cents / 100);
  return (v < 0 && cents !== 0 ? '-$' : '$') + body;
}

/** +$200 / -$200 / $0 */
export function formatSignedARS(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (Math.round(Math.abs(v) * 100) === 0) return '$0';
  return (v > 0 ? '+' : '') + formatARS(v);
}

/** +20 % / -5,5 % */
export function formatPct(p) {
  if (p === null || p === undefined || Number.isNaN(Number(p))) return '—';
  const v = Number(p);
  if (Math.abs(v) < 0.005) return '0 %';
  return (v > 0 ? '+' : '-') + nfPct.format(Math.abs(v)) + ' %';
}

export const formatQty = (q) => nfQty.format(Number(q));

const UNIT_NAMES = { un: ['unidad', 'unidades'], kg: ['kg', 'kg'], l: ['litro', 'litros'] };
export function unitLabel(unit, qty = 1) {
  const u = UNIT_NAMES[unit] || [unit, unit];
  return Number(qty) === 1 ? u[0] : u[1];
}
export const unitShort = (unit) => ({ un: 'un.', kg: 'kg', l: 'l' }[unit] || unit);

/**
 * Lee un número escrito por una persona argentina: "1.200,50", "1200", "1,5", "$ 30.000".
 * Devuelve NaN si no se puede interpretar.
 */
export function parseNumberAR(input) {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').replace(/[\s$]/g, '');
  if (s === '') return NaN;
  if (!/^-?[\d.,]+$/.test(s)) return NaN;
  if (s.includes(',')) {
    if ((s.match(/,/g) || []).length > 1) return NaN;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');            // 1.200 => 1200 (punto como separador de miles)
  } else if ((s.match(/\./g) || []).length > 1) {
    return NaN;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Fecha local YYYY-MM-DD (sin desfase de zona horaria). */
export function todayISO(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', hour12: false });
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
