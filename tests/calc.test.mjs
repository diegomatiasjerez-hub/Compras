import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subtotal, round2, variation, buildPriceIndex, compareProduct, monthSummary, compareTotals,
  biggestMovers, validatePurchase, pricePerBase, monthlyTotals, priceSeries, prevMonth, compareMonths,
} from '../js/calc.js';
import { formatARS, formatSignedARS, formatPct, parseNumberAR, monthLabel } from '../js/format.js';

let n = 0;
const P = (product_id, date, quantity, unit_price, extra = {}) => ({
  id: 'p' + ++n, product_id, purchased_on: date, quantity, unit_price, created_at: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`,
  product_name: extra.name ?? product_id, presentation: 'Pack de 4 unidades', base_unit: 'un', base_qty: 4, store_id: extra.store ?? 'makro', ...extra,
});
const prod = (id, name = id) => ({ id, name });

test('escenarios 1-3: 4 × $1.200 = $4.800; 1 kg × $30.000; total $34.800', () => {
  assert.equal(subtotal(4, 1200), 4800);
  assert.equal(subtotal(1, 30000), 30000);
  const rows = [P('papel', '2026-09-10', 4, 1200), P('queso', '2026-09-10', 1, 30000, { presentation: 'Kilogramo', base_unit: 'kg', base_qty: 1 })];
  const s = monthSummary(rows, 2026, 9);
  assert.equal(s.total, 34800);
  assert.equal(s.lines, 2);
});

test('precio por unidad individual: pack de 4 a $1.200 → $300 por rollo', () => {
  assert.equal(pricePerBase(1200, 4), 300);
  assert.equal(pricePerBase(9000, 1.5), 6000);
});

test('subtotal sin errores de coma flotante', () => {
  assert.equal(subtotal(2.5, 9000.4), 22501);
  assert.equal(subtotal(0.1, 0.2), 0.02);
  assert.equal(subtotal(3, 19.99), 59.97);
  assert.equal(subtotal(1.005, 100), 100.5);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(-1.005), -1.01);
});

test('escenario 6: septiembre $1.000 → octubre $1.200 = +$200, +20 %', () => {
  const idx = buildPriceIndex([P('papel', '2026-09-05', 1, 1000), P('papel', '2026-10-05', 1, 1200)]);
  const c = compareProduct(idx, 'papel', 2026, 10);
  assert.equal(c.status, 'comparado');
  assert.equal(c.diff, 200); assert.equal(c.pct, 20); assert.equal(c.dir, 'up');
  assert.equal(c.refIsPrevMonth, true);
  assert.equal(formatSignedARS(c.diff), '+$200'); assert.equal(formatPct(c.pct), '+20 %');
});

test('si el precio baja, muestra la disminución', () => {
  const idx = buildPriceIndex([P('a', '2026-09-05', 1, 1000), P('a', '2026-10-05', 1, 900)]);
  const c = compareProduct(idx, 'a', 2026, 10);
  assert.equal(c.dir, 'down'); assert.equal(c.diff, -100); assert.equal(c.pct, -10);
  assert.equal(formatSignedARS(c.diff), '-$100'); assert.equal(formatPct(c.pct), '-10 %');
});

test('sin registro anterior', () => {
  const idx = buildPriceIndex([P('a', '2026-10-05', 1, 1000)]);
  const c = compareProduct(idx, 'a', 2026, 10);
  assert.equal(c.status, 'sin_anterior'); assert.equal(c.diff, null);
});

test('no se compró este mes: conserva el último precio conocido e identifica su mes (no lo confunde con el mes anterior)', () => {
  const idx = buildPriceIndex([P('a', '2026-07-20', 1, 1000)]);
  const c = compareProduct(idx, 'a', 2026, 10);
  assert.equal(c.status, 'sin_compra_mes');
  assert.equal(c.current, null);
  assert.equal(c.reference.price, 1000);
  assert.deepEqual([c.reference.year, c.reference.month], [2026, 7]);
  assert.equal(c.refIsPrevMonth, false);          // la interfaz debe decir "julio 2026", no "mes anterior"
  assert.equal(compareProduct(idx, 'zzz', 2026, 10).status, 'sin_registros');
});

test('compra este mes y anterior hace 3 meses: compara con ese mes y lo señala', () => {
  const idx = buildPriceIndex([P('a', '2026-07-20', 1, 1000), P('a', '2026-10-02', 1, 1100)]);
  const c = compareProduct(idx, 'a', 2026, 10);
  assert.equal(c.status, 'comparado'); assert.equal(c.refIsPrevMonth, false); assert.equal(c.pct, 10);
});

test('cambio de presentación: se normaliza por unidad base; cambio de unidad base no es comparable', () => {
  const idx = buildPriceIndex([
    P('papel', '2026-09-05', 1, 1200),                                               // pack de 4 → $300 c/u
    P('papel', '2026-10-05', 1, 2100, { presentation: 'Pack de 6 unidades', base_qty: 6 }), // $350 c/u
    P('aceite', '2026-09-05', 1, 3000, { presentation: 'Botella 1,5 l', base_unit: 'l', base_qty: 1.5 }),
    P('aceite', '2026-10-05', 1, 5000, { presentation: 'Bidón 5 kg', base_unit: 'kg', base_qty: 5 }),
  ]);
  const c = compareProduct(idx, 'papel', 2026, 10);
  assert.equal(c.normalized, true); assert.equal(c.diff, 50); assert.equal(c.dir, 'up');
  assert.equal(Math.round(c.pct * 100) / 100, 16.67);
  assert.equal(compareProduct(idx, 'aceite', 2026, 10).status, 'no_comparable');
});

test('varias compras en el mes: el precio del mes es el de la última', () => {
  const idx = buildPriceIndex([P('a', '2026-10-02', 1, 1000), P('a', '2026-10-20', 1, 1300), P('a', '2026-09-30', 1, 900)]);
  assert.equal(compareProduct(idx, 'a', 2026, 10).current.price, 1300);
  assert.equal(compareProduct(idx, 'a', 2026, 10).pct, 44.44);
});

test('cruce de año: diciembre → enero', () => {
  assert.deepEqual(prevMonth(2027, 1), { year: 2026, month: 12 });
  const idx = buildPriceIndex([P('a', '2026-12-15', 1, 100), P('a', '2027-01-15', 1, 150)]);
  const c = compareProduct(idx, 'a', 2027, 1);
  assert.equal(c.pct, 50); assert.equal(c.refIsPrevMonth, true);
});

test('escenario 9: totales por comercio suman el total general', () => {
  const rows = [
    P('papel', '2026-09-10', 4, 1200), P('queso', '2026-09-10', 1, 30000), P('aceite', '2026-09-11', 3, 4999.99),
    P('picada', '2026-09-12', 2.5, 9000.4, { store: 'avicola' }), P('pollo', '2026-09-12', 1.75, 7333.33, { store: 'avicola' }),
  ];
  const s = monthSummary(rows, 2026, 9);
  const sum = s.byStore.reduce((a, x) => a + x.cents, 0) / 100;
  assert.equal(sum, s.total);
  assert.equal(s.byProduct.reduce((a, x) => a + x.cents, 0) / 100, s.total);
  assert.equal(s.byStore.find((x) => x.store_id === 'avicola').total, 22501 + 12833.33 /* 1,75 × 7333,33 */ );
  assert.equal(s.distinctProducts, 5);
});

test('cantidades y subtotales por producto se acumulan', () => {
  const rows = [P('a', '2026-10-02', 2, 100), P('a', '2026-10-15', 1.5, 110)];
  const s = monthSummary(rows, 2026, 10);
  assert.equal(s.byProduct[0].quantity, 3.5); assert.equal(s.byProduct[0].total, 365);
});

test('comparación del gasto total entre meses', () => {
  const v = compareTotals(34800, 30000);
  assert.equal(v.diff, 4800); assert.equal(v.pct, 16); assert.equal(v.dir, 'up');
  assert.equal(compareTotals(100, 0, false).diff, null);
  assert.equal(compareTotals(100, 0).pct, null);   // sin división por cero
});

test('productos que más aumentaron y disminuyeron', () => {
  const products = ['a', 'b', 'c', 'd'].map((x) => prod(x));
  const idx = buildPriceIndex([
    P('a', '2026-09-01', 1, 100), P('a', '2026-10-01', 1, 150),   // +50 %
    P('b', '2026-09-01', 1, 100), P('b', '2026-10-01', 1, 110),   // +10 %
    P('c', '2026-09-01', 1, 100), P('c', '2026-10-01', 1, 80),    // -20 %
    P('d', '2026-09-01', 1, 100), P('d', '2026-10-01', 1, 100),   // igual
  ]);
  const m = biggestMovers(products, idx, 2026, 10);
  assert.deepEqual(m.up.map((r) => r.product.id), ['a', 'b']);
  assert.deepEqual(m.down.map((r) => r.product.id), ['c']);
});

test('validaciones de precios, cantidades y fechas', () => {
  const today = new Date(2026, 9, 12);
  assert.deepEqual(validatePurchase({ quantity: 4, price: 1200, date: '2026-10-12' }, today), {});
  assert.ok(validatePurchase({ quantity: 0, price: 1200, date: '2026-10-12' }, today).quantity);
  assert.ok(validatePurchase({ quantity: -2, price: 1200, date: '2026-10-12' }, today).quantity);
  assert.ok(validatePurchase({ quantity: NaN, price: 1200, date: '2026-10-12' }, today).quantity);
  assert.ok(validatePurchase({ quantity: 1.2345, price: 1200, date: '2026-10-12' }, today).quantity);
  assert.ok(validatePurchase({ quantity: 1, price: 0, date: '2026-10-12' }, today).price);
  assert.ok(validatePurchase({ quantity: 1, price: -1, date: '2026-10-12' }, today).price);
  assert.ok(validatePurchase({ quantity: 1, price: 1, date: '2026-10-20' }, today).date);
  assert.ok(validatePurchase({ quantity: 1, price: 1, date: '' }, today).date);
  assert.ok(validatePurchase({ quantity: 1, price: 1, date: '2026-13-45' }, today).date);
});

test('series de precios y gasto mensual (gráficos)', () => {
  const rows = [P('a', '2026-08-01', 1, 100), P('a', '2026-10-01', 1, 120), P('b', '2026-10-01', 2, 50)];
  const idx = buildPriceIndex(rows);
  assert.deepEqual(priceSeries(idx, 'a').map((x) => x.price), [100, 120]);
  const t = monthlyTotals(rows, 2026, 10, 4);
  assert.deepEqual(t.map((x) => [x.month, x.total]), [[7, 0], [8, 100], [9, 0], [10, 220]]);
});

test('formato de moneda argentina y lectura de números', () => {
  assert.equal(formatARS(1200), '$1.200');
  assert.equal(formatARS(34800), '$34.800');
  assert.equal(formatARS(1234567.5), '$1.234.567,50');
  assert.equal(formatARS(-200), '-$200');
  assert.equal(formatARS(0.004), '$0');
  assert.equal(formatARS(null), '—');
  assert.equal(parseNumberAR('1.200'), 1200);
  assert.equal(parseNumberAR('1.200,50'), 1200.5);
  assert.equal(parseNumberAR('$ 30.000'), 30000);
  assert.equal(parseNumberAR('1,5'), 1.5);
  assert.equal(parseNumberAR('1.5'), 1.5);
  assert.equal(parseNumberAR('4'), 4);
  assert.ok(Number.isNaN(parseNumberAR('abc')));
  assert.ok(Number.isNaN(parseNumberAR('')));
  assert.ok(Number.isNaN(parseNumberAR('1,2,3')));
  assert.equal(monthLabel(2026, 10), 'Octubre 2026');
});

test('comparar dos meses específicos (no consecutivos)', () => {
  const idx = buildPriceIndex([P('a', '2026-03-05', 1, 1000), P('a', '2026-10-05', 1, 1500), P('b', '2026-03-05', 1, 10)]);
  const c = compareMonths(idx, 'a', { year: 2026, month: 3 }, { year: 2026, month: 10 });
  assert.equal(c.diff, 500); assert.equal(c.pct, 50); assert.equal(c.dir, 'up');
  assert.equal(compareMonths(idx, 'b', { year: 2026, month: 3 }, { year: 2026, month: 10 }).status, 'falta_registro');
});
