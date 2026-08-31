/* Regression: searching an expert by name returned unrelated experts.
   'ip' (a legal synonym) matched inside "Tripathi"/"leadership"/"partnerships",
   so canon('sandiip') became 'legal' and bio noise (+15) outranked the name (+5). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not locate ${from} .. ${to}`);
  return src.slice(a, b + to.length);
};

const ctx = vm.createContext({ window: {} });
vm.runInContext(
  'const low=v=>String(v==null?"":v).toLowerCase().trim();' +
  'const arr=v=>Array.isArray(v)?v:(v==null||v===""?[]:String(v).split(/[,|;]+/).map(x=>x.trim()).filter(Boolean));' +
  slice('const CATEGORY_SYNONYMS=', 'function canon(q){q=low(q); for(const [k,vals] of Object.entries(CATEGORY_SYNONYMS)){ if(k===q||vals.some(v=>v===q||hasWord(q,v)||(q.length>=3&&hasWord(v,q)))) return k; } return q; }') +
  slice('function includesAny(', 'hasWord(text,t));}') +
  slice('function guidcyFlatText(v,d){', 'c.highest_education,c.college]);\n}') +
  slice('function consultantScore(c,query)', 'window.guidcyConsultantScore=consultantScore;'),
  ctx);
const { canon, includesAny, consultantScore } = ctx;

test('two-letter synonyms no longer match inside ordinary words', () => {
  assert.notEqual(canon('sandiip'), 'legal');
  assert.equal(includesAny('Seasoned leadership and partnerships expert', ['ip']), false);
  assert.equal(includesAny('Prakhar Tripathi', ['ip']), false);
  assert.equal(includesAny('email marketing', ['ai']), false);
  assert.equal(includesAny('luxury goods', ['ux']), false);
});

test('real category terms still canonicalise, including partial typing', () => {
  assert.equal(canon('market'), 'marketing');
  assert.equal(canon('marketing'), 'marketing');
  assert.equal(canon('legal'), 'legal');
  assert.equal(canon('ip law'), 'legal');
  assert.equal(includesAny('IP litigation and contracts', ['ip']), true);
});

test('exact name search ranks that person above incidental bio mentions', () => {
  const target = { name: 'Sandiip Kothaari', category: 'Finance', bio: 'Wealth advisor.' };
  const noise  = { name: 'Prakhar Tripathi', category: 'Technology', bio: 'Leadership and partnerships.' };
  assert.ok(consultantScore(target, 'Sandiip') > consultantScore(noise, 'Sandiip'));
  assert.equal(consultantScore(noise, 'Sandiip'), 0);   // no longer leaks into results
});

test('typos still find the expert, as a fallback below exact matches', () => {
  const marketer = { name: 'Riya Sharma', category: 'Marketing', bio: 'Brand strategy.' };
  const exact    = { name: 'Riya Sharma', category: 'Marketing', bio: 'Brand strategy.' };
  assert.ok(consultantScore(marketer, 'marketng') > 0, 'misspelled category should still match');
  assert.ok(consultantScore({ name: 'Sandiip Kothaari' }, 'sandeep') > 0, 'misspelled name should still match');
  assert.ok(consultantScore(exact, 'marketing') > consultantScore(marketer, 'marketng'),
    'exact spelling must still outrank a typo');
  assert.equal(consultantScore({ name: 'Ankur Chopra', bio: 'Leadership.' }, 'marketng'), 0,
    'fuzzy must not resurrect unrelated experts');
});

test('deleting the query clears the filter instead of reusing the last one', () => {
  assert.ok(!/input\?\.value\|\|browseFilters\.search/.test(src),
    'empty search box must not fall back to the previous query');
});

test('suggestion dropdown is topped up to five entries', () => {
  const ctx2 = vm.createContext({
    window: { guidcyConsultantScore: (c, q) => (c.name === 'B' ? 10 : 0) },
    guidcyBrowseSuggestCache: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' }],
  });
  vm.runInContext(slice('function guidcyPadSuggestions(', '  return out;\n}'), ctx2);
  const out = ctx2.guidcyPadSuggestions([{ name: 'A' }], 'x', 5, 7);
  assert.equal(out.length, 5);
  assert.equal(out[1].name, 'B', 'best-scoring filler comes first');
});

/* Regression: "HFCL" lived in current_company_college / company_experience,
   which the scorer never read - only the one consultant with it in their bio ranked. */
test('company and education fields are searchable, in any shape', () => {
  const plain = { name: 'A', current_company_college: 'HFCL Limited' };
  const json  = { name: 'B', company_experience: '[{"company_name":"HFCL","start_date":"2019"}]' };
  const other = { name: 'C', current_company_college: 'Infosys' };
  assert.ok(consultantScore(plain, 'HFCL') > 0);
  assert.ok(consultantScore(json, 'HFCL') > 0);
  assert.equal(consultantScore(other, 'HFCL'), 0);
  /* object keys must not leak into the haystack */
  assert.equal(consultantScore(json, 'company'), 0);
});
