/* Blog UI. Public reads use the anonymous server route; admin writes use RLS. */
(function(){
  'use strict';
  const B=window.GuidcyBlogContent,$=id=>document.getElementById(id);
  const client=()=>window.guidcyGetSupabaseClient();
  let publicRequest=null,lastPublic='',lastPublicAt=0,adminPage=0,posts=[],editing=null,saving=false,dirty=false;
  const publicPath=()=>/^\/blog(?:\/|$)/.test(location.pathname);
  function message(text){const node=$('blog-admin-error')||$('blog-edit-error');if(node)node.textContent=text}
  async function authorized(){
    const c=client(),user=await c.auth.getUser();
    if(user.error||!user.data?.user)throw new Error('Sign in with an administrator account.');
    const result=await c.rpc('guidcy_is_admin',{uid:user.data.user.id});
    if(result.error||result.data!==true)throw new Error('Administrator access is required.');
    return c;
  }
  function errorText(error){
    if(error.code==='23505')return 'That slug is already in use. Choose another URL.';
    if(error.code==='PGRST116')return 'This article changed in another session or was deleted. Copy your edits before reloading.';
    return error.message||'Unable to save. Your edits are still here; please try again.';
  }
  async function renderPublic(){
    if(!publicPath())return;
    const key=location.pathname+location.search;
    const page=$('page-blog');if(!page)return;
    document.querySelectorAll('.page.on,.page.active').forEach(p=>{if(p!==page)p.classList.remove('on','active')});page.classList.add('on');
    if(publicRequest?.key===key)return publicRequest.promise;
    if(lastPublic===key&&Date.now()-lastPublicAt<1500&&page.querySelector('#blog-list'))return;
    if(!page.querySelector('#blog-list')?.textContent.trim())page.innerHTML='<div class="guidcy-blog-wrap"><p role="status">Loading articles…</p></div>';
    const promise=(async()=>{
      try{
        const pageNumber=new URLSearchParams(location.search).get('page')||'1';
        const response=await fetch('/api/jobs?service=seo&format=json&path='+encodeURIComponent(location.pathname)+'&page='+encodeURIComponent(pageNumber),{cache:'no-store'});
        if(!response.ok&&response.status!==404)throw new Error('Unavailable');
        const result=await response.json();
        if(location.pathname+location.search!==key||!publicPath())return;
        page.innerHTML='<div class="guidcy-blog-wrap"><div id="blog-list">'+result.body+'</div></div>';
        window.guidcySeoApply?.(result.meta);lastPublic=key;lastPublicAt=Date.now();
      }catch(_){
        if(location.pathname+location.search!==key||!publicPath())return;
        page.innerHTML='<div class="guidcy-blog-wrap"><h1>Blog temporarily unavailable</h1><p>Please try again shortly.</p><button class="btn" data-blog-retry>Try again</button></div>';
      }finally{if(publicRequest?.key===key)publicRequest=null;}
    })();
    publicRequest={key,promise};return promise;
  }
  async function renderAdmin(){
    const host=$('adash-main');if(!host)return;
    if($('blog-editor'))return; // Background dashboard refreshes must preserve edits.
    host.innerHTML='<div class="dash-title">Blog Management</div><p role="status">Loading articles…</p>';
    try{
      const c=await authorized();
      const result=await c.from('blog_posts').select('*').order('created_at',{ascending:false}).order('id').range(adminPage*20,adminPage*20+20);
      if(result.error)throw result.error;
      if(!host.querySelector('.dash-title')?.textContent.includes('Blog Management'))return;
      posts=(result.data||[]).slice(0,20);editing=null;dirty=false;
      host.innerHTML='<div class="dash-title">Blog Management</div><p>Create articles, review drafts, and manage what readers see.</p><div class="blog-actions"><button class="btn btn-blue" data-blog-new>Create article</button><a class="btn" href="/blog" target="_blank" rel="noopener">View public blog</a></div><p id="blog-admin-error" class="blog-error" role="alert"></p><div id="blog-admin-list">'+
        (posts.length?posts.map(p=>'<article class="blog-admin-row"><h2>'+B.esc(p.title)+'</h2><p class="blog-status">'+B.esc(p.status==='published'&&Date.parse(p.published_at)>Date.now()?'Scheduled':p.status==='published'?'Published':'Draft')+' · '+B.esc(p.author)+' · '+B.esc(p.category)+'</p><p class="blog-status">/blog/'+B.esc(p.slug)+'</p><div class="blog-actions">'+
          '<button class="btn" data-blog-edit="'+p.id+'">Edit</button><button class="btn" data-blog-preview="'+p.id+'">Preview</button><button class="btn" data-blog-status="'+p.id+'">'+(p.status==='published'?'Unpublish':'Publish')+'</button><button class="btn" data-blog-delete="'+p.id+'">Delete</button></div></article>').join(''):'<div class="blog-empty">No articles here yet.</div>')+'</div><nav class="blog-pagination" aria-label="Manage article pages">'+(adminPage?'<button class="btn" data-blog-page="-1">Previous</button>':'')+(result.data?.length>20?'<button class="btn" data-blog-page="1">Next</button>':'')+'</nav>';
    }catch(error){host.innerHTML='<div class="dash-title">Blog Management</div><p class="blog-error" role="alert">'+B.esc(errorText(error))+'</p><button class="btn" data-blog-reload>Try again</button>';}
  }
  function field(name,label,value='',options=''){
    return '<div class="field"><label for="blog-'+name+'">'+label+'</label><input id="blog-'+name+'" name="'+name+'" value="'+B.esc(value)+'" '+options+'></div>';
  }
  function localDate(value){const d=value?new Date(value):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
  function edit(post){
    editing=post||null;dirty=false;
    const p=post||{author:'Guidcy',category:'Guidance',status:'draft'};
    $('adash-main').innerHTML='<div class="dash-title">Blog Management</div><form id="blog-editor" class="blog-editor"><h2>'+(post?'Edit article':'Create article')+'</h2><div class="blog-editor-grid">'+
      field('title','Title',p.title,'required maxlength="200"')+field('slug','Slug',p.slug,'required maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*" '+(p.first_published_at?'readonly':''))+
      field('author','Author',p.author,'required maxlength="120"')+field('category','Category',p.category,'required maxlength="80"')+
      field('published_at','Publish date and time',localDate(p.published_at),'type="datetime-local"')+
      '<div class="field"><label for="blog-status">Status</label><select id="blog-status" name="status"><option value="draft">Draft</option><option value="published" '+(p.status==='published'?'selected':'')+'>Published</option></select></div></div><small>Dates use your local time zone. Future publication dates remain private until that time. A published URL stays fixed.</small>'+
      field('cover_image','Cover image URL',p.cover_image,'type="url" maxlength="2048" placeholder="https://…"')+
      '<div class="field"><label for="blog-cover-file">Or upload a cover image</label><input id="blog-cover-file" type="file" accept="image/jpeg,image/png,image/webp"><small>JPEG, PNG or WebP, up to 5 MB. Cover images have public URLs.</small></div>'+
      field('cover_alt','Cover image description',p.cover_alt,'maxlength="200"')+
      '<div class="field"><label for="blog-excerpt">Excerpt</label><textarea id="blog-excerpt" name="excerpt" maxlength="500">'+B.esc(p.excerpt)+'</textarea></div>'+
      '<label id="blog-content-label">Article content</label><div class="blog-toolbar" role="group" aria-label="Text formatting">'+
      [['bold','Bold'],['italic','Italic'],['formatBlock:p','Paragraph'],['formatBlock:h2','Heading 2'],['formatBlock:h3','Heading 3'],['insertUnorderedList','Bullet list'],['insertOrderedList','Numbered list'],['formatBlock:blockquote','Quote'],['createLink','Link'],['unlink','Remove link'],['undo','Undo']].map(([cmd,label])=>'<button type="button" class="btn" data-blog-format="'+cmd+'">'+label+'</button>').join('')+'</div>'+
      '<div id="blog-content" class="blog-prose blog-editable" role="textbox" aria-multiline="true" aria-labelledby="blog-content-label" contenteditable="true">'+B.render(p.content||[])+'</div>'+
      '<div class="blog-editor-grid">'+field('meta_title','SEO title',p.meta_title,'maxlength="200" placeholder="Defaults to the article title"')+
      '<div class="field"><label for="blog-meta_description">SEO description</label><textarea id="blog-meta_description" name="meta_description" maxlength="300" placeholder="Defaults to the excerpt">'+B.esc(p.meta_description)+'</textarea></div></div><small>Aim for about 60 characters for the SEO title and 160 for the description.</small>'+
      '<p id="blog-edit-error" class="blog-error" role="alert"></p><div class="blog-actions"><button type="submit" class="btn btn-blue">Save article</button><button type="button" class="btn" data-blog-preview-current>Preview</button><button type="button" class="btn" data-blog-cancel>Cancel</button></div></form>';
    $('blog-title').focus();
  }
  function read(){
    const data=Object.fromEntries(new FormData($('blog-editor')));
    Object.keys(data).forEach(key=>data[key]=data[key].trim());
    data.content=B.read($('blog-content'));
    data.published_at=data.published_at?new Date(data.published_at).toISOString():null;
    return data;
  }
  function validate(p){
    if(!p.title?.trim()||!p.author?.trim()||!p.category?.trim())throw new Error('Add a title, author and category.');
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)||p.slug.length>100)throw new Error('Use a slug with lowercase letters, numbers and single hyphens.');
    if(p.cover_image&&!B.image(p.cover_image))throw new Error('Use a valid HTTPS cover image URL.');
    if(JSON.stringify(p.content).length>100000)throw new Error('The article is too long. Keep content under 100,000 characters.');
    if(p.status==='published'&&(!p.excerpt?.trim()||!B.plain(p.content).trim()))throw new Error('Add an excerpt and article content before publishing.');
  }
  function preview(p){
    const dialog=document.createElement('dialog');dialog.className='blog-preview';dialog.setAttribute('aria-label','Article preview');
    dialog.innerHTML='<div class="blog-actions"><strong>Article preview</strong><button class="btn" data-blog-close-preview>Close preview</button></div>'+B.article(p);
    document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
    const file=$('blog-cover-file')?.files[0];
    if(file&&/^image\/(jpeg|png|webp)$/.test(file.type)){
      const img=document.createElement('img'),objectUrl=URL.createObjectURL(file);img.className='blog-cover';img.alt=p.cover_alt||p.title;img.src=objectUrl;
      dialog.querySelector('.blog-article>.blog-cover')?.remove();dialog.querySelector('.blog-prose').before(img);
      dialog.addEventListener('close',()=>URL.revokeObjectURL(objectUrl),{once:true});
    }
  }
  async function save(){
    if(saving)return;
    const form=$('blog-editor');if(!form.reportValidity())return;
    let uploadPath='',c,saved=false;
    try{
      const data=read();validate(data);saving=true;
      form.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=true);$('blog-content').contentEditable='false';
      c=await authorized();
      const file=$('blog-cover-file').files[0];
      if(file){
        const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
        if(!ext||file.size>5242880)throw new Error('Choose a JPEG, PNG or WebP image smaller than 5 MB.');
        uploadPath=crypto.randomUUID()+'.'+ext;
        const uploaded=await c.storage.from('blog-covers').upload(uploadPath,file,{contentType:file.type,upsert:false});
        if(uploaded.error)throw uploaded.error;
        data.cover_image=c.storage.from('blog-covers').getPublicUrl(uploadPath).data.publicUrl;
      }
      const result=await (editing?c.from('blog_posts').update(data).eq('id',editing.id).eq('version',editing.version):c.from('blog_posts').insert(data)).select('*').single();
      if(result.error)throw result.error;
      if(!result.data)throw new Error('No article was saved. Please try again.');
      saved=true;dirty=false;lastPublic='';editing=null;
      if(form.isConnected){form.remove();await renderAdmin();}
    }catch(error){message(errorText(error));}
    finally{
      if(uploadPath&&!saved&&c)await c.storage.from('blog-covers').remove([uploadPath]).catch(()=>{});
      saving=false;
      if(form.isConnected){form.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=false);$('blog-content').contentEditable='true';}
    }
  }
  async function mutate(post,remove){
    if(saving)return;
    if(remove&&!confirm('Delete “'+post.title+'”? This cannot be undone.'))return;
    try{
      saving=true;const c=await authorized();
      const data={status:post.status==='published'?'draft':'published'};
      if(!remove){validate({...post,...data});if(data.status==='published'&&!post.published_at)data.published_at=new Date().toISOString();}
      const query=remove?c.from('blog_posts').delete():c.from('blog_posts').update(data);
      const result=await query.eq('id',post.id).eq('version',post.version).select('id').single();
      if(result.error)throw result.error;
      if(!result.data)throw new Error('The article was not changed. Reload and try again.');
      lastPublic='';await renderAdmin();
    }catch(error){message(errorText(error));}finally{saving=false;}
  }
  document.addEventListener('submit',event=>{if(event.target.id==='blog-editor'){event.preventDefault();save();}});
  document.addEventListener('input',event=>{
    if(!event.target.closest('#blog-editor'))return;
    dirty=true;
    if(event.target.id==='blog-title'&&!editing&&!$('blog-slug').dataset.edited)$('blog-slug').value=event.target.value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'');
    if(event.target.id==='blog-slug')event.target.dataset.edited='true';
  });
  document.addEventListener('paste',event=>{
    if(event.target.closest('#blog-content')){event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));}
  });
  document.addEventListener('drop',event=>{if(event.target.closest('#blog-content'))event.preventDefault();});
  document.addEventListener('mousedown',event=>{if(event.target.closest('[data-blog-format]'))event.preventDefault();});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-blog-close-preview')){button.closest('dialog').close();return;}
    if(button.hasAttribute('data-blog-retry')){lastPublic='';renderPublic();return;}
    if(button.hasAttribute('data-blog-reload')){renderAdmin();return;}
    if(saving)return;
    if(button.hasAttribute('data-blog-new')){edit();return;}
    if(button.hasAttribute('data-blog-cancel')){
      if(dirty&&!confirm('Discard your unsaved changes?'))return;
      dirty=false;$('blog-editor').remove();renderAdmin();return;
    }
    if(button.hasAttribute('data-blog-preview-current')){try{preview(read())}catch(error){message(errorText(error))}return;}
    if(button.dataset.blogFormat){
      const [command,arg]=button.dataset.blogFormat.split(':');let value=arg;
      if(command==='createLink'){value=prompt('Link URL (https://… or /blog/article-slug)');if(!value)return;value=B.link(value);if(!value){message('Use an HTTPS/HTTP link or a relative site URL.');return;}}
      $('blog-content').focus();document.execCommand(command,false,value);dirty=true;return;
    }
    if(button.dataset.blogPage){adminPage=Math.max(0,adminPage+Number(button.dataset.blogPage));renderAdmin();return;}
    const post=posts.find(p=>p.id===(button.dataset.blogEdit||button.dataset.blogPreview||button.dataset.blogStatus||button.dataset.blogDelete));
    if(!post)return;
    if(button.dataset.blogEdit)edit(post);
    if(button.dataset.blogPreview)preview(post);
    if(button.dataset.blogStatus)mutate(post,false);
    if(button.dataset.blogDelete)mutate(post,true);
  });
  // Block accidental navigation while saving, and confirm before discarding edits.
  window.addEventListener('click',event=>{
    if(!$('blog-editor')||!event.target.closest('a,button')||event.target.closest('#blog-editor,dialog'))return;
    if(saving||(dirty&&!confirm('Discard your unsaved changes?'))){event.preventDefault();event.stopImmediatePropagation();return;}
    dirty=false;
  },true);
  window.addEventListener('beforeunload',event=>{if((dirty||saving)&&$('blog-editor')){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pageshow',()=>{if(publicPath()){lastPublic='';renderPublic();}});
  window.GuidcyBlog={renderPublic,renderAdmin};
  window.renderGuidcyBlog=window.renderBlog=renderPublic;
  // Disable obsolete browser-local publishing entry points retained by legacy code.
  ['guidcyAddBlogPost','guidcyEditBlogPost','guidcySaveBlogEdit','guidcyDeleteBlogPost','guidcyRemoveBlogImage','guidcySaveBlogPosts','guidcyAddComment','guidcyDeleteBlogComment'].forEach(name=>{window[name]=()=>{};});
  if(publicPath())renderPublic();
})();
