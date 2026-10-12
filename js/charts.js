// Gráficos SVG simples, sin librerías. Devuelven HTML listo para insertar.
import { monthShort, formatARS, esc } from './format.js';
import { ym } from './calc.js';

const W = 340, H = 190, PAD = { l: 8, r: 8, t: 22, b: 26 };
export const STORE_COLORS = { makro: '#2a50b8', avicola: '#a85d0a', '': '#7a8798' };

function compact(n) {
  if (n >= 1e6) return (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
  if (n >= 1e3) return (n / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' mil';
  return String(Math.round(n));
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * Barras apiladas por comercio. months = [{year, month, total, byStore:[{store_id,total}]}]
 * storeClassOf(storeId) -> 'makro' | 'avicola' | ''
 */
export function stackedBars(months, storeClassOf, label = 'Gasto mensual') {
  const max = niceMax(Math.max(...months.map((m) => m.total), 0));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b, bw = iw / months.length;
  const y = (v) => PAD.t + ih - (v / max) * ih;
  let g = `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${PAD.t + ih}" y2="${PAD.t + ih}" stroke="#c5ced6"/>`;
  months.forEach((m, i) => {
    const x = PAD.l + i * bw + bw * 0.15, w = bw * 0.7; let acc = 0;
    for (const s of m.byStore) {
      const y1 = y(acc + s.total), y0 = y(acc); acc += s.total;
      g += `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(y0 - y1, 0)}" rx="2" fill="${STORE_COLORS[storeClassOf(s.store_id)] ?? STORE_COLORS['']}"/>`;
    }
    if (m.total > 0) g += `<text x="${x + w / 2}" y="${y(m.total) - 5}" text-anchor="middle">${compact(m.total)}</text>`;
    g += `<text x="${x + w / 2}" y="${H - 9}" text-anchor="middle">${monthShort(m.month)}</text>`;
  });
  const desc = months.map((m) => `${monthShort(m.month)} ${m.year}: ${formatARS(m.total)}`).join('; ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}. ${esc(desc)}">${g}</svg>`;
}

/** Línea de precios. series = [{year, month, value}] */
export function lineChart(series, label = 'Evolución del precio') {
  if (!series.length) return '';
  const vals = series.map((s) => s.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo *= 0.9; hi *= 1.1; if (lo === hi) hi = lo + 1; }
  const padv = (hi - lo) * 0.15; lo = Math.max(0, lo - padv); hi += padv;
  const first = ym(series[0].year, series[0].month), last = ym(series.at(-1).year, series.at(-1).month);
  const span = Math.max(last - first, 1), iw = W - PAD.l - PAD.r - 24, ih = H - PAD.t - PAD.b;
  const x = (s) => PAD.l + 12 + (series.length === 1 ? iw / 2 : ((ym(s.year, s.month) - first) / span) * iw);
  const y = (v) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = series.map((s) => `${x(s).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ');
  let g = `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${PAD.t + ih}" y2="${PAD.t + ih}" stroke="#c5ced6"/>`;
  if (series.length > 1) g += `<polyline points="${pts}" fill="none" stroke="#18284d" stroke-width="2.5" stroke-linejoin="round"/>`;
  series.forEach((s, i) => {
    const up = i > 0 && s.value > series[i - 1].value, down = i > 0 && s.value < series[i - 1].value;
    g += `<circle cx="${x(s)}" cy="${y(s.value)}" r="4.5" fill="${up ? '#b8341d' : down ? '#17794a' : '#18284d'}" stroke="#fff" stroke-width="1.5"/>`;
    g += `<text x="${x(s)}" y="${y(s.value) - 9}" text-anchor="middle">${compact(s.value)}</text>`;
    g += `<text x="${x(s)}" y="${H - 9}" text-anchor="middle">${monthShort(s.month)} ${String(s.year).slice(2)}</text>`;
  });
  const desc = series.map((s) => `${monthShort(s.month)} ${s.year}: ${formatARS(s.value)}`).join('; ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}. ${esc(desc)}">${g}</svg>`;
}

export function legend(items) {
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}
