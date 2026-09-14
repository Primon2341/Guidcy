/* Search-state companion: duck below the bar, relocate while hidden, then peek out. */
(function () {
  'use strict';
  let disposePrevious = null;
  window.guidcyCreateJobsCompanion = function (page) {
    if (disposePrevious) disposePrevious();
    const rail = page.querySelector('.jobs-companion-rail');
    const thought = rail.querySelector('.jobs-thought');
    const input = page.querySelector('#job-q');
    const results = page.querySelector('#jobs-main-area');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 560px)');
    const listeners = new AbortController();
    let timer = null, hideTimer = null, revealTimer = null;
    let step = 0, busy = false, disposed = false, state = 'idle';
    const messages = {
      idle: 'Ready to find your next role?',
      typing: 'Thinking about your next move…',
      prompt: 'Tell me a role or skill first.',
      location: 'Where shall we look next?',
      searching: 'I’m finding jobs for you…',
      more: 'Looking for more opportunities…',
      empty: 'No matches yet. Try another search?',
      error: 'A little hiccup. Let’s try again.'
    };
    function visible() {
      return page.isConnected && !document.hidden && (page.classList.contains('on') || page.classList.contains('active'));
    }
    function stop() {
      clearInterval(timer); clearTimeout(hideTimer); clearTimeout(revealTimer);
      timer = hideTimer = revealTimer = null;
      rail.classList.remove('is-hiding');
    }
    function hop() {
      if (!busy || !visible() || media.matches || disposed) return;
      rail.classList.add('is-hiding');
      hideTimer = setTimeout(function () {
        const positions = mobile.matches ? ['left', 'right'] : ['left', 'center', 'right', 'center'];
        step = (step + 1) % positions.length;
        rail.dataset.position = positions[step];
        rail.dataset.pose = step % 2 ? 'look' : 'think';
        revealTimer = setTimeout(function () { rail.classList.remove('is-hiding'); }, 120);
      }, 300);
    }
    function syncMotion() {
      stop();
      if (!busy || !visible() || media.matches || disposed) return;
      timer = setInterval(hop, 2800);
    }
    function set(nextState, count) {
      if (disposed) return;
      const changed = state !== nextState;
      state = nextState;
      busy = state === 'searching' || state === 'more';
      rail.dataset.state = state;
      results.setAttribute('aria-busy', String(busy));
      const message = state === 'results'
        ? count + (count === 1 ? ' opportunity found!' : ' opportunities found!')
        : messages[state] || messages.idle;
      if (thought.textContent !== message) thought.textContent = message;
      rail.dataset.pose = state === 'results' || state === 'idle' ? 'wave' : busy ? 'look' : 'think';
      if (changed && !media.matches) {
        rail.dataset.position = state === 'results' || state === 'location' ? 'right' : 'left';
        step = 0;
      }
      syncMotion();
    }
    input.addEventListener('input', function () {
      if (!busy) set(input.value.trim() ? 'typing' : 'idle');
    }, { signal: listeners.signal });
    page.querySelector('#job-loc').addEventListener('change', function () {
      if (!busy) set('location');
    }, { signal: listeners.signal });
    const observer = new MutationObserver(syncMotion);
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', syncMotion, { signal: listeners.signal });
    media.addEventListener('change', syncMotion, { signal: listeners.signal });
    mobile.addEventListener('change', function () {
      rail.dataset.position = 'left'; step = 0; syncMotion();
    }, { signal: listeners.signal });
    disposePrevious = function () {
      disposed = true; stop(); listeners.abort(); observer.disconnect();
    };
    set('idle');
    return { set };
  };
})();
