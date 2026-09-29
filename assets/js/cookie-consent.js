/* Optional analytics is off until an explicit, current choice allows it.
 * Essential authentication and transaction storage is deliberately untouched. */
(function () {
  'use strict';
  const key = 'guidcy_cookie_consent_v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (value?.version === 1 && typeof value.analytics === 'boolean' &&
          Number.isFinite(value.savedAt) && value.savedAt <= Date.now() && Date.now() - value.savedAt < lifetime) return value;
    } catch (_) {}
    return null;
  }
  let choice = read();
  let analyticsScript;
  function analyticsAllowed() { return !!(choice?.analytics && Date.now() - choice.savedAt < lifetime); }
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  // Vercel calls this for every event, including SPA navigation and after withdrawal.
  window.va('beforeSend', event => analyticsAllowed() ? event : null);
  function apply() {
    if (analyticsAllowed() && !analyticsScript && /(^|\.)guidcy\.com$|\.vercel\.app$/.test(location.hostname)) {
      analyticsScript = document.createElement('script');
      analyticsScript.defer = true;
      analyticsScript.src = '/_vercel/insights/script.js';
      analyticsScript.onerror = () => { analyticsScript.remove(); analyticsScript = null; };
      document.head.appendChild(analyticsScript);
    }
    banner.hidden = !!choice;
  }
  function save(analytics) {
    choice = {version:1, analytics:analytics === true, savedAt:Date.now()};
    try { localStorage.setItem(key, JSON.stringify(choice)); } catch (_) {}
    apply();
    if (dialog.open) dialog.close();
  }
  const banner = document.createElement('section');
  banner.id = 'guidcy-cookie-banner';
  banner.setAttribute('aria-label', 'Cookie and privacy choices');
  banner.innerHTML = '<h2>Your privacy choices</h2><p>Essential cookies and browser storage keep sign-in, bookings and payments working. Optional, cookie-free analytics helps us improve Guidcy and only runs with your permission. <a href="/privacy" data-cookie-privacy>Privacy policy</a></p><div class="gc-actions"><button type="button" data-cookie-choice="accept">Accept all</button><button type="button" data-cookie-choice="reject">Reject</button><button type="button" data-cookie-settings>Preferences</button></div>';
  const dialog = document.createElement('dialog');
  dialog.id = 'guidcy-cookie-preferences';
  dialog.setAttribute('aria-labelledby', 'gc-preferences-title');
  dialog.innerHTML = '<div class="gc-heading"><h2 id="gc-preferences-title">Cookie preferences</h2><button type="button" class="gc-close" aria-label="Close cookie preferences">×</button></div><p>Choose whether to allow optional analytics. Your choice is saved on this browser for six months.</p><div class="gc-option"><div><strong>Essential storage</strong><p>Used for security, sign-in, bookings, payments and remembering your privacy choice.</p></div><span class="gc-required">Always on</span></div><label class="gc-option" for="gc-analytics"><div><strong>Analytics (optional)</strong><p>Allow cookie-free analytics to measure visits and page usage.</p></div><input id="gc-analytics" type="checkbox"></label><div class="gc-actions"><button type="button" data-cookie-save>Save preferences</button><button type="button" data-cookie-choice="reject">Reject</button></div>';
  document.body.append(banner, dialog);
  const checkbox = dialog.querySelector('input');
  let returnFocus;
  function openPreferences() {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    checkbox.checked = analyticsAllowed();
    dialog.showModal();
    document.documentElement.classList.add('guidcy-cookie-modal-open');
  }
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('guidcy-cookie-modal-open');
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({preventScroll:true});
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-cookie-choice],[data-cookie-settings],[data-cookie-save],.gc-close,[data-cookie-privacy]');
    if (!button) return;
    if (button.hasAttribute('data-cookie-settings')) openPreferences();
    else if (button.hasAttribute('data-cookie-choice')) save(button.dataset.cookieChoice === 'accept');
    else if (button.hasAttribute('data-cookie-save')) save(checkbox.checked);
    else if (button.classList.contains('gc-close')) dialog.close();
    else if (typeof window.go === 'function') { event.preventDefault(); window.go('privacy'); }
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    choice = read();
    checkbox.checked = analyticsAllowed();
    apply();
  });
  apply();
})();
