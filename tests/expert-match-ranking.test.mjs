/* Why a PhD with no startup background beat a Startup specialist for "startup
   funding": one spurious exact-company signal ("NTU") collapsed the whole result
   set to that person. Plus two false-match sources feeding it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/expert-match.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

function load(fnName, extra = '') {
  const from = api.indexOf('function ' + fnName + '(');
  assert.ok(from > -1, fnName + ' must still exist');
  const to = api.indexOf('\n}\n', from) + 3;
  return new Function(extra + api.slice(from, to) + '\nreturn ' + fnName + ';')();
}

test('a match only narrows to one company when a company was actually asked for', () => {
  assert.match(api, /const askedAboutOrganisation = Array\.isArray\(intent\.organizations\) && intent\.organizations\.length > 0;/);
  assert.match(api, /const exactCompanyRanked = askedAboutOrganisation\s*\?\s*allRanked\.filter/,
    'without this one stray company hit discards every other consultant');
  // "someone from HFCL" must still narrow
  assert.match(api, /exactCompanyRanked\.length \? exactCompanyRanked : allRanked/);
});

test('a two-letter acronym no longer counts as a company', () => {
  assert.match(api, /if \(a\.length >= 3 && acronymAll\(company\) === a\) return true;/);
  assert.match(api, /if \(b\.length >= 3 && acronymAll\(query\) === b\) return true;/);
  assert.doesNotMatch(api, /if \(a\.length >= 2 && acronymAll/, 'two characters is what matched NTU');
});

test('short terms must land on a word boundary', () => {
  assert.match(api, /const inProfile = term\.length >= 4/);
  assert.match(api, /new RegExp\('\\\\b'/, '"ca" scored against "capital" and "career" before this');
});

test('typos are corrected, but only towards words the profiles actually use', () => {
  const within = load('editDistanceWithin');
  assert.equal(within('loigstics', 'logistics', 2), true);
  assert.equal(within('marketting', 'marketing', 2), true);
  assert.equal(within('logistics', 'logistics', 1), true);
  assert.equal(within('finance', 'logistics', 2), false, 'unrelated words must not be merged');

  const distanceSrc = api.slice(api.indexOf('function editDistanceWithin('),
                                api.indexOf('function profileVocabulary('));
  const correct = load('correctTerms', 'const STOP_WORDS=new Set();\n' + distanceSrc);
  const vocab = new Set(['logistics', 'warehousing', 'marketing', 'startup']);
  assert.ok(correct(['loigstics'], vocab).includes('logistics'));
  assert.ok(correct(['marketting'], vocab).includes('marketing'));
  // a term the profiles already use is never rewritten
  assert.deepEqual(correct(['startup'], vocab), ['startup']);
  // nothing close enough means nothing invented
  assert.deepEqual(correct(['zzzzzzzz'], vocab), ['zzzzzzzz']);
  // the original is always kept alongside any correction
  assert.ok(correct(['loigstics'], vocab).includes('loigstics'));
  assert.deepEqual(correct(['anything'], new Set()), ['anything'], 'no vocabulary, no changes');
});

test('closing the suggestions clears the filter they applied', () => {
  const fn = app.slice(app.indexOf('window.guidcyCloseExpertMatch=function()'),
                       app.indexOf('function consultantCard(c,whyHtml)'));
  assert.match(fn, /window\.browseFilters\.search=''/, 'the goal filter must be lifted');
  assert.match(fn, /box\.value=''/, 'and the search box emptied');
  assert.match(fn, /window\.applyFilters\(\)/, 'and the grid re-rendered with everyone');
  assert.doesNotMatch(fn, /browseFilters\s*=\s*\{\}/,
    "a category or price filter the reader set is theirs - only the search is reset");
});

/* A company signal is worth ~70 points, so a phantom one decides the ranking on
   its own: "NTU" scored as an exact employer for "startup funding" and put a PhD
   with no startup background above a Startup specialist. */
test('an employer only scores when the reader named one', () => {
  assert.match(api, /const organisationTerms = new Set\(/);
  assert.match(api, /if \(organisationTerms\.has\(term\) && companyMatches\(term, exp\.company_name\)\)/,
    'company points must come from an organisation the goal actually names');
  // the company path itself is untouched, so "someone from HFCL" still works
  assert.match(api, /addSignal\(signals, 'company'/);
});

/* specialty and category were never scored as fields. roleOf() prefers
   current_position, so an "Event Management consultant" listed as "CMO" earned 8
   points from a substring while other people took 42 for a role and 44 for an
   MBA - and never appeared for "event management" at all. */
test('what a consultant says they do is scored, not just their job title', () => {
  assert.match(api, /fieldMatchScore\(c\.specialty, term, 42, 24\)/,
    'the headline must weigh like a role, it is where the discipline is stated');
  assert.match(api, /fieldMatchScore\(c\.category, term, 34, 20\)/);
  assert.match(api, /addSignal\(signals, 'focus', c\.specialty/,
    'and it must be visible as a signal, so a bad rank can be explained');
});
