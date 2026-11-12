/* Hold existing regions during revalidation. Cold loads use the shared centered
 * animation without drawing placeholder cards, bars or profile shapes. */
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
    'browse-grid', 'cats-full-grid', 'profile-layout',
    'page-blog', 'gnet-me','gnet-mobile-avatar','gnet-compose-avatar', 'gnet-experts', 'gnet-feed', 'gnet-profile-posts',
    /* webinars */
    'wbn-cards', 'wbn-regs-list',
    /* marketplace and careers */
    'gmkt-grid', 'gc-list', 'jobs-main-area', 'sf-results', 'opp-results-area'
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
    // The booking DOM may already exist while the public profile is pending.
    if(/\bdata-guidcy-profile-loading\b/.test(String(html)))return true;
    // Secondary activity reads do not cover the already loaded profile.
    if(/\bdata-guidcy-profile-placeholder\b/.test(String(html)))return false;
    var text = textOf(html);
    if(!text||text.length>PLACEHOLDER_MAX_TEXT||!PLACEHOLDER_WORDS.test(text))return false;
    if(/\b(?:unable|failed|could not|couldn['’]t|error)\b/i.test(text))return false;
    // Titles/posts can contain words such as "Loading" or "Searching" too.
    // Real records, controls and error states must always reach the screen.
    return !/<(?:article|table|form|input|button)\b|<a\b[^>]*href\s*=|\bdata-(?:post|consultant-id|wbn-id|gmkt-id)\s*=/i.test(String(html));
  }

  function hasContent(el, html) {
    /* A panel showing nothing but its own placeholder is not content worth
       keeping, so a slow first load still gets to show the spinner. */
    if (!el || !el.firstChild) return false;
    var markup=html === undefined ? native.get.call(el) : html;
    var text = textOf(markup);
    if (!text) return false;
    return !isPlaceholder(markup);
  }

  function setBusy(el, busy) {
    try { el.classList.toggle('guidcy-panel-busy', !!busy); } catch (_) {}
  }

  // Observe only registered content regions and their page visibility. The
  // status lives outside those regions so it never enters their cached markup.
  var automaticLoading=new WeakSet();
  var secondaryLoading=new Set(['gnet-me','gnet-mobile-avatar','gnet-compose-avatar','gnet-experts','gnet-profile-posts','cons-rec-grid']);
  var loadingNodes=new Set(), loadingPages=new Set(), loadingQueued=false;
  function finishLoading(target){
    automaticLoading.delete(target);setBusy(target,false);
    target.classList.remove('guidcy-panel-skeleton');target.removeAttribute('aria-busy');target.removeAttribute('data-guidcy-background-refresh');
  }
  function loadingChanged(records){
    records.forEach(function(record){
      // Native replaceChildren/append paths bypass our innerHTML setter. Only
      // finish flags we created, and only after root content is committed.
      if(record.type==='childList')for(var target=record.target;target;target=target.parentElement){
        if(automaticLoading.has(target)&&hasContent(target))finishLoading(target);
      }
    });
    scheduleLoading();
  }
  var loadingObserver=typeof MutationObserver==='function'?new MutationObserver(loadingChanged):null;
  function scheduleLoading(){
    if(loadingQueued)return;loadingQueued=true;
    queueMicrotask(function(){loadingQueued=false;syncLoading()});
  }
  function watchLoading(el){
    if(!el||!loadingObserver||loadingNodes.has(el))return;
    loadingNodes.add(el);loadingObserver.observe(el,{attributes:true,attributeFilter:['aria-busy','class','data-guidcy-background-refresh'],childList:true,subtree:el.id==='profile-layout'});
    var page=el.closest('.page');
    if(page&&!loadingPages.has(page)){loadingPages.add(page);loadingObserver.observe(page,{attributes:true,attributeFilter:['class','hidden']})}
    scheduleLoading();
  }
  function syncLoading(){
    if(!document.body)return;
    var active=false,removed=false;
    loadingNodes.forEach(function(el){
      if(!el.isConnected){loadingNodes.delete(el);removed=true;return}
      if(!secondaryLoading.has(el.id)&&!el.hasAttribute('data-guidcy-background-refresh')&&el.getAttribute('aria-busy')==='true'&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')active=true;
    });
    loadingPages.forEach(function(el){if(!el.isConnected){loadingPages.delete(el);removed=true}});
    if(removed&&loadingObserver){
      loadingObserver.disconnect();
      loadingNodes.forEach(function(el){loadingObserver.observe(el,{attributes:true,attributeFilter:['aria-busy','class','data-guidcy-background-refresh'],childList:true,subtree:el.id==='profile-layout'})});
      loadingPages.forEach(function(el){loadingObserver.observe(el,{attributes:true,attributeFilter:['class','hidden']})});
    }
    var status=document.getElementById('guidcy-loading-status');
    if(!status&&active){
      status=document.createElement('div');status.id='guidcy-loading-status';status.className='guidcy-retro-loader';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      status.innerHTML='<span class="guidcy-loading-label">Loading...</span><span class="guidcy-loading-track" aria-hidden="true"><span class="guidcy-loading-fill"></span></span>';
      document.body.appendChild(status);
    }
    if(status)status.hidden=!active;
  }

  window.guidcyFinishPanelRefresh = function(target) {
    finishLoading(target);
    if(target.__guidcyRestoreMinHeight!==undefined){target.style.minHeight=target.__guidcyRestoreMinHeight;delete target.__guidcyRestoreMinHeight}
    target.removeAttribute('inert');
    target.removeAttribute('data-guidcy-restored');
  };

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
              // Profile renderers already preserve same-person refreshes themselves.
              // A new loading header must install the new person's booking DOM.
              sameSection=target.id!=='profile-layout'&&(!incomingTitle||!previousTitle||incomingTitle[1]===previousTitle[1]);
            }
            if (sameSection && skeleton && hasContent(target,previous)) {
              automaticLoading.add(target);
              setBusy(target, true);
              target.setAttribute('aria-busy', 'true');
              return;
            }
            setBusy(target, false);
            // Preserve focused controls and mounted descendants for identical data.
            if(previous!==html)native.set.call(target, value);
            window.guidcyFinishPanelRefresh(target);
            /* Hide cold-load status markup; only the shared animation is visible.
               Keep the state class for cache and request lifecycle compatibility. */
            target.classList.toggle('guidcy-panel-skeleton', skeleton);
            if (skeleton) target.setAttribute('aria-busy', 'true'); else target.removeAttribute('aria-busy');
            if(skeleton)automaticLoading.add(target);
            if (skeleton) return;
          } catch (_) {
            native.set.call(target, value);
          }
        },
      });
      if(isPlaceholder(native.get.call(el))){
        el.classList.add('guidcy-panel-skeleton');el.setAttribute('aria-busy','true');automaticLoading.add(el);
      }
    } catch (_) {
      el.__guidcyPanelRefresh = false;
    }
  }

  function attachAll() {
    for (var i = 0; i < PANEL_IDS.length; i++) {
      var el=document.getElementById(PANEL_IDS[i]);attach(el);watchLoading(el);
    }
    scheduleLoading();
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
