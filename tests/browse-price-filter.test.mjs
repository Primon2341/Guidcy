import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

/* Pull the real helper out of app.js rather than restating it here, so this
   fails if the shipped bounds logic changes. */
function loadBounds(){
  const start = source.indexOf('function guidcyPriceBounds(');
  assert.ok(start > 0, 'guidcyPriceBounds not found in app.js');
  const end = source.indexOf('\n}', start) + 2;
  const ctx = vm.createContext({});
  vm.runInContext(source.slice(start, end) + '\nguidcyPriceBounds', ctx);
  return vm.runInContext('guidcyPriceBounds', ctx);
}

const raw = loadBounds();
/* Spread back into this realm: vm objects carry the context's Object.prototype,
   which deepStrictEqual rejects even when every value matches. */
const bounds = (min, max) => ({ ...raw(min, max) });
const el = value => ({ value });

test('empty boxes admit every price', () => {
  assert.deepEqual(bounds(el(''), el('')), { minPrice: 0, maxPrice: 99999 });
  assert.deepEqual(bounds(null, null), { minPrice: 0, maxPrice: 99999 });
});

test('a max above the old 8000 slider ceiling is honoured', () => {
  assert.deepEqual(bounds(el(''), el('25000')), { minPrice: 0, maxPrice: 25000 });
});

test('either end alone bounds only that end', () => {
  assert.deepEqual(bounds(el('2000'), el('')), { minPrice: 2000, maxPrice: 99999 });
  assert.deepEqual(bounds(el('1000'), el('5000')), { minPrice: 1000, maxPrice: 5000 });
});

test('an out-of-order or junk max falls back to unbounded, never empty results', () => {
  assert.deepEqual(bounds(el('5000'), el('1')), { minPrice: 5000, maxPrice: 99999 });
  assert.deepEqual(bounds(el(''), el('abc')), { minPrice: 0, maxPrice: 99999 });
  assert.deepEqual(bounds(el('-500'), el('')), { minPrice: 0, maxPrice: 99999 });
});

test('the drag slider is gone from the markup', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('id="price-range"'), 'price-range slider still in index.html');
  assert.ok(html.includes('id="price-min"') && html.includes('id="price-max"'));
});
