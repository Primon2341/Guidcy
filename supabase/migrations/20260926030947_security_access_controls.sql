-- Security boundaries: privileged identity, prices and settlement never come
-- from the browser. Public directory functions deliberately redact private data.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create table if not exists private.guidcy_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.guidcy_admins from public, anon, authenticated;
grant all on private.guidcy_admins to service_role;
insert into private.guidcy_admins(user_id)
select id from auth.users where email_confirmed_at is not null
and lower(email) in ('guidcytechnologies@gmail.com','tripathiprakhar41@gmail.com')
on conflict do nothing;

create or replace function private.guidcy_server() returns boolean
language sql stable set search_path='' as $$
  select coalesce(auth.role(),'')='service_role'
    or (current_setting('role',true) in ('none','postgres') and session_user='postgres');
$$;
create or replace function public.guidcy_is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select (uid=auth.uid() or private.guidcy_server())
    and exists(select 1 from private.guidcy_admins a where a.user_id=uid);
$$;
create or replace function public.guidcy_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.guidcy_admins a where a.user_id=auth.uid());
$$;

create table if not exists private.guidcy_request_limits (
  key text primary key, started_at timestamptz not null, hits integer not null
);
revoke all on private.guidcy_request_limits from public, anon, authenticated;
create or replace function public.guidcy_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if not private.guidcy_server() then raise insufficient_privilege; end if;
  if length(p_key)>128 or p_limit<1 or p_seconds<1 or p_seconds>86400 then raise exception 'Invalid limit'; end if;
  insert into private.guidcy_request_limits as l(key,started_at,hits) values(p_key,clock_timestamp(),1)
  on conflict(key) do update set
    hits=case when l.started_at < clock_timestamp()-make_interval(secs=>p_seconds) then 1 else l.hits+1 end,
    started_at=case when l.started_at < clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else l.started_at end
  returning hits into n;
  delete from private.guidcy_request_limits where started_at < now()-interval '2 days';
  return n<=p_limit;
end; $$;
revoke all on function public.guidcy_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.guidcy_rate_limit(text,integer,integer) to service_role;

-- Opaque PL/pgSQL projection prevents predicates from observing redacted fields.
create or replace function private.guidcy_profiles_rows() returns setof public.profiles
language plpgsql stable security definer set search_path='' as $$
begin
 return query select (jsonb_populate_record(null::public.profiles,case when (r.id=auth.uid()) or public.guidcy_is_admin(auth.uid()) then to_jsonb(r) else to_jsonb(r)-array['email','phone','city','timezone','notification_pref','refund_bank_name','refund_account_number','refund_ifsc_code','refund_upi_id','referral_code_used','referral_code_id','referred_by_ambassador','referred_at'] end)).*
 from public.profiles r where (true) or (r.id=auth.uid()) or public.guidcy_is_admin(auth.uid());
end; $$;
revoke all on function private.guidcy_profiles_rows() from public;
grant execute on function private.guidcy_profiles_rows() to anon,authenticated,service_role;
create or replace view public.guidcy_profiles with(security_invoker=true,security_barrier=true) as select * from private.guidcy_profiles_rows();
grant select on public.guidcy_profiles to anon,authenticated,service_role;
create or replace function private.guidcy_consultants_rows() returns setof public.consultants
language plpgsql stable security definer set search_path='' as $$
begin
 return query select (jsonb_populate_record(null::public.consultants,case when (r.profile_id=auth.uid()) or public.guidcy_is_admin(auth.uid()) then to_jsonb(r) else to_jsonb(r)-array['bank_ifsc','bank_account','upi_id','pan_number','bank_name','account_number','ifsc_code','total_earnings','rejection_reason','rejected_at','approved_by','profile_update_fields','profile_update_note','profile_hidden_snapshot','referral_code_used','referral_code_id','referred_by_ambassador','referred_at'] end)).*
 from public.consultants r where (r.is_active and r.is_approved and r.approval_status='approved') or (r.profile_id=auth.uid()) or public.guidcy_is_admin(auth.uid());
end; $$;
revoke all on function private.guidcy_consultants_rows() from public;
grant execute on function private.guidcy_consultants_rows() to anon,authenticated,service_role;
create or replace view public.guidcy_consultants with(security_invoker=true,security_barrier=true) as select * from private.guidcy_consultants_rows();
grant select on public.guidcy_consultants to anon,authenticated,service_role;
create or replace function private.guidcy_webinars_rows() returns setof public.webinars
language plpgsql stable security definer set search_path='' as $$
begin
 return query select (jsonb_populate_record(null::public.webinars,case when (r.created_by=auth.uid()) or public.guidcy_is_admin(auth.uid()) then to_jsonb(r) else to_jsonb(r)-array['meet_link','publisher_email','payout_status','payout_amount','payout_transaction_id','payout_mode','payout_paid_at','payout_paid_by','payout_marked_by','payout_note'] end)).*
 from public.webinars r where (true) or (r.created_by=auth.uid()) or public.guidcy_is_admin(auth.uid());
end; $$;
revoke all on function private.guidcy_webinars_rows() from public;
grant execute on function private.guidcy_webinars_rows() to anon,authenticated,service_role;
create or replace view public.guidcy_webinars with(security_invoker=true,security_barrier=true) as select * from private.guidcy_webinars_rows();
grant select on public.guidcy_webinars to anon,authenticated,service_role;
create or replace function private.guidcy_webinar_counts() returns table(webinar_id text,count bigint)
language sql stable security definer set search_path='' as $$
 select r.webinar_id,count(*) from public.webinar_registrations r
 where not coalesce(r.is_deleted,false) and r.registration_status='confirmed' and r.payment_verified is true
 and r.payment_status in ('success','free') group by r.webinar_id;
$$;
revoke all on function private.guidcy_webinar_counts() from public;
grant execute on function private.guidcy_webinar_counts() to anon,authenticated,service_role;
create or replace view public.guidcy_webinar_counts with(security_invoker=true) as select * from private.guidcy_webinar_counts();
grant select on public.guidcy_webinar_counts to anon,authenticated,service_role;


notify pgrst,'reload schema';
