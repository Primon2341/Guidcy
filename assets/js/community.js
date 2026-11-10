/* Homepage social layer. Identity, navigation and booking remain owned by Guidcy. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => window.guidcyEscapeHtml(String(value ?? ''));
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
  const client = () => window.guidcyGetSupabaseClient?.() || window.sb;
  const state = {user:null, mode:'community', rows:new Map(), people:new Map(), epoch:0, busy:false, cursor:null, asOf:null, key:'', at:0, follows:new Set()};
  let authStarted=false, authReady=null, profileKey='', profileEpoch=0, lastFocus=null;
  const home = () => $('page-home')?.classList.contains('on');
  const params = () => new URLSearchParams(location.search);
  const safeURL = value => {if(!value)return '';try {const u=new URL(value,location.origin);return /^https?:$/.test(u.protocol)?u.href:'';} catch (_) {return '';}};
  const imageURL = value => /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value||'')?value:safeURL(value);
  const href = p => p.consultant_id ? '/consultant/'+encodeURIComponent(p.consultant_id) : '/profile?member='+encodeURIComponent(p.id);
  const postURL = id => location.origin+'/?post='+encodeURIComponent(id);
  function avatar(p,eager=false) {
    if(!p||!p.name||p.name==='Guidcy member')return brand();
    const raw=p?.avatar_url||'';
    const url=imageURL(raw);
    return url && p?.avatar_url ? `<img class="gnet-avatar" src="${esc(url)}" alt="" width="44" height="44" loading="${eager?'eager':'lazy'}" decoding="async">` : `<span class="gnet-avatar" aria-hidden="true">${esc((p?.name||'Guidcy').split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase())}</span>`;
  }
  function follow(p) {
    return p.id===state.user?.id?'':`<button class="gnet-follow" data-follow="${esc(p.id)}" aria-pressed="${!!p.is_following}">${p.is_following?'Following':'＋ Follow'}</button>`;
  }
  function identity(p,showCompany=true) {
    const headline=[p.headline,showCompany?p.company:''].filter(Boolean).join(' · ')||'Guidcy community member';
    return `<a class="gnet-person" href="${esc(href(p))}">${avatar(p)}<span><strong>${esc(p.name)}</strong><span class="gnet-headline">${esc(headline)}</span></span></a>`;
  }
  function notice(message) {window.toast?.(message);}
  async function result(query) {const r=await query;if(r.error)throw r.error;return r.data || [];}
  async function people(ids) {
    if(!ids.length)return;
    const viewer=state.user?.id;
    const rows=await result(client().rpc('community_people',{p_ids:[...new Set(ids)].slice(0,50)}));
    if(viewer!==state.user?.id)return;
    rows.forEach(p=>state.people.set(p.id,{...state.people.get(p.id),...p}));
  }
  function person(id) {return state.people.get(id)||{id,name:'Guidcy member',headline:''};}
  function requireUser() {
    if(state.user)return true;
    const d=dialog('Join the conversation',`<p>Sign in to post, follow people, like, comment or save. You can keep exploring public posts and expert profiles.</p><div class="gnet-dialog-actions"><button class="gnet-button" data-close>Keep exploring</button><a class="gnet-button gnet-primary" href="/login">Log in</a><a class="gnet-text-link" href="/signup">Create an account</a></div>`);
    d.querySelector('a').focus();return false;
  }
  function dialog(title,body,focusHeading=false) {
    $('gnet-dialog')?.close();$('gnet-dialog')?.remove();lastFocus=document.activeElement;
    const d=document.createElement('dialog');d.id='gnet-dialog';d.className='gnet-dialog';
    d.innerHTML=`<header><h2 id="gnet-dialog-title">${esc(title)}</h2><button data-close aria-label="Close dialog">×</button></header>${body}`;
    d.setAttribute('aria-labelledby','gnet-dialog-title');document.body.append(d);d.showModal();
    if(focusHeading){const heading=d.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});}
    d.addEventListener('click',e=>{if(e.target.closest('[data-close]'))d.close();const a=e.target.closest('a[href]');if(a&&new URL(a.href).origin===location.origin)d.close();});
    d.addEventListener('close',()=>{d.remove();lastFocus?.isConnected&&lastFocus.focus({preventScroll:true});},{once:true});
    return d;
  }
  function icon(name) {
    const paths={link:'M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2',like:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',comment:'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',share:'M7 17 17 7M7 7h10v10',save:'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'};
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
  }
  function postCard(p) {
    const author=person(p.author_id), mine=p.author_id===state.user?.id;
    const image=p.image_path?client().storage.from('community-images').getPublicUrl(p.image_path).data.publicUrl:'';
    const date=new Date(p.created_at);
    return `<article class="gnet-card gnet-post" data-post="${esc(p.id)}" aria-label="Post by ${esc(author.name)}"><header>${identity(author,false)}${follow(author)}${mine?`<details class="gnet-menu"><summary aria-label="Post options">•••</summary><div><button data-action="edit">Edit post</button><button data-action="delete">Delete post</button></div></details>`:''}</header><div class="gnet-post-meta"><a href="/?post=${esc(p.id)}"><time datetime="${esc(p.created_at)}" title="${esc(date.toLocaleString())}">${esc(date.toLocaleDateString(undefined,{month:'short',day:'numeric'}))}</time></a> · Public</div><div class="gnet-post-copy"><div class="gnet-post-body gnet-collapsed">${esc(p.body)}</div><button class="gnet-read-more" data-action="expand" aria-expanded="false" hidden>… more</button></div>${image?`<img class="gnet-post-image" src="${esc(image)}" alt="${esc(p.image_alt||'Image shared by '+author.name)}" loading="lazy" decoding="async" width="960" height="640">`:''}<div class="gnet-post-counts"><span data-like-count>${Number(p.likes)} likes</span><button data-action="comments"><span data-comment-count>${Number(p.comments)}</span> comments</button>${author.consultant_id?`<a href="${esc(href(author))}" class="gnet-text-link">View expert ↗</a>`:''}</div><div class="gnet-post-actions"><button data-action="like" aria-pressed="${!!p.liked}">${icon('like')} Like</button><button data-action="comments">${icon('comment')} Comment</button><button data-action="share">${icon('share')} Share</button><button data-action="save" aria-pressed="${!!p.saved}">${icon('save')} <span data-save-label>${p.saved?'Saved':'Save'}</span></button></div><section class="gnet-comments" aria-label="Comments" hidden></section></article>`;
  }
  const previewBodies=new Set();
  function paintPostPreviews(bodies){
    const updates=bodies.filter(body=>body.isConnected).map(body=>({button:body.nextElementSibling,show:!body.classList.contains('gnet-collapsed')||body.scrollHeight>body.clientHeight+1}));
    updates.forEach(({button,show})=>{if(button?.matches('[data-action=expand]'))button.hidden=!show;});
  }
  const previewObserver=new ResizeObserver(entries=>paintPostPreviews(entries.map(e=>e.target)));
  function syncPostPreviews(){
    for(const body of previewBodies)if(!body.isConnected){previewObserver.unobserve(body);previewBodies.delete(body);}
    const bodies=[...document.querySelectorAll('.gnet-post-body')];
    for(const body of bodies)if(!previewBodies.has(body)){previewBodies.add(body);previewObserver.observe(body);}
    paintPostPreviews(bodies);
  }
  document.fonts?.ready.then(syncPostPreviews);
  function paintComposerAvatar() {
    const p=state.user?person(state.user.id):null;
    $('gnet-compose-avatar').innerHTML=avatar(p);
  }
  async function sidebar() {
    const epoch=state.epoch;
    try {
      if(state.user)await profileInfo(state.user.id);
      if(epoch!==state.epoch)return;paintComposerAvatar();
      const experts=await result(client().rpc('community_people',{p_ids:null}));
      if(epoch!==state.epoch)return;
      experts.forEach(p=>state.people.set(p.id,{...state.people.get(p.id),...p}));
      $('gnet-experts').innerHTML=experts.length?experts.map(p=>`<div class="gnet-expert">${identity(p)}${p.expertise?.length?`<p class="gnet-expertise">${esc(p.expertise.slice(0,2).join(' · '))}</p>`:''}${follow(p)}</div>`).join(''):'<p class="gnet-muted">Explore the expert directory to find your next guide.</p>';
    } catch (_) {if(epoch===state.epoch){paintComposerAvatar();$('gnet-experts').innerHTML='<p class="gnet-muted">Suggestions are unavailable. You can still browse experts.</p>';}}
  }
  function feedKey() {return [state.user?.id||'',state.mode,params().get('post')||'',params().get('author')||''].join('|');}
  async function load(reset=false) {
    if(!home()||!client())return;
    if(!reset&&state.busy)return;
    if(reset){state.epoch++;state.cursor=null;state.asOf=new Date().toISOString();if(state.key&&state.key!==feedKey()){$('gnet-feed').replaceChildren();state.rows.clear();}state.key=feedKey();$('gnet-feed').innerHTML='<div class="gnet-card gnet-loading" role="status"><div class="gnet-skeleton"></div><div class="gnet-skeleton"></div><span class="sr-only">Loading posts</span></div>';}
    document.querySelectorAll('.gnet-feed-toolbar [data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    const label=$('gnet-view-label');label.textContent=params().has('author')?'Posts from this member':state.mode==='mine'?'My Posts':state.mode==='saved'?'Saved Posts':'';label.hidden=!label.textContent;
    const epoch=state.epoch;state.busy=true;$('gnet-feed').setAttribute('aria-busy','true');$('gnet-more').disabled=true;
    try {
      const post=params().get('post'),author=params().get('author');
      if((post&&!uuid(post))||(author&&!uuid(author)))throw new Error('invalid-link');
      const rows=await result(client().rpc('community_feed',{p_mode:post||author?'latest':state.mode,p_before:state.cursor?.rank_at||null,p_before_id:state.cursor?.id||null,p_as_of:state.asOf,p_post:post||null,p_author:author||null}));
      await people(rows.slice(0,12).map(p=>p.author_id));
      if(epoch!==state.epoch||!home())return;
      if(reset){state.rows.clear();$('gnet-feed').innerHTML=rows.slice(0,12).map(postCard).join('');rows.slice(0,12).forEach(p=>state.rows.set(p.id,p));}
      else rows.slice(0,12).forEach(p=>{if(!state.rows.has(p.id)){$('gnet-feed').insertAdjacentHTML('beforeend',postCard(p));state.rows.set(p.id,p);}});
      state.cursor=rows.slice(0,12).at(-1)||state.cursor;
      $('gnet-more').hidden=rows.length<=12||!!post;
      if(!state.rows.size)$('gnet-feed').innerHTML=`<div class="gnet-card gnet-empty"><span class="gnet-empty-mark" aria-hidden="true">↗</span><p class="gnet-eyebrow">${post?'POST UNAVAILABLE':'ROOM FOR YOUR PERSPECTIVE'}</p><h2>${post?'This post is no longer available.':state.mode==='saved'?'Your saved ideas belong here.':state.mode==='following'?'Your circle starts with a follow.':'Be part of the conversation.'}</h2><p>${post?'The author may have deleted it.':state.mode==='saved'?'Save useful posts and come back to them anytime.':state.mode==='following'?'Follow people whose experience interests you. Their posts will appear here.':'Share something you learned, celebrate a milestone, or ask your community a thoughtful question.'}</p>${post?'<a class="gnet-button" href="/" data-guidcy-back>Back</a>':'<button class="gnet-button gnet-primary" data-action="compose">Share your first post</button>'}</div>`;
      else if(post)$('gnet-feed').insertAdjacentHTML('afterbegin','<a class="gnet-back" href="/" data-guidcy-back>← Back</a>');
      state.at=Date.now();
    } catch (e) {
      if(epoch!==state.epoch)return;
      if(reset)$('gnet-feed').innerHTML=`<div class="gnet-card gnet-empty" role="status"><h2>${e.message==='invalid-link'?'This post link is invalid.':'The feed couldn’t load.'}</h2><p>Please try again. Your profile and bookings are still available.</p><button class="gnet-button" data-action="refresh">Try again</button></div>`;
      else notice('Could not load more posts. Please try again.');
      $('gnet-more').hidden=reset;
    } finally {if(epoch===state.epoch){state.busy=false;$('gnet-feed').setAttribute('aria-busy','false');$('gnet-more').disabled=false;syncPostPreviews();}}
  }
  async function mount() {
    if(!home())return;
    await startAuth();
    if(!home())return;
    if(state.key===feedKey()&&(state.busy||Date.now()-state.at<45000))return;
    load(true);sidebar();
  }
  function syncFollow(id) {
    const p=person(id);
    document.querySelectorAll(`[data-follow="${id}"]`).forEach(b=>{b.textContent=p.is_following?'Following':'＋ Follow';b.setAttribute('aria-pressed',String(!!p.is_following));b.disabled=state.follows.has(id);});
    document.querySelectorAll(`[data-follow-count="${id}"]`).forEach(el=>el.innerHTML=followCounts(p));
  }
  async function toggleFollow(id) {
    if(!requireUser()||state.follows.has(id)||id===state.user.id)return;
    const p=person(id),before=!!p.is_following,oldCount=Number(p.followers||0),me=state.people.get(state.user.id);
    p.is_following=!before;p.followers=Math.max(0,oldCount+(before?-1:1));state.people.set(id,p);state.follows.add(id);syncFollow(id);
    try {
      const q=client().from('community_follows');
      const r=before?await q.delete().eq('follower_id',state.user.id).eq('following_id',id):await q.insert({follower_id:state.user.id,following_id:id});
      if(r.error&&r.error.code!=='23505')throw r.error;
      if(me){me.following=Math.max(0,Number(me.following||0)+(before?-1:1));paintComposerAvatar();syncFollow(me.id);}
      state.at=0; // Apply the new ranking on the next refresh; keep reading position stable.
    } catch (_) {p.is_following=before;p.followers=oldCount;notice('Could not update follow. Please try again.');}
    finally {state.follows.delete(id);syncFollow(id);}
  }
  function clearLikeMotion(button) {
    try {
      button.querySelector('svg')?.getAnimations?.().forEach(animation=>animation.cancel());
      const burst=button.closest('[data-post]')?.querySelector('.gnet-like-burst');
      burst?.getAnimations?.().forEach(animation=>animation.cancel());burst?.remove();
    } catch (_) {/* Motion must never block the underlying like operation. */}
  }
  function animateLike(button,content) {
    try {
      clearLikeMotion(button);
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const heart=button.querySelector('svg');if(!heart?.animate)return;
      heart.animate([{transform:'scale(1)'},{transform:'scale(1.35)',offset:.4},{transform:'scale(.92)',offset:.75},{transform:'scale(1)'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'}).finished.catch(()=>{});
      if(!content)return;
      const card=button.closest('[data-post]'),area=content.getBoundingClientRect(),bounds=card.getBoundingClientRect();
      const burst=document.createElement('span');burst.className='gnet-like-burst';burst.setAttribute('aria-hidden','true');burst.innerHTML=icon('like');
      burst.style.left=(area.left-bounds.left-card.clientLeft+area.width/2)+'px';burst.style.top=(area.top-bounds.top-card.clientTop+area.height/2)+'px';card.append(burst);
      const animation=burst.animate([{transform:'translate(-50%,-50%) scale(.35) rotate(-12deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.12)',opacity:1,offset:.25},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.6},{transform:'translate(-50%,-50%) scale(1.12)',opacity:0}],{duration:650,easing:'ease-out'});
      animation.finished.then(()=>burst.remove(),()=>burst.remove());
    } catch (_) {clearLikeMotion(button);}
  }
  async function toggleReaction(button,p,save,content=null) {
    if(!requireUser()||button.disabled)return;
    const key=save?'saved':'liked',before=p[key],old=p.likes;
    button.disabled=true;p[key]=!before;if(!save)p.likes=Math.max(0,Number(p.likes)+(before?-1:1));
    const card=button.closest('[data-post]');button.setAttribute('aria-pressed',String(p[key]));
    const paint=()=>{if(save)button.querySelector('[data-save-label]').textContent=p.saved?'Saved':'Save';else card.querySelector('[data-like-count]').textContent=p.likes+' likes';};paint();
    if(!save){if(before)clearLikeMotion(button);else animateLike(button,content);}
    try {const q=client().from(save?'community_saves':'community_likes');const r=before?await q.delete().eq('post_id',p.id).eq('user_id',state.user.id):await q.insert({post_id:p.id,user_id:state.user.id});if(r.error&&r.error.code!=='23505')throw r.error;}
    catch (_) {if(!save)clearLikeMotion(button);p[key]=before;p.likes=old;button.setAttribute('aria-pressed',String(before));paint();notice('Could not save your change. Please try again.');}
    finally {button.disabled=false;}
  }
  function postContent(target) {
    return target instanceof Element&&!target.closest('a,button,input,textarea,select')?target.closest('.gnet-post-body,.gnet-post-image'):null;
  }
  function likePostContent(content) {
    const card=content?.closest('[data-post]'),p=card&&(profilePosts.get(card.dataset.post)||state.rows.get(card.dataset.post));
    const button=card?.querySelector('[data-action=like]');
    if(!p||!button||button.disabled)return;
    if(!p.liked)toggleReaction(button,p,false,content);
    else if(state.user)animateLike(button,content);
  }
  // Touch taps must stay on the same post and cannot be part of a swipe/scroll.
  let touchDown=null,lastTap=null;
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch')return;
    const content=postContent(e.target);
    if(!e.isPrimary||!content){touchDown=null;lastTap=null;return;}
    touchDown={content,id:e.pointerId,x:e.clientX,y:e.clientY,at:e.timeStamp};
  },{passive:true});
  document.addEventListener('pointercancel',()=>{touchDown=null;lastTap=null;},{passive:true});
  document.addEventListener('pointerup',e=>{
    if(e.pointerType!=='touch')return;
    const down=touchDown;touchDown=null;
    if(!down||down.id!==e.pointerId||e.timeStamp-down.at>300||Math.hypot(e.clientX-down.x,e.clientY-down.y)>12){lastTap=null;return;}
    if(lastTap&&lastTap.content===down.content&&e.timeStamp-lastTap.at<=320&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=28){lastTap=null;likePostContent(down.content);}
    else lastTap={content:down.content,x:e.clientX,y:e.clientY,at:e.timeStamp};
  },{passive:true});
  document.addEventListener('dblclick',e=>likePostContent(postContent(e.target)));
  async function compress(file) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('Choose a JPG, PNG or WebP image under 15 MB.');
    const bitmap=await createImageBitmap(file);
    try {const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));if(!blob||blob.type!=='image/webp'||blob.size>2097152)throw new Error('This image is too large. Please choose a smaller image.');return blob;} finally {bitmap.close();}
  }
  function compose(post) {
    if(!requireUser())return;
    let blob=null,previewURL='',removed=false,imageEpoch=0;
    const d=dialog(post?'Edit your post':'Share with the community',`<form id="gnet-post-form"><p class="gnet-muted">Public · Visible to anyone, including people outside Guidcy</p><label class="sr-only" for="gnet-body">Post content</label><textarea id="gnet-body" maxlength="5000" rows="7" placeholder="What would you like to share?">${esc(post?.body||'')}</textarea><div id="gnet-preview"></div><label for="gnet-file">Add a photo</label><input type="file" id="gnet-file" data-no-avatar-crop accept="image/jpeg,image/png,image/webp"><p class="gnet-form-error" role="alert"></p><div class="gnet-dialog-actions"><span class="gnet-muted">Up to 5,000 characters</span><button class="gnet-button gnet-primary" type="submit">${post?'Save changes':'Publish post'}</button></div></form>`);
    const preview=d.querySelector('#gnet-preview'),error=d.querySelector('.gnet-form-error'),submit=d.querySelector('[type=submit]');
    function paintPreview(url){preview.innerHTML=url?`<img src="${esc(url)}" alt="Selected image preview"><button type="button" class="gnet-button" id="gnet-remove-image">Remove image</button>`:'';preview.querySelector('button')?.addEventListener('click',()=>{imageEpoch++;blob=null;removed=true;submit.disabled=false;d.querySelector('#gnet-file').value='';paintPreview('');});}
    if(post?.image_path)paintPreview(client().storage.from('community-images').getPublicUrl(post.image_path).data.publicUrl);
    d.querySelector('#gnet-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;const epoch=++imageEpoch;submit.disabled=true;error.textContent='';try{const next=await compress(file);if(epoch!==imageEpoch)return;blob=next;removed=false;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);paintPreview(previewURL);}catch(e){error.textContent=e.message;}finally{if(epoch===imageEpoch)submit.disabled=false;}});
    d.addEventListener('close',()=>{imageEpoch++;if(previewURL)URL.revokeObjectURL(previewURL);});
    d.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();if(submit.disabled)return;
      const owner=state.user?.id;if(!owner){error.textContent='Please log in again before publishing.';return;}
      const body=d.querySelector('#gnet-body').value.trim();let path=removed?null:post?.image_path||null,uploaded=null;
      if(!body&&!blob&&!path){error.textContent='Add some text or an image to your post.';return;}
      submit.disabled=true;error.textContent='';d.querySelectorAll('[data-close]').forEach(b=>b.disabled=true);d.oncancel=e=>e.preventDefault();
      try {
        if(blob){uploaded=owner+'/'+crypto.randomUUID()+'.webp';await result(client().storage.from('community-images').upload(uploaded,blob,{contentType:'image/webp',upsert:false}));path=uploaded;}
        const data={body,image_path:path,image_alt:path===post?.image_path?(post.image_alt||''):''};
        await result(post?client().from('community_posts').update(data).eq('id',post.id).eq('author_id',owner).select('id').single():client().from('community_posts').insert({...data,author_id:owner}).select('id').single());
        if(post?.image_path&&post.image_path!==path)await cleanupImage(post.image_path);
        d.close();state.at=0;if(home()){await load(true);sidebar();}else refreshActivity();notice(post?'Post updated.':'Your post is published.');
      } catch (_) {if(uploaded)await cleanupImage(uploaded);error.textContent='Your post could not be saved. Your draft is still here; please try again.';}
      finally {submit.disabled=false;d.querySelectorAll('[data-close]').forEach(b=>b.disabled=false);d.oncancel=null;}
    });
    d.querySelector('textarea').focus();
  }
  // ponytail: browser cleanup is best-effort; add a scheduled orphan sweep if storage grows.
  async function cleanupImage(path) {try {const r=await client().storage.from('community-images').remove([path]);if(r.error)console.warn('Community image cleanup needs retry',r.error.code);}catch (_) {console.warn('Community image cleanup needs retry');}}
  function removePost(post) {
    if(!requireUser()||post.author_id!==state.user.id)return;
    const d=dialog('Delete this post?',`<p>This will remove your post and its likes, comments and saves.</p><p class="gnet-form-error" role="alert"></p><div class="gnet-dialog-actions"><button class="gnet-button" data-close>Keep post</button><button class="gnet-button gnet-danger" id="gnet-delete-confirm">Delete post</button></div>`);
    d.querySelector('#gnet-delete-confirm').onclick=async e=>{e.target.disabled=true;try {await result(client().from('community_posts').delete().eq('id',post.id).eq('author_id',state.user.id).select('id').single());if(post.image_path)await cleanupImage(post.image_path);d.close();if(home())load(true);else refreshActivity();}catch(_){d.querySelector('.gnet-form-error').textContent='Could not delete the post. Please try again.';e.target.disabled=false;}};
  }
  async function comments(card,p,append=false) {
    const section=card.querySelector('.gnet-comments');
    if(!append&&!section.hidden){section.hidden=true;section._request=(section._request||0)+1;return;}
    section.hidden=false;
    const request=section._request=(section._request||0)+1;
    if(!append){section.innerHTML='<div class="guidcy-retro-loader gnet-load-status" role="status"><span class="guidcy-loading-label">Loading comments...</span><span class="guidcy-loading-track" aria-hidden="true"><span class="guidcy-loading-fill"></span></span></div>';section._cursor=null;}
    try {
      let q=client().from('community_comments').select('id,author_id,body,created_at').eq('post_id',p.id).order('created_at').order('id').limit(11);
      const cursor=section._cursor;if(cursor)q=q.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
      const rows=await result(q);await people([...rows.slice(0,10).map(r=>r.author_id),...(state.user?[state.user.id]:[])]);if(!card.isConnected||request!==section._request)return;
      if(!append){
        section.innerHTML=`<form class="gnet-comment-form">${avatar(state.user?person(state.user.id):null)}<div class="gnet-comment-input"><label class="sr-only" for="comment-${esc(p.id)}">Write a comment</label><textarea id="comment-${esc(p.id)}" maxlength="1500" rows="1" placeholder="Add a comment…" required></textarea><button class="gnet-button gnet-comment-submit" type="submit" hidden><span>Post</span></button></div><p class="gnet-form-error" role="alert"></p></form><div class="gnet-comments-heading">Comments</div><div class="gnet-comment-list"></div><button class="gnet-text-link gnet-comments-more">See more comments</button>`;
        section.querySelector('.gnet-comments-more').onclick=e=>{e.target.disabled=true;comments(card,p,true);};
        section.querySelector('form').oninput=e=>{const form=e.currentTarget;form.querySelector('[type=submit]').hidden=!form.querySelector('textarea').value.trim();};
        section.querySelector('form').onsubmit=async e=>{
          e.preventDefault();if(!requireUser())return;
          const form=e.target,input=form.querySelector('textarea'),button=form.querySelector('button'),error=form.querySelector('.gnet-form-error');
          if(button.disabled||!input.value.trim())return;
          button.disabled=true;error.textContent='';
          try{
            await result(client().from('community_comments').insert({post_id:p.id,author_id:state.user.id,body:input.value.trim()}));
            input.value='';button.hidden=true;p.comments=Number(p.comments)+1;card.querySelector('[data-comment-count]').textContent=p.comments;
            section.hidden=true;comments(card,p);
          }catch(_){error.textContent='Comment not sent. Please try again.';}
          finally{button.disabled=false;}
        };
      }
      section.querySelector('.gnet-comment-list').insertAdjacentHTML('beforeend',rows.slice(0,10).map(c=>{
        const author=person(c.author_id),date=new Date(c.created_at);
        return `<div class="gnet-comment" data-comment="${esc(c.id)}"><header>${identity(author,false)}</header><div class="gnet-comment-meta"><time datetime="${esc(c.created_at)}" title="${esc(date.toLocaleString())}">${esc(date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))}</time>${follow(author)}</div><p>${esc(c.body)}</p>${c.author_id===state.user?.id?'<button class="gnet-text-link" data-delete-comment>Delete comment</button>':''}</div>`;
      }).join(''));
      section._cursor=rows.slice(0,10).at(-1)||cursor;
      const more=section.querySelector('.gnet-comments-more');more.hidden=rows.length<=10;more.disabled=false;
      section.querySelectorAll('[data-delete-comment]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await result(client().from('community_comments').delete().eq('id',b.closest('[data-comment]').dataset.comment).eq('author_id',state.user.id));b.closest('[data-comment]').remove();p.comments=Math.max(0,Number(p.comments)-1);card.querySelector('[data-comment-count]').textContent=p.comments;}catch(_){notice('Could not delete the comment.');b.disabled=false;}});
    }catch(_){if(request!==section._request||!card.isConnected)return;if(!append){section.innerHTML='<button class="gnet-button">Comments couldn’t load. Retry</button>';section.querySelector('button').onclick=()=>{section.hidden=true;comments(card,p);};}else{notice('Could not load more comments.');section.querySelector('.gnet-comments-more').disabled=false;}}
  }
  function share(p) {
    shareLink(postURL(p.id),'Share this post');
  }
  function shareLink(url,title) {
    const encoded=encodeURIComponent(url);
    const d=dialog(title,`<p>Share this with the Guidcy community.</p><div class="gnet-share-options"><button class="gnet-button" id="gnet-copy">Copy Link</button><a class="gnet-button" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encoded}">WhatsApp</a><a class="gnet-button" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url=${encoded}">LinkedIn</a><a class="gnet-button" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?url=${encoded}">X / Twitter</a>${navigator.share?'<button class="gnet-button" id="gnet-native">More options</button>':''}</div><label for="gnet-share-url">Post link</label><input id="gnet-share-url" value="${esc(url)}" readonly><p role="status" id="gnet-copy-status"></p>`);
    d.querySelector('#gnet-copy').onclick=async()=>{try{await navigator.clipboard.writeText(url);d.querySelector('#gnet-copy-status').textContent='Link copied.';}catch(_){d.querySelector('input').select();d.querySelector('#gnet-copy-status').textContent='Select and copy the link above.';}};
    const native=d.querySelector('#gnet-native');if(native)native.onclick=async()=>{try{await navigator.share({title,url});}catch(e){if(e.name!=='AbortError')d.querySelector('#gnet-copy-status').textContent='Sharing is unavailable. You can copy the link instead.';}};
  }
  function network() {
    if(!requireUser())return;
    const d=dialog('People you follow','<div id="gnet-network-list"></div><button class="gnet-button" id="gnet-network-more">Load people</button>',true);
    let cursor=null;const button=d.querySelector('#gnet-network-more');
    const fetchNext=async()=>{button.disabled=true;try{let q=client().from('community_follows').select('following_id').eq('follower_id',state.user.id).order('following_id').limit(21);if(cursor)q=q.gt('following_id',cursor);const rows=await result(q);await people(rows.slice(0,20).map(r=>r.following_id));d.querySelector('#gnet-network-list').insertAdjacentHTML('beforeend',rows.slice(0,20).map(r=>`<div class="gnet-expert">${identity(person(r.following_id))}${follow(person(r.following_id))}</div>`).join(''));if(!rows.length&&!cursor)d.querySelector('#gnet-network-list').textContent='Follow people from their posts or profiles to build your circle.';cursor=rows.slice(0,20).at(-1)?.following_id;button.hidden=rows.length<=20;button.textContent='Load more people';}catch(_){button.textContent='Could not load people. Retry';}finally{button.disabled=false;}};
    button.onclick=fetchNext;fetchNext();
  }
  let profilePerson=null;
  const profilePosts=new Map();
  const brand=()=>'<img class="gnet-avatar gnet-brand" src="/favicon-96x96.png?v=guidcy-mark-20261007" alt="Guidcy" width="44" height="44">';
  const coverURL=p=>p.cover_path?client().storage.from('community-images').getPublicUrl(p.cover_path).data.publicUrl:'';
  function headline(p) {
    const value=(p.headline||'').trim();
    if(value)return value;
    return (p.expertise||[]).slice(0,2).join(' · ')||p.education||'Guidcy community member';
  }
  async function profileInfo(id) {
    const data=await result(client().rpc('community_profile',{p_id:id}));
    if(!data?.id)throw new Error('Profile unavailable');
    state.people.set(id,data);return data;
  }
  const entryLabels={education:'Education',certification:'Certifications',award:'Awards',publication:'Publications',project:'Projects',patent:'Patents',achievement:'Achievements'};
  let portfolio={owner:null,entries:[],featured:[]}, activityCursor=null,activityEpoch=0;
  const ownProfile=()=>profilePerson?.id===state.user?.id;
  const tags=p=>[...new Set([...(p.skills||[]),...(p.expertise||[])])];
  const editButton=(section,label='Edit')=>ownProfile()?`<button class="gnet-text-link" data-action="profile-section" data-section="${section}">${label}</button>`:'';
  const organizationKey=name=>String(name||'').trim().replace(/\s+/g,' ').toLowerCase();
  const organizationSelect='id,kind,name,name_key,logo_url,is_approved';
  function organizationMark(name,kind,entry=false){return `<span class="${entry?'gnet-entry-mark':'gnet-org-mark'}" data-organization="${esc(organizationKey(name))}" data-organization-kind="${kind}" aria-hidden="true">${kind==='company'?'▤':'◇'}</span>`;}
  function organizationName(name,kind){return `<span data-organization-name="${esc(organizationKey(name))}" data-organization-kind="${kind}">${esc(name)}</span>`;}
  async function loadOrganizationLogos(root){
    const marks=[...root.querySelectorAll('[data-organization],[data-organization-name]')],names=[...new Set(marks.map(el=>el.dataset.organization||el.dataset.organizationName).filter(Boolean))].slice(0,150);if(!names.length)return;
    try{const rows=(await Promise.all([...new Set(marks.map(el=>el.dataset.organizationKind))].map(kind=>result(client().rpc('community_organization_matches',{p_kind:kind,p_names:names}))))).flat();
      for(let mark of marks){if(!mark.isConnected)continue;const row=rows.find(r=>r.name_key===(mark.dataset.organization||mark.dataset.organizationName)&&r.kind===mark.dataset.organizationKind);if(!row)continue;
        if(row.consultant_id){
          if(mark.tagName!=='A'){const link=document.createElement('a');for(const attr of mark.attributes)link.setAttribute(attr.name,attr.value);link.append(...mark.childNodes);mark.replaceWith(link);mark=link;}
          mark.href=href({consultant_id:row.consultant_id});mark.classList.add('gnet-organization-link');mark.removeAttribute('aria-hidden');mark.setAttribute('aria-label','View '+row.name+' on Guidcy');
        }
        const url=imageURL(row.logo_url);if(!mark.dataset.organization||!url)continue;
        const image=document.createElement('img');image.src=url;image.alt='';image.loading='lazy';image.decoding='async';image.width=40;image.height=40;image.onerror=()=>{if(mark.isConnected)mark.textContent=row.kind==='company'?'▤':'◇';};mark.replaceChildren(image);
      }
    }catch(_){/* Names remain usable when the directory is temporarily unavailable. */}
  }
  function organizationSuggestions(input,kind){
    if(!input)return;const list=document.createElement('datalist');list.id=input.id+'-organizations';input.setAttribute('list',list.id);input.after(list);let timer,epoch=0;
    input.addEventListener('input',()=>{clearTimeout(timer);const turn=++epoch;list.replaceChildren();const key=organizationKey(input.value);if(key.length<2)return;
      timer=setTimeout(async()=>{try{const rows=await result(client().rpc('community_organization_matches',{p_kind:kind,p_query:key}));if(turn!==epoch||!input.isConnected)return;list.innerHTML=rows.map(r=>`<option value="${esc(r.name)}" label="${r.source==='consultant'?'Registered Guidcy profile':'Organization directory'}"></option>`).join('');}catch(_){}},200);
    });input.closest('dialog')?.addEventListener('close',()=>{epoch++;clearTimeout(timer);},{once:true});
  }
  async function organizationDirectory(){
    if(!requireUser())return;
    const d=dialog('Organization directory','<p class="gnet-muted">Approved company and college logos appear automatically on matching profiles. Use the official name; matching ignores case and extra spaces.</p><label for="gnet-org-search">Search organizations</label><input id="gnet-org-search" type="search" maxlength="160"><button class="gnet-button" id="gnet-org-add">Add organization</button><div id="gnet-org-list"></div><button class="gnet-text-link" id="gnet-org-next" hidden>Show more</button><p class="gnet-form-error" role="alert"></p>');
    let cursor=null,epoch=0,timer;const list=d.querySelector('#gnet-org-list'),next=d.querySelector('#gnet-org-next'),error=d.querySelector('.gnet-form-error');
    async function load(reset=true){const turn=++epoch;if(reset){cursor=null;list.replaceChildren();}next.disabled=true;error.textContent='';
      try{let q=client().from('community_organizations').select(organizationSelect).order('id').limit(21);const term=organizationKey(d.querySelector('input').value);if(term)q=q.ilike('name_key',term.replace(/[\\%_]/g,'\\$&')+'%');if(cursor)q=q.gt('id',cursor);const rows=await result(q);if(turn!==epoch||!d.isConnected)return;
        for(const row of rows.slice(0,20)){const button=document.createElement('button');button.className='gnet-button gnet-org-row';button.textContent=row.name+' · '+(row.kind==='college'?'College':'Company')+' · '+(row.is_approved?'Approved':'Hidden');button.onclick=()=>editOrganization(row);list.append(button);}
        if(reset&&!rows.length)list.innerHTML='<p class="gnet-muted">No organizations yet. Add an official name and logo to get started.</p>';cursor=rows.slice(0,20).at(-1)?.id;next.hidden=rows.length<=20;
      }catch(_){error.textContent='Directory could not load. Try searching again.';}finally{next.disabled=false;}
    }
    d.querySelector('#gnet-org-add').onclick=()=>editOrganization();d.querySelector('input').oninput=()=>{clearTimeout(timer);epoch++;timer=setTimeout(()=>load(),200);};next.onclick=()=>load(false);d.addEventListener('close',()=>{epoch++;clearTimeout(timer);});load();
  }
  function editOrganization(row={}){
    const d=dialog(row.id?'Edit organization':'Add organization',`<form id="gnet-org-form"><label for="gnet-org-kind">Type</label><select id="gnet-org-kind"><option value="company">Company</option><option value="college"${row.kind==='college'?' selected':''}>College / university</option></select><label for="gnet-org-name">Official name</label><input id="gnet-org-name" required maxlength="160" value="${esc(row.name||'')}"><label for="gnet-org-logo">Logo URL (HTTPS)</label><input id="gnet-org-logo" type="url" maxlength="1500" value="${esc(row.logo_url||'')}" placeholder="https://"><label for="gnet-org-file">Or upload the official logo</label><input id="gnet-org-file" type="file" data-no-avatar-crop accept="image/png,image/jpeg,image/webp"><label class="gnet-checkbox"><input id="gnet-org-approved" type="checkbox"${row.is_approved?' checked':''}> Approved for public profiles</label><p class="gnet-muted">Uncheck approval to hide a logo without changing anyone’s career or education data.</p><p class="gnet-form-error" role="alert"></p><div class="gnet-dialog-actions"><button type="button" class="gnet-button" id="gnet-org-back">Back</button><button class="gnet-button gnet-primary" type="submit">Save organization</button></div></form>`);
    d.querySelector('#gnet-org-back').onclick=organizationDirectory;
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]'),error=form.querySelector('.gnet-form-error');if(button.disabled)return;button.disabled=true;error.textContent='';d.oncancel=e=>e.preventDefault();d.querySelectorAll('button').forEach(b=>b.disabled=true);let uploaded=null;
      try{let logo=d.querySelector('#gnet-org-logo').value.trim();const file=d.querySelector('#gnet-org-file').files[0];if(file){const blob=await compress(file);uploaded=state.user.id+'/'+crypto.randomUUID()+'.webp';await result(client().storage.from('community-images').upload(uploaded,blob,{contentType:'image/webp',upsert:false}));logo=client().storage.from('community-images').getPublicUrl(uploaded).data.publicUrl;}
        if(logo&&!/^https:\/\/\S+$/.test(logo))throw new Error('Use an HTTPS logo URL.');const values={name:d.querySelector('#gnet-org-name').value.trim(),kind:d.querySelector('#gnet-org-kind').value,logo_url:logo,is_approved:d.querySelector('#gnet-org-approved').checked};
        await result(row.id?client().from('community_organizations').update(values).eq('id',row.id).select('id').single():client().from('community_organizations').insert(values).select('id').single());d.close();organizationDirectory();
      }catch(e){error.textContent=e.code==='23505'?'This organization is already in the directory. Edit its existing entry.':'Could not save. Check the logo URL and your administrator access, then retry.';/* Keep uploads on uncertain commits; never delete a logo that may have saved. */}
      finally{d.oncancel=null;d.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
  }
  function profileHeader(p) {
    const own=p.id===state.user?.id,cover=coverURL(p);
    const organizations=`${p.company?`<div>${organizationMark(p.company,'company')}<strong class="guidcy-profile-work-company">${organizationName(p.company,'company')}</strong></div>`:''}${p.college?`<div>${organizationMark(p.college,'college')}<strong class="gnet-education">${organizationName(p.college,'college')}</strong></div>`:''}`;
    return `<div class="gnet-cover${cover?' has-image':''}">${cover?`<img src="${esc(cover)}" alt="${esc(p.name)}’s cover" width="1200" height="300">`:''}<button class="gnet-profile-close" data-action="close-profile" aria-label="Close profile">×</button>${own?'<button class="gnet-cover-target" data-action="photo-options" data-photo-kind="cover" aria-label="Cover photo options"></button>':''}</div><div class="gnet-profile-info"><div class="gnet-profile-photo-row">${own?`<button class="gnet-photo-target" data-action="photo-options" data-photo-kind="avatar" aria-label="Profile photo options">${avatar(p,true)}</button>`:`${avatar(p,true)}`}</div><div class="gnet-profile-intro"><div class="gnet-profile-heading"><div class="gnet-name-line"><h1 class="profile-name">${esc(p.name)}</h1>${p.pronouns?`<span class="gnet-pronouns">${esc(p.pronouns)}</span>`:''}</div><p class="gnet-profile-headline">${esc(headline(p))}</p><div class="gnet-intro-meta">${p.city&&p.show_location!==false?`<span class="gnet-current-location">${esc(p.city)}</span>`:''}${p.website_public&&safeURL(p.website_url)?`<a class="gnet-text-link gnet-profile-website" href="${esc(safeURL(p.website_url))}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(safeURL(p.website_url).replace(/^https?:\/\//,'').replace(/\/$/,''))}</span></a>`:''}</div></div>${organizations?`<div class="gnet-organizations">${organizations}</div>`:''}</div><div class="gnet-profile-count-line" data-follow-count="${esc(p.id)}">${followCounts(p)}</div><div class="gnet-profile-actions">${own?'<button class="gnet-button gnet-primary" data-action="edit-profile">Edit Profile</button><button class="gnet-button" data-action="add-section">Add Profile Section</button><button class="gnet-button" data-action="view-posts">View Posts</button>':`${follow(p)}${p.consultant_id?'<button class="gnet-button gnet-primary" data-action="book">Book Session</button>':''}`}<button class="gnet-button" data-action="share-profile">${icon('share')} Share</button></div></div>`;
  }
  function followCounts(p){return `<button data-action="profile-network" data-person="${esc(p.id)}" data-direction="followers"><b>${Number(p.followers||0)}</b> followers</button><span>·</span><button data-action="profile-network" data-person="${esc(p.id)}" data-direction="following"><b>${Number(p.following||0)}</b> following</button>`;}
  function section(id,title,body,action='') {return `<section id="gnet-section-${id}" class="gnet-card gnet-prof-section"><header><h2>${title}</h2>${action}</header>${body}</section>`;}
  function longText(text){return `<div class="gnet-long-text${text.length>400?' is-collapsed':''}">${esc(text)}</div>${text.length>400?'<button class="gnet-text-link" data-action="expand-about" aria-expanded="false">See more</button>':''}`;}
  function dateRank(value){const s=String(value||'');const local=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);return local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`:s;}
  function experienceRows(p){return (p.company_experience||[]).map((e,index)=>({...e,index})).sort((a,b)=>Number(!!b.currently_working)-Number(!!a.currently_working)||dateRank(b.end_date||b.start_date).localeCompare(dateRank(a.end_date||a.start_date)));}
  const experienceMonths=['January','February','March','April','May','June','July','August','September','October','November','December'];
  function experienceDateParts(value){
    const match=dateRank(value).match(/^(\d{4})(?:-(0[1-9]|1[0-2])(?:-\d{2}(?:T.*)?)?)?$/);
    return {year:match?.[1]||'',month:match?.[2]||''};
  }
  function experienceDateLabel(value){
    const {year,month}=experienceDateParts(value);
    return year?(month?experienceMonths[Number(month)-1].slice(0,3)+' ':'')+year:String(value||'');
  }
  function experienceDuration(rows,now=new Date()){
    const ranges=rows.flatMap(e=>{
      const start=experienceDateParts(e.start_date),end=e.currently_working?{year:now.getFullYear(),month:now.getMonth()+1}:experienceDateParts(e.end_date);
      if(!start.year||!start.month||!end.year||!end.month)return [];
      const a=Number(start.year)*12+Number(start.month)-1,b=Number(end.year)*12+Number(end.month)-1;
      return b>=a?[[a,b]]:[];
    }).sort((a,b)=>a[0]-b[0]);
    if(ranges.length!==rows.length)return '';
    let months=0,end=-1;
    for(const [a,b] of ranges){months+=Math.max(0,b-Math.max(a,end+1)+1);end=Math.max(end,b);}
    const years=Math.floor(months/12),rest=months%12;
    return [years?years+' '+(years===1?'yr':'yrs'):'',rest?rest+' '+(rest===1?'mo':'mos'):''].filter(Boolean).join(' ');
  }
  function experienceHTML(rows){
    const groups=[];
    for(const row of rows){
      let group=groups.at(-1);
      if(!group||organizationKey(group[0].company_name)!==organizationKey(row.company_name)){group=[];groups.push(group);}
      group.push(row);
    }
    return groups.map(group=>{
      const company=group[0].company_name,types=[...new Set(group.map(e=>e.employment_type).filter(Boolean))];
      const locationType=group.every(e=>e.location_type===group[0].location_type)?group[0].location_type:'';
      const meta=[types.length===1?types[0]:'',experienceDuration(group)].filter(Boolean).join(' · ');
      return `<div class="gnet-experience-group"><div class="gnet-experience-company">${organizationMark(company,'company',true)}<div><h3>${organizationName(company,'company')}</h3>${meta?`<p>${esc(meta)}</p>`:''}${locationType?`<p class="gnet-muted">${esc(locationType)}</p>`:''}</div></div><div class="gnet-experience-roles">${group.map(e=>{
        const title=e.designation||e.job_title||'Professional',duration=experienceDuration([e]);
        const dates=[experienceDateLabel(e.start_date),e.currently_working?'Present':experienceDateLabel(e.end_date)].filter(Boolean).join(' – ');
        const location=[e.location,!locationType?e.location_type:''].filter(Boolean).join(' · '),skills=e.skills||[];
        return `<article class="gnet-career-entry gnet-experience-role"><div class="gnet-entry-content"><h3>${esc(title)}</h3>${types.length>1&&e.employment_type?`<p class="gnet-muted">${esc(e.employment_type)}</p>`:''}${dates||duration?`<p class="gnet-muted">${esc([dates,duration].filter(Boolean).join(' · '))}</p>`:''}${location?`<p class="gnet-muted">${esc(location)}</p>`:''}${e.description?longText(e.description):''}${skills.length>2?`<details class="gnet-experience-skills"><summary>◇ ${esc(skills.slice(0,2).join(', '))} and +${skills.length-2} skills</summary><p>${esc(skills.join(', '))}</p></details>`:skills.length?`<p class="gnet-entry-skills">◇ ${esc(skills.join(', '))}</p>`:''}</div>${ownProfile()?`<button class="gnet-entry-edit" data-action="edit-experience" data-entry="${e.index}" aria-label="Edit ${esc(title)}">✎</button>`:''}</article>`;
      }).join('')}</div></div>`;
    }).join('');
  }
  function experienceDateValue(data,prefix,previous){
    const year=String(data.get(prefix+'_year')||''),month=String(data.get(prefix+'_month')||'');
    if(month&&!year)throw new Error('Select a year for each month.');
    if(year&&!/^(19\d\d|20\d\d|2100)$/.test(year))throw new Error('Use a year between 1900 and 2100.');
    if(month&&!/^(0[1-9]|1[0-2])$/.test(month))throw new Error('Select a valid month.');
    const before=experienceDateParts(previous);
    return before.year===year&&before.month===month?previous||'':year+(year&&month?'-'+month:'');
  }
  function entryHTML(e){
    const education=e.kind==='education',dates=[e.start_date?.slice(0,education?4:7),e.end_date?.slice(0,education?4:7)].filter(Boolean).join(' – ');
    return `<article class="gnet-career-entry" id="gnet-entry-${esc(e.id)}">${education?organizationMark(e.organization,'college',true):'<div class="gnet-entry-mark" aria-hidden="true">◇</div>'}<div class="gnet-entry-content"><h3>${esc(e.title)}</h3><p>${education?organizationName(e.organization,'college'):esc(e.organization||'')}${e.organization&&e.field?' · ':''}${esc(e.field||'')}</p>${dates?`<p class="gnet-muted">${esc(dates)}</p>`:''}${e.grade?`<p>Grade: ${esc(e.grade)}</p>`:''}${e.activities?`<p>Activities: ${esc(e.activities)}</p>`:''}${e.description?longText(e.description):''}${safeURL(e.url)?`<a class="gnet-text-link" href="${esc(safeURL(e.url))}" target="_blank" rel="noopener noreferrer">View ${esc(e.kind||'details')} ↗</a>`:''}</div>${ownProfile()?`<button class="gnet-entry-edit" data-action="edit-entry" data-entry="${esc(e.id)}" aria-label="Edit ${esc(e.title)}">✎</button>`:''}</article>`;
  }
  function strength(p,entries){
    const checks=[['Profile photo',!!p.avatar_url,'photo'],['Headline',!!p.headline&&!/^(student|user|consultant)$/i.test(p.headline),'intro'],['About',!!p.bio?.trim(),'about'],['Experience',!!p.company_experience?.length,'experience'],['Education',!!p.college||!!p.education||entries.some(e=>e.kind==='education'),'education'],['Expertise & skills',!!tags(p).length,'skills']];
    const score=Math.round(checks.filter(x=>x[1]).length/checks.length*100),next=checks.find(x=>!x[1]);
    return section('strength','Your profile',`<p><strong>Profile strength: ${score}%</strong><span class="gnet-private">Only you</span></p><progress max="100" value="${score}" aria-label="Profile strength">${score}%</progress>${next?`<button class="gnet-text-link" data-action="profile-section" data-section="${next[2]}">Add ${next[0].toLowerCase()} →</button>`:'<p class="gnet-muted">Your professional essentials are in place.</p>'}`);
  }
  async function profileDetails(p) {
    const layout=$('profile-layout'),main=layout?.querySelector('.profile-main');if(!main)return;
    let side=layout.querySelector('.profile-sidebar');if(!side){side=document.createElement('aside');side.className='profile-sidebar';layout.append(side);}
    side.hidden=false;
    main.querySelector('#gnet-portfolio-loading')?.remove();
    const loading=document.createElement('div');loading.id='gnet-portfolio-loading';
    if(!main.querySelector('.gnet-prof-section'))loading.innerHTML='<div class="gnet-card gnet-loading"><div class="gnet-skeleton"></div></div>';
    main.append(loading);
    try {
      const [entries,featured]=await Promise.all([result(client().from('profile_entries').select('id,kind,title,organization,field,start_date,end_date,description,grade,activities,url').eq('profile_id',p.id).order('start_date',{ascending:false,nullsFirst:false}).order('id').limit(100)),result(client().rpc('community_featured',{p_id:p.id}))]);
      if(!loading.isConnected||profilePerson?.id!==p.id)return;
      portfolio={owner:p.id,entries,featured};
      main.querySelectorAll(':scope > .gnet-prof-section').forEach(el=>el.remove());side.querySelectorAll(':scope > .gnet-prof-section').forEach(el=>el.remove());
      const hero=main.querySelector('.gnet-profile-header'),bio=p.bio||'';
      if(bio||ownProfile())hero.insertAdjacentHTML('afterend',section('about','About',bio?longText(bio):'<p class="gnet-muted">Introduce your work, interests and the guidance you can offer.</p>',editButton('about',bio?'Edit':'Add')));
      const skills=tags(p);if(skills.length||ownProfile())side.insertAdjacentHTML('beforeend',section('skills','Expertise & Skills',skills.length?`<div class="gnet-skill-list">${skills.map(t=>`<div class="gnet-skill"><span>${esc(t)}</span><span data-endorsement="${esc(t)}"></span></div>`).join('')}</div>`:'<p class="gnet-muted">Add the areas you know best.</p>',editButton('skills')));
      if(skills.length)loadEndorsements(p);
      const experiences=experienceRows(p);
      const activityEl=main.querySelector('.gnet-activity');
      if(experiences.length||ownProfile())activityEl.insertAdjacentHTML('afterend',section('experience','Experience',experiences.length?experienceHTML(experiences):'<p class="gnet-muted">Add your roles, companies and career history.</p>',editButton('experience','＋ Add experience')));
      const marker=main.querySelector('#gnet-section-experience')||activityEl;marker.after(loading);
      const education=entries.filter(e=>e.kind==='education');
      let html=education.length?section('education','Education',education.map(e=>entryHTML(e)).join(''),editButton('education','＋ Add')):'';
      if(featured.length||ownProfile())html+=section('featured','Featured',featured.length?`<div class="gnet-featured-grid">${featured.map(f=>featuredCard(f)).join('')}</div>`:'<p class="gnet-muted">Choose a post, resource or project that represents your work.</p>',editButton('featured','＋ Add'));
      for(const [kind,label] of Object.entries(entryLabels)){if(kind==='education')continue;const rows=entries.filter(e=>e.kind===kind);if(rows.length)html+=section(kind,label,rows.map(e=>entryHTML(e)).join(''),editButton(kind,'＋ Add'));}
      loading.outerHTML=html;loadOrganizationLogos(layout);
      if(ownProfile())side.insertAdjacentHTML('beforeend',strength(p,entries));
    }catch(_){if(loading.isConnected)loading.innerHTML='<p>Professional details couldn’t load.</p><button class="gnet-button" data-action="retry-profile">Try again</button>';}
  }
  function featuredCard(f){
    const target=f.post_id?'/?post='+encodeURIComponent(f.post_id):f.webinar_id?'/webinars/'+encodeURIComponent(f.webinar_id):f.entry_id?'#gnet-entry-'+f.entry_id:'';
    return `<article class="gnet-featured-item"><span class="gnet-eyebrow">${esc(f.kind)}</span><h3>${esc(f.title||'Shared work')}</h3>${f.description?`<p>${esc(f.description.slice(0,180))}</p>`:''}${f.resource_id?`<p class="gnet-resource-price">${f.is_free||!Number(f.price)?'Free':esc(window.guidcyFormatINR(f.price))}</p><div class="gnet-feature-actions"><button class="gnet-button" data-action="featured-view" data-resource="${esc(f.resource_id)}">View</button><button class="gnet-button gnet-primary" data-action="featured-buy" data-resource="${esc(f.resource_id)}" ${ownProfile()?'disabled':''}>${ownProfile()?'Your resource':f.is_free||!Number(f.price)?'Get resource':'Buy'}</button></div>`:`<a class="gnet-text-link" href="${esc(target)}">View ${esc(f.kind.toLowerCase())} →</a>`}${ownProfile()?`<button class="gnet-text-link" data-action="unfeature" data-entry="${esc(f.id)}">Remove from featured</button>`:''}</article>`;
  }
  async function refreshProfessional(){
    const id=profilePerson?.id;if(!id)return;
    const p=await profileInfo(id);if(profilePerson?.id!==id)return;profilePerson=p;
    const hero=document.querySelector('.gnet-profile-header');if(hero){hero.innerHTML=profileHeader(p);window.guidcyRefreshSavedConsultant?.();}
    if(p.id===state.user?.id){if(window.currentProfile)Object.assign(window.currentProfile,{company_experience:p.company_experience,current_company:p.company,current_company_college:p.company,college:p.college,highest_education:p.education,skills:tags(p)});if(window.curCons?.profile_id===p.id)Object.assign(window.curCons,{company_experience:p.company_experience,current_company:p.company,current_company_college:p.company,college:p.college,highest_education:p.education,tags:tags(p)});window.guidcyBroadcastDataChange?.('consultants');}
    await profileDetails(p);state.at=0;sidebar();
  }
  function addSection(){dialog('Add Profile Section',`<div class="gnet-section-choices">${[['about','About'],['experience','Experience'],['education','Education'],['skills','Expertise & Skills'],['featured','Featured'],...Object.entries(entryLabels).filter(([k])=>k!=='education')].map(([key,label])=>`<button class="gnet-button" data-action="profile-section" data-section="${key}">${label}</button>`).join('')}</div>`);}
  function profileSection(key){
    if(!ownProfile()||!requireUser())return;
    if(key==='intro'||key==='about')editProfile();
    else if(key==='photo')photoOptions('avatar');
    else if(key==='experience')editExperience();
    else if(key==='skills')editSkills();
    else if(key==='featured')featurePicker();
    else if(entryLabels[key])editEntry(null,key);
  }
  function inputField(name,label,value='',type='text',limit=160,required=false){return `<label for="gp-${name}">${label}</label><input id="gp-${name}" name="${name}" type="${type}" value="${esc(value||'')}" maxlength="${limit}" ${required?'required':''}>`;}
  function textareaField(name,label,value='',limit=3000){return `<label for="gp-${name}">${label}</label><textarea id="gp-${name}" name="${name}" rows="4" maxlength="${limit}">${esc(value||'')}</textarea>`;}
  function experienceSelect(name,label,value,options){
    const choices=value&&!options.includes(value)?[value,...options]:options;
    return `<label for="gp-${name}">${label}</label><select id="gp-${name}" name="${name}"><option value="">Select ${label.toLowerCase()}</option>${choices.map(v=>`<option${v===value?' selected':''}>${esc(v)}</option>`).join('')}</select>`;
  }
  function experienceDateFields(prefix,label,value,required){
    const {year,month}=experienceDateParts(value);
    return `<div><label for="gp-${prefix}_month">${label} month</label><select id="gp-${prefix}_month" name="${prefix}_month"><option value="">Month</option>${experienceMonths.map((name,i)=>{const v=String(i+1).padStart(2,'0');return `<option value="${v}"${v===month?' selected':''}>${name}</option>`;}).join('')}</select></div><div>${inputField(prefix+'_year',label+' year'+(required?' *':''),year,'number',4,required)}</div>`;
  }
  function editor(title,body,save,remove){
    const d=dialog(title,`<form class="gnet-prof-form">${body}<p class="gnet-form-error" role="alert"></p><div class="gnet-dialog-actions">${remove?'<button class="gnet-button gnet-danger" type="button" id="gnet-remove-entry">Delete</button>':''}<button class="gnet-button gnet-primary" type="submit">Save</button></div></form>`);
    const form=d.querySelector('form'),error=d.querySelector('.gnet-form-error');
    async function submit(work){if(form.dataset.busy)return;form.dataset.busy='1';error.textContent='';d.querySelectorAll('button').forEach(b=>b.disabled=true);d.oncancel=e=>e.preventDefault();
      try{await work();d.close();await refreshProfessional();notice('Profile Saved');}catch(e){error.textContent=e.message||'Your changes could not be saved. Please try again.';}finally{delete form.dataset.busy;d.querySelectorAll('button').forEach(b=>b.disabled=false);d.oncancel=null;}}
    form.onsubmit=e=>{e.preventDefault();submit(()=>save(new FormData(form)));};
    d.querySelector('#gnet-remove-entry')?.addEventListener('click',()=>{const button=d.querySelector('#gnet-remove-entry');if(button.dataset.confirm)submit(remove);else{button.dataset.confirm='1';button.textContent='Confirm delete';}});
    return d;
  }
  function editExperience(index=null){
    if(!ownProfile())return;
    const current=structuredClone(profilePerson.company_experience||[]),entry=index!==null?current[index]:{};if(!entry)return;
    const d=editor(index===null?'Add role':'Edit role',`<div class="gnet-role-fields"><h3>Role details</h3><div class="gnet-role-grid"><div>${inputField('designation','Job title *',entry.designation||entry.job_title,'text',160,true)}</div><div>${inputField('company_name','Organization *',entry.company_name,'text',160,true)}</div><div>${inputField('location','Location',entry.location)}</div><div>${experienceSelect('location_type','Location type',entry.location_type,['On-site','Hybrid','Remote'])}</div></div>${experienceSelect('employment_type','Employment type',entry.employment_type,['Full-time','Part-time','Self-employed','Freelance','Contract','Internship','Apprenticeship','Seasonal','Volunteer'])}<label class="gnet-checkbox"><input name="currently_working" type="checkbox" ${entry.currently_working?'checked':''}> I am currently working in this role</label><div class="gnet-role-dates">${experienceDateFields('start','Start',entry.start_date,index===null)}${experienceDateFields('end','End',entry.end_date,index===null&&!entry.currently_working)}</div>${textareaField('description','Description',entry.description)}${inputField('skills','Skills (comma separated)',(entry.skills||[]).join(', '),'text',1200)}<p class="gnet-muted">Add up to 20 skills used in this role.</p></div>`,async data=>{
      const patch={};for(const key of ['designation','company_name','location','location_type','employment_type','description'])patch[key]=String(data.get(key)||'').trim();
      patch.currently_working=data.has('currently_working');patch.skills=[...new Set(String(data.get('skills')||'').split(',').map(s=>s.trim()).filter(Boolean))];
      if(!patch.designation||!patch.company_name)throw new Error('Add a job title and organization.');
      if(patch.skills.length>20||patch.skills.some(s=>s.length>60))throw new Error('Use up to 20 skills, each 60 characters or fewer.');
      patch.start_date=experienceDateValue(data,'start',entry.start_date);
      patch.end_date=patch.currently_working?'':experienceDateValue(data,'end',entry.end_date);
      if(index===null&&(!patch.start_date||(!patch.currently_working&&!patch.end_date)))throw new Error('Select the start and end years, or mark this as your current role.');
      const start=experienceDateParts(patch.start_date),end=experienceDateParts(patch.end_date);
      if(start.year&&end.year&&(end.year<start.year||(end.year===start.year&&start.month&&end.month&&end.month<start.month)))throw new Error('End date must follow the start date.');
      const list=current.slice();if(index===null)list.push(patch);else list[index]={...entry,...patch};
      await result(client().rpc('community_update_professional',{p_section:'experience',p_data:list,p_expected:current}));
    },index===null?null:()=>result(client().rpc('community_update_professional',{p_section:'experience',p_data:current.filter((_,i)=>i!==index),p_expected:current})));
    d.classList.add('gnet-role-dialog');
    d.querySelectorAll('input[type=number]').forEach(input=>{input.min='1900';input.max='2100';input.step='1';input.placeholder='Year';});
    organizationSuggestions(d.querySelector('#gp-company_name'),'company');
    const check=d.querySelector('[name=currently_working]');const sync=()=>{for(const field of ['end_month','end_year'])d.querySelector('[name='+field+']').disabled=check.checked;d.querySelector('#gp-end_year').required=index===null&&!check.checked;d.querySelector('label[for=gp-end_year]').textContent='End year'+(index===null&&!check.checked?' *':'');};check.onchange=sync;sync();
  }
  function editSkills(){editor('Expertise & Skills',textareaField('skills','Up to 40 skills, separated by commas',tags(profilePerson).join(', '),2400),data=>result(client().rpc('community_update_professional',{p_section:'skills',p_data:[...new Set(data.get('skills').split(',').map(x=>x.trim()).filter(Boolean))]})));}
  function editEntry(id,kind){
    if(!ownProfile())return;
    const e=id?portfolio.entries.find(e=>e.id===id):{kind};if(!e)return;
    const education=e.kind==='education';
    const d=editor(id?'Edit '+entryLabels[e.kind]:'Add '+entryLabels[e.kind],inputField('title',education?'Degree':'Title',e.title,'text',160,true)+inputField('organization',education?'Institution':'Organization / issuer',e.organization,'text',160,education)+(education?inputField('field','Field of study',e.field):'')+`<div class="gnet-form-grid">${inputField('start_date',education?'Start year':'Issued / start date',education?e.start_date?.slice(0,4):e.start_date,education?'number':'date')}${inputField('end_date',education?'End year (optional)':'Expiry / end date (optional)',education?e.end_date?.slice(0,4):e.end_date,education?'number':'date')}</div>`+(education?inputField('grade','Grade / CGPA (optional)',e.grade,'text',40)+textareaField('activities','Activities / societies (optional)',e.activities,1000):'')+textareaField('description','Description',e.description)+inputField('url','Public link (optional)',e.url,'url',1500),async data=>{
      const values=Object.fromEntries(data);for(const k of ['start_date','end_date']){if(education&&values[k]&&!/^(19\d\d|20\d\d|2100)$/.test(values[k]))throw new Error('Use a year between 1900 and 2100.');values[k]=values[k]?(education?values[k]+'-01-01':values[k]):null;}
      if(values.start_date&&values.end_date&&values.end_date<values.start_date)throw new Error('End date must follow the start date.');
      const q=client().from('profile_entries');try{await result(id?q.update(values).eq('id',id).eq('profile_id',state.user.id).select('id').single():q.insert({...values,kind:e.kind,profile_id:state.user.id}).select('id').single());}catch(error){if(education&&error.code==='23505')throw new Error('This education is already on your profile. Edit the existing entry instead.');throw error;}
    },id?()=>result(client().from('profile_entries').delete().eq('id',id).eq('profile_id',state.user.id)):null);
    if(education)organizationSuggestions(d.querySelector('#gp-organization'),'college');
  }
  async function featurePicker(){
    const d=dialog('Feature your work','<label for="gnet-feature-source">Choose from your work</label><select id="gnet-feature-source"><option value="post">Posts</option><option value="resource">Marketplace resources</option><option value="entry">Projects, achievements & publications</option><option value="webinar">Webinars you host or speak at</option></select><div id="gnet-feature-choices"></div><button class="gnet-button" id="gnet-feature-next">Show more</button><p class="gnet-form-error" role="alert"></p>');
    let cursor=null,epoch=0;const select=d.querySelector('select'),next=d.querySelector('#gnet-feature-next'),list=d.querySelector('#gnet-feature-choices'),error=d.querySelector('.gnet-form-error');
    async function loadChoices(reset){const turn=++epoch,type=select.value;next.disabled=true;error.textContent='';if(reset){cursor=null;list.replaceChildren();}
      try{let q=type==='post'?client().from('community_posts').select('id,body').eq('author_id',state.user.id):type==='resource'?client().from('marketplace_notes').select('id,title').eq('uploader_id',state.user.id).eq('status','active').is('removed_at',null):type==='webinar'?client().rpc('community_featureable_webinars',{p_before:cursor}):client().from('profile_entries').select('id,title,kind').eq('profile_id',state.user.id).neq('kind','education');
        if(type!=='webinar'){q=q.order('id').limit(21);if(cursor)q=q.gt('id',cursor);}const rows=await result(q);if(turn!==epoch||!d.isConnected)return;
        const shown=rows.slice(0,20);list.insertAdjacentHTML('beforeend',shown.map(r=>`<button class="gnet-feature-choice" data-feature-id="${esc(r.id)}">＋ ${esc((r.title||r.body||'Post').slice(0,160))}</button>`).join(''));if(!rows.length&&!cursor)list.innerHTML='<p class="gnet-muted">Nothing to feature here yet.</p>';
        cursor=shown.at(-1)?.id;next.hidden=rows.length<=20;
        list.querySelectorAll('button').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await result(client().from('profile_featured').insert({profile_id:state.user.id,[type+'_id']:b.dataset.featureId}));d.close();await refreshProfessional();}catch(e){error.textContent=e.code==='23505'?'This item is already featured.':e.message||'Could not feature this item.';b.disabled=false;}});
      }catch(_){error.textContent='Items could not load. Please try again.';next.hidden=false;}finally{if(turn===epoch)next.disabled=false;}}
    select.onchange=()=>loadChoices(true);next.onclick=()=>loadChoices(false);loadChoices(true);
  }
  async function profileNetwork(id,direction){
    const d=dialog(direction==='followers'?'Followers':'Following','<div id="gnet-network-list"></div><button class="gnet-button" id="gnet-network-more">Load people</button>',true);
    const filter=direction==='followers'?'following_id':'follower_id',field=direction==='followers'?'follower_id':'following_id';let cursor=null;
    const button=d.querySelector('button#gnet-network-more'),list=d.querySelector('#gnet-network-list');
    async function read(){button.disabled=true;try{let q=client().from('community_follows').select(field).eq(filter,id).order(field).limit(21);if(cursor)q=q.gt(field,cursor);const rows=await result(q);await people(rows.slice(0,20).map(r=>r[field]));if(!d.isConnected)return;
      list.insertAdjacentHTML('beforeend',rows.slice(0,20).map(r=>`<div class="gnet-expert">${identity(person(r[field]))}${follow(person(r[field]))}</div>`).join(''));if(!rows.length&&!cursor)list.textContent='No '+direction+' yet.';cursor=rows.slice(0,20).at(-1)?.[field];button.hidden=rows.length<=20;button.textContent='Show more';
    }catch(_){button.textContent='Could not load people. Retry';}finally{button.disabled=false;}}
    button.onclick=read;read();
  }
  async function activity(p,append=false) {
    const host=$('gnet-profile-posts');if(!host)return;
    const epoch=++activityEpoch,owner=p.id;
    if(host.dataset.owner!==owner||host.dataset.activityTab!=='posts')host.replaceChildren();
    host.dataset.owner=owner;host.dataset.activityTab='posts';host.setAttribute('aria-busy','true');
    if(!append){activityCursor=null;if(!host.firstChild)host.innerHTML='<div class="gnet-card gnet-loading"><div class="gnet-skeleton"></div><p>Loading activity…</p></div>';}
    const more=$('gnet-activity-more');if(more)more.disabled=true;
    try {
      const rows=await result(client().rpc('community_profile_activity',{p_id:owner,p_kind:null,p_before:activityCursor?.created_at||null,p_before_id:activityCursor?.id||null}));
      if(epoch!==activityEpoch||!host.isConnected||profilePerson?.id!==owner)return;
      const visible=rows.slice(0,5);await people(visible.map(r=>r.author_id));if(epoch!==activityEpoch||!host.isConnected||profilePerson?.id!==owner)return;
      if(!append)profilePosts.clear();visible.forEach(post=>profilePosts.set(post.id,post));
      const html=visible.map(postCard).join('');
      if(append)host.insertAdjacentHTML('beforeend',html);else host.innerHTML=html;
      window.guidcyFinishPanelRefresh?.(host);
      if(!rows.length&&!append)host.innerHTML=`<div class="gnet-card gnet-profile-empty"><p>No posts yet.</p>${owner===state.user?.id?'<button class="gnet-button" data-action="compose">Share a post</button>':''}</div>`;
      activityCursor=visible.at(-1)||activityCursor;if(more){more.hidden=rows.length<=5;more.textContent=append?'Show more posts →':'Show all posts →';}
    }catch(_){if(epoch===activityEpoch){if(!append)host.innerHTML='<button class="gnet-button" data-action="retry-posts">Activity couldn’t load. Try again</button>';else notice('Could not load more activity. Please try again.');}}
    finally{if(epoch===activityEpoch){host.setAttribute('aria-busy','false');if(more)more.disabled=false;syncPostPreviews();}}
  }
  function activityShell(p) {
    return `<section class="gnet-activity" aria-label="Activity"><header><h2>Activity</h2>${p.id===state.user?.id?'<button class="gnet-text-link" data-action="compose">Create a post</button>':''}</header><div class="gnet-activity-tabs"><button class="gnet-button" data-action="refresh-activity" data-tab="posts" aria-pressed="true">Posts</button></div><div id="gnet-profile-posts" tabindex="0" role="region" aria-label="Posts — scroll horizontally to browse"></div><button id="gnet-activity-more" class="gnet-view-all" data-action="more-activity" hidden>Show all posts →</button></section>`;
  }
  function refreshActivity(){if(profilePerson&&$('page-profile').classList.contains('on'))activity(profilePerson);}
  async function member(id) {
    await startAuth();if(params().get('member')!==id)return;
    if(!uuid(id)){$('profile-layout').innerHTML='<p class="gnet-card gnet-empty">This profile link is invalid.</p>';return;}
    const key='member:'+id+':'+(state.user?.id||'');if(profileKey===key&&$('gnet-member'))return;profileKey=key;const epoch=++profileEpoch;
    $('profile-layout').removeAttribute('data-profile-loading');
    $('profile-layout').classList.add('gnet-profile-page','gnet-member-layout');
    const layout=$('profile-layout'),preserve=layout.dataset.profileTarget==='member:'+id&&$('gnet-member');
    if(!preserve)layout.innerHTML='<div class="gnet-card gnet-loading"><div class="gnet-skeleton"></div></div>';
    layout.dataset.profileTarget='member:'+id;
    try {const p=await profileInfo(id);if(epoch!==profileEpoch||params().get('member')!==id)return;
      if(p.consultant_id){window.guidcyNavigate(href(p),{replace:true});return;}
      profilePerson=p;
      if(preserve)$('gnet-member').innerHTML=profileHeader(p);
      else layout.innerHTML=`<div class="profile-main"><section id="gnet-member" class="gnet-card gnet-profile-header">${profileHeader(p)}</section>${activityShell(p)}</div>`;
      window.guidcyFinishPanelRefresh?.(layout);
      activity(p);profileDetails(p);
    }catch(_){if(epoch===profileEpoch){profileKey='';$('profile-layout').innerHTML='<div class="gnet-card gnet-empty"><h1>Profile unavailable</h1><a href="/" data-guidcy-back>Back</a></div>';window.guidcyFinishPanelRefresh?.(layout);}}
  }
  async function mountConsultant() {
    await startAuth();
    if(params().has('member'))return;
    const c=window.curCons,hero=document.querySelector('#page-profile.on .profile-hero');
    if(!hero||!c?.profile_id)return;
    // A restored header may arrive before the live booking renderer.
    if($('profile-layout').hasAttribute('data-guidcy-restored')&&$('profile-layout').dataset.bookingReady!==String(c.id||c.dbId))return;
    const key=c.profile_id+':'+(state.user?.id||'');if(hero.dataset.communityProfile===key)return;
    if(profileKey===key)return;profileKey=key;const epoch=++profileEpoch;
    try {
      const p=await profileInfo(c.profile_id);if(epoch!==profileEpoch||!hero.isConnected||window.curCons?.profile_id!==p.id)return;
      profilePerson=p;hero.dataset.communityProfile=key;
      const layout=$('profile-layout');layout.classList.add('gnet-profile-page');layout.classList.remove('gnet-member-layout');
      hero.classList.add('gnet-card','gnet-profile-header');hero.innerHTML=profileHeader(p);window.guidcyRefreshSavedConsultant?.();hero.removeAttribute('aria-busy');layout.removeAttribute('data-profile-loading');
      const main=hero.parentElement;
      if(!main.querySelector('.gnet-activity'))hero.insertAdjacentHTML('afterend',activityShell(p));
      // Keep existing resources, webinars and reviews visible on arrival.
      let extras=$('gnet-profile-extras');
      if(!extras){extras=document.createElement('details');extras.open=true;extras.id='gnet-profile-extras';extras.className='gnet-profile-extras';extras.innerHTML='<summary>Webinars & client reviews</summary>';main.append(extras);main.querySelectorAll('#profile-webinars,.sec-block:has(.review-card),.sec-block:has(.block-title)').forEach(el=>{if(el.id||el.querySelector('.block-title')?.textContent.startsWith('Client reviews'))extras.append(el);});}
      const resources=$('profile-resources');if(resources&&resources.parentElement!==layout)layout.append(resources);
      extras.querySelector('summary').textContent='Webinars & client reviews';
      const side=layout.querySelector('.profile-sidebar'),box=side?.querySelector('.book-box');
      if(side&&box&&!side.querySelector('.gnet-consultation')){
        const card=document.createElement('section');card.className='gnet-card gnet-consultation';card.innerHTML=`<h2>Get guidance from ${esc(p.name.split(' ')[0])}</h2><p></p><button class="gnet-button gnet-primary" data-action="book">Book Session</button><details id="gnet-booking-options" open><summary>Availability & session options</summary></details>`;
        side.prepend(card);card.querySelector('details').append(box);
      }
      const consultation=side?.querySelector('.gnet-consultation');if(consultation){
        consultation.hidden=!p.consultant_id;
        const own=p.id===state.user?.id;
        consultation.querySelectorAll('[data-action=book],.book-footer .green-btn').forEach(button=>{button.disabled=own;button.textContent=own?'Your consultation':button.matches('[data-action=book]')?'Book Session':'Book this session';button.title=own?'You cannot book a session with yourself.':'';});
        consultation.querySelector('h2').textContent='Get guidance from '+p.name.split(' ')[0];
        const fee=Math.round(Number(window.getSTypePrice?window.getSTypePrice(c):c.video_price??c.price??c.rate??0)*.5);
        consultation.querySelector(':scope > p').textContent='30 min video session · '+window.guidcyFormatINR(fee);
      }
      consultation?.querySelector('.gnet-consultation-details')?.remove();
      if(consultation&&!consultation.hidden)consultation.querySelector('h2').insertAdjacentHTML('afterend',consultationDetails(p,c));
      window.guidcyFinishPanelRefresh?.(layout);
      profileKey='';activity(p);profileDetails(p);
    }catch(_){profileKey='';if(hero.isConnected){hero.innerHTML='<div class="gnet-profile-info gnet-profile-loading"><p>Profile could not load.</p><button class="gnet-button" data-action="retry-profile-header">Try again</button></div>';hero.removeAttribute('aria-busy');$('profile-layout').removeAttribute('data-profile-loading');window.guidcyFinishPanelRefresh?.($('profile-layout'));}}
  }
  function consultationDetails(p,c) {
    let next='';
    try {const raw=c.availability_map||c._availabilityOverrides||c.availabilityMap||{};
      const map=window.GuidcyAvailability.resolve(raw,c.recurring_availability||null,new Date(),30);
      for(const date of Object.keys(map).sort()){const slots=window.guidcyFutureSlotsForDate(date,map[date]);if(slots.length){next=`<p class="gnet-next-slot">Next listed slot<br><strong>${esc(date+' · '+slots[0]+' IST')}</strong></p>`;break;}}
    }catch(_){}
    return `<div class="gnet-consultation-details">${tags(p).length?`<p>${esc(tags(p).slice(0,3).join(' · '))}</p>`:''}${Number(p.review_count)>0?`<p>★ ${esc(p.rating)} · ${Number(p.review_count)} reviews</p>`:''}${next}</div>`;
  }
  function openBooking() {
    const details=$('gnet-booking-options');if(!details||!profilePerson?.consultant_id)return;
    if(ownProfile()){notice('You cannot book a session with yourself.');return;}
    details.open=true;
    if(!details.dataset.started){const duration=details.querySelector('.dur-btn');if(duration&&window.selDurFn)window.selDurFn(30,duration);details.dataset.started='1';}
    details.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    const summary=details.querySelector('summary');summary.focus();
  }
  async function refreshIdentity(id){
    const p=await profileInfo(id);
    if(profilePerson?.id!==id)return;
    profilePerson=p;
    const hero=document.querySelector('.gnet-profile-header');if(hero){hero.innerHTML=profileHeader(p);window.guidcyRefreshSavedConsultant?.();}
  }
  async function loadEndorsements(p){
    const section=$('gnet-section-skills');if(!section)return;
    try{
      const rows=await result(client().rpc('community_skill_endorsements',{p_id:p.id}));if(!section.isConnected||profilePerson?.id!==p.id)return;
      section.querySelectorAll('[data-endorsement]').forEach(el=>{const skill=el.dataset.endorsement,row=rows.find(r=>r.skill===skill),count=Number(row?.endorsements||0);el.innerHTML=p.id===state.user?.id?`<span class="gnet-endorsement-count">${count} endorsement${count===1?'':'s'}</span>`:`<button class="gnet-button" data-action="endorse" data-skill="${esc(skill)}" aria-pressed="${!!row?.endorsed}">${row?.endorsed?'Endorsed':'Endorse'} · ${count}</button>`;});
    }catch(_){if(section.isConnected)section.querySelectorAll('[data-endorsement]').forEach(el=>{el.innerHTML='<button class="gnet-text-link" data-action="retry-endorsements">Retry endorsements</button>';});}
  }
  async function endorse(button){
    if(!requireUser()||!profilePerson)return;
    const p=profilePerson;button.disabled=true;
    try{await result(client().rpc('community_endorse_skill',{p_id:p.id,p_skill:button.dataset.skill,p_endorsed:button.getAttribute('aria-pressed')!=='true'}));await loadEndorsements(p);}catch(_){notice('Could not update this endorsement. Please try again.');}finally{button.disabled=false;}
  }
  async function photoOptions(kind){
    if(!['avatar','cover'].includes(kind)||!ownProfile()||!requireUser())return;
    let p;try{p=await profileInfo(state.user.id);}catch(_){notice('Photo could not load. Please try again.');return;}
    const isCover=kind==='cover',source=isCover?coverURL(p):p.avatar_url||'',title=isCover?'Cover photo':'Profile photo';
    let bitmap=null,busy=false,epoch=0;
    const d=dialog(title,`<div class="gnet-photo-preview${isCover?' is-cover':''}">${source?`<img src="${esc(source)}" alt="Current ${title.toLowerCase()}">`:'<p>No photo added yet.</p>'}<canvas id="gnet-photo-canvas" width="${isCover?1600:512}" height="${isCover?400:512}" hidden aria-label="Photo crop preview"></canvas></div><div id="gnet-photo-crop" hidden><p class="gnet-muted">Adjust the crop, then save.</p>${[['zoom','Zoom',1,3,.01,1],['x','Horizontal position',0,100,1,50],['y','Vertical position',0,100,1,50]].map(([id,label,min,max,step,value])=>`<label for="gnet-photo-${id}">${label}</label><input id="gnet-photo-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`).join('')}</div><input id="gnet-photo-file" type="file" accept="image/jpeg,image/png,image/webp" data-no-avatar-crop hidden><p class="gnet-form-error" role="alert"></p><div class="gnet-dialog-actions"><button class="gnet-button" id="gnet-photo-edit" ${source?'':'disabled'}>Edit</button><button class="gnet-button" id="gnet-photo-update">Update</button><button class="gnet-button gnet-danger" id="gnet-photo-delete" ${source?'':'disabled'}>Delete</button><button class="gnet-button gnet-primary" id="gnet-photo-save" hidden>Save photo</button></div>`);
    const canvas=d.querySelector('canvas'),ctx=canvas.getContext('2d'),crop=d.querySelector('#gnet-photo-crop'),file=d.querySelector('#gnet-photo-file'),error=d.querySelector('.gnet-form-error'),edit=d.querySelector('#gnet-photo-edit'),remove=d.querySelector('#gnet-photo-delete'),save=d.querySelector('#gnet-photo-save');
    function working(value,saving=false){busy=value;d.querySelectorAll('button,input').forEach(el=>el.disabled=value);if(!value){edit.disabled=!bitmap&&!source;remove.disabled=!source;}d.querySelector('[data-close]').disabled=value&&saving;d.oncancel=value&&saving?e=>e.preventDefault():null;}
    function draw(){
      if(!bitmap)return;
      const zoom=Number(d.querySelector('#gnet-photo-zoom').value),scale=Math.max(canvas.width/bitmap.width,canvas.height/bitmap.height)*zoom,w=canvas.width/scale,h=canvas.height/scale;
      const x=(bitmap.width-w)*Number(d.querySelector('#gnet-photo-x').value)/100,y=(bitmap.height-h)*Number(d.querySelector('#gnet-photo-y').value)/100;
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);
    }
    async function prepare(blob){
      const version=++epoch;working(true);error.textContent='';
      try{
        const next=await createImageBitmap(blob);if(version!==epoch||!d.isConnected){next.close();return;}
        bitmap?.close();bitmap=next;
        d.querySelector('#gnet-photo-zoom').value=1;d.querySelector('#gnet-photo-x').value=50;d.querySelector('#gnet-photo-y').value=50;
        d.querySelectorAll('.gnet-photo-preview>img,.gnet-photo-preview>p').forEach(el=>el.hidden=true);
        canvas.hidden=false;crop.hidden=false;save.hidden=false;remove.textContent='Delete';delete remove.dataset.confirm;draw();
      }catch(_){error.textContent='Could not edit this image. Choose a JPG, PNG or WebP from your device.';}finally{if(version===epoch)working(false);}
    }
    edit.onclick=async()=>{
      if(busy)return;if(bitmap){crop.hidden=false;return;}
      working(true);error.textContent='';
      try{const response=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Image unavailable');await prepare(await response.blob());}catch(_){error.textContent='Could not load this photo for editing. Use Update to choose it from your device.';}finally{working(false);}
    };
    d.querySelector('#gnet-photo-update').onclick=()=>file.click();
    file.onchange=async()=>{if(!file.files[0]||busy)return;working(true);error.textContent='';try{await prepare(await compress(file.files[0]));}catch(e){error.textContent=e.message;}finally{file.value='';working(false);}};
    crop.addEventListener('input',draw);
    async function persist(deleting=false){
      if(busy||(!deleting&&!bitmap))return;working(true,true);error.textContent='';let uploaded=null,committed=false;
      try{
        if(state.user?.id!==p.id)throw new Error('Sign in again before saving.');
        if(isCover){
          if(!deleting){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob||blob.type!=='image/webp'||blob.size>2097152)throw new Error('Choose a smaller image.');uploaded=p.id+'/'+crypto.randomUUID()+'.webp';await result(client().storage.from('community-images').upload(uploaded,blob,{contentType:'image/webp',upsert:false}));}
          await result(client().rpc('community_update_photo',{p_kind:'cover',p_value:uploaded}));committed=true;
          if(window.currentProfile?.id===p.id)window.currentProfile.cover_path=uploaded;
          if(p.cover_path&&p.cover_path!==uploaded)await cleanupImage(p.cover_path);
        }else{await window.guidcyUpdateProfilePhoto(deleting?'':canvas.toDataURL('image/webp',.82));committed=true;}
        d.close();state.at=0;
        try{await refreshIdentity(p.id);refreshActivity();sidebar();}catch(_){notice('Photo saved. Refresh your profile to see it.');return;}
        notice(deleting?'Photo deleted.':'Photo updated.');
      }catch(_){if(uploaded&&!committed){try{const saved=await profileInfo(p.id);if(saved.cover_path!==uploaded)await cleanupImage(uploaded);}catch(_){/* Keep the object when a network failure leaves the commit uncertain. */}}error.textContent='Photo not saved or could not be confirmed. Please try again.';}finally{working(false);}
    }
    save.onclick=()=>persist();
    remove.onclick=()=>{if(remove.dataset.confirm)persist(true);else{remove.dataset.confirm='1';remove.textContent='Confirm delete';error.textContent='Delete this photo? Your other profile information will stay unchanged.';}};
    d.addEventListener('close',()=>{epoch++;bitmap?.close();},{once:true});
  }
  async function editProfile() {
    if(!requireUser())return;
    let p;
    try{p=await profileInfo(state.user.id);}catch(_){notice('Your profile could not load. Please try again.');return;}
    const cover=p.cover_path||null;
    const d=dialog('Edit Profile',`<form id="gnet-profile-form"><label for="gnet-edit-name">Name</label><input id="gnet-edit-name" required maxlength="120" value="${esc(p.name)}"><label for="gnet-edit-headline">Professional headline</label><textarea id="gnet-edit-headline" maxlength="240" rows="3" placeholder="HFCL | Manager | NPD | IIT Roorkee | Polymer Science">${esc(p.headline||'')}</textarea><p class="gnet-muted">Write your headline in your own words. Up to 240 characters.</p><label for="gnet-edit-pronouns">Pronouns (optional)</label><input id="gnet-edit-pronouns" maxlength="40" value="${esc(p.pronouns||'')}" placeholder="e.g. He/Him, She/Her, They/Them"><label for="gnet-edit-company">Current company / organization</label><input id="gnet-edit-company" maxlength="160" value="${esc(p.company||'')}"><label for="gnet-edit-city">Current location</label><input id="gnet-edit-city" maxlength="160" value="${esc(p.city||'')}" placeholder="City, state, country" autocomplete="address-level2"><label class="gnet-checkbox"><input type="checkbox" id="gnet-show-location" ${p.show_location!==false?'checked':''}> Show current location on my profile</label><label for="gnet-edit-website">Website (optional)</label><input id="gnet-edit-website" type="url" maxlength="500" value="${esc(p.website_url||'')}" placeholder="https://example.com"><label class="gnet-checkbox"><input id="gnet-website-public" type="checkbox" ${p.website_public?'checked':''}> Show website on my public profile</label><label for="gnet-edit-bio">About (up to 2,000 characters)</label><textarea id="gnet-edit-bio" rows="3" maxlength="2000">${esc(p.bio||'')}</textarea><p class="gnet-form-error" role="alert"></p><div class="gnet-dialog-actions"><a class="gnet-text-link" href="${window.currentProfile?.role==='consultant'?'/consultant-dashboard/profile':'/dashboard/profile'}">More profile settings</a><button class="gnet-button gnet-primary" type="submit">Save profile</button></div></form>`);
    organizationSuggestions(d.querySelector('#gnet-edit-company'),'company');
    const submit=d.querySelector('[type=submit]'),error=d.querySelector('.gnet-form-error');
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;d.oncancel=e=>e.preventDefault();d.querySelector('[data-close]').disabled=true;error.textContent='';
      try {
        if(!state.user||state.user.id!==p.id)throw new Error('Sign in again to save your profile.');
        const values={p_name:d.querySelector('#gnet-edit-name').value.trim(),p_headline:d.querySelector('#gnet-edit-headline').value.trim(),p_bio:d.querySelector('#gnet-edit-bio').value.trim(),p_cover:cover};
        await result(client().rpc('community_update_identity',{p_data:{name:values.p_name,headline:values.p_headline,bio:values.p_bio,cover:values.p_cover,company:d.querySelector('#gnet-edit-company').value.trim(),city:d.querySelector('#gnet-edit-city').value.trim(),show_location:d.querySelector('#gnet-show-location').checked,pronouns:d.querySelector('#gnet-edit-pronouns').value.trim(),website_url:d.querySelector('#gnet-edit-website').value.trim(),website_public:d.querySelector('#gnet-website-public').checked}}));
        const company=d.querySelector('#gnet-edit-company').value.trim();
        if(window.currentProfile)Object.assign(window.currentProfile,{full_name:values.p_name,current_position:values.p_headline,current_company:company,current_company_college:company,bio:values.p_bio,cover_path:cover});
        if(window.curCons?.profile_id===p.id)Object.assign(window.curCons,{name:values.p_name,current_position:values.p_headline,current_company:company,current_company_college:company,bio:values.p_bio});
        window.guidcyBroadcastDataChange?.('profiles');window.guidcyBroadcastDataChange?.('consultants');
        profileKey='';document.querySelector('.profile-hero')?.removeAttribute('data-community-profile');
        if(params().has('member'))await member(p.id);else await mountConsultant();
        d.close();
        state.at=0;sidebar();notice('Profile Saved');
      }catch(_){error.textContent='Profile not saved. Your edits are still here; please try again.';}
      finally{submit.disabled=false;d.oncancel=null;d.querySelector('[data-close]').disabled=false;}
    };
  }
  function startAuth() {
    const c=client();if(!c||authStarted)return authReady;authStarted=true;
    const update=user=>{if((state.user?.id||'')===(user?.id||''))return;state.user=user;state.people.clear();state.at=0;profileKey='';if(!user&&['mine','saved','following'].includes(state.mode))state.mode='community';$('gnet-dialog')?.close();if(home()){load(true);sidebar();}if(params().has('member'))member(params().get('member'));else mountConsultant();};
    authReady=c.auth.getSession().then(r=>update(r.data?.session?.user||null)).catch(()=>{});
    c.auth.onAuthStateChange((_event,session)=>setTimeout(()=>update(session?.user||null),0));
    return authReady;
  }
  document.addEventListener('click',e=>{
    const organization=e.target.closest('a.gnet-organization-link');
    if(organization&&!e.defaultPrevented&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&typeof window.guidcyNavigate==='function'){e.preventDefault();window.guidcyNavigate(organization.getAttribute('href'));return;}
    const b=e.target.closest('button');if(!b||(!b.closest('.gnet-network,.gnet-dialog,.gnet-profile-page')&&b.dataset.action!=='organization-directory'))return;
    if(b.dataset.follow){toggleFollow(b.dataset.follow);return;}
    if(b.dataset.mode){if(['mine','saved','following'].includes(b.dataset.mode)&&!requireUser())return;state.mode=b.dataset.mode;document.querySelectorAll('.gnet-feed-toolbar [data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mode===state.mode)));const u=new URL(location.href);u.searchParams.delete('post');u.searchParams.delete('author');history.replaceState(history.state,'',u.pathname+u.search);load(true);return;}
    const action=b.dataset.action,card=b.closest('[data-post]'),p=card&&(profilePosts.get(card.dataset.post)||state.rows.get(card.dataset.post));
    if(action==='compose'){compose(null);if(b.dataset.photo)$('gnet-file')?.click();}
    if(action==='refresh'){load(true);sidebar();}
    if(action==='more')load();
    if(action==='network')network();
    if(action==='organization-directory')organizationDirectory();
    if(action==='close-profile')window.guidcyBack('/find-experts');
    if(action==='book')openBooking();
    if(action==='photo-options')photoOptions(b.dataset.photoKind);
    if(action==='edit-profile')editProfile();
    if(action==='endorse')endorse(b);
    if(action==='retry-endorsements'&&profilePerson)loadEndorsements(profilePerson);
    if(action==='add-section'&&ownProfile())addSection();
    if(action==='profile-section')profileSection(b.dataset.section);
    if(action==='edit-entry')editEntry(b.dataset.entry);
    if(action==='edit-experience')editExperience(Number(b.dataset.entry));
    if(action==='retry-profile')profileDetails(profilePerson);
    if(action==='retry-profile-header')mountConsultant();
    if(action==='expand-about'){const content=b.previousElementSibling,expanded=b.getAttribute('aria-expanded')==='true';content.classList.toggle('is-collapsed',expanded);b.setAttribute('aria-expanded',String(!expanded));b.textContent=expanded?'See more':'See less';}
    if(action==='share-profile'&&profilePerson){shareLink(location.origin+href(profilePerson),'Share Profile');}
    if(action==='profile-network')profileNetwork(b.dataset.person,b.dataset.direction);
    if(action==='view-posts'){$('gnet-profile-posts')?.scrollIntoView({block:'start'});activity(profilePerson);}
    if(action==='refresh-activity')activity(profilePerson);
    if(action==='more-activity')activity(profilePerson,true);
    if(action==='unfeature'&&ownProfile()){b.disabled=true;result(client().from('profile_featured').delete().eq('id',b.dataset.entry).eq('profile_id',state.user.id)).then(()=>refreshProfessional()).catch(()=>{notice('Could not remove featured item.');b.disabled=false;});}
    if(action==='featured-view'||action==='featured-buy'){b.disabled=true;const work=action==='featured-view'?window.GuidcyMarketplace.openDetails:window.GuidcyMarketplace.buyOrDownload;Promise.resolve().then(()=>work(b.dataset.resource)).catch(()=>notice('This resource could not open. Please try again.')).finally(()=>b.disabled=false);}

    if(action==='retry-posts')refreshActivity();
    if(!p)return;
    if(action==='like'||action==='save')toggleReaction(b,p,action==='save');
    if(action==='comments')comments(card,p);
    if(action==='share')share(p);
    if(action==='edit')compose(p);
    if(action==='delete')removePost(p);
    if(action==='expand'){card.querySelector('.gnet-post-body').classList.remove('gnet-collapsed');b.remove();}
  });
  window.GuidcyCommunity={mount,member,mountProfile:mountConsultant};
  window.initHome=mount;
  function boot() {
    startAuth();mount();if(params().has('member')&&location.pathname.replace(/\/$/,'')==='/profile')member(params().get('member'));
    if(!params().has('member'))mountConsultant();
    // Leaving Home invalidates its pending read so returning can start a fresh one.
    new MutationObserver(()=>{if(home())mount();else if(state.busy){state.epoch++;state.busy=false;state.at=0;}}).observe($('page-home'),{attributes:true,attributeFilter:['class']});
    window.addEventListener('popstate',()=>{if(home())mount();});
    window.addEventListener('guidcy:auth-ready',()=>{if(home())sidebar();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
