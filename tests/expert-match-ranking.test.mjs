/* Expert match is a search, plainly: a word the reader typed has to appear in
   the profile, their filters narrow it, the rating orders it.
   This file replaces the tests for the scoring, the relevance tiers and the
   generous intent expansion - all removed, because every one of them decided
   something the reader had not asked for. The symptom was the same person
   turning up under every search. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/expert-match.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

/* Runs the real matcher, so these are behaviours rather than string checks. */
function matcher() {
  const grab = name => {
    const i = api.indexOf('function ' + name + '(');
    assert.ok(i > -1, name + ' must still exist');
    return api.slice(i, api.indexOf('\n}\n', i) + 3);
  };
  const prelude = [
    "const STOP_WORDS=new Set(['and','for','the','with','from','that','this','need','want','help','best','good','find','your','about']);",
    grab('norm'), grab('cleanPhrase'), grab('textOf'), grab('safeArray'), grab('maybeJson'),
    grab('educationEntries'), grab('experienceEntries'), grab('consultantText'), grab('priceOf'),
    grab('editDistanceWithin'), grab('profileVocabulary'), grab('correctTerms'),
    grab('goalTerms'), grab('profileHits'), grab('passesFilters'),
  ].join('\n');
  const m = new Function(prelude + '\nreturn {goalTerms,profileHits,passesFilters,profileVocabulary};')();
  const people = [
    { name: 'Neelam Saxena', specialty: 'Event Management consultant', category: 'Entertainment', bio: 'Events at F&L', price: 900, languages: ['English'] },
    { name: 'sagar sahu', specialty: 'Logistics Manager', category: 'E-Commerce', bio: 'warehousing and supply chain', price: 400, languages: ['Hindi', 'English'] },
    { name: 'Pranav Krishnan', specialty: 'Senior Analyst', category: 'Finance', bio: 'I help with business strategy and planning', price: 1500, languages: ['English'] },
  ];
  const vocab = m.profileVocabulary(people);
  return (goal, form = {}) => people
    .filter(p => m.profileHits(p, m.goalTerms({ goal }, vocab)).length && m.passesFilters(p, { goal, ...form }))
    .map(p => p.name);
}

test('a search returns the profiles that contain the word, and no one else', () => {
  const find = matcher();
  assert.deepEqual(find('event management'), ['Neelam Saxena']);
  assert.deepEqual(find('logistics'), ['sagar sahu']);
  assert.deepEqual(find('warehousing'), ['sagar sahu'], 'the bio counts as profile data');
  /* The whole point: a search nobody matches returns nobody, rather than
     everybody. This is what put the same face under every query. */
  assert.deepEqual(find('underwater basketry'), []);
});

test('a typo still finds the profile', () => {
  const find = matcher();
  assert.deepEqual(find('loigstics'), ['sagar sahu']);
});

test("the reader's filters narrow the result", () => {
  const find = matcher();
  assert.deepEqual(find('event management', { budget: '500' }), [], 'she is 900, over budget');
  assert.deepEqual(find('logistics', { budget: '500' }), ['sagar sahu']);
  assert.deepEqual(find('event management', { language: 'Hindi' }), [], 'she is listed in English only');
  assert.deepEqual(find('logistics', { language: 'Hindi' }), ['sagar sahu']);
  assert.deepEqual(find('logistics', {}), ['sagar sahu'], 'no filter set, no filtering');
});

test('nothing invents terms the reader did not type', () => {
  assert.doesNotMatch(api, /const intent = await inferIntent/,
    'the expansion turned "event management" into logistics and budgeting, which matched everybody');
  assert.doesNotMatch(api, /item\.tier/, 'relevance tiers are gone');
  assert.doesNotMatch(api, /scoreConsultant\(c, form, intent\)/, 'the weighted score is gone');
  assert.match(api, /const terms = goalTerms\(form, profileVocabulary\(consultants\)\);/);
  assert.match(api, /if \(!terms\.length\)/, 'an empty goal must return nothing, not everyone');
});

