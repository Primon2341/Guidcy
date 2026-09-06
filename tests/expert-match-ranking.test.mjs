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

test('no weighted score decides who is shown or in what order', () => {
  assert.doesNotMatch(api, /exactCompanyRanked/,
    'the company collapse is gone - one stray signal must not discard everyone else');
  const block = api.slice(api.indexOf('const ranked = consultants'), api.indexOf('.slice(0, form.limit);'));
  assert.doesNotMatch(block, /\.score/, 'the consultant ordering must not read a score at all');
  assert.match(block, /if \(a\.tier !== b\.tier\) return a\.tier - b\.tier;/,
    'relevance picks the bucket, rating only orders within it');
  assert.doesNotMatch(api, /score: Math\.round\(match\.score\)/,
    'no score is handed downstream, so nothing can re-sort by it');
  assert.match(api, /\.filter\(item => \(item\.signals \|\| \[\]\)\.length > 0\)/,
    'a consultant is shown when their own profile matches, full stop');
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

test('the order is the rating, then reviews, then a stable tiebreak', () => {
  const from = api.indexOf('const ranked = consultants');
  const to = api.indexOf('.slice(0, form.limit);', from);
  assert.ok(from > -1 && to > from, 'the ordering block must still be there');
  const block = api.slice(from, to);

  const body = block.slice(block.indexOf('.sort((a, b) => {') + '.sort('.length, block.lastIndexOf('})') + 1);
  const sort = new Function('ratingOf', 'reviewsOf', 'return ' + body + ';')(
    c => Number(c.rating || c.average_rating || 0) || 0,
    c => Number(c.reviews || c.review_count || 0) || 0,
  );
  const row = (name, rating, reviews) => ({ consultant: { name, rating, reviews } });

  const list = [row('Zoe', 3.5, 2), row('Amy', 4.9, 1), row('Bob', 4.9, 40), row('Cal', 0, 0)];
  const order = list.slice().sort(sort).map(x => x.consultant.name);
  assert.deepEqual(order, ['Bob', 'Amy', 'Zoe', 'Cal'],
    'highest rating first; equal ratings settled by review count');

  // unrated consultants must not shuffle between identical requests
  const unrated = [row('Dave', 0, 0), row('Carol', 0, 0), row('Ed', 0, 0)];
  assert.deepEqual(unrated.slice().sort(sort).map(x => x.consultant.name), ['Carol', 'Dave', 'Ed']);
  assert.deepEqual(unrated.slice().reverse().sort(sort).map(x => x.consultant.name), ['Carol', 'Dave', 'Ed']);
});

test('the browser fallback orders the same way, so the two cannot disagree', () => {
  const fn = app.slice(app.indexOf('function rank(cons,d){'), app.indexOf('function reasonFor(item,d)'));
  assert.match(fn, /if\(rb!==ra\)return rb-ra;/, 'rating first');
  assert.match(fn, /if\(vb!==va\)return vb-va;/, 'then reviews');
  assert.doesNotMatch(fn, /sort\(function\(a,b\)\{return b\.score-a\.score\}\)/,
    'the fallback must not rank by points while the server ranks by rating');
});

/* Ordering by rating alone put an alphabetical list in front of the reader,
   because not one consultant has a rating yet - and it left an "Event Management
   consultant" off the results for "event management". Relevance now picks the
   bucket and the rating orders within it. */
test('what a consultant says they do outranks a passing mention', () => {
  const from = api.indexOf('const headline = cleanPhrase(');
  const to = api.indexOf('signals.sort((a, b) =>', from);
  assert.ok(from > -1 && to > from, 'the tier calculation must still be there');

  const tierOf = new Function('c', 'terms', 'signals', 'cleanPhrase', 'addSignal',
    api.slice(from, to) + '\nreturn tier;');
  const clean = v => String(v || '').toLowerCase().trim();
  const noop = () => {};

  const neelam = { specialty: 'Event Management consultant', category: 'Entertainment' };
  assert.equal(tierOf(neelam, ['event management'], [], clean, noop), 1,
    'her stated discipline is the strongest thing a profile can say');

  const roleHolder = { specialty: 'Director', category: 'Marketing' };
  assert.equal(tierOf(roleHolder, ['event management'], [{ type: 'role', exact: true }], clean, noop), 1);
  assert.equal(tierOf(roleHolder, ['event management'], [{ type: 'education', exact: false }], clean, noop), 2,
    'an MBA is a credential, not a statement of what you do');
  assert.equal(tierOf(roleHolder, ['event management'], [{ type: 'profile', exact: false }], clean, noop), 3,
    'a mention in the bio is the weakest evidence there is');
});

test('the tier is visible as a signal, so an order can be explained', () => {
  assert.match(api, /addSignal\(signals, 'focus', c\.specialty \|\| c\.category, 0, true\)/);
  assert.match(api, /addSignal\(signals, 'focus'[^)]*, 0, /,
    'it carries no weight - it marks the bucket, it does not score');
});

/* The intent step expands a goal generously - "event management" became
   logistics, budgeting, marketing, risk management, timeline creation - and
   those brush against nearly every profile. Combined with rating-only ordering
   that produced "everyone, alphabetically", which is why the same names showed
   up under every search. */
test('a bare mention only fills a thin list', () => {
  const from = api.indexOf('const strong = ranked.filter');
  const to = api.indexOf('const matches =', from);
  assert.ok(from > -1 && to > from, 'the relevance gate must still be there');
  const block = api.slice(from, to);

  const pick = new Function('ranked', block + '\nreturn relevant;');
  const t = tier => ({ tier });

  // enough real matches: the padding is dropped
  assert.deepEqual(pick([t(1), t(1), t(2), t(3), t(3)]).map(x => x.tier), [1, 1, 2],
    'weak mentions must not pad a good result with everybody else');
  // too few: a weak match beats an empty page
  assert.deepEqual(pick([t(1), t(3), t(3)]).map(x => x.tier), [1, 3, 3]);
  assert.deepEqual(pick([t(3)]).map(x => x.tier), [3], 'one weak match is better than nothing');
  assert.deepEqual(pick([]).map(x => x.tier), []);
});

test('the results sent out are the gated ones', () => {
  assert.match(api, /enrichReasons\(relevant, intent, form\)/,
    'gating the list and then sending the ungated one would be a silent no-op');
});
