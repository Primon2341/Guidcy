const assert = require('node:assert/strict');

module.exports = async function verifyHomeMotionAndLoading(page) {
 await page.emulateMedia({ reducedMotion: 'no-preference' });
 for (const width of [320, 375, 390, 430, 768, 1024, 1280]) {
 await page.setViewportSize({ width, height: 812 });
 const number = page.locator('#page-home .how-num').first();
 await number.evaluate(el => el.scrollIntoView({ block: 'center' }));
 const before = await number.evaluate(el => ({ name: getComputedStyle(el).animationName, transform: getComputedStyle(el).transform }));
 assert.equal(before.name, 'guidcyHowNumFloat', 'homepage animation at ' + width);
 await page.waitForTimeout(220);
 assert.notEqual(await number.evaluate(el => getComputedStyle(el).transform), before.transform, 'homepage animation must move at ' + width);
 assert.equal(await page.locator('#page-home .guidcy-growth-logo-chip, #page-home .guidcy-mix-chip, #page-home .guidcy-mix-orb').count(), 0, 'floating stickers must be removed at ' + width);
 const visual = page.locator('#page-home .guidcy-growth-visual');
 assert.equal(await visual.evaluate(el => getComputedStyle(el).paddingTop), '0px');
 assert.equal(await visual.evaluate(el => getComputedStyle(el, '::before').content), 'none');
 assert.equal(await visual.locator('.guidcy-mix-board').count(), 1);
 if ([320, 768, 1280].includes(width)) await visual.screenshot({ path: '/private/tmp/guidcy-home-no-stickers-' + width + '.png' });
 }
 await page.locator('#page-home .how-grid').screenshot({ path: '/private/tmp/guidcy-home-animation.png' });
 await page.emulateMedia({ reducedMotion: 'reduce' });
 assert.equal(await page.locator('#page-home .how-num').first().evaluate(el => getComputedStyle(el).animationName), 'none');
 assert.equal(await page.locator('#page-home .how-item').first().evaluate(el => getComputedStyle(el).opacity), '1');
 await page.emulateMedia({ reducedMotion: 'no-preference' });

 await page.route('**/api/ui-loader-regression', async route => {
 await new Promise(resolve => setTimeout(resolve, 900));
 await route.fulfill({ contentType: 'application/json', body: '{}' });
 });
 await page.evaluate(() => {
 const panel = document.getElementById('browse-grid');
 panel.innerHTML = '<div>Existing expert results</div>';
 panel.innerHTML = '<div>Loading experts...</div>';
 window.__uiLoaderTest = fetch('/api/ui-loader-regression').then(() => {
 panel.innerHTML = '<div>Updated expert results</div>';
 });
 });
 await page.waitForFunction(() => document.getElementById('guidcy-page-loader')?.classList.contains('on'));
 const loading = await page.evaluate(() => {
 const panel = document.getElementById('browse-grid');
 return { count: document.querySelectorAll('#guidcy-page-loader').length, busy: panel.classList.contains('guidcy-panel-busy'), secondary: getComputedStyle(panel, '::before').content, content: panel.textContent };
 });
 assert.deepEqual(loading, { count: 1, busy: true, secondary: 'none', content: 'Existing expert results' });
 await page.evaluate(() => window.__uiLoaderTest);
 await page.waitForFunction(() => !document.getElementById('guidcy-page-loader')?.classList.contains('on'));
 assert.equal(await page.locator('#browse-grid').textContent(), 'Updated expert results');
 await page.unroute('**/api/ui-loader-regression');
 await page.evaluate(() => window.scrollTo(0, 0));
 console.log('Homepage motion, reduced motion, and single top loading bar passed');
};
