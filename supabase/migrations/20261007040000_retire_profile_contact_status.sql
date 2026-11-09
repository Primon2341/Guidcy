-- Retire public contact/status fields without deleting private records or legacy columns.
create or replace function public.community_update_identity(p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid profile data' using errcode='22023';end if;
 perform public.community_update_professional('intro',p_data);
 update public.profiles set pronouns=btrim(coalesce(p_data->>'pronouns','')),
  show_location=coalesce((p_data->>'show_location')::boolean,show_location) where id=auth.uid();
end $$;
revoke all on function public.community_update_identity(jsonb) from public;
grant execute on function public.community_update_identity(jsonb) to authenticated;

create or replace function public.community_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object('cover_path',p.cover_path,'bio',coalesce(c.bio,p.bio,''),'city',case when p.show_location or p.id=auth.uid() then coalesce(p.city,'') else '' end,'show_location',p.show_location,
 'pronouns',p.pronouns,
 'connections',(select count(*) from public.community_connections e where p.id in(e.member_a,e.member_b) and e.status='accepted'),
 'connection_status',coalesce((select case when e.status='accepted' then 'connected' when e.requested_by=auth.uid() then 'outgoing' else 'incoming' end from public.community_connections e where e.member_a=least(p.id,auth.uid()) and e.member_b=greatest(p.id,auth.uid()) and auth.uid() is not null),'none'),
 'connection_requests',case when p.id=auth.uid() then (select count(*) from public.community_connections e where p.id in(e.member_a,e.member_b) and e.requested_by<>p.id and e.status='pending') else null end,
 'education',coalesce(nullif(c.highest_education,''),nullif(p.highest_education,''),p.education,''),
 'company_experience',case when jsonb_array_length(coalesce(c.company_experience,'[]'))>0 then c.company_experience else coalesce(p.company_experience,'[]') end,
 'skills',case when c.id is not null then coalesce(c.tags,'{}'::text[]) else p.skills end,
 'review_count',(select count(*) from public.reviews r where r.consultant_id=c.id and r.is_published),
 'rating',(select round(avg(r.rating),1) from public.reviews r where r.consultant_id=c.id and r.is_published))
 from public.community_people(array[p_id]) person join public.profiles p on p.id=person.id
 left join public.consultants c on c.id=person.consultant_id
$$;


create or replace function private.guidcy_profiles_rows() returns setof public.profiles
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); is_admin boolean:=public.guidcy_is_admin(auth.uid());
begin
 return query select masked.* from public.profiles r cross join lateral jsonb_populate_record(null::public.profiles,case when (r.id=viewer) or is_admin then to_jsonb(r) else to_jsonb(r)-array['website_url','public_contact_email','linkedin_url','linkedin','professional_status','professional_status_note','email','phone','city','timezone','notification_pref','refund_bank_name','refund_account_number','refund_ifsc_code','refund_upi_id','referral_code_used','referral_code_id','referred_by_ambassador','referred_at'] end) masked where (true) or (r.id=viewer) or is_admin;
end; $$;

create or replace function private.guidcy_consultants_rows() returns setof public.consultants
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); is_admin boolean:=public.guidcy_is_admin(auth.uid());
begin
 return query select masked.* from public.consultants r cross join lateral jsonb_populate_record(null::public.consultants,case when (r.profile_id=viewer) or is_admin then to_jsonb(r) else to_jsonb(r)-array['linkedin_url','linkedin','bank_ifsc','bank_account','upi_id','pan_number','bank_name','account_number','ifsc_code','total_earnings','rejection_reason','rejected_at','approved_by','profile_update_fields','profile_update_note','profile_hidden_snapshot','referral_code_used','referral_code_id','referred_by_ambassador','referred_at'] end) masked where (r.is_active and r.is_approved and r.approval_status='approved') or (r.profile_id=viewer) or is_admin;
end; $$;
