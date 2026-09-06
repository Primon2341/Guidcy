/* Consultants can say what they actually did in each role, the way a LinkedIn
   entry reads. A company name and a job title describe a slot; the description
   is what makes the profile read as a real person's work. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/expert-match.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');

test('the description survives the whole round trip', () => {
  // normalised in, so an entry saved before this existed is not dropped
  assert.match(app, /description:clean\(e\.description\|\|e\.summary\|\|e\.details\|\|e\.responsibilities\|\|e\.work_description\|\|''\)/);
  // edited
  assert.match(app, /<textarea data-exp-field="description"/);
  // and collected - BOTH savers, or one dashboard silently discards it
  const savers = app.match(/description:(f|get)\('description'\)/g) || [];
  assert.equal(savers.length, 2, 'the user and consultant dashboards each have their own collector');
  // a blank row must carry the field or a new entry cannot be described
  assert.equal((app.match(/start_date:'',end_date:'',description:'',currently_working:false/g) || []).length, 2);
});

test('it is shown on the profile, with the author line breaks kept', () => {
  assert.match(app, /guidcy-exp-timeline-about/);
  assert.match(app, /esc\(e\.description\)\.replace\(\/\\n\+\/g,'<br>'\)/,
    'escaped first, then line breaks restored - never the other way round');
  assert.match(app, /e\.description\?/, 'an entry without one must not render an empty block');
  assert.match(css, /\.guidcy-exp-timeline-about\{/);
  assert.match(css, /overflow-wrap:anywhere/, 'a long unbroken word must not widen the profile');
});

test('the matcher can see it, so the work itself is searchable', () => {
  assert.match(api, /description: item\.description \|\| item\.summary \|\| item\.details \|\| item\.responsibilities \|\| ''/,
    'expert-match reads experience entries - the description has to be carried through');
  // the client's own search text too, or the two disagree
  assert.match(app, /\[e\.company_name,e\.designation,e\.department,e\.description,/);
});

test('the field is optional and bounded', () => {
  assert.match(app, /maxlength="1200"/, 'a profile field with no cap is an invitation');
  assert.match(app, /optional, shown on your profile/, 'the label must say it is optional and public');
});
