/* One transport boundary for the legacy SPA's SDK and REST callers. Database
 * policies remain authoritative; directory responses contain public fields only
 * unless the database authenticates the row owner or administrator. */
(function(){
  'use strict';
  const nativeFetch=window.fetch.bind(window);
  window.guidcyEscapeHtml=function(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));};
  window.guidcySafeColor=function(value){return /^#[0-9a-f]{3,8}$/i.test(String(value))?value:'#1E72BE';};
  const databaseOrigin='https://lsthngfxehayeqyctkla.supabase.co';
  const directories={profiles:'guidcy_profiles',consultants:'guidcy_consultants',webinars:'guidcy_webinars'};
  window.fetch=async function(input,init){
    const request=new Request(input instanceof Request?input:new URL(input,location.href),init);
    const url=new URL(request.url);
    if(url.origin===databaseOrigin){
      const table=url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
      if((request.method==='GET'||request.method==='HEAD')&&directories[table]){
        url.pathname='/rest/v1/'+directories[table];
        return nativeFetch(new Request(url,request));
      }
      if(url.pathname==='/functions/v1/send-guidcy-email'||url.pathname==='/functions/v1/send-booking-email'){
        url.href=location.origin+'/api/send-guidcy-email';
      }
    }
    if(url.origin===location.origin&&/^\/api\//.test(url.pathname)&&request.method==='POST'){
      const client=window.sb||window.__guidcySupabaseClient;
      const session=client?.auth?await client.auth.getSession():null;
      const token=session?.data?.session?.access_token;
      const headers=new Headers(request.headers);
      headers.delete('apikey');
      if(token)headers.set('Authorization','Bearer '+token);
      return nativeFetch(new Request(url,new Request(request,{headers})));
    }
    return nativeFetch(request);
  };
  let pdfPromise;
  window.guidcyLoadPdfJs=function(){
    if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
    if(!pdfPromise)pdfPromise=import('/assets/vendor/pdf.mjs').then(lib=>{
      lib.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.mjs';
      window.pdfjsLib=lib;return lib;
    }).catch(error=>{pdfPromise=null;throw error});
    return pdfPromise;
  };
})();
