// Cálculos de compras y comparaciones. Funciones puras: no tocan la red ni el DOM.
//
// Modelo de entrada (filas tal como vienen de la base):
//   purchase = { id, product_id, purchased_on:'YYYY-MM-DD', quantity, unit_price, subtotal?,
//                product_name, presentation, base_unit, base_qty, store_id, created_at }
// Cada compra lleva una "foto" de la presentación vigente cuando se compró, por eso los
// cambios posteriores al producto nunca alteran el histórico ni las comparaciones.

export const ym = (year, month) => year * 12 + (month - 1);          // índice lineal de mes
export const fromYm = (i) => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
export const prevMonth = (year, month) => fromYm(ym(year, month) - 1);
export const nextMonth = (year, month) => fromYm(ym(year, month) + 1);
export const monthOf = (isoDate) => ({ year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) });

/** Redondeo a centavos igual que PostgreSQL (mitad hacia afuera), sin errores de coma flotante. */
export function round2(n) {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}

/** cantidad × precio, con la misma aritmética que la columna `subtotal` de la base. */
export function subtotal(quantity, unitPrice) {
  const qMilli = Math.round(Number(quantity) * 1000);
  const pCents = Math.round(Number(unitPrice) * 100);
  return Math.round((qMilli * pCents) / 1000) / 100;
}

/** Precio por unidad base (kg, l o unidad suelta): $1.200 por pack de 4 → $300 por unidad. */
export function pricePerBase(price, baseQty) {
  return Number(baseQty) > 0 ? Number(price) / Number(baseQty) : null;
}

/** Variación entre un precio anterior y uno actual. */
export function variation(prev, cur) {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return { diff: null, pct: null, dir: null };
  const diff = round2(cur - prev);
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 10000) / 100 : null;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
  return { diff, pct, dir };
}

const presKey = (r) => `${r.presentation}|${r.base_unit}|${Number(r.base_qty)}`.toLowerCase();
const monthKey = (year, month) => ym(year, month);

/**
 * Índice de precios: product_id → (mes lineal → registro). El precio de un mes es el de la
 * ÚLTIMA compra de ese mes (por fecha y luego por orden de carga).
 */
export function buildPriceIndex(purchases) {
  const idx = new Map();
  const sorted = [...purchases].sort((a, b) =>
    a.purchased_on === b.purchased_on ? String(a.created_at).localeCompare(String(b.created_at)) : a.purchased_on.localeCompare(b.purchased_on));
  for (const p of sorted) {
    const { year, month } = monthOf(p.purchased_on);
    const k = monthKey(year, month);
    if (!idx.has(p.product_id)) idx.set(p.product_id, new Map());
    idx.get(p.product_id).set(k, {
      key: k, year, month, price: Number(p.unit_price), date: p.purchased_on,
      presentation: p.presentation, base_unit: p.base_unit, base_qty: Number(p.base_qty),
    });
  }
  return idx;
}

/** Último registro de un producto en un mes anterior al indicado (o null). */
export function lastKnownBefore(idx, productId, year, month) {
  const months = idx.get(productId);
  if (!months) return null;
  const limit = ym(year, month);
  let best = null;
  for (const [k, rec] of months) if (k < limit && (!best || k > best.key)) best = rec;
  return best;
}

/**
 * Comparación de un producto en un mes.
 * status:
 *   'comparado'        compró este mes y hay registro anterior comparable
 *   'sin_anterior'     compró este mes, pero nunca antes → "Sin registro anterior"
 *   'sin_compra_mes'   no compró este mes: se muestra el último precio conocido con su mes
 *   'sin_registros'    nunca se compró
 *   'no_comparable'    cambió la unidad base (kg ↔ unidad, etc.): no se puede comparar
 * `normalized` = true cuando cambió la presentación y se comparó por kg/l/unidad.
 */
export function compareProduct(idx, productId, year, month) {
  const months = idx.get(productId);
  const cur = months?.get(monthKey(year, month)) ?? null;
  const ref = lastKnownBefore(idx, productId, year, month);
  const pm = prevMonth(year, month);
  const refIsPrevMonth = !!ref && ref.key === ym(pm.year, pm.month);
  const base = { current: cur, reference: ref, refIsPrevMonth, normalized: false, diff: null, pct: null, dir: null };

  if (!cur && !ref) return { ...base, status: 'sin_registros' };
  if (!cur) return { ...base, status: 'sin_compra_mes' };
  if (!ref) return { ...base, status: 'sin_anterior' };

  if (cur.base_unit !== ref.base_unit) return { ...base, status: 'no_comparable' };
  if (presKey(cur) === presKey(ref)) return { ...base, status: 'comparado', ...variation(ref.price, cur.price) };

  const v = variation(pricePerBase(ref.price, ref.base_qty), pricePerBase(cur.price, cur.base_qty));
  return { ...base, status: 'comparado', normalized: true, ...v, diff: v.diff === null ? null : Math.round(v.diff * 100) / 100 };
}

