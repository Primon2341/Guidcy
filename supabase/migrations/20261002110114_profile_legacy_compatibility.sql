-- Consultant dashboard bio remains authoritative; preserve blank legacy job titles.
create or replace function public.community_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object('cover_path',p.cover_path,'bio',coalesce(c.bio,p.bio,''),'city',coalesce(p.city,''),
 'linkedin_url',coalesce(nullif(c.linkedin_url,''),p.linkedin_url,''),
 'education',coalesce(nullif(c.highest_education,''),nullif(p.highest_education,''),p.education,''),
 'company_experience',case when jsonb_array_length(coalesce(c.company_experience,'[]'))>0 then c.company_experience else coalesce(p.company_experience,'[]') end,
 'skills',case when c.id is not null then coalesce(c.tags,'{}'::text[]) else p.skills end,
 'review_count',(select count(*) from public.reviews r where r.consultant_id=c.id and r.is_published),
 'rating',(select round(avg(r.rating),1) from public.reviews r where r.consultant_id=c.id and r.is_published))
 from public.community_people(array[p_id]) person join public.profiles p on p.id=person.id
 left join public.consultants c on c.id=person.consultant_id
$$;

create or replace function public.community_update_professional(p_section text,p_data jsonb,p_expected jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); list jsonb; entry jsonb; skill_tags text[]; companies text[]; s text;
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
   if jsonb_typeof(entry)<>'object' or coalesce(char_length(btrim(entry->>'company_name')),0) not between 1 and 160 or coalesce(char_length(btrim(entry->>'designation')),0) not between 0 and 160 or char_length(entry::text)>7000 then raise exception 'Check the job title and company' using errcode='22023';end if;
   if char_length(coalesce(entry->>'description',''))>3000 or char_length(coalesce(entry->>'location',''))>160 or char_length(coalesce(entry->>'employment_type',''))>80 then raise exception 'Experience field too long' using errcode='22023';end if;
   if entry ? 'skills' and (jsonb_typeof(entry->'skills')<>'array' or jsonb_array_length(entry->'skills')>20 or char_length((entry->'skills')::text)>1200) then raise exception 'Use up to 20 skills per role' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(entry->'skills','[]')) skill where jsonb_typeof(skill)<>'string' or char_length(btrim(skill#>>'{}')) not between 1 and 60) then raise exception 'Invalid experience skill' using errcode='22023';end if;
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
  select coalesce(array_agg(distinct btrim(value)),'{}') into skill_tags from jsonb_array_elements_text(p_data);
  update public.profiles set skills=skill_tags,updated_at=now() where id=owner;
  update public.consultants set tags=skill_tags,updated_at=now() where profile_id=owner;
 elsif p_section='intro' then
  if jsonb_typeof(p_data)<>'object' or char_length(coalesce(p_data->>'company',''))>160 or char_length(coalesce(p_data->>'city',''))>160 then raise exception 'Check company and location' using errcode='22023';end if;
  perform public.community_update_profile(p_data->>'name',p_data->>'headline',p_data->>'bio',p_data->>'cover');
  update public.profiles set current_company=btrim(coalesce(p_data->>'company','')),city=btrim(coalesce(p_data->>'city','')) where id=owner;
  update public.consultants set current_company=btrim(coalesce(p_data->>'company','')) where profile_id=owner;
 else raise exception 'Unknown profile section' using errcode='22023';end if;
end $$;