test('the order is the rating, then reviews, then a stable tiebreak', () => {
  const from = api.indexOf('const ranked = consultants');
  const to = api.indexOf('.slice(0, form.limit);', from);
  const block = api.slice(from, to);
  const body = block.slice(block.indexOf('.sort((a, b) => {') + '.sort('.length, block.lastIndexOf('})') + 1);
  const sort = new Function('ratingOf', 'reviewsOf', 'return ' + body + ';')(
    c => Number(c.rating || 0) || 0, c => Number(c.reviews || 0) || 0);
  const row = (name, rating, reviews) => ({ consultant: { name, rating, reviews } });
  const order = [row('Zoe', 3.5, 2), row('Amy', 4.9, 1), row('Bob', 4.9, 40), row('Cal', 0, 0)]
    .sort(sort).map(x => x.consultant.name);
  assert.deepEqual(order, ['Bob', 'Amy', 'Zoe', 'Cal']);
  const unrated = [row('Dave', 0, 0), row('Carol', 0, 0)];
  assert.deepEqual(unrated.slice().reverse().sort(sort).map(x => x.consultant.name), ['Carol', 'Dave']);
});

test('the filler row is gone', () => {
  assert.doesNotMatch(app, /Similar experts<\/div><div class="grid browse-grid"/,
    'it showed ranked.slice(4,8) - whoever came next, matched or not');
  assert.match(app, /var best=ranked\.slice\(0,8\);/);
});

test('the browser fallback orders the same way, so the two cannot disagree', () => {
  const fn = app.slice(app.indexOf('function rank(cons,d){'), app.indexOf('function reasonFor(item,d)'));
  assert.match(fn, /if\(rb!==ra\)return rb-ra;/);
  assert.match(fn, /if\(vb!==va\)return vb-va;/);
});

/* Same work, different wording: NPD is R&D, R&D reaches the PhD who runs the
   lab. Shown after the direct matches and clearly labelled, never mixed in and
   never used to fill an empty result. */
function related() {
  const groups = api.slice(api.indexOf('const RELATED_GROUPS'), api.indexOf('];', api.indexOf('const RELATED_GROUPS')) + 2);
  const fn = api.slice(api.indexOf('function relatedTerms('), api.indexOf('\n}\n', api.indexOf('function relatedTerms(')) + 3);
  return new Function(groups + '\n' + fn + '\nreturn relatedTerms;')();
}

test('related terms reach the same work under another name', () => {
  const reach = related();
  assert.ok(reach(['npd']).includes('r&d'), 'NPD is R&D');
  assert.ok(reach(['npd']).includes('process development'));
  assert.ok(reach(['research']).includes('phd'), 'research reaches the PhD');
  assert.ok(reach(['logistics']).includes('supply chain'));
  // and nothing at all for a search that means nothing here
  assert.deepEqual(reach(['underwater basketry']), []);
  // never echoes back what was typed - that is the direct search
  assert.ok(!reach(['logistics']).includes('logistics'));
});

test('related profiles are an addition, never a substitute', () => {
  assert.match(api, /const related = alsoTerms\.length \? consultants/);
  assert.match(api, /\.filter\(c => !shown\.has\(String\(c\.id\)\)\)/,
    'a direct match must not be repeated in the related row');
  assert.match(api, /\.slice\(0, 4\)/, 'a few, not a second full list');
  assert.match(api, /passesFilters\(item\.consultant, form\)/,
    "the reader's filters apply to these too");

  const fn = app.slice(app.indexOf('function relatedSection(){'), app.indexOf('function consultantCard(c,whyHtml){'));
  assert.match(fn, /if\(!list\.length\)return '';/);
  assert.match(fn, /Related expertise/);
  assert.match(fn, /Different wording, same work/, 'the reader must know why these are here');
});

test('a failed search shows no related row either', () => {
  // the browser only renders what the API returned, and the API returns none
  // when nothing matched - "here is somebody adjacent" is not an answer
  assert.match(app, /window\.__guidcyRelatedMatches=\[\];/,
    'the local fallback must clear it, or a stale row survives the next search');
});
