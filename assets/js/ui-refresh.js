/* Hold existing regions during revalidation. Empty regions alone get a static
 * skeleton. No timeout clears content and no animation accompanies a swap. */
(function () {
  'use strict';

  if (window.__GUIDCY_PANEL_REFRESH__) return;
  window.__GUIDCY_PANEL_REFRESH__ = true;

  /* The content regions that renderers repaint. Listing one that never shows a
     placeholder costs nothing - the interception only ever acts on a
     loading-shaped payload assigned over existing content. */
  var PANEL_IDS = [
    /* dashboards */
    'adash-main', 'cdash-main', 'udash-main',
    /* browse, categories and the home rails */
    'browse-grid', 'cats-full-grid', 'cons-grid', 'cons-rec-grid',
    'sf-supabase-consultants-grid', 'reviews-grid',
    /* webinars */
    'wbn-cards', 'wbn-regs-list',
    /* marketplace and careers */
    'gmkt-grid', 'gc-list', 'jobs-main-area', 'sf-results', 'opp-results', 'profile-layout'
  ];
  /* The wording the existing renderers use for their placeholders. */
  var PLACEHOLDER_WORDS = /(loading|searching|filtering|please wait|fetching)/i;
  /* Long enough for the longest real placeholder, short enough that no rendered
     table, list or empty state can be mistaken for one. */
  var PLACEHOLDER_MAX_TEXT = 160;


  var native = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (!native || typeof native.set !== 'function' || typeof native.get !== 'function') return;

  function textOf(html) {
    return String(html == null ? '' : html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isPlaceholder(html) {
    var text = textOf(html);
    return text.length > 0 && text.length <= PLACEHOLDER_MAX_TEXT && PLACEHOLDER_WORDS.test(text);
  }

  function hasContent(el, html) {
    /* A panel showing nothing but its own placeholder is not content worth
       keeping, so a slow first load still gets to show the spinner. */
    if (!el || !el.firstChild) return false;
    var text = textOf(html === undefined ? native.get.call(el) : html);
    if (!text) return false;
    return !(text.length <= PLACEHOLDER_MAX_TEXT && PLACEHOLDER_WORDS.test(text));
  }

  function setBusy(el, busy) {
    try { el.classList.toggle('guidcy-panel-busy', !!busy); } catch (_) {}
  }

  function attach(el) {
    if (!el || el.__guidcyPanelRefresh) return;
    el.__guidcyPanelRefresh = true;

    try {
      Object.defineProperty(el, 'innerHTML', {
        configurable: true,
        enumerable: false,
        get: function () { return native.get.call(this); },
        set: function (value) {
          var target = this;
          try {
            // Some legacy views bypass the dashboard controller. They must not
            // publish empty/zero data while session and profile are unresolved.
            if(/^(u|c|a)dash-main$/.test(target.id)&&window.guidcyDashboardAuthReady&&!window.guidcyDashboardAuthReady())return;
            var html=String(value),previous=native.get.call(target);
            var skeleton=isPlaceholder(html);
            var sameSection=true;
            if(skeleton){
              var incomingTitle=html.match(/class=["']dash-title["'][^>]*>([^<]*)/);
              var previousTitle=previous.match(/class=["']dash-title["'][^>]*>([^<]*)/);
              sameSection=!incomingTitle||!previousTitle||incomingTitle[1]===previousTitle[1];
            }
            if (sameSection && skeleton && hasContent(target,previous)) {
              setBusy(target, true);
              target.setAttribute('aria-busy', 'true');
              return;
            }
            setBusy(target, false);
            // Preserve focused controls and mounted descendants for identical data.
            if(previous!==html)native.set.call(target, value);
            if(target.__guidcyRestoreMinHeight!==undefined){target.style.minHeight=target.__guidcyRestoreMinHeight;delete target.__guidcyRestoreMinHeight}
            target.removeAttribute('inert');
            target.removeAttribute('data-guidcy-restored');
            /* An empty panel keeps its placeholder, but drawn as a quiet skeleton
               rather than a bare "Loading..." line; the real markup clears it. */
            target.classList.toggle('guidcy-panel-skeleton', skeleton);
            if (skeleton) target.setAttribute('aria-busy', 'true'); else target.removeAttribute('aria-busy');
            if (skeleton) return;
          } catch (_) {
            native.set.call(target, value);
          }
        },
      });
    } catch (_) {
      el.__guidcyPanelRefresh = false;
    }
  }

  function attachAll() {
    for (var i = 0; i < PANEL_IDS.length; i++) attach(document.getElementById(PANEL_IDS[i]));
  }

  window.guidcyAttachPanelRefresh = attachAll;

  attachAll();
  document.addEventListener('DOMContentLoaded', attachAll);
  window.addEventListener('load', attachAll);

  /* Several of these regions do not exist at load - the marketplace page builds
     itself on first visit, and any container inside a panel is replaced whole
     when its parent is repainted, which discards the override with the old
     element. Re-attach when the DOM changes, coalesced into one pass per frame
     so a busy render does not pay for it repeatedly. */
  if (typeof MutationObserver === 'function') {
    var queued = false;
    var run = function () { queued = false; attachAll(); };
    /* setTimeout, not requestAnimationFrame: rAF does not fire in a hidden tab,
       so a region built in a background tab would never be attached. The work
       is a handful of getElementById calls, so there is nothing to align to a
       frame anyway. */
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(run, 0);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
