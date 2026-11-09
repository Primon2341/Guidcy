-- Preserve existing statuses and location display while adding owner controls.
alter table public.profiles add column show_location boolean not null default true;
alter table public.profiles drop constraint profiles_professional_status_check;
alter table public.profiles add constraint profiles_professional_status_check check (professional_status in ('none','open_to_work','offering_services','hiring','content'));

create or replace function public.community_update_identity(p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid profile data' using errcode='22023';end if;
 if char_length(coalesce(p_data->>'linkedin_url',''))>500 or (coalesce(p_data->>'linkedin_url','')<>'' and p_data->>'linkedin_url' !~ '^https?://[^[:space:]]+$') then raise exception 'Use an HTTPS or HTTP professional link' using errcode='22023';end if;
 perform public.community_update_professional('intro',p_data);
 update public.profiles set pronouns=btrim(coalesce(p_data->>'pronouns','')),website_url=btrim(coalesce(p_data->>'website_url','')),
  linkedin_url=btrim(coalesce(p_data->>'linkedin_url','')),public_contact_email=btrim(coalesce(p_data->>'public_contact_email','')),
  show_location=coalesce((p_data->>'show_location')::boolean,show_location),professional_status=coalesce(p_data->>'professional_status','none'),professional_status_note=btrim(coalesce(p_data->>'professional_status_note','')) where id=auth.uid();
 update public.consultants set linkedin_url=btrim(coalesce(p_data->>'linkedin_url','')) where profile_id=auth.uid();
end $$;
revoke all on function public.community_update_identity(jsonb) from public;
grant execute on function public.community_update_identity(jsonb) to authenticated;

create or replace function public.community_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object('cover_path',p.cover_path,'bio',coalesce(c.bio,p.bio,''),'city',case when p.show_location or p.id=auth.uid() then coalesce(p.city,'') else '' end,'show_location',p.show_location,
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
