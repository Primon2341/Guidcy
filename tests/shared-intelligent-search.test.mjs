import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/shared-search.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

function loadSearch(){
  const document = {
    readyState: 'loading',
    addEventListener(){},
    getElementById(){ return null; },
    querySelectorAll(){ return []; },
  };
  const consultants = [
    { id:'finance', name:'Asha Mehta', category:'Finance', expertise:'Investment planning', skills:['tax planning','wealth management'], title:'Financial Advisor', bio:'Personal finance and funding guidance.', rating:4.9 },
    { id:'marketing', name:'Riya Sharma', category:'Marketing', expertise:'Digital growth', skills:['SEO','brand strategy','content marketing'], title:'Growth Marketer', rating:4.8 },
    { id:'psychology', name:'Neha Rao', category:'Mental Health', expertise:'Therapy and wellness', skills:['counselling'], title:'Psychologist', rating:4.7 },
    { id:'startup', name:'Aman Jain', category:'Startup', expertise:'Founder coaching', skills:['fundraising','go to market'], title:'Startup Advisor', rating:4.6 },
    { id:'technology', name:'Dev Singh', category:'Technology', expertise:'Cloud architecture', skills:['AWS','platform engineering'], title:'Software Engineer', rating:4.5 },
    { id:'incidental', name:'Ira Kapoor', category:'Education', title:'Admissions Coach', bio:'Previously supported finance operations.', rating:4.4 },
  ];
  const window = {
    CATEGORIES_FULL: [{name:'Finance'},{name:'Marketing'},{name:'Mental Health'},{name:'Startup'},{name:'Technology'}],
    addEventListener(){},
    fetchConsultants: async () => consultants,
  };
  const context = {
    window, document, console,
    setTimeout(){ return 1; }, clearTimeout(){},
    AbortController, URLSearchParams,
    location:{pathname:'/',search:'',href:''},
    history:{replaceState(){}}, sessionStorage:{setItem(){}},
    encodeURIComponent, decodeURIComponent,
    Map, Set, Date, Error, Array, Object, String, Number, Math, JSON, RegExp,
  };
  window.window = window;
  vm.runInNewContext(source, context);
  return { engine:window.GuidcyConsultantSearch, fetchConsultants:window.fetchConsultants, consultants };
}

test('shared search script loads after app and owns both search bars', () => {
  assert.ok(index.indexOf('/assets/js/app.js') < index.indexOf('/assets/js/shared-search.js'));
  assert.match(source, /window\.renderHeroSuggestions=function\(\)\{scheduleSurface\('hero'/);
  assert.match(source, /window\.renderBrowseSuggestions=function\(\)\{scheduleSurface\('browse'/);
  assert.match(source, /window\.browseSearch=function\(\)/);
  assert.match(source, /window\.doHeroSearch=function\(\)/);
});

test('exact, partial, profile-field, and multi-word searches rank relevant experts', () => {
  const {engine,consultants} = loadSearch();
  const exact = engine.search(consultants, 'Finance');
  assert.equal(exact.results[0].consultant.id, 'finance');
  assert.equal(exact.results[0].tier, 'exact');

  assert.equal(engine.search(consultants, 'mark').results[0].consultant.id, 'marketing');
  assert.equal(engine.search(consultants, 'wealth').results[0].consultant.id, 'finance');
  assert.equal(engine.search(consultants, 'startup fundraising').results[0].consultant.id, 'startup');
});

test('misspellings are corrected from live vocabulary, not a typo lookup table', () => {
  const {engine,consultants} = loadSearch();
  for(const [query,correction,id] of [
    ['finace','finance','finance'],
    ['marketng','marketing','marketing'],
    ['psycholgist','psychologist','psychology'],
  ]){
    const result = engine.search(consultants, query);
    assert.equal(result.correction?.query, correction);
    assert.equal(result.results[0].consultant.id, id);
    assert.equal(result.results[0].tier, 'fuzzy');
    assert.ok(!result.results.some(item => item.consultant.id === 'incidental'), 'a typo must not promote a low-weight incidental profile mention');
  }
  assert.doesNotMatch(source, /finace|marketng|psycholgist/);
});

test('low-confidence unrelated searches do not leak consultants into results', () => {
  const {engine,consultants} = loadSearch();
  assert.deepEqual(engine.search(consultants, 'zzqxvplm').results, []);
  assert.deepEqual(engine.search(consultants, 'oceanic archaeology').results, []);
});

test('Find Expert data filtering delegates to the same shared engine', async () => {
  const {engine,fetchConsultants,consultants} = loadSearch();
  const dropdownIds = engine.search(consultants, 'finace').results.map(result => result.consultant.id);
  const gridIds = (await fetchConsultants({search:'finace'})).map(consultant => consultant.id);
  assert.deepEqual(gridIds, dropdownIds);
});

test('suggestions include profile photos with initials fallback, correction UI, and cancellable bounded queries', () => {
  assert.match(source, /consultant\.avatar_url\|\|consultant\.profile_image_url\|\|consultant\.photo_url/);
  assert.match(source, /<img src=/);
  assert.match(source, /onerror=\"this\.remove\(\)\"/);
  assert.match(source, /Did you mean <strong>/);
  assert.match(source, /\.limit\(FETCH_LIMIT\)/);
  assert.match(source, /\.abortSignal\(signal\)/);
  assert.match(source, /tracker\.controller\.abort\(\)/);
});

test('homepage-to-Find-Expert navigation and refresh preserve query state without touching Goal', () => {
  assert.match(source, /params\.set\('q',query\)/);
  assert.match(source, /params\.get\('q'\)\|\|params\.get\('search'\)/);
  assert.match(source, /sessionStorage\.setItem\('guidcy_shared_search'/);
  assert.match(source, /sessionStorage\.getItem\('guidcy_shared_search'/);
  assert.match(source, /replaceBrowseUrl\(query,category\)/);
  assert.doesNotMatch(source, /goal/i);
});
test('clearing Find Expert search cancels stale work and removes the preserved query', () => {
  assert.match(source, /function clearBrowseSearch\(\)/);
  assert.match(source, /clearTimeout\(browseGridTimer\)/);
  assert.match(source, /__guidcySharedClearCaptureBound/);
  assert.match(source, /closest\('#browse-search-clear'\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\);clearBrowseSearch\(\)/);
  assert.match(source, /rememberQuery\('',category\).*replaceBrowseUrl\('',category\)/s);
  assert.match(source, /window\.guidcyClearSearch=clearBrowseSearch/);
  assert.match(appSource, /params\.delete\('q'\)/);
  assert.match(appSource, /sessionStorage\.setItem\('guidcy_shared_search'/);
  assert.match(appSource, /function clearFilters\(\).*guidcySyncClearedSearchUrl\(\)/s);
  assert.match(source, /hydrateBrowseFromUrl[\s\S]*guidcyToggleSearchClear/);
});
