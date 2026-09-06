/* AI expert matching on Find an Expert: show the profile, not the write-up,
   and let the reader dismiss the suggestions. Ranking is untouched - the same
   matcher still decides who appears, only the explanation is dropped. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');

test('matched experts render as a profile card with no write-up', () => {
  assert.match(app, /best\.map\(function\(x\)\{return consultantCard\(x\.c,''\)\}\)/,
    'the best matches must be rendered without a reason block');
  assert.doesNotMatch(app, /consultantCard\(x\.c,reasonFor\(x,d\)\)/,
    'passing the reason back in is what put "Why recommended" under every card');
  // the card itself still only adds the block when given one, so nothing else regresses
  assert.match(app, /\(whyHtml\?'<div class="guidcy-match-why">'\+whyHtml\+'<\/div>':''\)/);
});

test('the ranking that picks the experts is untouched', () => {
  assert.match(app, /function reasonFor\(|reasonFor\(/, 'the matcher itself must still be there');
  assert.match(app, /best\.map\(function\(x\)/, 'best matches still come from the ranked list');
  assert.match(app, /similar\.length\?/, 'the similar-experts section is unchanged');
});

test('the suggestions can be dismissed without a reload', () => {
  assert.match(app, /window\.guidcyCloseExpertMatch=function\(\)/);
  assert.match(app, /\['guidcy-browse-match-results', ?'guidcy-home-match-results'\]/,
    'both the browse and home containers must be cleared');
  assert.match(app, /class="guidcy-match-close"[^>]*aria-label="Close suggestions"/,
    'the control needs an accessible name, it is only a glyph');
  assert.match(app, /onclick="window\.guidcyCloseExpertMatch&&guidcyCloseExpertMatch\(\)"/);
  // closing must not take the form with it, or a second search is impossible
  assert.doesNotMatch(app, /guidcyCloseExpertMatch=function\(\)\{[\s\S]{0,200}match-panel/,
    'the form above the results must survive a close');
});

test('the close control is a real target, not a bare glyph', () => {
  assert.match(css, /\.guidcy-match-close\{[\s\S]*?width:32px;height:32px/);
  assert.match(css, /\.guidcy-match-close:focus-visible\{outline:/, 'it must be reachable by keyboard');
  assert.match(css, /\.guidcy-result-head-actions\{display:flex[\s\S]*?flex-wrap:wrap\}/,
    'the header wraps on a phone and the button has to come with it');
});
