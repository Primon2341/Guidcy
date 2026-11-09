-- Professional details extend existing identities; booking and commerce tables are untouched.
alter table public.profiles add column skills text[] not null default '{}';
alter table public.profiles add constraint profile_skills_limit check(cardinality(skills)<=40 and char_length(array_to_string(skills,','))<=2400);

create table public.profile_entries (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('education','certification','award','publication','project','patent','achievement')),
 title text not null check(char_length(btrim(title)) between 1 and 160),
 organization text not null default '' check(char_length(organization)<=160),
 field text not null default '' check(char_length(field)<=160),
 start_date date check(start_date between '1900-01-01' and '2100-12-31'),
 end_date date check(end_date between '1900-01-01' and '2100-12-31'),
 description text not null default '' check(char_length(description)<=3000),
 grade text not null default '' check(char_length(grade)<=40),
 activities text not null default '' check(char_length(activities)<=1000),
 url text not null default '' check(char_length(url)<=1500 and (url='' or url ~ '^https?://[^[:space:]]+$')),
 created_at timestamptz not null default now(),
 check(end_date is null or start_date is null or end_date>=start_date)
);
create index profile_entries_owner_kind on public.profile_entries(profile_id,kind,start_date desc,id);
alter table public.profile_entries enable row level security;
create policy entries_public on public.profile_entries for select to anon,authenticated using(true);
create policy entries_owner_insert on public.profile_entries for insert to authenticated with check(profile_id=(select auth.uid()));
create policy entries_owner_update on public.profile_entries for update to authenticated using(profile_id=(select auth.uid())) with check(profile_id=(select auth.uid()));
create policy entries_owner_delete on public.profile_entries for delete to authenticated using(profile_id=(select auth.uid()));
revoke all on public.profile_entries from anon,authenticated;
grant select on public.profile_entries to anon,authenticated;
grant insert(profile_id,kind,title,organization,field,start_date,end_date,description,grade,activities,url),update(title,organization,field,start_date,end_date,description,grade,activities,url),delete on public.profile_entries to authenticated;

-- Preserve each distinct existing education record; original fields remain intact.
insert into public.profile_entries(profile_id,kind,title,organization)
select distinct id,'education',left(coalesce(nullif(degree,''),'Education'),160),left(coalesce(college,''),160) from (
 select id,coalesce(nullif(highest_education,''),education,'') degree,college from public.profiles
 union all select profile_id,coalesce(nullif(highest_education,''),education,''),college from public.consultants where profile_id is not null
) existing where coalesce(degree,'')<>'' or coalesce(college,'')<>'';
insert into public.profile_entries(profile_id,kind,title)
select distinct c.profile_id,'certification',left(btrim(cert),160) from public.consultants c cross join lateral unnest(c.certs) cert
where c.profile_id is not null and btrim(cert)<>'';

create table public.profile_featured (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.profiles(id) on delete cascade,
 post_id uuid references public.community_posts(id) on delete cascade,
 resource_id uuid references public.marketplace_notes(id) on delete cascade,
 entry_id uuid references public.profile_entries(id) on delete cascade,
 webinar_id text references public.webinars(id) on delete cascade,
 created_at timestamptz not null default now(),
 check(num_nonnulls(post_id,resource_id,entry_id,webinar_id)=1),
 unique(profile_id,post_id),unique(profile_id,resource_id),unique(profile_id,entry_id),unique(profile_id,webinar_id)
);
create index profile_featured_owner on public.profile_featured(profile_id,created_at desc,id);
create index profile_featured_post on public.profile_featured(post_id) where post_id is not null;
create index profile_featured_resource on public.profile_featured(resource_id) where resource_id is not null;
create index profile_featured_entry on public.profile_featured(entry_id) where entry_id is not null;
create index profile_featured_webinar on public.profile_featured(webinar_id) where webinar_id is not null;
alter table public.profile_featured enable row level security;
create policy featured_owner_read on public.profile_featured for select to authenticated using(profile_id=(select auth.uid()));
create policy featured_owner_insert on public.profile_featured for insert to authenticated with check(profile_id=(select auth.uid()));
create policy featured_owner_delete on public.profile_featured for delete to authenticated using(profile_id=(select auth.uid()));
revoke all on public.profile_featured from anon,authenticated;
grant select,delete on public.profile_featured to authenticated;
grant insert(profile_id,post_id,resource_id,entry_id,webinar_id) on public.profile_featured to authenticated;

