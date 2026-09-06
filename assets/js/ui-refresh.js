/* Dashboard panels: refresh the content, don't blank the panel.
 *
 * Every dashboard view renders in two steps - the panel is replaced by a title
 * plus "Loading ...", then, one or more round trips later, by the real markup.
 * When the view is already on screen that first step throws away a perfectly
 * good table for a few hundred milliseconds, which is the blink: content
 * vanishes, spinner appears, content returns. A considered site does the
 * opposite - it keeps what the reader is looking at, says quietly that it is
 * working, and swaps the result in when it is ready, with the surrounding
 * chrome never moving.
 *
 * Rather than rewrite thirty-odd renderers - each owning its own markup, empty
 * states and error paths - this intercepts the single assignment that causes
 * it. The placeholder is held back while the panel already has content, and a
 * thin progress bar carries the "working" signal instead. The real markup that
 * follows is assigned normally, so no renderer changes behaviour and no error
 * path is swallowed.
 *
 * Deliberately conservative, because the rule here was not to disturb anything:
 *  - only the three dashboard panels are touched, nothing else on the site;
 *  - only a SHORT, loading-shaped payload is ever held back;
 *  - an empty panel always gets its placeholder, so a first paint still shows
 *    feedback rather than sitting blank;
 *  - if the real markup never arrives the placeholder is applied after all, so
 *    a stuck render cannot hide behind stale content;
 *  - anything unexpected falls straight through to the native setter.
 */
(function () {
  'use strict';

  if (window.__GUIDCY_PANEL_REFRESH__) return;
  window.__GUIDCY_PANEL_REFRESH__ = true;

  var PANEL_IDS = ['adash-main', 'cdash-main', 'udash-main'];
  /* The wording the existing renderers use for their placeholders. */
  var PLACEHOLDER_WORDS = /(loading|searching|filtering|please wait|fetching)/i;
  /* Long enough for the longest real placeholder, short enough that no rendered
     table, list or empty state can be mistaken for one. */
  var PLACEHOLDER_MAX_TEXT = 160;
  /* Past this a render is not merely slow - show its placeholder rather than
     let the panel sit on stale content indefinitely. */
  var STALE_MS = 6000;

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

  function hasContent(el) {
    /* A panel showing nothing but its own placeholder is not content worth
       keeping, so a slow first load still gets to show the spinner. */
    if (!el || !el.firstChild) return false;
    var text = textOf(native.get.call(el));
    if (!text) return false;
    return !(text.length <= PLACEHOLDER_MAX_TEXT && PLACEHOLDER_WORDS.test(text));
  }

  function setBusy(el, busy) {
    try { el.classList.toggle('guidcy-panel-busy', !!busy); } catch (_) {}
  }

  function attach(el) {
    if (!el || el.__guidcyPanelRefresh) return;
    el.__guidcyPanelRefresh = true;
    var pendingTimer = 0;

    function clearPending() {
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = 0; }
    }

    try {
      Object.defineProperty(el, 'innerHTML', {
        configurable: true,
        enumerable: false,
        get: function () { return native.get.call(this); },
        set: function (value) {
          var target = this;
          try {
            if (isPlaceholder(value) && hasContent(target)) {
              setBusy(target, true);
              clearPending();
              pendingTimer = setTimeout(function () {
                pendingTimer = 0;
                setBusy(target, false);
                native.set.call(target, value);
              }, STALE_MS);
              return;
            }
            clearPending();
            setBusy(target, false);
            native.set.call(target, value);
            /* One short fade on the swap, restarted on each render. */
            target.classList.remove('guidcy-panel-swap');
            void target.offsetWidth;
            target.classList.add('guidcy-panel-swap');
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
})();
