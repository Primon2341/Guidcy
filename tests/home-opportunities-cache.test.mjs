import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const built = fs.readFileSync(new URL('../public/assets/js/app.js', import.meta.url), 'utf8');

const getDaily = source.slice(source.indexOf('async function getDaily('));
const body = getDaily.slice(0, getDaily.indexOf('\n  }') + 4);

test('a failed opportunities fetch is never written to the 24h cache', () => {
  // Caching [] used to pin the "cache is empty" panel for a full TTL.
  assert.match(body, /if\(items\.length\)await writeShared\(k,items\)/);
  assert.doesNotMatch(body, /\n\s*await writeShared\(k,items\);/);
  assert.match(built, /if\(\w+\.length\)await \w+\(\w+,\w+\)/);
});

test('an already-empty cache row is treated as a miss, not as fresh', () => {
  assert.match(body, /if\(cached&&cached\.items&&cached\.items\.length\)return cached/);
  assert.doesNotMatch(body, /if\(cached\)return cached/);
});