create function public.community_portfolio_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Serialize owner inserts to enforce bounded profile payloads even under concurrency.
 perform 1 from public.profiles where id=new.profile_id for update;
 if tg_table_name='profile_entries' then
  if (select count(*) from public.profile_entries where profile_id=new.profile_id)>=100 then raise exception 'A profile can contain up to 100 portfolio entries';end if;
 else
  if (select count(*) from public.profile_featured where profile_id=new.profile_id)>=8 then raise exception 'Feature up to eight items';end if;
  if not (
   exists(select 1 from public.community_posts where id=new.post_id and author_id=new.profile_id) or
   exists(select 1 from public.marketplace_notes where id=new.resource_id and uploader_id=new.profile_id and status='active' and removed_at is null) or
   exists(select 1 from public.profile_entries where id=new.entry_id and profile_id=new.profile_id and kind in ('project','achievement','publication','award','patent','certification')) or
   exists(select 1 from public.webinars where id=new.webinar_id and created_by=new.profile_id)
  ) then raise exception 'Choose an item belonging to your profile' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function public.community_portfolio_guard() from public,anon,authenticated;
create trigger portfolio_entry_limit before insert on public.profile_entries for each row execute function public.community_portfolio_guard();
create trigger portfolio_feature_guard before insert on public.profile_featured for each row execute function public.community_portfolio_guard();

create function public.community_featured(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by created_at desc,id),'[]'::jsonb) from (
 select f.id,f.created_at,jsonb_build_object('id',f.id,'post_id',p.id,'resource_id',n.id,'entry_id',e.id,'webinar_id',w.id,
 'kind',case when p.id is not null then 'Post' when n.id is not null then 'Resource' when e.id is not null then initcap(e.kind) else 'Webinar' end,
 'title',coalesce(left(p.body,180),n.title,e.title,w.title),'description',coalesce(n.description,e.description,w.description,''),
 'price',n.price,'is_free',n.is_free,'image',n.thumbnail_url,'url',e.url) item
 from public.profile_featured f
 left join public.community_posts p on p.id=f.post_id and p.author_id=f.profile_id
 left join public.marketplace_notes n on n.id=f.resource_id and n.uploader_id=f.profile_id and n.status='active' and n.removed_at is null
 left join public.profile_entries e on e.id=f.entry_id and e.profile_id=f.profile_id
 left join public.webinars w on w.id=f.webinar_id and w.created_by=f.profile_id
 where f.profile_id=p_id and coalesce(p.id::text,n.id::text,e.id::text,w.id) is not null
 order by f.created_at desc,f.id limit 8
 ) visible
$$;
revoke all on function public.community_featured(uuid) from public;
grant execute on function public.community_featured(uuid) to anon,authenticated;

create or replace function public.community_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object('cover_path',p.cover_path,'bio',coalesce(nullif(p.bio,''),c.bio,''),'city',coalesce(p.city,''),
 'education',coalesce(nullif(c.highest_education,''),nullif(p.highest_education,''),p.education,''),
 'company_experience',case when jsonb_array_length(coalesce(c.company_experience,'[]'))>0 then c.company_experience else coalesce(p.company_experience,'[]') end,
 'skills',case when c.id is not null then coalesce(c.tags,'{}'::text[]) else p.skills end,
 'review_count',(select count(*) from public.reviews r where r.consultant_id=c.id and r.is_published),
 'rating',(select round(avg(r.rating),1) from public.reviews r where r.consultant_id=c.id and r.is_published))
 from public.community_people(array[p_id]) person join public.profiles p on p.id=person.id
 left join public.consultants c on c.id=person.consultant_id
$$;

