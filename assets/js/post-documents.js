/* PDF attachments reuse the existing post, auth and storage systems. Loaded on demand. */
(function(){
  'use strict';
  if(window.GuidcyPostDocuments)return;
  const MAX_BYTES=20*1024*1024,MAX_PAGES=200,viewers=new Map();
  const pathOK=p=>/^[a-f0-9-]{36}\/[a-f0-9-]{36}[.]pdf$/.test(p||'');
  const visible=el=>el.isConnected&&!!el.getClientRects().length&&!!el.closest('.page.on');
  const library=()=>window.guidcyLoadPdfJs();
  const pdfOptions={isEvalSupported:false,enableXfa:false,cMapUrl:'/assets/vendor/pdf-assets/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/vendor/pdf-assets/standard_fonts/',wasmUrl:'/assets/vendor/pdf-assets/wasm/',iccUrl:'/assets/vendor/pdf-assets/iccs/'};
  async function timed(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PDF request timed out')),ms);})]);}finally{clearTimeout(timer);}}
  async function validate(file){
    if(!/\.pdf$/i.test(file.name)||!['application/pdf',''].includes(file.type)||!file.size||file.size>MAX_BYTES)throw new Error('Choose a PDF up to 20 MB.');
    if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')throw new Error('This file is not a valid PDF.');
    const lib=await library(),task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),...pdfOptions,stopAtErrors:true});
    try{const pdf=await timed(task.promise,20000);if(pdf.numPages<1||pdf.numPages>MAX_PAGES)throw new Error('Choose a PDF with 1–200 pages.');return {file,name:file.name.trim().slice(0,200),pages:pdf.numPages,bytes:file.size};}
    catch(error){if(error.name==='PasswordException')throw new Error('Choose a PDF without password protection.');if(/1–200/.test(error.message))throw error;throw new Error('This PDF could not be read. Choose a valid, unprotected PDF.');}
    finally{await task.destroy();}
  }
  function controls(s,busy){
    const active=document.activeElement;
    s.prev.disabled=busy||!s.pdf||s.page<=1;s.next.disabled=busy||!s.pdf||s.page>=s.pdf.numPages;
    const total=s.pdf?.numPages||s.total;s.counter.textContent=s.page+' / '+total;s.counter.setAttribute('aria-label','Page '+s.page+' of '+total);
    if(s.expanded){const {dialog,zoom}=s.expanded;dialog.querySelector('[data-pdf-zoom-out]').disabled=busy||!s.pdf||zoom<=.5;dialog.querySelector('[data-pdf-zoom-in]').disabled=busy||!s.pdf||zoom>=3;dialog.querySelector('[data-pdf-zoom-reset]').disabled=busy||!s.pdf;dialog.querySelector('[data-pdf-zoom-level]').textContent=Math.round(zoom*100)+'%';}
    // Disabling a focused control during rendering must not lose reader keyboard focus.
    if(s.expanded&&active?.disabled&&active.closest('.gnet-document-dialog')===s.expanded.dialog)s.expanded.dialog.focus({preventScroll:true});
  }
  function zoom(s,value){
    const expanded=s.expanded;if(!expanded||!s.pdf||s.busy)return;
    value=Math.max(.5,Math.min(3,value));if(value===expanded.zoom)return;
    expanded.anchor={x:(s.stage.scrollLeft+s.stage.clientWidth/2)/expanded.page.clientWidth,y:(s.stage.scrollTop+s.stage.clientHeight/2)/expanded.page.clientHeight};
    expanded.zoom=value;draw(s);
  }
  function keys(s,event){
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable]'))return;
    if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();turn(s,event.key==='ArrowLeft'?-1:1);}
    else if(s.expanded&&['+','=','-','_','0'].includes(event.key)){event.preventDefault();zoom(s,event.key==='0'?1:s.expanded.zoom+(['+','='].includes(event.key)?.25:-.25));}
  }
  let expandedReader=null;
  function closeExpanded(s){
    const expanded=s.expanded;if(!expanded)return;
    s.expanded=null;if(expandedReader===s)expandedReader=null;
    if(expanded.dialog.open)expanded.dialog.close();
    expanded.page.replaceWith(s.canvas);
    if(expanded.placeholder.isConnected)expanded.placeholder.replaceWith(s.el);
    expanded.dialog.remove();s.expand?.setAttribute('aria-expanded','false');
    window.guidcySyncModalScrollLock?.();
    if(visible(s.el)){s.expand?.focus({preventScroll:true});if(s.pdf)draw(s);}
  }
  function openExpanded(s){
    if(s.expanded)return;
    if(expandedReader)closeExpanded(expandedReader);
    const parent=s.el.parentElement;if(!parent)return;
    const placeholder=document.createElement('div');placeholder.className='gnet-document-placeholder';placeholder.setAttribute('aria-hidden','true');placeholder.style.height=s.el.getBoundingClientRect().height+'px';
    s.el.before(placeholder);
    const dialog=document.createElement('dialog');dialog.className='gnet-document-dialog';dialog.setAttribute('aria-label','Full-screen PDF reader');
    dialog.innerHTML='<header><div class="gnet-document-zoom" role="group" aria-label="PDF zoom"><button type="button" data-pdf-zoom-out aria-label="Zoom out" title="Zoom out (−)">−</button><button type="button" data-pdf-zoom-reset aria-label="Fit page" title="Fit page (0)"><span data-pdf-zoom-level aria-live="polite">100%</span></button><button type="button" data-pdf-zoom-in aria-label="Zoom in" title="Zoom in (+)">+</button></div><button type="button" class="gnet-document-close" aria-label="Close full-screen reader" title="Close">×</button></header>';
    const page=document.createElement('div');page.className='gnet-document-page';s.canvas.before(page);page.append(s.canvas);
    dialog.append(s.el);parent.append(dialog);s.expanded={dialog,placeholder,page,zoom:1};expandedReader=s;s.inView=true;s.expand?.setAttribute('aria-expanded','true');
    s.canvas.hidden=true;s.stage.setAttribute('aria-busy','true');if(s.pdf){s.busy=true;s.status.textContent='Loading page…';controls(s,true);}
    dialog.querySelector('.gnet-document-close').onclick=()=>closeExpanded(s);
    dialog.querySelector('[data-pdf-zoom-out]').onclick=()=>zoom(s,s.expanded.zoom-.25);
    dialog.querySelector('[data-pdf-zoom-in]').onclick=()=>zoom(s,s.expanded.zoom+.25);
    dialog.querySelector('[data-pdf-zoom-reset]').onclick=()=>zoom(s,1);
    dialog.addEventListener('keydown',event=>keys(s,event));
    dialog.addEventListener('close',()=>closeExpanded(s),{once:true});
    try{dialog.showModal();dialog.tabIndex=-1;dialog.focus({preventScroll:true});}catch(_){closeExpanded(s);return;}
    window.guidcySyncModalScrollLock?.();
    requestAnimationFrame(()=>{if(!s.expanded)return;window.guidcySyncModalScrollLock?.();if(s.pdf)draw(s);else load(s);});
  }
  function release(s){
    s.epoch++;s.renderVersion++;s.renderTask?.cancel();
    s.task?.destroy().catch(()=>{});s.task=null;s.pdf=null;s.loading=false;s.busy=false;s.failed=false;
    s.canvas.width=0;s.canvas.height=0;s.canvas.hidden=true;s.text.textContent='';
    s.status.textContent='';s.read.textContent='Read PDF';s.read.hidden=false;s.stage.removeAttribute('aria-busy');controls(s,false);
  }
  async function draw(s){
    if(!s.pdf||!visible(s.el))return;
    const version=++s.renderVersion;s.renderTask?.cancel();
    s.busy=true;s.canvas.hidden=true;s.status.textContent='Loading page…';s.stage.setAttribute('aria-busy','true');controls(s,true);
    try{
      await s.renderPromise?.catch(()=>{});
      const page=await s.pdf.getPage(s.page);if(version!==s.renderVersion||!visible(s.el)){page.cleanup();return;}
      const base=page.getViewport({scale:1}),height=s.expanded?Math.max(1,s.stage.clientHeight):560,scale=Math.min(s.stage.clientWidth/base.width,height/base.height)*(s.expanded?.zoom||1),viewport=page.getViewport({scale});
      // Bound raster memory on large screens while retaining the requested reading size.
      const ratio=Math.min(window.devicePixelRatio||1,2,8192/Math.max(viewport.width,viewport.height),Math.sqrt(16000000/(viewport.width*viewport.height)));
      s.stage.style.aspectRatio=base.width+' / '+base.height;
      s.canvas.width=Math.ceil(viewport.width*ratio);s.canvas.height=Math.ceil(viewport.height*ratio);
      s.canvas.style.width=viewport.width+'px';s.canvas.style.height=viewport.height+'px';
      if(s.expanded){const expanded=s.expanded;expanded.page.style.width=viewport.width+'px';expanded.page.style.height=viewport.height+'px';if(expanded.anchor){s.stage.scrollLeft=expanded.anchor.x*expanded.page.clientWidth-s.stage.clientWidth/2;s.stage.scrollTop=expanded.anchor.y*expanded.page.clientHeight-s.stage.clientHeight/2;expanded.anchor=null;}}
      s.read.hidden=true;
      s.renderTask=page.render({canvasContext:s.canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});
      s.renderPromise=s.renderTask.promise;await s.renderPromise;if(version!==s.renderVersion)return;s.canvas.hidden=false;s.status.textContent='';
      const content=await page.getTextContent().catch(()=>({items:[]}));if(version!==s.renderVersion)return;
      s.text.textContent=content.items.map(item=>item.str||'').join(' ').slice(0,30000);page.cleanup();
      s.canvas.setAttribute('aria-label','Page '+s.page+' of '+s.pdf.numPages);
    }catch(error){if(version!==s.renderVersion||error.name==='RenderingCancelledException')return;s.failed=true;s.canvas.hidden=true;s.text.textContent='';s.read.textContent='Try again';s.read.hidden=false;s.status.textContent='This page could not load. Use the arrows to try another page or download the PDF.';}
    finally{if(version===s.renderVersion){s.busy=false;s.stage.removeAttribute('aria-busy');controls(s,false);}}
  }
  async function load(s){
    if(s.loading||s.pdf||!s.inView||!visible(s.el))return;
    const epoch=++s.epoch;s.failed=false;s.loading=true;s.read.hidden=true;s.status.textContent='Loading PDF…';s.stage.setAttribute('aria-busy','true');
    try{
      const lib=await library();if(epoch!==s.epoch||!visible(s.el))return;
      const client=window.guidcyGetSupabaseClient?.()||window.sb,path=s.el.dataset.documentPath;
      if(!pathOK(path))throw new Error('Invalid document path');
      const url=client.storage.from('community-documents').getPublicUrl(path).data.publicUrl;
      const task=lib.getDocument({url,...pdfOptions,disableAutoFetch:true,disableStream:true});s.task=task;
      const pdf=await timed(task.promise,30000);if(epoch!==s.epoch){await task.destroy();return;}
      if(pdf.numPages<1||pdf.numPages>MAX_PAGES)throw new Error('Unsupported PDF');
      s.pdf=pdf;s.total=pdf.numPages;s.page=Math.min(s.page,pdf.numPages);await draw(s);
    }catch(_){if(epoch!==s.epoch)return;s.failed=true;s.task?.destroy().catch(()=>{});s.task=null;s.pdf=null;s.canvas.hidden=true;s.status.textContent='The PDF could not load. Try again or download it.';s.read.textContent='Try again';s.read.hidden=false;}
    finally{if(epoch===s.epoch){s.loading=false;s.stage.removeAttribute('aria-busy');controls(s,s.busy);}}
  }
  function turn(s,delta){if(!s.pdf||s.busy||s.page+delta<1||s.page+delta>s.pdf.numPages)return;s.page+=delta;if(s.expanded)s.expanded.anchor={x:.5,y:0};draw(s);}
  const intersection=new IntersectionObserver(entries=>{for(const entry of entries){const s=viewers.get(entry.target);if(!s)continue;if(s.expanded){s.inView=true;if(visible(s.el)&&!s.failed)load(s);continue;}s.inView=entry.isIntersecting;if(entry.isIntersecting&&visible(s.el)&&!s.failed)load(s);else if(!entry.isIntersecting&&(s.task||s.loading||s.failed))release(s);}},{rootMargin:'200px 0px'});
  const resize=new ResizeObserver(entries=>{for(const entry of entries){const s=viewers.get(entry.target);if(s&&(Math.abs(s.width-entry.contentRect.width)>1||(s.expanded&&Math.abs(s.height-entry.contentRect.height)>1))){s.width=entry.contentRect.width;s.height=entry.contentRect.height;if(s.pdf)draw(s);}}});
  function mountAll(){
    if(expandedReader&&(!expandedReader.el.isConnected||!expandedReader.el.closest('.page.on')))closeExpanded(expandedReader);
    for(const [el,s] of viewers)if(!el.isConnected){release(s);intersection.unobserve(el);resize.unobserve(el);viewers.delete(el);}else if(!visible(el)&&(s.task||s.loading||s.failed))release(s);
    for(const el of document.querySelectorAll('.gnet-document[data-document-path]')){
      if(viewers.has(el)){const existing=viewers.get(el);if(existing.inView&&visible(el)&&!existing.failed)load(existing);continue;}
      const s={el,inView:false,failed:false,page:1,total:Number(el.dataset.documentPages)||1,width:el.clientWidth,height:el.clientHeight,expand:el.querySelector('[data-pdf-expand]'),epoch:0,renderVersion:0,stage:el.querySelector('.gnet-document-stage'),canvas:el.querySelector('canvas'),text:el.querySelector('.gnet-document-text'),read:el.querySelector('[data-action=load-document]'),status:el.querySelector('[role=status]'),prev:el.querySelector('[data-pdf-prev]'),next:el.querySelector('[data-pdf-next]'),counter:el.querySelector('[data-pdf-counter]')};
      if(!s.stage||!s.canvas||!s.read||!s.prev||!s.next)continue;
      if(s.expand){s.expand.disabled=false;s.expand.setAttribute('aria-expanded','false');s.expand.onclick=()=>openExpanded(s);}
      viewers.set(el,s);s.canvas.hidden=true;s.read.hidden=false;s.read.onclick=()=>{s.inView=true;s.failed=false;return s.pdf?draw(s):load(s);};s.prev.onclick=()=>turn(s,-1);s.next.onclick=()=>turn(s,1);
      s.stage.onkeydown=event=>{if(!s.expanded)keys(s,event);};
      let down=null;s.stage.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&event.isPrimary)down={x:event.clientX,y:event.clientY};},{passive:true});
      s.stage.addEventListener('pointercancel',()=>{down=null;},{passive:true});
      s.stage.addEventListener('pointerup',event=>{if(!down)return;const dx=event.clientX-down.x,dy=event.clientY-down.y;down=null;if(s.expanded?.zoom>1)return;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)turn(s,dx<0?1:-1);},{passive:true});
      controls(s,false);intersection.observe(el);resize.observe(el);
    }
  }
  let queued=false;function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mountAll();});}
  for(const id of ['gnet-feed','profile-layout']){const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{childList:true,subtree:true});}
  for(const id of ['page-home','page-profile']){const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{attributes:true,attributeFilter:['class']});}
  window.addEventListener('pagehide',()=>{for(const s of viewers.values())release(s);});
  window.addEventListener('pageshow',()=>{mountAll();for(const s of viewers.values())if(s.inView&&visible(s.el))load(s);});
  window.GuidcyPostDocuments={validate,mountAll};mountAll();
})();
