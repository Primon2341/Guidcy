/* The mobile dashboard drawer hides the Menu strip that opened it, so without a
   close button of its own the only way out is the sliver of overlay beside it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const controllers = fs.readFileSync(new URL('../assets/js/controllers.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');

/* Run the real helper against a stub side panel rather than pattern-matching it. */
const from = controllers.indexOf('function ensureDrawerCloseButton(');
assert.ok(from > 0, 'ensureDrawerCloseButton is missing from controllers.js');
const source = controllers.slice(from, controllers.indexOf('function openDashboardMenu(', from));

function run() {
  const closed = [];
  const ctx = vm.createContext({
    closeDashboardMenu: which => closed.push(which),
    document: {
      createElement: () => ({
        style: {}, attrs: {}, handlers: {},
        setAttribute(k, v) { this.attrs[k] = v },
        addEventListener(type, fn) { this.handlers[type] = fn },
      }),
    },
  });
  vm.runInContext(source, ctx);

  const children = [];
  const side = {
    children,
    querySelector: sel => children.find(c => c.className === sel.slice(1)) || null,
    insertBefore: (el) => { children.unshift(el) },
    firstChild: null,
  };
  ctx.ensureDrawerCloseButton(side, 'user');
  return { side, children, closed };
}

test('opening the drawer gives it a close button that closes it', () => {
  const { children, closed } = run();
  assert.equal(children.length, 1, 'no close button was added');
  const button = children[0];
  assert.equal(button.className, 'dash-side-close');
  assert.equal(button.attrs['aria-label'], 'Close menu');
  assert.equal(typeof button.handlers.click, 'function', 'the button is not wired to anything');

  button.handlers.click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(closed, ['user'], 'clicking it did not close the drawer');
});

test('re-opening the drawer does not stack a second close button', () => {
  const { side, children } = run();
  side.querySelector = sel => children.find(c => c.className === sel.slice(1)) || null;
  assert.equal(children.length, 1);
});

test('the close button only shows inside the mobile drawer', () => {
  const block = css.slice(css.indexOf('=== guidcy-dash-drawer-close ==='));
  assert.ok(block, 'the drawer close styles are missing');
  assert.match(block, /\.dash-side-close\{display:none\}/);
  assert.match(block, /@media\(max-width:900px\)/);
  assert.match(block, /#page-user-dash \.dash-side\.on \.dash-side-close[\s\S]*?display:flex!important/);
});
