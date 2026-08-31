import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

/* Pull ensureFreeConsultationControl out of its IIFE and run it against fake inputs,
   so the empty-vs-zero branch is actually executed rather than pattern-matched. */
function wire() {
  const start = source.indexOf('  function ensureFreeConsultationControl(){');
  assert.ok(start > 0, 'ensureFreeConsultationControl not found');
  const end = source.indexOf('\n  }\n', start) + 4;
  const rate = { value: '2000', disabled: false, attrs: {}, oninput: null,
    setAttribute(k, v) { this.attrs[k] = v }, focus() { this.focused = true },
    closest: () => null, parentElement: null };
  const box = { checked: false, onchange: null, dataset: {} };
  const ctx = vm.createContext({
    $: id => (id === 'cd-rate' ? rate : id === 'cd-free-consultation' ? box : null),
    txt: v => String(v == null ? '' : v).trim(),
    document: { createElement: () => ({ innerHTML: '' }) },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.rewire=ensureFreeConsultationControl;', ctx);
  ctx.rewire();
  return { rate, box, rewire: ctx.rewire };
}

test('clearing the price does not tick the free checkbox', () => {
  const { rate, box } = wire();
  rate.value = '';
  rate.oninput();
  assert.equal(box.checked, false, 'empty field must not mean free');
  assert.equal(rate.disabled, false, 'must stay editable while typing');
  rate.value = '1';
  rate.oninput();
  assert.equal(box.checked, false);
});

test('an explicit zero still ticks free, and a price unticks it', () => {
  const { rate, box } = wire();
  rate.value = '0';
  rate.oninput();
  assert.equal(box.checked, true);
  rate.value = '500';
  rate.oninput();
  assert.equal(box.checked, false);
});

test('unticking free clears the box instead of prefilling 2000', () => {
  const { rate, box } = wire();
  box.checked = true;
  box.onchange.call(box);
  assert.equal(rate.value, '0');
  box.checked = false;
  box.onchange.call(box);
  assert.equal(rate.value, '', 'must not resurrect the registration-time default');
});

test('saving a blank price is rejected rather than defaulting', () => {
  assert.match(source, /Enter a price, or tick "Offer this consultation for free"/);
});

test('the DOM-settled observer re-running mid-typing leaves the field alone', () => {
  const { rate, box, rewire } = wire();
  rate.value = '';           // consultant cleared it to type a new price
  rate.oninput();
  rewire();                  // a mutation elsewhere fires the maintenance pass
  rewire();
  assert.equal(box.checked, false, 'observer must not tick free on an empty field');
  assert.equal(rate.disabled, false, 'observer must not disable the field being typed in');
});

test('a fresh render still seeds free from a saved zero rate', () => {
  const { rate, box, rewire } = wire();
  rate.value = '0';
  box.dataset = {};          // new render = new checkbox element
  rewire();
  assert.equal(box.checked, true);
  assert.equal(rate.disabled, true);
});
