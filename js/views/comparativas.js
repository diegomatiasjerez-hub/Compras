// Comparativas: evolución mensual de gastos y de precios.
import { state, storeClass, storeById } from '../data.js';
import { monthlyTotals, priceSeries, biggestMovers, variation, pricePerBase } from '../calc.js';
import { monthLabel, monthLabelShort, formatARS, formatSignedARS, formatPct, esc, unitLabel } from '../format.js';
import { pageTitle, emptyState } from '../ui.js';
import { ctx, monthBar, wireMonthBar, priceIndex } from './shared.js';
import { stackedBars, lineChart, legend, STORE_COLORS } from '../charts.js';

const sel = { productId: null, basis: 'presentacion' };

export function render(root) {
  const idx = priceIndex();
  const months = monthlyTotals(state.purchases, ctx.year, ctx.month, 12);
  const hasSpend = months.some((m) => m.total > 0);
  const bought = state.products.filter((p) => idx.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!bought.some((p) => p.id === sel.productId)) sel.productId = bought[0]?.id ?? null;
  const prod = bought.find((p) => p.id === sel.productId);
  const series = prod ? priceSeries(idx, prod.id) : [];
  const useBase = sel.basis === 'base';
  const pts = series.map((s) => ({ year: s.year, month: s.month, value: useBase ? s.perBase : s.price }));
  const movers = biggestMovers(state.products, idx, ctx.year, ctx.month, 5);
  const used = [...new Set(months.flatMap((m) => m.byStore.map((s) => s.store_id)))];
  const moverRows = (rows, cls) => rows.length ? rows.map((r) => `<div class="leader"><span>${esc(r.product.name)}</span><span class="${cls}">${formatSignedARS(r.cmp.diff)} · ${formatPct(r.cmp.pct)}</span></div>`).join('') : '<p class="muted small">Sin variaciones en este mes.</p>';

  root.innerHTML = `${pageTitle('Comparativas')}${monthBar()}
    <div class="section-title"><h2>Gasto de los últimos 12 meses</h2></div>
    <div class="card">${hasSpend ? stackedBars(months, storeClass) + legend(used.map((id) => ({ color: STORE_COLORS[storeClass(id)] ?? STORE_COLORS[''], label: storeById(id)?.name ?? '—' })))
      : emptyState('Aún no hay gastos para graficar', 'Cuando registres compras vas a ver acá cómo evoluciona el gasto de cada mes.')}</div>

    <div class="section-title"><h2>Evolución del precio</h2></div>
    <div class="card">${prod ? `
      <label class="field"><span>Producto</span><select id="prod">${bought.map((p) => `<option value="${p.id}" ${p.id === prod.id ? 'selected' : ''}>${esc(p.name)} — ${esc(p.presentation)}</option>`).join('')}</select></label>
      <div class="seg" role="group" aria-label="Base de comparación" style="margin-bottom:10px">
        <button data-basis="presentacion" aria-pressed="${!useBase}">Por presentación</button>
        <button data-basis="base" aria-pressed="${useBase}">Por ${unitLabel(prod.base_unit)}</button></div>
      ${lineChart(pts, `Precio de ${prod.name}`)}
      <div class="tablewrap"><table class="stackable"><thead><tr><th>Mes</th><th>Presentación</th><th class="r">Precio</th><th class="r">Variación</th></tr></thead><tbody>
        ${series.map((s, i) => { const cur = useBase ? s.perBase : s.price, prev = i ? (useBase ? series[i - 1].perBase : series[i - 1].price) : null; const v = variation(prev, cur);
          return `<tr><td data-l="Mes">${esc(monthLabelShort(s.year, s.month))}</td><td data-l="Presentación">${esc(s.presentation)}</td><td class="r" data-l="Precio"><b>${formatARS(cur)}</b></td>
          <td class="r" data-l="Variación">${i === 0 ? '<span class="muted">—</span>' : `<span class="${v.dir === 'up' ? 'up' : v.dir === 'down' ? 'down' : ''}">${formatSignedARS(v.diff)} · ${formatPct(v.pct)}</span>`}</td></tr>`; }).reverse().join('')}
      </tbody></table></div>
      ${useBase ? '' : '<p class="tiny">Si cambió la presentación, mirá «Por ' + unitLabel(prod.base_unit) + '» para comparar en la misma medida.</p>'}`
      : emptyState('Sin precios registrados', 'Registrá compras para ver cómo cambia el precio de cada producto.')}</div>

    <div class="section-title"><h2>${esc(monthLabel(ctx.year, ctx.month))}: aumentos y bajas</h2></div>
    <div class="card"><h3 class="up">Más aumentaron</h3>${moverRows(movers.up, 'up')}</div>
    <div class="card"><h3 class="down">Más bajaron</h3>${moverRows(movers.down, 'down')}</div>`;

  wireMonthBar(root);
  root.querySelector('#prod')?.addEventListener('change', (e) => { sel.productId = e.target.value; render(root); });
  root.querySelectorAll('[data-basis]').forEach((b) => b.addEventListener('click', () => { sel.basis = b.dataset.basis; render(root); }));
}
