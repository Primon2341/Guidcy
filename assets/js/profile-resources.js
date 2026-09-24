/* Public profiles read the Marketplace catalog; checkout remains owned by Marketplace. */
(function () {
  'use strict';
  const FIELDS = 'id,uploader_id,title,category,description,price,is_free,thumbnail_url,preview_file_path,preview_pdf_path,preview_bucket,downloads_count,status,removed_at,created_at';
  const INITIAL = 4;
  let state = null, channel = null, channelClient = null, poll = null, debounce = null;
  const client = () => window.guidcyGetSupabaseClient?.();
  const viewer = () => String(window.currentUser?.id || '');
  // Render just the first public preview page and reuse it across ownership refreshes.
  const covers = new Map();
  let coverObserver;
  let descriptionObserver, descriptionWidth = 0;
  function fitDescriptions(root) {
    root.querySelectorAll('.gpr-description').forEach(el => {
      const text = el.querySelector('.gpr-description-text');
      const button = el.querySelector('.gpr-description-toggle');
      const id = el.closest('.gpr-card').dataset.resourceId;
      const full = state?.rows.find(n => String(n.id) === id)?.description || '';
      const expanded = state?.expanded.has(id);
      text.textContent = full;
      button.hidden = !expanded;
      button.textContent = expanded ? 'View less' : '… View more';
      button.setAttribute('aria-expanded', String(!!expanded));
      if (expanded || !el.clientWidth) return;
      const height = parseFloat(getComputedStyle(el).lineHeight) * 2 + 1;
      if (el.scrollHeight <= height) return;
      button.hidden = false;
      // Fit the text AND the inline link into the existing two-line space.
      let low = 0, high = full.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        text.textContent = full.slice(0, mid).trimEnd();
        if (el.scrollHeight <= height) low = mid; else high = mid - 1;
      }
      const prefix = full.slice(0, low);
      const wordEnd = prefix.lastIndexOf(' ');
      text.textContent = (wordEnd > 0 && !/\s/.test(full[low] || '') ? prefix.slice(0, wordEnd) : prefix).trimEnd();
    });
  }
  function observeDescriptions(root) {
    fitDescriptions(root);
    if (!('ResizeObserver' in window)) return;
    if (!descriptionObserver) descriptionObserver = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width === descriptionWidth || !active()) return;
      descriptionWidth = width;
      fitDescriptions(state.el);
    });
    descriptionObserver.disconnect();
    descriptionWidth = root.getBoundingClientRect().width;
    descriptionObserver.observe(root);
  }
  async function firstPage(url) {
    if (covers.has(url)) return covers.get(url);
    const pending = (async () => {
      const lib = await window.GuidcyMarketplace.loadPdfJs();
      const pdf = await lib.getDocument({url, withCredentials:false}).promise;
      try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({scale:1});
        const viewport = page.getViewport({scale:192 / base.width});
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise;
        return canvas.toDataURL('image/jpeg', 0.85);
      } finally { await pdf.destroy(); }
    })();
    covers.set(url, pending);
    if (covers.size > 32) covers.delete(covers.keys().next().value);
    try { return await pending; }
    catch (error) { covers.delete(url); throw error; }
  }
  async function showCover(el) {
    if (el.dataset.previewStarted) return;
    el.dataset.previewStarted = '1';
    try {
      const src = await firstPage(el.dataset.resourcePreview);
      if (!el.isConnected) return;
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'First page of ' + (el.closest('.gpr-card')?.querySelector('h4')?.textContent || 'resource');
      img.width = 96; img.height = 120;
      el.replaceChildren(img);
    } catch (_) {
      if (el.isConnected) el.querySelector('.gpr-preview-status').textContent = 'Preview unavailable';
    }
  }
  function observeCovers(root) {
    if ('IntersectionObserver' in window && !coverObserver) {
      coverObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) { coverObserver.unobserve(entry.target); showCover(entry.target); }
        });
      }, {rootMargin:'150px 0px'});
    }
    coverObserver?.disconnect();
    root.querySelectorAll('[data-resource-preview]:not([data-preview-started])').forEach(el => {
      if (coverObserver) coverObserver.observe(el); else showCover(el);
    });
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function active(s = state) {
    const page = document.getElementById('page-profile');
    return s && state === s && s.el.isConnected && !document.hidden &&
      (page?.classList.contains('on') || page?.classList.contains('active'));
  }
  function imageUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.origin);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  function card(n, owned) {
    const paid = Number(n.price) > 0 && !n.is_free;
    const price = paid ? window.guidcyFormatINR(Number(n.price)) : 'Free';
    const cover = imageUrl(n.thumbnail_url);
    const preview = window.GuidcyMarketplace.previewUrl(n);
    return '<article class="gpr-card" data-resource-id="'+esc(n.id)+'">' +
      '<div class="gpr-cover"'+(preview ? ' data-resource-preview="'+esc(preview)+'"' : '')+'>' + (preview ? '<span class="gpr-preview-status">Loading preview…</span>' : cover ? '<img src="'+esc(cover)+'" alt="" width="96" height="120" loading="lazy" decoding="async">' : '<span class="gpr-preview-status">Preview unavailable</span>') + '</div>' +
      '<div class="gpr-body"><div class="gpr-category">'+esc(n.category || 'Resource')+'</div>' +
      '<h4>'+esc(n.title)+'</h4><p class="gpr-description"><span class="gpr-description-text">'+esc(n.description || '')+'</span><button type="button" class="gpr-description-toggle" data-resource-action="description" aria-expanded="false" hidden>… View more</button></p>' +
      '<div class="gpr-meta"><strong>'+esc(price)+'</strong>' +
      (n.downloads_count != null ? '<span>'+esc(Number(n.downloads_count) || 0)+' downloads</span>' : '') + '</div>' +
      '<div class="gpr-actions"><button type="button" class="btn" data-resource-action="details" data-resource-id="'+esc(n.id)+'">View Details</button>' +
      '<button type="button" class="btn btn-blue" data-resource-action="buy" data-resource-id="'+esc(n.id)+'">'+(owned ? 'Download' : paid ? 'Buy Now' : 'Download Free')+'</button></div></div></article>';
  }
  function paint(s) {
    if (state !== s || !s.el.isConnected) return;
    const html = '<h3>Resources by '+esc(s.name)+'</h3><div class="gpr-list">'+s.rows.map(n => card(n, s.owned.has(String(n.id)))).join('')+'</div>' +
      (s.more ? '<button type="button" class="btn gpr-more" data-resource-action="more">'+(s.limit === INITIAL ? 'View all resources' : 'Show more resources')+'</button>' : '') +
      '<p class="gpr-status" role="status" hidden></p>';
    // Revalidation must not replace identical cards or reset keyboard focus.
    if (s.html !== html) { s.el.innerHTML = html; s.html = html; }
    const status = s.el.querySelector('.gpr-status');
    if (status) status.hidden = true;
    s.el.hidden = s.rows.length === 0;
    observeCovers(s.el);
    observeDescriptions(s.el);
  }
  async function refresh() {
    const s = state;
    if (!active(s)) return;
    if (s.pending) { s.again = true; return s.pending; }
    const c = client();
    if (!c) return;
    const userId = viewer();
    s.pending = (async () => {
      s.el.setAttribute('aria-busy', 'true');
      try {
        // profile_id is the auth user ID; consultant.id is a different primary key.
        const result = await c.from('marketplace_notes').select(FIELDS)
          .eq('uploader_id', s.owner).eq('status', 'active').is('removed_at', null)
          .order('created_at', {ascending:false}).order('id', {ascending:false}).limit(s.limit + 1);
        if (result.error) throw result.error;
        if (!active(s)) return;
        const rows = (result.data || []).filter(n => String(n.uploader_id) === s.owner && n.status === 'active' && !n.removed_at);
        s.more = rows.length > s.limit;
        s.rows = rows.slice(0, s.limit);
        const ids = s.rows.map(n => n.id);
        let owned = new Set();
        if (userId && ids.length) {
          // Match the existing secure Marketplace download entitlement exactly.
          const orders = await c.from('marketplace_orders').select('note_id')
            .eq('buyer_id', userId).eq('download_granted', true).in('note_id', ids);
          if (orders.error) throw orders.error;
          owned = new Set((orders.data || []).map(o => String(o.note_id)));
        }
        if (!active(s) || userId !== viewer()) { s.again = true; return; }
        s.owned = owned;
        paint(s);
      } catch (_) {
        if (!active(s)) return;
        if (!s.html) {
          s.el.innerHTML = '<h3>Resources by '+esc(s.name)+'</h3><p class="gpr-status" role="status">Resources could not be loaded.</p><button type="button" class="btn" data-resource-action="retry">Retry</button>';
          s.el.hidden = false;
        } else {
          const status = s.el.querySelector('.gpr-status');
          if (status) { status.textContent = 'Could not refresh resources. Please try again shortly.'; status.hidden = false; }
        }
      } finally {
        s.pending = null;
        s.el.removeAttribute('aria-busy');
        s.el.querySelector('[data-resource-action="more"]')?.removeAttribute('disabled');
        if (s.again && active(s)) { s.again = false; schedule(); }
      }
    })();
    return s.pending;
  }
  function schedule() {
    clearTimeout(debounce);
    if (active()) debounce = setTimeout(refresh, 100);
  }
  function stop() {
    coverObserver?.disconnect();
    descriptionObserver?.disconnect();
    clearInterval(poll); poll = null;
    clearTimeout(debounce); debounce = null;
    if (channel) {
      const old = channel; channel = null;
      Promise.resolve(channelClient.removeChannel(old)).catch(() => {});
    }
  }
  function sync() {
    if (!active()) { stop(); return; }
    const c = client();
    if (!c || poll) return;
    // Public RLS can suppress an UPDATE after a listing becomes private.
    // A visible-page refresh also covers that case and disconnected Realtime.
    poll = setInterval(refresh, 60000);
    if (c.channel) {
      channelClient = c;
      channel = c.channel('guidcy-profile-resources-'+state.owner)
        .on('postgres_changes', {event:'INSERT', schema:'public', table:'marketplace_notes', filter:'uploader_id=eq.'+state.owner}, schedule)
        .on('postgres_changes', {event:'UPDATE', schema:'public', table:'marketplace_notes', filter:'uploader_id=eq.'+state.owner}, schedule)
        // DELETE events cannot be filtered by uploader; the old primary key is available.
        .on('postgres_changes', {event:'DELETE', schema:'public', table:'marketplace_notes'}, payload => {
          if (!payload?.old?.id || state?.rows.some(n => String(n.id) === String(payload.old.id))) schedule();
        })
        .subscribe();
    }
    refresh();
  }
  function mount(consultant) {
    const el = document.getElementById('profile-resources');
    const owner = String(consultant?.profile_id || '');
    if (!el || !owner) { stop(); state = null; if (el) el.hidden = true; return; }
    if (state?.el === el && state.owner === owner) { sync(); return; }
    stop();
    state = {el, owner, name:consultant.name || 'Consultant', rows:[], owned:new Set(), expanded:new Set(), limit:INITIAL, more:false, html:'', pending:null, again:false};
    sync();
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('#profile-resources [data-resource-action]');
    if (!button || button.disabled) return;
    const s = state;
    if (!active(s)) return;
    const action = button.dataset.resourceAction;
    if (action === 'description') {
      const id = button.closest('.gpr-card').dataset.resourceId;
      if (s.expanded.has(id)) s.expanded.delete(id); else s.expanded.add(id);
      fitDescriptions(s.el);
      return;
    }
    if (action === 'more') { s.limit += 20; button.disabled = true; await refresh(); return; }
    if (action === 'retry') { await refresh(); return; }
    button.disabled = true;
    try {
      // Check current publication state before acting on a card left open in a tab.
      const id = button.dataset.resourceId;
      const result = await client().from('marketplace_notes').select('id')
        .eq('id', id).eq('uploader_id', s.owner).eq('status', 'active').is('removed_at', null).maybeSingle();
      if (result.error) throw result.error;
      if (!active(s)) return;
      if (!result.data) { window.toast?.('This resource is no longer available.', 'blue'); await refresh(); return; }
      if (action === 'details') await window.GuidcyMarketplace.openDetails(id);
      else await window.GuidcyMarketplace.buyOrDownload(id);
    } catch (_) { window.toast?.('Unable to open this resource. Please try again.', 'red'); }
    finally { button.disabled = false; if (action === 'buy') schedule(); }
  });
  function boot() {
    const page = document.getElementById('page-profile');
    if (page) new MutationObserver(sync).observe(page, {attributes:true, attributeFilter:['class']});
    if (window.curCons) mount(window.curCons);
    const c = client();
    c?.auth?.onAuthStateChange(() => {
      // Defer database reads until Supabase releases the auth callback lock.
      setTimeout(() => { if (state) { state.owned = new Set(); paint(state); } schedule(); }, 0);
    });
  }
  window.GuidcyProfileResources = {mount, refresh};
  window.addEventListener('guidcy:auth-ready', () => { sync(); schedule(); });
  window.addEventListener('guidcy:marketplace-purchase-updated', schedule);
  window.addEventListener('focus', schedule);
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
