/* Guidcy shared intelligent consultant search — homepage + Find Expert. */
(function(){
  'use strict';
  if(window.__guidcySharedSearchInstalled)return;
  window.__guidcySharedSearchInstalled=true;

  var CACHE_MS=60000,FETCH_LIMIT=200,SUGGESTION_LIMIT=7;
  var GENERIC_WORDS={a:1,an:1,and:1,for:1,in:1,of:1,on:1,the:1,to:1,with:1,consultant:1,consultants:1,expert:1,experts:1,help:1,mentor:1};
  var FIELD_GROUPS=[
    {name:'name',weight:12,keys:['name','full_name']},
    {name:'category',weight:11,keys:['category','categories','consultation_category','consultation_categories','primary_category','specialty','role']},
    {name:'expertise',weight:9,keys:['expertise','skills','tags','services','certs','certifications']},
    {name:'title',weight:8,keys:['title','headline','designation','current_position','current_work','job_title']},
    {name:'keywords',weight:6,keys:['profile_keywords','keywords','search_keywords','seo_keywords','industries','industry','languages']},
    {name:'profile',weight:4,keys:['bio','short_bio','about','description','experience','exp','company_experience','experience_history','previous_companies','current_company_college','current_company','company','organization','highest_education','college','university']}
  ];
  var state={rows:null,loadedAt:0,vocabulary:null};
  var priorFetch=typeof window.fetchConsultants==='function'?window.fetchConsultants:null;
  var surfaceState={hero:{timer:null,controller:null,sequence:0},browse:{timer:null,controller:null,sequence:0}};
  var browseGridTimer=null;

  function normalize(value){return String(value==null?'':value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
  function flatValues(value,depth){
    depth=depth||0;if(value==null||depth>5)return [];
    if(Array.isArray(value))return value.reduce(function(out,item){return out.concat(flatValues(item,depth+1))},[]);
    if(typeof value==='object')return Object.keys(value).reduce(function(out,key){return out.concat(flatValues(value[key],depth+1))},[]);
    if(typeof value==='string'){
      var raw=value.trim();
      if((raw[0]==='['&&raw[raw.length-1]===']')||(raw[0]==='{'&&raw[raw.length-1]==='}')){try{return flatValues(JSON.parse(raw),depth+1)}catch(_){}}
      return raw?[raw]:[];
    }
    return [String(value)];
  }
  function tokenize(value){var all=normalize(value).split(' ').filter(Boolean),useful=all.filter(function(token){return !GENERIC_WORDS[token]});return useful.length?useful:all}
  function boundedDistance(a,b,max){
    a=normalize(a);b=normalize(b);if(a===b)return 0;if(!a||!b)return Math.max(a.length,b.length);if(Math.abs(a.length-b.length)>max)return max+1;
    var previous=Array.from({length:b.length+1},function(_,i){return i}),beforePrevious=null;
    for(var i=1;i<=a.length;i++){
      var current=[i],rowBest=i;
      for(var j=1;j<=b.length;j++){
        var value=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
        if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]&&beforePrevious)value=Math.min(value,beforePrevious[j-2]+1);
        current[j]=value;if(value<rowBest)rowBest=value;
      }
      if(rowBest>max)return max+1;beforePrevious=previous;previous=current;
    }
    return previous[b.length];
  }
  function commonPrefixLength(a,b){var size=Math.min(a.length,b.length),i=0;while(i<size&&a[i]===b[i])i++;return i}
  function tokenSimilarity(queryToken,candidateToken){
    var q=normalize(queryToken),c=normalize(candidateToken);if(!q||!c)return {value:0,mode:'none'};if(q===c)return {value:1,mode:'exact'};
    if(q.length>=2&&c.indexOf(q)===0)return {value:Math.max(.86,.96-Math.min(.1,(c.length-q.length)*.012)),mode:'prefix'};
    if(c.length>=4&&q.indexOf(c)===0)return {value:Math.max(.82,.9-Math.min(.08,(q.length-c.length)*.012)),mode:'prefix'};
    if(q.length>=4&&c.length>=4&&(c.indexOf(q)>-1||q.indexOf(c)>-1))return {value:.82,mode:'partial'};
    var prefix=commonPrefixLength(q,c);if(prefix>=5&&prefix/Math.min(q.length,c.length)>=.7)return {value:.84,mode:'similar'};
    if(Math.min(q.length,c.length)<4)return {value:0,mode:'none'};
    var allowed=Math.max(q.length,c.length)<=4?1:2,distance=boundedDistance(q,c,allowed);if(distance>allowed)return {value:0,mode:'none'};
    var similarity=1-distance/Math.max(q.length,c.length),floor=Math.max(q.length,c.length)<=5?.74:.76;
    return similarity>=floor?{value:similarity,mode:'fuzzy',distance:distance}:{value:0,mode:'none'};
  }
  function consultantFields(consultant){
    consultant=consultant||{};
    return FIELD_GROUPS.map(function(group){var values=[];group.keys.forEach(function(key){values=values.concat(flatValues(consultant[key]))});return {name:group.name,weight:group.weight,values:values.map(normalize).filter(Boolean)}}).filter(function(group){return group.values.length});
  }
  function displayValue(value){var raw=String(value==null?'':value).trim();if(!raw)return '';return raw===raw.toLowerCase()?raw.replace(/\b[a-z]/g,function(ch){return ch.toUpperCase()}):raw}
  function buildVocabulary(rows){
    var terms=new Map();
    function put(term,display,weight,kind){var current=terms.get(term),nextWeight=(current?current.weight:0)+weight;if(!current||weight>=current.bestWeight)terms.set(term,{term:term,display:displayValue(display),weight:nextWeight,bestWeight:weight,kind:kind||'profile'});else current.weight=nextWeight}
    function add(raw,weight,kind){flatValues(raw).forEach(function(value){var phrase=normalize(value);if(!phrase)return;var pieces=phrase.split(' ').filter(Boolean);if(pieces.length<=4&&phrase.length>=3)put(phrase,value,weight,kind);pieces.forEach(function(piece){if(piece.length>=3)put(piece,piece,weight,kind)})})}
    (window.CATEGORIES_FULL||[]).forEach(function(category){add(category&&category.name||category,40,'category')});
    (rows||[]).forEach(function(c){add([c.category,c.categories,c.consultation_category,c.consultation_categories,c.primary_category,c.specialty],14,'category');add([c.expertise,c.skills,c.tags,c.services],8,'expertise');add([c.title,c.headline,c.designation,c.current_position,c.current_work],6,'title');add([c.name,c.full_name],4,'name')});
    return Array.from(terms.values());
  }
  function correctionFor(query,vocabulary){
    var original=normalize(query),tokens=tokenize(query);if(!original||!tokens.length)return null;var changed=false,confidences=[];
    var corrected=tokens.map(function(token){
      var exact=(vocabulary||[]).find(function(item){return item.term===token||item.term.indexOf(token)===0});if(exact)return token;var best=null;
      (vocabulary||[]).forEach(function(item){
        if(item.term.indexOf(' ')>-1||Math.abs(item.term.length-token.length)>2)return;var max=item.term.length<=4?1:2,distance=boundedDistance(token,item.term,max);if(distance>max)return;
        var similarity=1-distance/Math.max(token.length,item.term.length),minimum=Math.max(token.length,item.term.length)<=5?.76:.78;if(similarity<minimum)return;
        var value=similarity+(Math.min(50,item.weight)/1000);if(!best||value>best.value)best={item:item,value:value,similarity:similarity};
      });
      if(!best)return token;changed=true;confidences.push(best.similarity);return best.item.term;
    });
    if(!changed)return null;var confidence=confidences.reduce(function(sum,value){return sum+value},0)/confidences.length;if(confidence<.78)return null;
    return {query:corrected.join(' '),display:corrected.map(function(token){var item=(vocabulary||[]).find(function(entry){return entry.term===token});return item?item.display:displayValue(token)}).join(' '),confidence:confidence};
  }
  function scoreConsultant(consultant,query,correctionUsed){
    var normalizedQuery=normalize(query),queryTokens=tokenize(query),fields=consultantFields(consultant);if(!normalizedQuery||!queryTokens.length)return null;
    var tokenMatches=queryTokens.map(function(queryToken){
      var best={value:0,mode:'none',weight:0,field:''};
      fields.forEach(function(field){field.values.forEach(function(value){value.split(' ').forEach(function(candidateToken){var match=tokenSimilarity(queryToken,candidateToken),weighted=match.value*field.weight;if(weighted>best.value*best.weight)best={value:match.value,mode:match.mode,weight:field.weight,field:field.name}})})});return best;
    });
    if(tokenMatches.filter(function(match,index){return match.value>=(queryTokens[index].length<=2?.86:.72)}).length!==queryTokens.length)return null;
    var phraseBonus=0,phraseField='';
    fields.forEach(function(field){field.values.forEach(function(value){if(value===normalizedQuery&&field.weight*8>phraseBonus){phraseBonus=field.weight*8;phraseField=field.name}else if((' '+value+' ').indexOf(' '+normalizedQuery+' ')>-1&&field.weight*4>phraseBonus){phraseBonus=field.weight*4;phraseField=field.name}})});
    var averageSimilarity=tokenMatches.reduce(function(sum,match){return sum+match.value},0)/tokenMatches.length,averageWeight=tokenMatches.reduce(function(sum,match){return sum+match.weight},0)/tokenMatches.length;
    var confidence=Math.min(1,averageSimilarity*.65+(averageWeight/12)*.2+(phraseBonus?.15:0)),minimum=queryTokens.length>1?.69:(queryTokens[0].length<=2?.88:.68);if(confidence<minimum||(correctionUsed&&averageWeight<6))return null;
    var modes=tokenMatches.map(function(match){return match.mode}),tier=(correctionUsed||modes.some(function(mode){return mode==='fuzzy'||mode==='similar'}))?'fuzzy':((phraseBonus||modes.every(function(mode){return mode==='exact'}))?'exact':'strong');
    var score=phraseBonus+tokenMatches.reduce(function(sum,match){return sum+match.value*match.weight*10},0)+confidence*30;if(phraseField==='name')score+=35;if(consultant.is_featured)score+=4;score+=Math.min(5,Number(consultant.rating||0));
    return {consultant:consultant,score:score,confidence:confidence,tier:tier,matchedFields:Array.from(new Set(tokenMatches.map(function(match){return match.field}))).filter(Boolean)};
  }
  function categoryForQuery(query,vocabulary){
    var q=normalize(query),tokens=tokenize(query),best=null;
    (vocabulary||[]).filter(function(item){return item.kind==='category'}).forEach(function(item){
      var candidateTokens=item.term.split(' '),scores=tokens.map(function(token){return candidateTokens.reduce(function(max,candidate){return Math.max(max,tokenSimilarity(token,candidate).value)},0)});if(!scores.length||scores.some(function(score){return score<.78}))return;
      var score=scores.reduce(function(sum,value){return sum+value},0)/scores.length+Math.min(.08,item.weight/1000)+(item.term===q?.2:0);if(!best||score>best.score)best={name:item.display,term:item.term,score:score};
    });
    if(!best||best.score<.84)return null;
    if(tokens.length===1){
      var closestCategoryToken=best.term.split(' ').sort(function(a,b){return tokenSimilarity(tokens[0],b).value-tokenSimilarity(tokens[0],a).value})[0];
      best.name=displayValue(closestCategoryToken||tokens[0]);
    }
    return best;
  }
  function categoryMatches(consultant,categories){categories=(categories||[]).map(normalize).filter(Boolean);if(!categories.length)return true;var text=normalize(flatValues([consultant.category,consultant.categories,consultant.consultation_category,consultant.consultation_categories,consultant.primary_category,consultant.specialty,consultant.role]).join(' '));return categories.some(function(category){return (' '+text+' ').indexOf(' '+category+' ')>-1||text.indexOf(category)>-1})}
  function search(rows,query,options){
    options=options||{};rows=Array.isArray(rows)?rows:[];var vocabulary=options.vocabulary||buildVocabulary(rows),correction=correctionFor(query,vocabulary),effectiveQuery=correction?correction.query:query,categories=options.categories||(options.category?[options.category]:[]);
    var results=rows.filter(function(c){return categoryMatches(c,categories)}).map(function(c){return scoreConsultant(c,effectiveQuery,!!correction)}).filter(Boolean),tierOrder={exact:3,strong:2,fuzzy:1};
    results.sort(function(a,b){return (tierOrder[b.tier]-tierOrder[a.tier])||(b.score-a.score)||(b.confidence-a.confidence)||(Number(b.consultant.rating||0)-Number(a.consultant.rating||0))});
    var seen={};results=results.filter(function(result){var c=result.consultant,key=String(c.id||c.dbId||c.profile_id||c.name||'');if(!key||seen[key])return false;seen[key]=1;return true});if(options.limit)results=results.slice(0,options.limit);
    return {query:String(query||''),effectiveQuery:effectiveQuery,correction:correction,category:categoryForQuery(effectiveQuery,vocabulary),results:results};
  }
  function normalizeConsultant(row){var merged=row||{};try{if(typeof window.guidcyNormalizeConsultant==='function')merged=window.guidcyNormalizeConsultant(merged)}catch(_){}if(!merged.avatar_url)merged.avatar_url=merged.profile_image_url||merged.photo_url||merged.image_url||'';return merged}
  function approved(row){if(!row||row.is_active===false||row.approval_status==='rejected'||row.is_approved===false)return false;return row.is_approved===true||row.approval_status==='approved'||(row.is_approved==null&&row.approval_status==null)}
  function abortError(){var error=new Error('Search request cancelled');error.name='AbortError';return error}
  async function directCandidates(signal){
    var client=null;try{client=window.guidcyGetSupabaseClient&&window.guidcyGetSupabaseClient()}catch(_){}if(!client||!client.from)return [];
    var query=client.from('consultants').select('*').limit(FETCH_LIMIT);if(query&&typeof query.abortSignal==='function'&&signal)query=query.abortSignal(signal);var response=await query;
    if(signal&&signal.aborted)throw abortError();if(response&&response.error)throw response.error;var rows=(response&&response.data||[]).filter(approved);
    var profileIds=Array.from(new Set(rows.map(function(row){return row.profile_id||row.user_id||row.auth_user_id}).filter(Boolean).map(String)));
    if(profileIds.length){try{
      var profileQuery=client.from('profiles').select('*').in('id',profileIds).limit(FETCH_LIMIT);if(profileQuery&&typeof profileQuery.abortSignal==='function'&&signal)profileQuery=profileQuery.abortSignal(signal);var profileResponse=await profileQuery;
      if(signal&&signal.aborted)throw abortError();if(!profileResponse.error){var profiles=new Map((profileResponse.data||[]).map(function(profile){return [String(profile.id),profile]}));rows=rows.map(function(row){var profile=profiles.get(String(row.profile_id||row.user_id||row.auth_user_id||''))||{};return Object.assign({},profile,row,{name:row.name||row.full_name||profile.full_name||profile.name,full_name:row.full_name||row.name||profile.full_name||profile.name,avatar_url:row.avatar_url||row.profile_image_url||profile.avatar_url||profile.profile_image_url||profile.photo_url||'',title:row.title||profile.title||profile.designation||profile.current_work,headline:row.headline||profile.headline,profile_keywords:row.profile_keywords||profile.profile_keywords||profile.keywords})})}
    }catch(error){if(error&&error.name==='AbortError')throw error}}
    return rows.map(normalizeConsultant);
  }
  async function loadCandidates(options){
    options=options||{};var signal=options.signal;if(state.rows&&Date.now()-state.loadedAt<CACHE_MS)return state.rows;var rows=[];
    try{rows=await directCandidates(signal)}catch(error){if((signal&&signal.aborted)||(error&&error.name==='AbortError'))throw abortError();console.warn('Guidcy shared search direct query failed; using the existing consultant source.',error)}
    if(!rows.length&&priorFetch){if(signal&&signal.aborted)throw abortError();rows=await priorFetch({maxPrice:99999,search:''});if(signal&&signal.aborted)throw abortError();rows=(rows||[]).filter(approved).map(normalizeConsultant)}
    state.rows=rows||[];state.loadedAt=Date.now();state.vocabulary=buildVocabulary(state.rows);return state.rows;
  }
  function setRows(rows){if(!Array.isArray(rows)||!rows.length)return;state.rows=rows.map(normalizeConsultant);state.loadedAt=Date.now();state.vocabulary=buildVocabulary(state.rows)}
  function avatarHtml(consultant){
    try{if(typeof window.guidcySuggestAvatar==='function')return window.guidcySuggestAvatar(consultant)}catch(_){}
    var name=consultant.name||consultant.full_name||'Consultant',initials=consultant.initials||consultant.avatar_initials||name.split(/\s+/).map(function(word){return word[0]||''}).join('').slice(0,2).toUpperCase()||'GC',url=consultant.avatar_url||consultant.profile_image_url||consultant.photo_url||consultant.image_url||'';
    return '<div class="search-suggest-avatar" style="background:'+escapeHtml(consultant.bg||consultant.avatar_bg||'#EBF4FF')+';color:'+escapeHtml(consultant.color||consultant.avatar_color||'#1E72BE')+'">'+escapeHtml(initials)+(url?'<img src="'+escapeHtml(url)+'" alt="" loading="lazy" decoding="async" onerror="this.remove()">':'')+'</div>';
  }
  function encoded(value){return escapeHtml(encodeURIComponent(String(value==null?'':value)))}
  function resultRow(result,query){var c=result.consultant,id=c.id||c.dbId||c.profile_id||'',role=c.title||c.headline||c.role||c.specialty||c.category||'Consultant',category=c.category||c.specialty||'',detail=[role,category&&normalize(category)!==normalize(role)?category:''].filter(Boolean).join(' · ');return '<div class="search-suggest-item" role="option" data-guidcy-shared-action="consultant" data-guidcy-id="'+encoded(id)+'" data-guidcy-query="'+encoded(query)+'">'+avatarHtml(c)+'<div style="min-width:0;flex:1"><div class="search-suggest-name">'+escapeHtml(c.name||c.full_name||'Consultant')+'</div><div class="search-suggest-role">'+escapeHtml(detail)+'</div></div><div class="guidcy-search-type">'+escapeHtml(result.tier==='fuzzy'?'Closest match':'Expert')+'</div></div>'}
  function renderPayload(surface,payload,query){
    var box=document.getElementById(surface==='hero'?'hero-search-suggestions':'browse-search-suggestions');if(!box)return;var rows=[];
    if(payload.correction)rows.push('<div class="search-suggest-item guidcy-did-you-mean" role="option" data-guidcy-shared-action="correct" data-guidcy-query="'+encoded(payload.correction.query)+'"><div class="search-suggest-avatar guidcy-search-correction">↪</div><div style="min-width:0;flex:1"><div class="search-suggest-name">Did you mean <strong>'+escapeHtml(payload.correction.display)+'</strong>?</div><div class="search-suggest-role">Use the closest spelling from expert profiles and categories.</div></div></div>');
    if(payload.category)rows.push('<div class="search-suggest-item" role="option" data-guidcy-shared-action="category" data-guidcy-category="'+encoded(payload.category.name)+'" data-guidcy-query="'+encoded(query)+'"><div class="search-suggest-avatar guidcy-search-category">⌕</div><div style="min-width:0;flex:1"><div class="search-suggest-name">Browse '+escapeHtml(payload.category.name)+'</div><div class="search-suggest-role">View relevant experts in this category.</div></div><div class="guidcy-search-type">Category</div></div>');
    payload.results.slice(0,SUGGESTION_LIMIT).forEach(function(result){rows.push(resultRow(result,query))});
    if(payload.results.length)rows.push('<div class="search-suggest-item guidcy-search-all" role="option" data-guidcy-shared-action="browse" data-guidcy-query="'+encoded(query)+'"><div class="search-suggest-avatar guidcy-search-view-all">→</div><div style="min-width:0;flex:1"><div class="search-suggest-name">See all matching experts</div><div class="search-suggest-role">Keep this search on Find Expert.</div></div></div>');
    else if(!payload.category)rows.push('<div class="search-suggest-item guidcy-search-empty" aria-disabled="true"><div class="search-suggest-avatar">?</div><div><div class="search-suggest-name">No confident expert match</div><div class="search-suggest-role">Try a name, category, skill, title, or another profile keyword.</div></div></div>');
    box.innerHTML=rows.join('');box.classList.add('on');
  }
  function surfaceInput(surface){return document.getElementById(surface==='hero'?'srch':'browse-search')||document.getElementById('browse-srch')}
  function selectedCategories(surface){if(surface==='hero'){var category=document.getElementById('cat-select');return category&&category.value?[category.value]:[]}return Array.from(document.querySelectorAll('#page-browse .filter-section input[type="checkbox"]:checked')).filter(function(input){var title=input.closest('.filter-section');return title&&/categor/i.test(title.textContent||'')}).map(function(input){return input.value}).filter(Boolean)}
  async function executeSurface(surface){
    var input=surfaceInput(surface),box=document.getElementById(surface==='hero'?'hero-search-suggestions':'browse-search-suggestions');if(!input||!box)return;var query=String(input.value||'').trim(),categories=selectedCategories(surface);if(!query&&!categories.length){box.classList.remove('on');box.innerHTML='';return}
    var tracker=surfaceState[surface],sequence=++tracker.sequence;if(tracker.controller)tracker.controller.abort();tracker.controller=new AbortController();
    try{var rows=await loadCandidates({signal:tracker.controller.signal});if(sequence!==tracker.sequence||tracker.controller.signal.aborted)return;var payload=search(rows,query||categories.join(' '),{categories:categories,limit:20,vocabulary:state.vocabulary||buildVocabulary(rows)});renderPayload(surface,payload,query||categories.join(' '))}
    catch(error){if(error&&error.name==='AbortError')return;console.warn('Guidcy search suggestions failed.',error);if(sequence===tracker.sequence){box.innerHTML='<div class="search-suggest-item guidcy-search-empty"><div class="search-suggest-avatar">!</div><div><div class="search-suggest-name">Search is temporarily unavailable</div><div class="search-suggest-role">Please try again.</div></div></div>';box.classList.add('on')}}
  }
  function scheduleSurface(surface,delay){var tracker=surfaceState[surface];clearTimeout(tracker.timer);if(tracker.controller)tracker.controller.abort();tracker.timer=setTimeout(function(){executeSurface(surface)},delay==null?160:delay)}
  function rememberQuery(query,category){try{sessionStorage.setItem('guidcy_shared_search',JSON.stringify({q:String(query||''),category:String(category||''),at:Date.now()}))}catch(_){}}
  function replaceBrowseUrl(query,category){if(!/^\/(browse|find-experts|experts|consultants)\/?$/.test(location.pathname))return;try{var params=new URLSearchParams();if(query)params.set('q',query);if(category)params.set('category',category);history.replaceState({page:'browse',q:query,category:category},'',location.pathname+(params.toString()?'?'+params.toString():''))}catch(_){}}
  function navigateBrowse(query,category){
    query=String(query||'').trim();category=String(category||'').trim();rememberQuery(query,category);window.browseFilters={categories:category?[category]:[],sessionTypes:[],languages:[],experience:[],minRating:0,minPrice:0,maxPrice:99999,search:query,sort:''};
    if(typeof window.go==='function')window.go('browse');else location.href='/browse';
    setTimeout(function(){var input=surfaceInput('browse');if(input)input.value=query;document.querySelectorAll('#page-browse .filter-section input[type="checkbox"]').forEach(function(checkbox){var section=checkbox.closest('.filter-section');if(section&&/categor/i.test(section.textContent||''))checkbox.checked=!!category&&normalize(checkbox.value)===normalize(category)});if(typeof window.guidcyToggleSearchClear==='function')window.guidcyToggleSearchClear();if(typeof window.applyFilters==='function')window.applyFilters();replaceBrowseUrl(query,category)},260);
  }
  function openConsultant(id,query){id=String(id||'');query=String(query||'').trim();rememberQuery(query,'');if(typeof window.openProfile==='function')window.openProfile(id,-1);setTimeout(function(){try{if(id&&query)history.replaceState({page:'profile',consultantId:id,q:query},'','/consultant/'+encodeURIComponent(id)+'?q='+encodeURIComponent(query))}catch(_){}},40)}
  function decodeData(value){try{return decodeURIComponent(value||'')}catch(_){return value||''}}
  function handleSuggestion(event,surface){
    var item=event.target&&event.target.closest&&event.target.closest('[data-guidcy-shared-action]');if(!item)return;event.preventDefault();var action=item.getAttribute('data-guidcy-shared-action'),query=decodeData(item.getAttribute('data-guidcy-query')),input=surfaceInput(surface);
    if(action==='correct'){if(input)input.value=query;if(surface==='browse'){if(window.browseFilters)window.browseFilters.search=query;clearTimeout(browseGridTimer);browseGridTimer=setTimeout(function(){if(typeof window.applyFilters==='function')window.applyFilters();replaceBrowseUrl(query,selectedCategories('browse')[0]||'')},180)}scheduleSurface(surface,0);return}
    var box=document.getElementById(surface==='hero'?'hero-search-suggestions':'browse-search-suggestions');if(box)box.classList.remove('on');if(action==='consultant'){openConsultant(decodeData(item.getAttribute('data-guidcy-id')),query);return}if(action==='category'){navigateBrowse(query,decodeData(item.getAttribute('data-guidcy-category')));return}if(action==='browse')navigateBrowse(query,selectedCategories(surface)[0]||'');
  }
  function hydrateBrowseFromUrl(){
    if(!/^\/(browse|find-experts|experts|consultants)\/?$/.test(location.pathname))return;
    var params=new URLSearchParams(location.search),input=surfaceInput('browse'),query=params.get('q')||params.get('search')||'',category=params.get('category')||'';
    if(!query&&!category){
      query=String(input&&input.value||(window.browseFilters&&window.browseFilters.search)||'').trim();
      try{var remembered=JSON.parse(sessionStorage.getItem('guidcy_shared_search')||'null');if(!query&&remembered&&Date.now()-Number(remembered.at||0)<30*60*1000){query=String(remembered.q||'');category=String(remembered.category||'')}}catch(_){}
    }
    if(!query&&!category)return;
    rememberQuery(query,category);if(input&&!input.value)input.value=query;window.browseFilters=Object.assign({},window.browseFilters||{},{categories:category?[category]:[],search:query});document.querySelectorAll('#page-browse .filter-section input[type="checkbox"]').forEach(function(checkbox){var section=checkbox.closest('.filter-section');if(section&&/categor/i.test(section.textContent||''))checkbox.checked=!!category&&normalize(checkbox.value)===normalize(category)});if(typeof window.guidcyToggleSearchClear==='function')window.guidcyToggleSearchClear();if(typeof window.applyFilters==='function')window.applyFilters();setTimeout(function(){replaceBrowseUrl(query,category)},80);
  }
  function clearBrowseSearch(){
    var input=surfaceInput('browse'),clear=document.getElementById('browse-search-clear'),box=document.getElementById('browse-search-suggestions'),tracker=surfaceState.browse;
    clearTimeout(browseGridTimer);clearTimeout(tracker.timer);if(tracker.controller)tracker.controller.abort();
    if(input){input.value='';input.focus()}if(clear)clear.hidden=true;if(box){box.classList.remove('on');box.innerHTML=''}
    var category=selectedCategories('browse')[0]||'';rememberQuery('',category);if(window.browseFilters)window.browseFilters.search='';if(typeof window.applyFilters==='function')window.applyFilters();replaceBrowseUrl('',category);
  }
  function installBindings(){
    var hero=surfaceInput('hero'),browse=surfaceInput('browse');
    if(hero){hero.placeholder='Search consultants, categories, skills, or expertise...';hero.setAttribute('autocomplete','off');hero.setAttribute('spellcheck','false');hero.oninput=function(){scheduleSurface('hero',170)};hero.onfocus=function(){scheduleSurface('hero',40)};hero.onkeydown=function(event){if(event.key==='Enter'){event.preventDefault();navigateBrowse(hero.value,(document.getElementById('cat-select')||{}).value||'')}else if(event.key==='Escape'){var box=document.getElementById('hero-search-suggestions');if(box)box.classList.remove('on')}}}
    if(browse){browse.setAttribute('autocomplete','off');browse.setAttribute('spellcheck','false');browse.oninput=function(){window.browseSearch()};browse.onfocus=function(){scheduleSurface('browse',40)};browse.onkeydown=function(event){if(event.key==='Enter'){event.preventDefault();var box=document.getElementById('browse-search-suggestions');if(box)box.classList.remove('on');if(typeof window.applyFilters==='function')window.applyFilters();replaceBrowseUrl(browse.value,selectedCategories('browse')[0]||'')}else if(event.key==='Escape'){var box=document.getElementById('browse-search-suggestions');if(box)box.classList.remove('on')}}}
    var heroBox=document.getElementById('hero-search-suggestions');if(heroBox&&!heroBox.dataset.guidcySharedBound){heroBox.dataset.guidcySharedBound='1';heroBox.addEventListener('click',function(event){handleSuggestion(event,'hero')})}
    var browseBox=document.getElementById('browse-search-suggestions');if(browseBox&&!browseBox.dataset.guidcySharedBound){browseBox.dataset.guidcySharedBound='1';browseBox.addEventListener('click',function(event){handleSuggestion(event,'browse')})}
    if(!window.__guidcySharedClearCaptureBound){window.__guidcySharedClearCaptureBound=true;document.addEventListener('click',function(event){var clear=event.target&&event.target.closest&&event.target.closest('#browse-search-clear');if(!clear)return;event.preventDefault();event.stopImmediatePropagation();clearBrowseSearch()},true)}
    var category=document.getElementById('cat-select');if(category)category.onchange=function(){scheduleSurface('hero',40)};
  }

  var engine={normalize:normalize,tokenize:tokenize,distance:boundedDistance,tokenSimilarity:tokenSimilarity,buildVocabulary:buildVocabulary,correctionFor:correctionFor,scoreConsultant:scoreConsultant,search:search,loadCandidates:loadCandidates,invalidate:function(){state={rows:null,loadedAt:0,vocabulary:null}}};
  window.GuidcyConsultantSearch=engine;
  window.guidcyConsultantSearchText=function(c){return consultantFields(c).reduce(function(out,field){return out.concat(field.values)},[]).join(' ')};
  window.guidcyConsultantScore=function(c,q){var result=scoreConsultant(c,q,false);return result?result.score:0};
  window.guidcyRankConsultants=function(rows,q){return search(rows,q,{limit:(rows||[]).length}).results.map(function(result){result.consultant._guidcy_score=result.score;return result.consultant})};

  if(priorFetch&&!priorFetch.__guidcySharedSearch){
    var sharedFetch=async function(filters){filters=filters||{};var query=String(filters.search||'').trim(),baseFilters=Object.assign({},filters,{search:''}),rows=await priorFetch.call(this,baseFilters);rows=Array.isArray(rows)?rows:[];setRows(rows);if(!query)return rows;return search(rows,query,{limit:rows.length,vocabulary:state.vocabulary}).results.map(function(result){return result.consultant})};
    sharedFetch.__guidcySharedSearch=true;window.fetchConsultants=sharedFetch;try{fetchConsultants=sharedFetch}catch(_){}
  }
  function installGlobals(){
    window.renderHeroSuggestions=function(){scheduleSurface('hero',80)};
    window.heroSearchInput=function(){scheduleSurface('hero',170)};
    window.renderBrowseSuggestions=function(){scheduleSurface('browse',100)};
    window.browseSearch=function(){var input=surfaceInput('browse'),clear=document.getElementById('browse-search-clear');if(clear)clear.hidden=!(input&&input.value.trim());scheduleSurface('browse',170);clearTimeout(browseGridTimer);browseGridTimer=setTimeout(function(){var query=input?input.value.trim():'',category=selectedCategories('browse')[0]||'';rememberQuery(query,category);if(window.browseFilters)window.browseFilters.search=query;if(typeof window.applyFilters==='function')window.applyFilters();replaceBrowseUrl(query,category)},280)};
  window.guidcyClearSearch=clearBrowseSearch;
    window.doHeroSearch=function(){var hero=surfaceInput('hero');navigateBrowse(hero?hero.value:'',(document.getElementById('cat-select')||{}).value||'')};
    window.selectHeroSuggestion=function(id,localId,name){openConsultant(id,(surfaceInput('hero')||{}).value||name||'')};
    window.selectBrowseSuggestion=function(id,localId,name){openConsultant(id,(surfaceInput('browse')||{}).value||name||'')};
    try{heroSearchInput=window.heroSearchInput;renderHeroSuggestions=window.renderHeroSuggestions;renderBrowseSuggestions=window.renderBrowseSuggestions;browseSearch=window.browseSearch;guidcyClearSearch=window.guidcyClearSearch;doHeroSearch=window.doHeroSearch}catch(_){}
  }
  installGlobals();

  function boot(){installGlobals();installBindings();hydrateBrowseFromUrl()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){[80,700,2400,5200].forEach(function(delay){setTimeout(boot,delay)})});else{[20,700,2400,5200].forEach(function(delay){setTimeout(boot,delay)})}
  window.addEventListener('load',function(){setTimeout(boot,300);setTimeout(boot,2600)});window.addEventListener('popstate',function(){setTimeout(boot,120)});
})();
