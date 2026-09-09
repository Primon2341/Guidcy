const assert = require('node:assert/strict');

module.exports = async function verifyWebinarPublisherPhotos(page) {
 const date = new Date(Date.now() + 86400000).toISOString().slice(0,10);
 const base = { title: 'Publisher photo check', category: 'Career', date, time: '18:00', duration: '60 minutes', seats: 100, speaker: 'Test Expert', publisher_name: 'Test Expert', description: 'Webinar publisher profile photo verification.' };
 const rows = [
 { ...base, id: 'publisher-photo', created_by: 'expert-profile' },
 { ...base, id: 'legacy-photo', publisher_email: 'expert@example.com' },
 { ...base, id: 'missing-photo', created_by: 'missing-profile', speaker: 'No Photo' }
 ];
 await page.route('**/rest/v1/webinars?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) }));
 await page.evaluate(() => window.go('webinar'));
 await page.evaluate(() => window.wbnLoad());
 for (const width of [390,1280]) {
 await page.setViewportSize({ width, height: 850 });
 assert.doesNotMatch(await page.locator('[data-wbn-id="publisher-photo"] .wbn-card-meta').textContent(), /registered/i);
 assert.equal(await page.locator('[data-wbn-id="publisher-photo"] [data-wbn-register]').count(), 1);
 const photo = page.locator('[data-wbn-id="publisher-photo"] .wbn-speaker-av img');
 await photo.scrollIntoViewIfNeeded();
 await page.waitForFunction(() => {
 const img = document.querySelector('[data-wbn-id="publisher-photo"] .wbn-speaker-av img');
 return img && img.complete && img.naturalWidth > 0;
 });
 assert.equal(await page.locator('[data-wbn-id="legacy-photo"] .wbn-speaker-av img').count(),1);
 assert.equal(await page.locator('[data-wbn-id="missing-photo"] .wbn-speaker-av img').count(),0);
 assert.equal(await page.locator('[data-wbn-id="missing-photo"] .wbn-speaker-av').textContent(),'NP');
 const size = await photo.evaluate(img => ({ width: img.clientWidth, height: img.clientHeight, fit: getComputedStyle(img).objectFit }));
 assert.equal(size.width,size.height);
 assert.equal(size.fit,'cover');
 await page.screenshot({ path: '/private/tmp/guidcy-webinar-publisher-' + width + '.png' });
 }
 await page.locator('[data-wbn-id="publisher-photo"] .wbn-speaker-av img').evaluate(img => { img.src='/missing-profile-photo.png'; });
 await page.waitForFunction(() => !document.querySelector('[data-wbn-id="publisher-photo"] .wbn-speaker-av img'));
 assert.equal(await page.locator('[data-wbn-id="publisher-photo"] .wbn-speaker-av').textContent(),'TE');
 console.log('Webinar publisher photos, email fallback, missing and broken images passed');
};