-- Update only a named professional section. Existing approval, rates and availability are excluded.
create function public.community_update_professional(p_section text,p_data jsonb,p_expected jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); list jsonb; entry jsonb; tags text[]; companies text[]; s text;
begin
 if owner is null then raise insufficient_privilege;end if;
 if p_data is null or p_data='null'::jsonb then raise exception 'Profile data is required' using errcode='22023';end if;
 perform 1 from public.profiles where id=owner for update;
 if not found then raise exception 'Profile unavailable';end if;
 if p_section='experience' then
  if jsonb_typeof(p_data)<>'array' or jsonb_array_length(p_data)>40 then raise exception 'Use up to 40 experience entries' using errcode='22023';end if;
  list:=public.community_profile(owner)->'company_experience';
  if p_expected is distinct from list then raise exception 'Experience changed in another window. Reopen the editor.' using errcode='40001';end if;
  for entry in select value from jsonb_array_elements(p_data) loop
   if jsonb_typeof(entry)<>'object' or coalesce(char_length(btrim(entry->>'company_name')),0) not between 1 and 160 or coalesce(char_length(btrim(entry->>'designation')),0) not between 1 and 160 or char_length(entry::text)>7000 then raise exception 'Check the job title and company' using errcode='22023';end if;
   if char_length(coalesce(entry->>'description',''))>3000 or char_length(coalesce(entry->>'location',''))>160 or char_length(coalesce(entry->>'employment_type',''))>80 then raise exception 'Experience field too long' using errcode='22023';end if;
   if entry ? 'skills' and (jsonb_typeof(entry->'skills')<>'array' or jsonb_array_length(entry->'skills')>20 or char_length((entry->'skills')::text)>1200) then raise exception 'Use up to 20 skills per role' using errcode='22023';end if;
   if entry ? 'currently_working' and jsonb_typeof(entry->'currently_working')<>'boolean' then raise exception 'Invalid current role' using errcode='22023';end if;
   if coalesce(entry->>'start_date','') ~ '^\d{4}-\d{2}$' and coalesce(entry->>'end_date','') ~ '^\d{4}-\d{2}$' and entry->>'end_date'<entry->>'start_date' and not coalesce((entry->>'currently_working')::boolean,false) then raise exception 'End date precedes start date' using errcode='22023';end if;
   -- Legacy date strings are preserved. New editors use ISO months and check ordering.
   if char_length(coalesce(entry->>'start_date',''))>30 or char_length(coalesce(entry->>'end_date',''))>30 then raise exception 'Invalid experience date' using errcode='22023';end if;
  end loop;
  select coalesce(array_agg(distinct btrim(regexp_replace(regexp_replace(lower(replace(value->>'company_name','&',' and ')),'[^a-z0-9[:space:]]',' ','g'),'\m(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|company|co|technologies|technology|tech|india|services|solutions|systems|system|group|global)\M','','g'))),'{}') into companies from jsonb_array_elements(p_data);
  update public.profiles set company_experience=p_data,experience_companies_normalized=companies,updated_at=now() where id=owner;
  update public.consultants set company_experience=p_data,experience_companies_normalized=companies,updated_at=now() where profile_id=owner;
 elsif p_section='skills' then
  if jsonb_typeof(p_data)<>'array' or jsonb_array_length(p_data)>40 then raise exception 'Use up to 40 skills' using errcode='22023';end if;
  for entry in select value from jsonb_array_elements(p_data) loop
   if jsonb_typeof(entry)<>'string' or char_length(btrim(entry#>>'{}')) not between 1 and 60 then raise exception 'Skills must contain 1–60 characters' using errcode='22023';end if;
  end loop;
  select coalesce(array_agg(distinct btrim(value)),'{}') into tags from jsonb_array_elements_text(p_data);
  update public.profiles set skills=tags,updated_at=now() where id=owner;
  update public.consultants set tags=tags,updated_at=now() where profile_id=owner;
 elsif p_section='intro' then
  if jsonb_typeof(p_data)<>'object' or char_length(coalesce(p_data->>'company',''))>160 or char_length(coalesce(p_data->>'city',''))>160 then raise exception 'Check company and location' using errcode='22023';end if;
  perform public.community_update_profile(p_data->>'name',p_data->>'headline',p_data->>'bio',p_data->>'cover');
  update public.profiles set current_company=btrim(coalesce(p_data->>'company','')),city=btrim(coalesce(p_data->>'city','')) where id=owner;
  update public.consultants set current_company=btrim(coalesce(p_data->>'company','')) where profile_id=owner;
 else raise exception 'Unknown profile section' using errcode='22023';end if;
end $$;
revoke all on function public.community_update_professional(text,jsonb,jsonb) from public;
grant execute on function public.community_update_professional(text,jsonb,jsonb) to authenticated;

create index community_comments_author_activity on public.community_comments(author_id,created_at desc,id desc);
create index community_posts_author_kind_activity on public.community_posts(author_id,kind,created_at desc,id desc);
create function public.community_profile_activity(p_id uuid,p_kind text default null,p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,author_id uuid,body text,kind text,image_path text,image_alt text,created_at timestamptz,updated_at timestamptz,likes bigint,comments bigint,liked boolean,saved boolean)
language sql stable security invoker set search_path='' as $$
 with page as (select p.* from public.community_posts p where p.author_id=p_id and (p_kind is null or p.kind=p_kind)
 and (p_before is null or (p.created_at,p.id)<(p_before,p_before_id)) order by p.created_at desc,p.id desc limit 6)
 select p.id,p.author_id,p.body,p.kind,p.image_path,p.image_alt,p.created_at,p.updated_at,
 (select count(*) from public.community_likes l where l.post_id=p.id),
 (select count(*) from public.community_comments c where c.post_id=p.id),
 exists(select 1 from public.community_likes l where l.post_id=p.id and l.user_id=auth.uid()),
 exists(select 1 from public.community_saves s where s.post_id=p.id and s.user_id=auth.uid())
 from page p order by p.created_at desc,p.id desc
$$;
revoke all on function public.community_profile_activity(uuid,text,timestamptz,uuid) from public;
grant execute on function public.community_profile_activity(uuid,text,timestamptz,uuid) to anon,authenticated;
