/* The header Dashboard button is a toggle: the first click opens the role's
   dashboard, the second click on that same dashboard closes it by popping the
   history entry the first click pushed, so the reader lands back on whatever
   they were looking at. These are the two halves that must not drift. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/controllers.js', import.meta.url), 'utf8');
const start = source.indexOf('=== guidcy-dashboard-button-toggle ===');
assert.ok(start > 0, 'dashboard button toggle block is missing from controllers.js');
/* Slice from the IIFE itself: the marker sits inside its comment. */
const block = source.slice(source.indexOf('(function', start));

function mount({ currentPageId = 'page-home', width = 1200 } = {}) {
 const calls = { go: [], back: 0, scrolled: [], menus: [] };
 const state = { pageId: currentPageId };
 let menuOpen = false;
  let onClick = null;

 const doc = {
 getElementById() { return { querySelector() { return { classList: { contains() { return menuOpen; } } }; } }; },
    addEventListener(type, fn, capture) {
      if (type === 'click' && capture === true) onClick = fn;
    },
    querySelector(sel) {
      return sel === '.page.on' ? { id: state.pageId } : null;
    },
  };
 const win = {
 innerWidth: width,
 openDashMenu(role) { menuOpen = true; calls.menus.push(role); },
 guidcyCloseDashboardMenu() { menuOpen = false; calls.menus.push('close'); },
    scrollY: 0,
    go(page) { calls.go.push(page); state.pageId = 'page-' + page; },
    scrollTo(x, y) { calls.scrolled.push(y); },
  };
  const history = { back() { calls.back++; } };
  const timers = [];
  const setTimeout = (fn) => { timers.push(fn); return 0; };

  new Function('window', 'document', 'history', 'setTimeout', block)(win, doc, history, setTimeout);
  assert.ok(onClick, 'the toggle never registered its click listener');

  return {
    calls, state, win,
    flushTimers: () => { while (timers.length) timers.shift()(); },
    clickDashboard(route = 'user-dash') {
      const button = { getAttribute: () => `go('${route}')` };
      let defaultPrevented = false;
      onClick({
        target: { closest: (sel) => (sel === '#guidcy-dashboard-btn' ? button : null) },
        preventDefault() { defaultPrevented = true; },
        stopImmediatePropagation() {},
      });
      return defaultPrevented;
    },
    clickElsewhere() {
      onClick({ target: { closest: () => null }, preventDefault() { assert.fail('unrelated click was hijacked'); }, stopImmediatePropagation() {} });
    },
    /* The suite that slices app.js invokes every registered listener with no
       arguments; the same must not throw here. */
    clickWithNoEvent() { onClick(); },
  };
}

test('first click opens the dashboard, second click pops the entry it pushed', () => {
  const ui = mount({ currentPageId: 'page-browse' });
  ui.win.scrollY = 420;

  assert.equal(ui.clickDashboard(), true, 'the button click must be handled here, not by its inline go()');
  assert.deepEqual(ui.calls.go, ['user-dash']);
  assert.equal(ui.calls.back, 0);

  ui.clickDashboard();
  assert.equal(ui.calls.back, 1, 'closing must be a Back, not a second navigation');
  assert.deepEqual(ui.calls.go, ['user-dash'], 'closing must not push another history entry');

  ui.flushTimers();
  assert.deepEqual(ui.calls.scrolled, [420], 'the previous page comes back where it was left');
});

test('mobile toggles the existing role menu without navigation', () => {
 for (const width of [320, 375, 390, 430, 900]) {
 for (const role of ['user', 'cons', 'admin']) {
 for (const currentPageId of ['page-browse', 'page-'+role+'-dash']) {
 const ui = mount({ width, currentPageId });
 ui.clickDashboard(role+'-dash');
 ui.clickDashboard(role+'-dash');
 assert.deepEqual(ui.calls.menus, [role, 'close']);
 assert.deepEqual(ui.calls.go, []);
 assert.equal(ui.calls.back, 0);
 assert.equal(ui.state.pageId, currentPageId);
 }
 }
 }
});

test('a dashboard opened any other way still just navigates', () => {
  const ui = mount({ currentPageId: 'page-user-dash' });
  ui.clickDashboard();
  assert.equal(ui.calls.back, 0, 'a deep-linked dashboard must never back out of the site');
  assert.deepEqual(ui.calls.go, ['user-dash']);
});

test('it works for every role and ignores anything else', () => {
  for (const route of ['user-dash', 'cons-dash', 'admin-dash']) {
    const ui = mount({ currentPageId: 'page-home' });
    ui.clickDashboard(route);
    ui.clickDashboard(route);
    assert.equal(ui.calls.back, 1, `${route} does not toggle`);
  }
  const ui = mount();
  ui.clickDashboard('marketplace');
  assert.deepEqual(ui.calls.go, [], 'only dashboard routes are toggled');
  ui.clickElsewhere();
  ui.clickWithNoEvent();
});
