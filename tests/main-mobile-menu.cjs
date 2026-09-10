const assert = require('node:assert/strict');

module.exports = async function checkMainMobileMenu(page, role) {
  const before = page.url();
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.locator('#mobile-burger').click();
    const drawer = page.locator('#gmob-drawer.open');
    await drawer.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#gmob-drawer').getBoundingClientRect().left === 0);
    assert.equal(await drawer.locator('.gmob-tagline').innerText(), 'Guidance made simple');
    const layout = await drawer.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const brand = el.querySelector('.gmob-brand').getBoundingClientRect();
      const close = el.querySelector('.gmob-close-btn').getBoundingClientRect();
      const body = el.querySelector('.gmob-body');
      return {
        width: bounds.width,
        overflow: el.scrollWidth > el.clientWidth + 1,
        overlap: brand.right > close.left,
        clipped: [...el.querySelectorAll('.gmob-label,.gmob-tagline,.gmob-email-row')].some(node => node.scrollWidth > node.clientWidth + 1),
        bodyHeight: body.clientHeight,
        scrollable: getComputedStyle(body).overflowY,
        closeSize: Math.min(close.width, close.height),
        footerBottom: el.querySelector('.gmob-footer').getBoundingClientRect().bottom
      };
    });
    assert.ok(Math.abs(layout.width - Math.min(width * 0.78, 280)) < 1, role + ': compact width at ' + width);
    assert.equal(layout.overflow, false);
    assert.equal(layout.overlap, false);
    assert.equal(layout.clipped, false);
    assert.equal(layout.scrollable, 'auto');
    assert.ok(layout.bodyHeight > 100);
    assert.ok(layout.closeSize >= 44);
    assert.ok(layout.footerBottom <= 813);
    const lastLink = drawer.locator('.gmob-item').last();
    await lastLink.scrollIntoViewIfNeeded();
    assert.equal(await lastLink.evaluate(el => {
      const r = el.getBoundingClientRect();
      const body = el.closest('.gmob-body').getBoundingClientRect();
      return r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
    }), true, 'Last public link remains reachable');
    await drawer.locator('.gmob-body').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: '/private/tmp/guidcy-main-menu-' + role + '-' + width + '.png' });
    await drawer.locator('.gmob-close-btn').click();
    assert.equal(await page.locator('#gmob-drawer.open').count(), 0);
    assert.equal(page.url(), before);
  }
  await page.setViewportSize({ width: 390, height: 812 });
  await page.locator('#mobile-burger').click();
  await page.locator('#gmob-drawer .gmob-item').filter({ hasText: /Find (?:the )?Expert/ }).click();
  await page.waitForURL(url => ['/browse', '/find-experts'].includes(url.pathname));
  await page.locator('#page-browse.on').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#gmob-drawer.open').count(), 0);
  await page.goBack();
  await page.waitForURL(before);
  console.log(role + ': compact public menu, tagline, scrolling and links at 320-768px passed');
};
