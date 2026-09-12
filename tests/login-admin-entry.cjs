const assert = require('node:assert/strict');

module.exports = async function checkAdminEntry(page, width) {
  const viewport = page.viewportSize();
  assert.deepEqual(await page.locator('#page-login .type-tabs button strong').allTextContents(), ['User', 'Consultant']);
  assert.equal(await page.locator('#li-a').count(), 1);
  for (const size of [...new Set([320, 430, width])]) {
    await page.setViewportSize({ width: size, height: viewport.height });
    await page.waitForFunction(() => document.querySelector('#gmob-drawer').getBoundingClientRect().right <= 0);
    const layout = await page.locator('#li-a').evaluate(button => {
      const r = button.getBoundingClientRect();
      const entry = button.closest('.login-admin-entry').getBoundingClientRect();
      const card = button.closest('.form-card');
      const logo = card.querySelector('.form-logo-wrap').getBoundingClientRect();
      return {
        rightAligned: Math.abs(r.right - entry.right) < 1,
        aboveLogo: r.bottom <= logo.top,
        compact: r.width < 150,
        clipped: card.scrollWidth > card.clientWidth + 1,
        touchHeight: r.height
      };
    });
    assert.deepEqual(layout, { rightAligned: true, aboveLogo: true, compact: true, clipped: false, touchHeight: 44 });
    const cardSize = await page.locator('#page-login .form-card').boundingBox();
    assert.ok(cardSize.width <= 421, 'Login panel must retain its previous compact width');
    assert.ok(cardSize.height <= 800, 'Login panel must not regain excessive vertical spacing');
    await page.locator('#li-a').click();
    assert.equal(await page.locator('#li-a').evaluate(el => el.classList.contains('on')), true);
    assert.equal(await page.locator('#page-login .type-tabs .on').count(), 0);
    assert.equal(await page.locator('#page-login .login-benefits>div').count(), 3);
    assert.equal(await page.locator('#page-login .guidcy-pass-toggle').count(), 1);
    await page.locator('#li-pass').fill('visibility-check');
    await page.locator('#page-login .guidcy-pass-toggle').click();
    assert.equal(await page.locator('#li-pass').getAttribute('type'), 'text');
    await page.locator('#page-login .guidcy-pass-toggle').click();
    assert.equal(await page.locator('#li-pass').getAttribute('type'), 'password');
    await page.locator('#li-pass').fill('');
    assert.equal(await page.locator('#page-login').evaluate(el => [...el.querySelectorAll('.type-tab,.login-role-copy,.login-benefits>div,input')].some(node => node.scrollWidth > node.clientWidth + 1)), false);
    await page.locator('#li-u').click();
    assert.equal(await page.locator('#li-a').evaluate(el => el.classList.contains('on')), false);
    await page.waitForFunction(() => [...document.querySelectorAll('#page-login svg.login-icon')].every(icon => icon.getBBox().width > 0));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#li-u')).borderTopColor === 'rgb(93, 160, 255)');
    await page.screenshot({ path: '/private/tmp/guidcy-login-admin-' + size + '.png', fullPage: true });
  }
  await page.setViewportSize(viewport);
};
