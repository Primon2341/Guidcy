/* Shared public metadata: used by the static build, server responses and SPA. */
(function(root, factory){
  if(typeof module === "object" && module.exports) module.exports = factory();
  else root.GuidcySEO = factory();
})(typeof window !== "undefined" ? window : globalThis, function(){
  "use strict";
  const origin = "https://www.guidcy.com";
const routes = {
  "/": {
    title: "Guidcy - Expert Guidance On Demand",
    description: "Guidcy helps people find verified experts, book consultations, discover notes, webinars, jobs, grants, and career guidance in one trusted platform.",
    h1: "Find the Right Expert. Get the Right Guidance.",
    summary: "Book expert consultations and explore trusted guidance resources across career, business, education, finance, startups and more.",
    priority: "1.0",
    changefreq: "weekly"
  },
  "/find-experts": {
    title: "Find Experts & Consultants Online - Guidcy",
    description: "Browse verified Guidcy experts and consultants for business, career, finance, startup, legal, education and professional guidance.",
    h1: "Find Experts & Consultants Online",
    summary: "Search and compare verified consultants, review their expertise, and book the right expert session on Guidcy.",
    priority: "0.95"
  },
  "/browse": {
    aliasOf: "/find-experts"
  },
  "/experts": {
    aliasOf: "/find-experts"
  },
  "/consultants": {
    aliasOf: "/browse"
  },
  "/find-jobs": {
    title: "Find Jobs, Internships & Opportunities - Guidcy",
    description: "Search jobs, internships, openings and saved opportunities on Guidcy for students, professionals and career explorers.",
    h1: "Find Jobs and Career Opportunities",
    summary: "Discover job opportunities, internships and openings that match your skills, goals and preferred career path.",
    priority: "0.9",
    changefreq: "daily"
  },
  "/jobs": {
    aliasOf: "/find-jobs"
  },
  "/careers": {
    title: "Careers at Guidcy - Join Our Team",
    description: "Explore open positions at Guidcy. Join a small, senior team building India's expert guidance marketplace across engineering, product, marketing and operations.",
    h1: "Careers at Guidcy",
    summary: "See current job openings at Guidcy and apply to help millions of learners and professionals get better guidance.",
    priority: "0.7",
    changefreq: "weekly"
  },
  "/find-work": {
    aliasOf: "/careers"
  },
  "/work": {
    aliasOf: "/careers"
  },
  "/guidcy-work": {
    aliasOf: "/careers"
  },
  "/marketplace": {
    title: "Marketplace Notes & Study Resources - Guidcy",
    description: "Buy, preview, download and sell PDF notes and study resources on the Guidcy Marketplace.",
    h1: "Guidcy Marketplace Notes",
    summary: "Browse study notes and PDF resources with previews, payments, downloads and seller tracking built into Guidcy.",
    priority: "0.9"
  },
  "/webinars": {
    title: "Webinars, Workshops & Expert Sessions - Guidcy",
    description: "Discover upcoming Guidcy webinars, workshops and expert-led online sessions for career, exams, business and professional growth.",
    h1: "Guidcy Webinars and Workshops",
    summary: "Register for live expert-led webinars and learning sessions hosted through Guidcy.",
    priority: "0.88"
  },
  "/webinar": {
    aliasOf: "/webinars"
  },
  "/funds-grants": {
    title: "Funds, Grants & Scholarships Finder - Guidcy",
    description: "Use Guidcy to discover funding opportunities, grants, scholarships and support programs for students, founders and professionals.",
    h1: "Funds, Grants and Scholarships Finder",
    summary: "Find relevant scholarships, grants, startup funds and funding programs with Guidcy.",
    priority: "0.9"
  },
  "/opportunities": {
    aliasOf: "/funds-grants"
  },
  "/career-ai-finder": {
    title: "Career & College AI Finder - Guidcy",
    description: "Explore career, college, exam and education options with Guidcy's AI-assisted career and college finder.",
    h1: "Career and College AI Finder",
    summary: "Get structured career and college suggestions, compare options and connect with guidance experts.",
    priority: "0.9"
  },
  "/career-ai": {
    aliasOf: "/career-ai-finder"
  },
  "/smart-finder": {
    aliasOf: "/career-ai-finder"
  },
  "/blog": {
    title: "Guidcy Blog - Expert Guidance Articles",
    description: "Read Guidcy articles about expert guidance, career decisions, learning, professional growth and online consultation.",
    h1: "Guidcy Blog",
    summary: "Read practical guidance articles from Guidcy about careers, learning, expert consultations and personal growth.",
    priority: "0.8"
  },
  "/categories": {
    title: "Consultation Categories - Guidcy",
    description: "Explore Guidcy consultation categories including business, career, finance, legal, education, startup, technology and wellness.",
    h1: "Guidcy Consultation Categories",
    summary: "Browse consultation categories and find the right kind of expert guidance for your goal.",
    priority: "0.75"
  },
  "/about": {
    title: "About Guidcy",
    description: "Learn about Guidcy, an expert guidance platform connecting users with verified consultants, resources, webinars and opportunities.",
    h1: "About Guidcy",
    summary: "Guidcy helps people access trustworthy expert guidance and resources from one online platform.",
    priority: "0.65"
  },
  "/contact": {
    title: "Contact Guidcy",
    description: "Contact Guidcy support and the Guidcy Hyderabad Office Near TCS Adibatla for help with bookings, webinars, marketplace notes and accounts.",
    h1: "Contact Guidcy",
    summary: "Reach Guidcy for support, questions, partnerships and account help.",
    priority: "0.65"
  },
  "/help-center": {
    title: "Guidcy Help Center",
    description: "Get help with Guidcy bookings, payments, marketplace notes, webinars, jobs, grants, accounts and consultant dashboards.",
    h1: "Guidcy Help Center",
    summary: "Find support for common Guidcy workflows including bookings, notes, webinars and payments.",
    priority: "0.65"
  },
  "/help": {
    aliasOf: "/help-center"
  },
  "/support": {
    aliasOf: "/help-center"
  },
  "/faq": {
    title: "Guidcy FAQ",
    description: "Find answers to frequently asked questions about Guidcy consultations, payments, experts, webinars and marketplace notes.",
    h1: "Guidcy FAQ",
    summary: "Answers to common questions about using Guidcy.",
    priority: "0.55"
  },
  "/dispute-resolution": {
    title: "Guidcy Dispute Resolution",
    description: "Learn how Guidcy handles disputes, support issues, booking concerns, marketplace concerns and payment-related complaints.",
    h1: "Guidcy Dispute Resolution",
    summary: "Guidcy support helps review disputes and support issues raised by users and consultants.",
    priority: "0.5"
  },
  "/dispute": {
    aliasOf: "/dispute-resolution"
  },
  "/terms": {
    title: "Guidcy Terms and Conditions",
    description: "Read the Guidcy terms and conditions for users, consultants, bookings, payments, webinars and marketplace use.",
    h1: "Guidcy Terms and Conditions",
    summary: "Terms governing use of the Guidcy platform.",
    priority: "0.35"
  },
  "/privacy": {
    title: "Guidcy Privacy Policy",
    description: "Read how Guidcy collects, uses and protects user, consultant, booking and platform data.",
    h1: "Guidcy Privacy Policy",
    summary: "Guidcy privacy information for users, consultants and visitors.",
    priority: "0.35"
  },
  "/refund": {
    title: "Guidcy Refund Policy",
    description: "Read Guidcy's refund policy for consultation bookings, payments and platform transactions.",
    h1: "Guidcy Refund Policy",
    summary: "Refund rules and timelines for Guidcy transactions.",
    priority: "0.35"
  },
  "/disclaimer": {
    title: "Guidcy Disclaimer",
    description: "Read important disclaimers about Guidcy consultations, expert guidance, outcomes and professional advice.",
    h1: "Guidcy Disclaimer",
    summary: "Important information about guidance provided through Guidcy.",
    priority: "0.35"
  }
};

  const pages = {'/':'home','/find-experts':'browse','/find-jobs':'jobs','/webinars':'webinar','/funds-grants':'opportunities','/career-ai-finder':'smart-finder','/help-center':'help','/dispute-resolution':'dispute'};
  const privatePages = {'/login':'Log in','/signup':'Sign up','/get-started':'Sign up','/profile':'Consultant profile','/consultant':'Consultants','/book':'Book a consultation','/payment':'Payment','/confirm':'Booking confirmation','/meeting':'Meeting','/review':'Review'};
  routes['/home'] = {aliasOf:'/'};
  routes['/consultants'] = {aliasOf:'/find-experts'};
  routes['/'].title = 'Guidcy | Expert Consultations, Resources & Career Guidance';
  routes['/marketplace'].title = 'Guidcy Marketplace | Notes, Guides & Study Resources';
  const text = v => String(v == null ? '' : v).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const short = v => { const s=text(v); return s.length>160?s.slice(0,157).replace(/\s+\S*$/,'')+'…':s; };
  function blogMeta(post){
    const route='/blog/'+encodeURIComponent(post.slug),url=origin+route;
    const description=post.meta_description||post.excerpt;
    const image=safeUrl(post.cover_image)||origin+'/logo.png';
    return {title:post.meta_title||post.title+' | Guidcy',description,h1:post.title,image,canonicalPath:route,page:'blog',parent:'/blog',index:true,blogPost:post,
      entity:{'@type':'Article','@id':url+'#article',headline:post.title,description:post.excerpt,url,image,
        mainEntityOfPage:{'@id':url+'#webpage'},datePublished:post.published_at,dateModified:post.updated_at,
        author:{'@type':post.author==='Guidcy'?'Organization':'Person',name:post.author},articleSection:post.category,
        publisher:{'@id':origin+'/#organization'}}};
  }
  function metaFor(raw){
    const path = new URL(raw || '/',origin).pathname.replace(/\/+$/,'') || '/';
    const meta = routes[path];
    if(meta?.aliasOf) return metaFor(meta.aliasOf);
    if(meta) return {...meta,canonicalPath:path,page:meta.page||pages[path]||path.slice(1),index:meta.index!==false};
    const privatePage = privatePages[path] || (/^\/(?:admin(?:-dash(?:board)?)?|dashboard|user-dash(?:board)?|cons-dash|consultant-dashboard)(?:\/|$)/.test(path)?'Dashboard':'');
    return {title:(privatePage || 'Page not found')+' | Guidcy',description:privatePage?'Access your Guidcy account securely.':'This Guidcy page could not be found.',h1:privatePage||'Page not found',canonicalPath:path,page:privatePage?({'/signup':'signup','/get-started':'signup','/login':'login'}[path]||''): 'not-found',index:false};
  }
  function safeUrl(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:''}catch(_){return ''}}
  function detailMeta(kind,row){
    const base={consultant:'/find-experts',marketplace:'/marketplace',webinars:'/webinars',careers:'/careers'}[kind];
    const canonicalPath='/'+kind+'/'+encodeURIComponent(row.id);
    const name=text(row.name||row.title);
    const description=short(kind==='consultant' ? `${name}${row.specialty?' — '+text(row.specialty):''}. ${row.bio||'View expertise and book a consultation on Guidcy.'}` : row.description||`${name} on Guidcy.`);
    const meta={title:`${name}${kind==='consultant'&&row.specialty?' — '+text(row.specialty):''} | Guidcy`,description,h1:name,canonicalPath,index:true,page:kind==='consultant'?'profile':'seo-detail',parent:base,kind,id:row.id};
    const url=origin+canonicalPath;
    let entity;
    if(kind==='consultant'){
      entity={'@type':'Person','@id':url+'#person',name,url,description:text(row.bio),jobTitle:text(row.specialty),knowsAbout:Array.isArray(row.tags)?row.tags:[]};
      const photo=safeUrl(row.avatar_url);if(photo)entity.image=photo;
      const linkedin=safeUrl(row.linkedin_url||row.linkedin);if(linkedin && new URL(linkedin).hostname.match(/(^|\.)linkedin\.com$/))entity.sameAs=[linkedin];
      meta.image=photo;
    } else if(kind==='marketplace'){
      entity={'@type':'Product','@id':url+'#product',name,description:text(row.description),category:text(row.category),url,offers:{'@type':'Offer',url,priceCurrency:'INR',price:row.is_free?'0':String(Number(row.price)||0),availability:'https://schema.org/InStock'}};
      const photo=safeUrl(row.thumbnail_url);if(photo)entity.image=photo;meta.image=photo;
    } else if(kind==='webinars'){
      const date=webinarDate(row);
      // A date-only value is truthful; never invent a time or a private meeting URL.
      if(date)entity={'@type':'Event','@id':url+'#event',name,description:text(row.description),url,startDate:date,eventAttendanceMode:'https://schema.org/OnlineEventAttendanceMode',eventStatus:'https://schema.org/EventScheduled',location:{'@type':'VirtualLocation',url},organizer:{'@type':row.publisher_name?'Person':'Organization',name:row.publisher_name||'Guidcy'},offers:{'@type':'Offer',url,priceCurrency:'INR',price:row.is_paid||row.price_type==='paid'?String(Number(row.price_amount)||0):'0'}};
      if(entity && row.speaker)entity.performer={'@type':'Person',name:text(row.speaker)};
    } else if(kind==='careers'){
      // The owner confirmed Guidcy's fully remote openings accept applicants worldwide.
      // Enumerate ISO countries for Google's required applicant-location field.
      const remote=String(row.work_mode).toLowerCase()==='remote';
      const location=row.job_location, country=row.applicant_country;
      const worldwide=remote&&/^Guidcy(?:\s|$)/i.test(row.company_name||'');
      if(row.created_at && row.description && row.company_name && (location||remote&&(country||worldwide))){
        entity={'@type':'JobPosting','@id':url+'#job',title:name,description:[row.description,row.responsibilities,row.required_skills,worldwide?'Fully remote. Applicants may work from anywhere in the world.':''].filter(Boolean).map(text).join('\n'),datePosted:row.created_at,hiringOrganization:{'@type':'Organization',name:row.company_name},url};
        if(remote){
          entity.jobLocationType='TELECOMMUTE';
          const countries=country?[country]:'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
          entity.applicantLocationRequirements=countries.map(name=>({'@type':'Country',name}));
        }
        const employment={'full-time':'FULL_TIME','part-time':'PART_TIME',contract:'CONTRACTOR',internship:'INTERN'}[String(row.work_type).toLowerCase()];
        if(employment)entity.employmentType=employment;
        if(location)entity.jobLocation={'@type':'Place',address:{'@type':'PostalAddress',...location}};
        if(row.application_deadline)entity.validThrough=row.application_deadline+'T23:59:59+05:30';
      }
    }
    if(entity)meta.entity=entity;
    return meta;
  }
  function webinarDate(row){
    const day=String(row.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day)))return '';
    const t=String(row.time||'').match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if(!t)return day;
    let hour=Number(t[1]);if(t[3])hour=hour%12+(/PM/i.test(t[3])?12:0);
    return hour<24&&Number(t[2])<60?`${day}T${String(hour).padStart(2,'0')}:${t[2]}:00+05:30`:day;
  }
  function graph(meta){
    const url=origin+meta.canonicalPath;
    const organization={'@type':'Organization','@id':origin+'/#organization',name:'Guidcy',url:origin+'/',logo:{'@type':'ImageObject',url:origin+'/logo.png'},description:'Guidcy connects people with expert consultants, learning resources, webinars and career guidance.'};
    const website={'@type':'WebSite','@id':origin+'/#website',name:'Guidcy',alternateName:'guidcy.com',url:origin+'/',publisher:{'@id':organization['@id']},inLanguage:'en'};
    const crumbs=[{'@type':'ListItem',position:1,name:'Guidcy',item:origin+'/'}];
    if(meta.parent)crumbs.push({'@type':'ListItem',position:2,name:metaFor(meta.parent).h1,item:origin+meta.parent});
    if(meta.canonicalPath!=='/')crumbs.push({'@type':'ListItem',position:crumbs.length+1,name:meta.h1,item:url});
    const webpage={'@type':meta.kind==='consultant'?'ProfilePage':'WebPage','@id':url+'#webpage',name:meta.title,description:meta.description,url,isPartOf:{'@id':website['@id']},breadcrumb:{'@id':url+'#breadcrumb'}};
    if(meta.entity)webpage.mainEntity={'@id':meta.entity['@id']};
    return {'@context':'https://schema.org','@graph':[organization,website,webpage,{'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:crumbs},...(meta.entity?[meta.entity]:[])]};
  }
  return {origin,routes,metaFor,detailMeta,graph,text,short,safeUrl,webinarDate,blogMeta};

});
