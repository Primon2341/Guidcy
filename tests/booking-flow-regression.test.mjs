import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const built = fs.readFileSync(new URL('../public/assets/js/app.js', import.meta.url), 'utf8');

test('deployable JavaScript is optimized from the current source', () => {
  assert.ok(built.length < source.length);
  assert.match(built, /__GUIDCY_FINAL_PAYMENT_PROMO_STATE_FIX__/);
  assert.match(built, /guidcy_booking_payment_context_v4/);
});

test('the pinned same-origin Supabase SDK loads without blocking the SPA', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const build = fs.readFileSync(new URL('../build-static.js', import.meta.url), 'utf8');
  // Same-origin and pinned, never the public CDN.
  assert.match(html, /<script defer src="\/assets\/vendor\/supabase\.js"><\/script>/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/);
  assert.match(build, /@supabase","supabase-js","dist","umd","supabase\.js/);
  assert.match(build, /pinned Supabase browser SDK/);
  // It must execute BEFORE app.js: app.js binds `sb` once at parse time and hundreds of
  // call sites use that binding directly, so loading this async left `sb` null and
  // silently broke booking and payment. Preload keeps the wait short without reordering.
  assert.ok(html.indexOf('/assets/vendor/supabase.js') < html.indexOf('/assets/js/app.js'),
    'the Supabase SDK must be parsed before app.js');
  assert.match(html, /<link rel="preload" as="script" href="\/assets\/vendor\/supabase\.js">/);
  assert.match(source, /function guidcyBindSupabaseClient\(\)/);
  // app.js stays deferred, and the careers module must tolerate a client that is not ready yet.
  assert.match(html, /<script defer src="\/assets\/js\/app\.js"><\/script>/);
  assert.match(source, /function sbcReady\(\)/);
  assert.match(source, /guidcyLoadScript\('\/assets\/vendor\/supabase\.js'\)/);
});

test('dashboard-to-public navigation remains inside the SPA', () => {
  assert.doesNotMatch(source, /if\(leavingDashboard\)\{location\.assign\(target\.url\);return\}/);
  assert.match(source, /All internal navigation remains in the SPA/);
});

test('booking restores auth before deciding that login is required', () => {
  assert.match(source, /async function restoreBookingSession\(\)/);
  assert.match(source, /if\(!isLoggedIn\(\)\)await restoreBookingSession\(\)/);
});

test('missing slot is handled before expired availability validation', () => {
  const start = source.indexOf('window.startBooking=function(){', source.indexOf('guidcy-final-payment-promo-state-fix'));
  const end = source.indexOf('if(!userNow())', start);
  const block = source.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.ok(block.indexOf("return 'missing_slot'") < block.indexOf("return 'expired_slot'"));
});

test('profile and payment context survive a browser refresh', () => {
  assert.match(source, /guidcy_last_consultant_id/);
  assert.match(source, /guidcyRestoreBookingContext/);
  assert.match(source, /guidcy_booking_payment_context_v4/);
  assert.match(source, /if\(!slotNow\(\)\|\|onLockedFlow\)set\('selSlot',snapshot\.timeSlot\)/);
  assert.match(source, /consultant:c\|\|null/);
  assert.match(source, /target\.url='\/consultant\/'\+encodeURIComponent\(consultantId\)/);
});

test('payment activation explicitly re-anchors the footer', () => {
  const start = source.indexOf('function showPaymentPage(s)');
  const end = source.indexOf('window.startBooking=function()', start);
  assert.match(source.slice(start, end), /guidcyPlaceFooterAfterPages/);
});

test('a consultant who books another consultant sees that booking too', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // One record, two perspectives: the booker is always user_id, the booked
  // consultant is always consultant_id. Nothing keys off the account's role.
  assert.match(source, /user_id:currentUser\.id,\s*consultant_id:consId/);
  // The consultant dashboard can now render the booker side, using the same
  // loader and cards as the user dashboard (so meet link, calendar, dispute
  // and cancel behave identically).
  assert.match(html, /data-dash-section="my-bookings" onclick="swCD\('my-bookings',this\)"/);
  assert.match(source, /String\(view\|\|''\)!=='my-bookings'\)return prevCD/);
  assert.match(source, /rows=await loadUserBookings\(\);\s*if\(Number\(window\.__guidcyCDMyBookingsId\)!==requestId\)return;/);
  assert.match(source, /\.eq\('user_id',uid\)\.order\('created_at'/);
  // Live repaint after a booking or cancellation must find the new tab.
  assert.match(source, /if\(txt\.includes\('my booking'\)\)return 'my-bookings';/);
  assert.match(source, /if\(t\.indexOf\('my booking'\)>-1\)return 'my-bookings';/);
  // Post-booking navigation and cancel refresh go to the booker's own
  // dashboard instead of hardcoding the user one.
  assert.match(source, /function guidcyRefreshMyBookings\(userView\)/);
  assert.doesNotMatch(source, /if\(role==='user'\)\s*swUD\('upcoming',null\)/);
  assert.doesNotMatch(source, /go\('user-dash'\);setTimeout\(function\(\)\{try\{swUD\('upcoming',null\)\}/);
});

test('both sides of a booking are woken by the same row change', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260829120000_bookings_realtime.sql', import.meta.url), 'utf8');
  // RLS still decides who receives what, so publishing the table widens
  // freshness, not visibility.
  assert.match(migration, /alter publication supabase_realtime add table public\.bookings/);
  assert.match(migration, /pg_publication_tables/);
  assert.match(source, /table:'bookings'\},refresh\)/);
  // The repaint re-reads from the database and does not re-broadcast: every
  // other tab holds its own subscription.
  assert.match(source, /guidcyForceBookingStatusRefresh\('realtime-booking',null,null,null,false\)/);
  // A missing channel must degrade to the old behaviour, never retry forever.
  assert.match(source, /failures>=MAX_FAILURES/);
  assert.match(source, /c\.realtime\.setAuth\(token\)/);
});