/** Resumen de un mes: totales, por comercio y por producto. */
export function monthSummary(purchases, year, month) {
  const rows = purchases.filter((p) => { const m = monthOf(p.purchased_on); return m.year === year && m.month === month; });
  const byStore = new Map(), byProduct = new Map();
  let totalCents = 0;
  for (const r of rows) {
    const st = subtotal(r.quantity, r.unit_price), cents = Math.round(st * 100);
    totalCents += cents;
    const s = byStore.get(r.store_id) ?? { store_id: r.store_id, cents: 0, lines: 0 };
    s.cents += cents; s.lines += 1; byStore.set(r.store_id, s);
    const p = byProduct.get(r.product_id) ?? {
      product_id: r.product_id, name: r.product_name, presentation: r.presentation, base_unit: r.base_unit,
      store_id: r.store_id, quantity: 0, cents: 0, lines: 0,
    };
    p.quantity = Math.round((p.quantity + Number(r.quantity)) * 1000) / 1000; p.cents += cents; p.lines += 1;
    byProduct.set(r.product_id, p);
  }
  const fin = (o) => ({ ...o, total: o.cents / 100 });
  return {
    year, month, total: totalCents / 100, lines: rows.length, distinctProducts: byProduct.size,
    byStore: [...byStore.values()].map(fin), byProduct: [...byProduct.values()].map(fin), rows,
  };
}

/** Compara el gasto total de dos meses. */
export function compareTotals(curTotal, prevTotal, prevExists = true) {
  if (!prevExists) return { diff: null, pct: null, dir: null };
  return variation(prevTotal, curTotal);
}

/** Productos que más subieron / bajaron en el mes (solo comparaciones válidas). */
export function biggestMovers(products, idx, year, month, limit = 5) {
  const rows = products.map((p) => ({ product: p, cmp: compareProduct(idx, p.id, year, month) }))
    .filter((r) => r.cmp.status === 'comparado' && r.cmp.pct !== null && r.cmp.dir !== 'same');
  const up = rows.filter((r) => r.cmp.dir === 'up').sort((a, b) => b.cmp.pct - a.cmp.pct).slice(0, limit);
  const down = rows.filter((r) => r.cmp.dir === 'down').sort((a, b) => a.cmp.pct - b.cmp.pct).slice(0, limit);
  return { up, down };
}

/** Validación del formulario de compra (espejo de las reglas de la base). */
export function validatePurchase({ quantity, price, date }, today = new Date()) {
  const errors = {};
  if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = 'Ingresá una cantidad mayor que 0.';
  else if (quantity > 100000) errors.quantity = 'La cantidad es demasiado grande.';
  else if (Math.round(quantity * 1000) / 1000 !== quantity) errors.quantity = 'Usá hasta 3 decimales.';
  if (!Number.isFinite(price) || price <= 0) errors.price = 'Ingresá un precio mayor que 0.';
  else if (price > 100000000) errors.price = 'El precio es demasiado grande.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) errors.date = 'Elegí una fecha válida.';
  else {
    const t = new Date(date + 'T00:00:00'); const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (Number.isNaN(t.getTime())) errors.date = 'Elegí una fecha válida.';
    else if (t > limit) errors.date = 'La fecha no puede ser futura.';
    else if (t.getFullYear() < 2000) errors.date = 'La fecha es demasiado antigua.';
  }
  return errors;
}

/** Evolución mensual de un producto (para gráficos): [{year, month, price, perBase}] ordenado. */
export function priceSeries(idx, productId) {
  const months = idx.get(productId);
  if (!months) return [];
  return [...months.values()].sort((a, b) => a.key - b.key)
    .map((r) => ({ year: r.year, month: r.month, price: r.price, perBase: pricePerBase(r.price, r.base_qty), presentation: r.presentation, base_unit: r.base_unit }));
}

/** Gasto total por mes (con desglose por comercio) para los últimos `n` meses terminando en year/month. */
export function monthlyTotals(purchases, year, month, n = 12) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const { year: y, month: m } = fromYm(ym(year, month) - i);
    const s = monthSummary(purchases, y, m);
    out.push({ year: y, month: m, total: s.total, byStore: s.byStore });
  }
  return out;
}

/**
 * Compara el precio de un producto entre dos meses cualquiera (A = base, B = nuevo).
 * Devuelve null si falta alguno de los dos registros. Si cambió la presentación, normaliza por unidad base.
 */
export function compareMonths(idx, productId, a, b) {
  const months = idx.get(productId);
  const ra = months?.get(ym(a.year, a.month)) ?? null, rb = months?.get(ym(b.year, b.month)) ?? null;
  const base = { a: ra, b: rb, normalized: false, diff: null, pct: null, dir: null, status: 'ok' };
  if (!ra || !rb) return { ...base, status: 'falta_registro' };
  if (ra.base_unit !== rb.base_unit) return { ...base, status: 'no_comparable' };
  if (presKey(ra) === presKey(rb)) return { ...base, ...variation(ra.price, rb.price) };
  const v = variation(pricePerBase(ra.price, ra.base_qty), pricePerBase(rb.price, rb.base_qty));
  return { ...base, normalized: true, ...v };
}
