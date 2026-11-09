-- Website publication is opt-in; stored links remain private until explicitly enabled.
alter table public.profiles add column website_public boolean not null default false;

create or replace function public.community_people(p_ids uuid[] default null)
returns table(id uuid,name text,avatar_url text,headline text,company text,college text,experience text,expertise text[],certifications text[],consultant_id uuid,followers bigint,following bigint,is_following boolean)
language sql stable security definer set search_path='' as $$
 select p.id,coalesce(nullif(c.name,''),p.full_name,'Guidcy member'),coalesce(nullif(c.avatar_url,''),p.avatar_url),
 coalesce(nullif(c.current_position,''),nullif(p.current_position,''),nullif(c.specialty,''),p.current_work,''),
 coalesce(c.current_company,p.current_company,p.current_company_college,''),
 coalesce((select e.organization from public.profile_entries e where e.profile_id=p.id and e.kind='education' order by e.start_date desc nulls last,e.created_at desc,e.id desc limit 1),''),coalesce(c.experience,''),coalesce(c.tags,'{}'),coalesce(c.certs,'{}'),c.id,
 (select count(*) from public.community_follows f where f.following_id=p.id),
 (select count(*) from public.community_follows f where f.follower_id=p.id),
 exists(select 1 from public.community_follows f where f.follower_id=auth.uid() and f.following_id=p.id)
 from public.profiles p left join lateral (
   select c.* from public.consultants c where c.profile_id=p.id and c.is_active and c.is_approved and c.approval_status='approved' and not coalesce(c.profile_update_required,false)
   order by c.created_at,c.id limit 1
 ) c on true
 where (p_ids is not null and p.id=any(p_ids[1:50])) or
 (p_ids is null and c.id is not null and p.id is distinct from auth.uid() and not exists(select 1 from public.community_follows f where f.follower_id=auth.uid() and f.following_id=p.id))
 order by (c.id is not null) desc,p.created_at desc,p.id limit case when p_ids is null then 5 else 50 end
$$;
revoke all on function public.community_people(uuid[]) from public;
grant execute on function public.community_people(uuid[]) to anon,authenticated;

