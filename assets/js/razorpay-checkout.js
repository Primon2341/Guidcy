/* One SDK load for every payment flow. Warm-up downloads code only: orders and
 * checkout are still created/opened by the user's existing Pay action. */
(function () {
  'use strict';
  if (window.guidcyLoadRazorpayCheckout) return;
  var source = 'https://checkout.razorpay.com/v1/checkout.js';
  var pending = null;

  function connect(origin) {
    if (document.querySelector('link[rel="preconnect"][href="' + origin + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    document.head.appendChild(link);
  }

  function load() {
    if (window.Razorpay) return Promise.resolve();
    if (pending) return pending;
    connect('https://checkout.razorpay.com');
    connect('https://api.razorpay.com');
    var script = document.createElement('script');
    script.src = source;
    script.async = true;
    var request = new Promise(function (resolve, reject) {
      script.onload = function () {
        if (window.Razorpay) resolve();
        else reject(new Error('Razorpay checkout did not initialize. Please try again.'));
      };
      script.onerror = function () { reject(new Error('Unable to load Razorpay checkout. Please try again.')); };
      document.head.appendChild(script);
    });
    pending = request.catch(function (error) {
      // A failed speculative load must never poison the next real Pay click.
      pending = null;
      window.__guidcyRazorpayScriptPromise = null;
      script.remove();
      throw error;
    });
    window.__guidcyRazorpayScriptPromise = pending;
    return pending;
  }
  function warm() { return load().catch(function () {}); }
  window.guidcyLoadRazorpayCheckout = load;
  window.guidcyWarmRazorpayCheckout = warm;

  var pages = ['page-profile', 'page-payment', 'page-marketplace', 'page-webinar'];
  function warmActivePage() {
    if (pages.some(function (id) {
      var page = document.getElementById(id);
      return page && (page.classList.contains('on') || page.classList.contains('active'));
    })) warm();
  }
  function observePages() {
    var observer = new MutationObserver(warmActivePage);
    pages.forEach(function (id) {
      var page = document.getElementById(id);
      if (page) observer.observe(page, { attributes: true, attributeFilter: ['class'] });
    });
    warmActivePage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observePages, { once: true });
  else observePages();
  window.addEventListener('pageshow', warmActivePage);
  // Intent warming also covers injected Marketplace controls and direct calls
  // made before their page's class mutation has been delivered.
  ['pointerover', 'pointerdown', 'focusin'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (event.target && event.target.closest && event.target.closest('#page-payment .green-btn,.book-footer .green-btn,[data-gmkt-action="buy"],#wbn-reg-form .btn-blue')) warm();
    }, { passive: true });
  });
})();
