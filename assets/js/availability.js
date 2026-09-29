/* One availability resolver for the editor and existing booking slot lists. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuidcyAvailability=factory();})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function today(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
  function date(key){const d=new Date(key+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(key)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===key?d:null}
  function minutes(value){
    const s=String(value||'').trim();let m=s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if(m&&+m[1]>=1&&+m[1]<=12&&+m[2]<60)return (+m[1]%12+(/PM/i.test(m[3])?12:0))*60 + +m[2];
    m=s.match(/^(\d{2}):(\d{2})$/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:null;
  }
  function label(n){return (Math.floor(n/60)%12||12)+':'+String(n%60).padStart(2,'0')+(n<720?' AM':' PM')}
  function validateHours(hours){
    const start=minutes(hours?.start),end=minutes(hours?.end);
    if(!/^\d{2}:\d{2}$/.test(hours?.start)||!/^\d{2}:\d{2}$/.test(hours?.end)||start===null||end===null||end<=start)throw new Error('Choose an end time after the start time.');
    if(end-start<30)throw new Error('Working hours must span at least 30 minutes.');
    return hours;
  }
  function validate(rule){
    if(!rule||typeof rule.enabled!=='boolean'||![30,60].includes(rule.interval))throw new Error('Choose a valid schedule and a 30 or 60 minute slot interval.');
    if(Object.hasOwn(rule,'weekly')){
      if(!Array.isArray(rule.weekly)||rule.weekly.length!==7)throw new Error('Provide a schedule for each day of the week.');
      rule.weekly.forEach((hours,i)=>{if(hours!==null)try{validateHours(hours)}catch(error){throw new Error(days[i]+': '+error.message)}});
      return rule;
    }
    if(!Array.isArray(rule.days)||rule.days.length>7||new Set(rule.days).size!==rule.days.length||rule.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw new Error('Choose valid working days.');
    const start=minutes(rule.start),end=minutes(rule.end);
    if(!/^\d{2}:\d{2}$/.test(rule.start)||!/^\d{2}:\d{2}$/.test(rule.end)||start===null||end===null||end<=start||![30,60].includes(rule.interval))throw new Error('Choose an end time after the start time and a 30 or 60 minute slot interval.');
    if(rule.enabled&&(!rule.days.length||end-start<30))throw new Error('Choose at least one working day and a window of at least 30 minutes.');
    return rule;
  }
  function weeklyRule(rule){
    validate(rule);
    return {enabled:rule.enabled,interval:rule.interval,weekly:days.map((_,i)=>{
      const hours=rule.weekly?rule.weekly[i]:(rule.days.includes(i)?rule:null);
      return hours?{start:hours.start,end:hours.end}:null;
    })};
  }
  function slots(key,overrides={},rule=null,duration=60){
    const d=date(key);if(!d)return [];
    if(Object.hasOwn(overrides,key))return [...new Set((Array.isArray(overrides[key])?overrides[key]:[]).filter(s=>minutes(s)!==null))].sort((a,b)=>minutes(a)-minutes(b));
    if(!rule?.enabled)return [];
    try{validate(rule)}catch(_){return []}
    const hours=rule.weekly?rule.weekly[d.getUTCDay()]:(rule.days.includes(d.getUTCDay())?rule:null);
    if(!hours)return [];
    const out=[],end=minutes(hours.end);for(let n=minutes(hours.start);n+duration<=end;n+=rule.interval)out.push(label(n));return out;
  }
  function calendarDates(now=new Date(),months=[]){
    const start=today(now),end=date(start);end.setUTCFullYear(end.getUTCFullYear()+1);
    const keys=new Set();
    for(const d=date(start);d<=end;d.setUTCDate(d.getUTCDate()+1))keys.add(d.toISOString().slice(0,10));
    // Generate later months on demand, without imposing an end date on recurrence.
    for(const month of months){
      const d=date(month+'-01');if(!d)continue;
      while(d.toISOString().slice(0,7)===month){const key=d.toISOString().slice(0,10);if(key>=start)keys.add(key);d.setUTCDate(d.getUTCDate()+1);}
    }
    return [...keys].sort();
  }
  function resolve(overrides={},rule=null,now=new Date(),duration=60,months=[]){
    const start=today(now);
    const out={};
    // Dated overrides beyond the rolling year remain compatible with older profiles.
    const keys=new Set(Object.keys(overrides||{}));
    if(rule?.enabled)for(const key of calendarDates(now,months))keys.add(key);
    for(const key of [...keys].sort()){if(key<start||!date(key))continue;const list=slots(key,overrides,rule,duration);if(list.length)out[key]=list;}
    return out;
  }
  return {days,today,date,minutes,label,validateHours,validate,weeklyRule,slots,calendarDates,resolve};
});