create or replace function public.community_update_identity(p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid profile data' using errcode='22023';end if;
 perform public.community_update_professional('intro',p_data);
 update public.profiles set website_url=case when p_data ? 'website_url' then btrim(coalesce(p_data->>'website_url','')) else website_url end,
  website_public=case when p_data ? 'website_public' then coalesce((p_data->>'website_public')::boolean,false) else website_public end,pronouns=btrim(coalesce(p_data->>'pronouns','')),
  show_location=coalesce((p_data->>'show_location')::boolean,show_location) where id=auth.uid();
end $$;
revoke all on function public.community_update_identity(jsonb) from public;
grant execute on function public.community_update_identity(jsonb) to authenticated;

create or replace function public.community_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object('cover_path',p.cover_path,'bio',coalesce(c.bio,p.bio,''),'city',case when p.show_location or p.id=auth.uid() then coalesce(p.city,'') else '' end,'show_location',p.show_location,
 'pronouns',p.pronouns,'website_url',case when p.website_public or p.id=auth.uid() then p.website_url else '' end,'website_public',p.website_public,
 'connections',(select count(*) from public.community_connections e where p.id in(e.member_a,e.member_b) and e.status='accepted'),
 'connection_status',coalesce((select case when e.status='accepted' then 'connected' when e.requested_by=auth.uid() then 'outgoing' else 'incoming' end from public.community_connections e where e.member_a=least(p.id,auth.uid()) and e.member_b=greatest(p.id,auth.uid()) and auth.uid() is not null),'none'),
 'connection_requests',case when p.id=auth.uid() then (select count(*) from public.community_connections e where p.id in(e.member_a,e.member_b) and e.requested_by<>p.id and e.status='pending') else null end,
 'education',coalesce((select e.title from public.profile_entries e where e.profile_id=p.id and e.kind='education' order by e.start_date desc nulls last,e.created_at desc,e.id desc limit 1),''),
 'company_experience',coalesce(c.company_experience,p.company_experience,'[]'),
 'skills',case when c.id is not null then coalesce(c.tags,'{}'::text[]) else p.skills end,
 'review_count',(select count(*) from public.reviews r where r.consultant_id=c.id and r.is_published),
 'rating',(select round(avg(r.rating),1) from public.reviews r where r.consultant_id=c.id and r.is_published))
 from public.community_people(array[p_id]) person join public.profiles p on p.id=person.id
 left join public.consultants c on c.id=person.consultant_id
$$;


-- Education entries are authoritative on professional profiles. Keep legacy editors working.
create function public.community_sync_education_entry() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid; chosen public.profile_entries;
begin
 if pg_trigger_depth()>1 or coalesce(new.kind,old.kind)<>'education' then return null;end if;
 owner:=coalesce(new.profile_id,old.profile_id);
 perform 1 from public.profiles where id=owner for update;
 select * into chosen from public.profile_entries where profile_id=owner and kind='education' order by start_date desc nulls last,created_at desc,id desc limit 1;
 update public.profiles set college=coalesce(chosen.organization,''),highest_education=coalesce(chosen.title,''),education=coalesce(chosen.title,'') where id=owner;
 update public.consultants set college=coalesce(chosen.organization,''),highest_education=coalesce(chosen.title,''),education=coalesce(chosen.title,'') where profile_id=owner;
 return null;
end $$;
revoke all on function public.community_sync_education_entry() from public,anon,authenticated;
create trigger education_summary_sync after insert or update or delete on public.profile_entries for each row execute function public.community_sync_education_entry();

create function public.community_sync_legacy_education() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid; entry_id uuid; institution text; degree text;
begin
 if pg_trigger_depth()>1 then return null;end if;
 if tg_op='UPDATE' and (new.college,new.highest_education,new.education) is not distinct from (old.college,old.highest_education,old.education) then return null;end if;
 if tg_table_name='profiles' then owner:=new.id;else owner:=new.profile_id;end if;
 if owner is null then return null;end if;
 institution:=coalesce(new.college,'');degree:=coalesce(new.highest_education,new.education,'');
 perform 1 from public.profiles where id=owner for update;
 select id into entry_id from public.profile_entries where profile_id=owner and kind='education' order by start_date desc nulls last,created_at desc,id desc limit 1;
 if institution='' and degree='' then
  delete from public.profile_entries where id=entry_id;
 elsif entry_id is not null then
  update public.profile_entries set organization=left(institution,160),title=left(coalesce(nullif(degree,''),'Education'),160) where id=entry_id;
 else
  insert into public.profile_entries(profile_id,kind,organization,title) values(owner,'education',left(institution,160),left(coalesce(nullif(degree,''),'Education'),160));
 end if;
 return null;
end $$;
revoke all on function public.community_sync_legacy_education() from public,anon,authenticated;
create trigger profile_education_sync after insert or update of college,highest_education,education on public.profiles for each row execute function public.community_sync_legacy_education();
create trigger consultant_education_sync after insert or update of college,highest_education,education on public.consultants for each row execute function public.community_sync_legacy_education();

-- Ending/removing the displayed current role must not leave a stale company summary.
create function public.community_sync_current_company() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_name text; old_name text;
begin
 if new.company_experience is not distinct from old.company_experience then return new;end if;
 old_name:=coalesce(old.current_company,old.current_company_college,'');
 select btrim(e->>'company_name') into current_name from jsonb_array_elements(coalesce(new.company_experience,'[]')) e where e->>'currently_working'='true' order by e->>'start_date' desc nulls last limit 1;
 if current_name is not null then new.current_company:=current_name;new.current_company_college:=current_name;
 elsif exists(select 1 from jsonb_array_elements(coalesce(old.company_experience,'[]')) e where lower(btrim(e->>'company_name'))=lower(btrim(old_name))) then new.current_company:='';new.current_company_college:='';end if;
 return new;
end $$;
revoke all on function public.community_sync_current_company() from public,anon,authenticated;
create trigger profile_current_company_sync before update of company_experience on public.profiles for each row execute function public.community_sync_current_company();
create trigger consultant_current_company_sync before update of company_experience on public.consultants for each row execute function public.community_sync_current_company();
