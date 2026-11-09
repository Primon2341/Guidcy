-- Add optional professional identity fields to existing accounts.
alter table public.profiles
 add column pronouns text not null default '' check(char_length(pronouns)<=40),
 add column website_url text not null default '' check(char_length(website_url)<=500 and (website_url='' or website_url ~ '^https?://[^[:space:]]+$')),
 add column public_contact_email text not null default '' check(char_length(public_contact_email)<=254 and (public_contact_email='' or public_contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 add column professional_status text not null default 'none' check(professional_status in ('none','open_to_work','offering_services')),
 add column professional_status_note text not null default '' check(char_length(professional_status_note)<=160);

-- Connections require consent; following continues to use community_follows.
create table public.community_connections(
 id uuid primary key default gen_random_uuid(),
 member_a uuid not null references public.profiles(id) on delete cascade,
 member_b uuid not null references public.profiles(id) on delete cascade,
 requested_by uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 check(member_a<member_b),check(requested_by in(member_a,member_b)),unique(member_a,member_b)
);
create index community_connections_a on public.community_connections(member_a,status,id);
create index community_connections_b on public.community_connections(member_b,status,id);
alter table public.community_connections enable row level security;
create policy connections_read on public.community_connections for select to anon,authenticated using(status='accepted' or (select auth.uid()) in(member_a,member_b));
revoke all on public.community_connections from anon,authenticated;
grant select on public.community_connections to anon,authenticated;

create table public.community_skill_endorsements(
 profile_id uuid not null references public.profiles(id) on delete cascade,
 endorser_id uuid not null references public.profiles(id) on delete cascade,
 skill text not null check(char_length(btrim(skill)) between 1 and 60),
 created_at timestamptz not null default now(),
 primary key(profile_id,skill,endorser_id),check(profile_id<>endorser_id)
);
create index community_endorsements_author on public.community_skill_endorsements(endorser_id);
alter table public.community_skill_endorsements enable row level security;
create policy endorsements_read on public.community_skill_endorsements for select to anon,authenticated using(true);
revoke all on public.community_skill_endorsements from anon,authenticated;
grant select on public.community_skill_endorsements to anon,authenticated;

create function public.community_connection(p_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a uuid; b uuid;
begin
 if actor is null then raise insufficient_privilege;end if;
 if p_id is null or actor=p_id then raise exception 'Choose another member' using errcode='22023';end if;
 a:=least(actor,p_id);b:=greatest(actor,p_id);
 if p_action='request' then
  insert into public.community_connections(member_a,member_b,requested_by) values(a,b,actor) on conflict(member_a,member_b) do nothing;
 elsif p_action='accept' then
  update public.community_connections set status='accepted' where member_a=a and member_b=b and requested_by<>actor and status='pending';
  if not found then raise exception 'This invitation is no longer available' using errcode='22023';end if;
 elsif p_action='remove' then
  delete from public.community_connections where member_a=a and member_b=b;
 else raise exception 'Unknown connection action' using errcode='22023';end if;
end $$;
revoke all on function public.community_connection(uuid,text) from public;
grant execute on function public.community_connection(uuid,text) to authenticated;

create function public.community_network(p_id uuid,p_requests boolean default false,p_before uuid default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_requests and (auth.uid() is null or auth.uid()<>p_id) then raise insufficient_privilege;end if;
 return query
 with edges as(
  select e.*,case when e.member_a=p_id then e.member_b else e.member_a end person_id from public.community_connections e
  where p_id in(e.member_a,e.member_b) and e.status=case when p_requests then 'pending' else 'accepted' end
   and (p_before is null or e.id>p_before)
  order by e.id limit 21
 ), people as(select * from public.community_people(array(select person_id from edges)))
 select jsonb_build_object('id',e.id,'requested_by',e.requested_by,'status',e.status,'person',to_jsonb(p))
 from edges e join people p on p.id=e.person_id order by e.id;
end $$;
revoke all on function public.community_network(uuid,boolean,uuid) from public;
grant execute on function public.community_network(uuid,boolean,uuid) to anon,authenticated;

create function public.community_endorse_skill(p_id uuid,p_skill text,p_endorsed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); profile jsonb;
begin
 if actor is null then raise insufficient_privilege;end if;
 if p_id is null or p_id=actor or p_endorsed is null then raise exception 'You can endorse another member' using errcode='22023';end if;
 profile:=public.community_profile(p_id);
 if p_endorsed then
  if not exists(select 1 from jsonb_array_elements_text(coalesce(profile->'skills','[]')||coalesce(profile->'expertise','[]')) s where s=p_skill) then raise exception 'Choose a skill on this profile' using errcode='22023';end if;
  insert into public.community_skill_endorsements(profile_id,endorser_id,skill) values(p_id,actor,p_skill) on conflict do nothing;
 else delete from public.community_skill_endorsements where profile_id=p_id and endorser_id=actor and skill=p_skill;end if;
end $$;
revoke all on function public.community_endorse_skill(uuid,text,boolean) from public;
grant execute on function public.community_endorse_skill(uuid,text,boolean) to authenticated;

create function public.community_skill_endorsements(p_id uuid) returns table(skill text,endorsements bigint,endorsed boolean)
language sql stable security invoker set search_path='' as $$
 select e.skill,count(*),bool_or(e.endorser_id=auth.uid()) from public.community_skill_endorsements e where e.profile_id=p_id group by e.skill
$$;
revoke all on function public.community_skill_endorsements(uuid) from public;
grant execute on function public.community_skill_endorsements(uuid) to anon,authenticated;

create function public.community_update_identity(p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid profile data' using errcode='22023';end if;
 if char_length(coalesce(p_data->>'linkedin_url',''))>500 or (coalesce(p_data->>'linkedin_url','')<>'' and p_data->>'linkedin_url' !~ '^https?://[^[:space:]]+$') then raise exception 'Use an HTTPS or HTTP professional link' using errcode='22023';end if;
 perform public.community_update_professional('intro',p_data);
 update public.profiles set pronouns=btrim(coalesce(p_data->>'pronouns','')),website_url=btrim(coalesce(p_data->>'website_url','')),
  linkedin_url=btrim(coalesce(p_data->>'linkedin_url','')),public_contact_email=btrim(coalesce(p_data->>'public_contact_email','')),
  professional_status=coalesce(p_data->>'professional_status','none'),professional_status_note=btrim(coalesce(p_data->>'professional_status_note','')) where id=auth.uid();
 update public.consultants set linkedin_url=btrim(coalesce(p_data->>'linkedin_url','')) where profile_id=auth.uid();
end $$;
revoke all on function public.community_update_identity(jsonb) from public;
grant execute on function public.community_update_identity(jsonb) to authenticated;

create or replace function public.community_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object('cover_path',p.cover_path,'bio',coalesce(c.bio,p.bio,''),'city',coalesce(p.city,''),
 'pronouns',p.pronouns,'website_url',p.website_url,'public_contact_email',p.public_contact_email,'professional_status',p.professional_status,'professional_status_note',p.professional_status_note,
 'connections',(select count(*) from public.community_connections e where p.id in(e.member_a,e.member_b) and e.status='accepted'),
 'connection_status',coalesce((select case when e.status='accepted' then 'connected' when e.requested_by=auth.uid() then 'outgoing' else 'incoming' end from public.community_connections e where e.member_a=least(p.id,auth.uid()) and e.member_b=greatest(p.id,auth.uid()) and auth.uid() is not null),'none'),
 'connection_requests',case when p.id=auth.uid() then (select count(*) from public.community_connections e where p.id in(e.member_a,e.member_b) and e.requested_by<>p.id and e.status='pending') else null end,
 'linkedin_url',coalesce(nullif(c.linkedin_url,''),p.linkedin_url,''),
 'education',coalesce(nullif(c.highest_education,''),nullif(p.highest_education,''),p.education,''),
 'company_experience',case when jsonb_array_length(coalesce(c.company_experience,'[]'))>0 then c.company_experience else coalesce(p.company_experience,'[]') end,
 'skills',case when c.id is not null then coalesce(c.tags,'{}'::text[]) else p.skills end,
 'review_count',(select count(*) from public.reviews r where r.consultant_id=c.id and r.is_published),
 'rating',(select round(avg(r.rating),1) from public.reviews r where r.consultant_id=c.id and r.is_published))
 from public.community_people(array[p_id]) person join public.profiles p on p.id=person.id
 left join public.consultants c on c.id=person.consultant_id
$$;


create or replace function public.community_update_profile(p_name text,p_headline text,p_bio text,p_cover text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to edit your profile' using errcode='42501';end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or p_headline is null or char_length(p_headline)>240 or p_bio is null or char_length(p_bio)>2000 then raise exception 'Check the name, headline and bio lengths' using errcode='22023';end if;
 if p_cover is not null and p_cover !~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}[.]webp$') then raise exception 'Invalid cover image' using errcode='22023';end if;
 update public.profiles set full_name=btrim(p_name),current_position=btrim(p_headline),bio=btrim(p_bio),cover_path=p_cover,updated_at=now() where id=auth.uid();
 if not found then raise exception 'Profile unavailable';end if;
 update public.consultants set name=btrim(p_name),current_position=btrim(p_headline),bio=btrim(p_bio),updated_at=now() where profile_id=auth.uid();
end $$;
