create or replace function private.guidcy_profiles_rows() returns setof public.profiles
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); is_admin boolean:=public.guidcy_is_admin(auth.uid());
begin
 return query select masked.* from public.profiles r cross join lateral jsonb_populate_record(null::public.profiles,case when (r.id=viewer) or is_admin then to_jsonb(r) else to_jsonb(r)-array['email','phone','city','timezone','notification_pref','refund_bank_name','refund_account_number','refund_ifsc_code','refund_upi_id','referral_code_used','referral_code_id','referred_by_ambassador','referred_at'] end) masked where (true) or (r.id=viewer) or is_admin;
end; $$;
revoke all on function private.guidcy_profiles_rows() from public;
grant execute on function private.guidcy_profiles_rows() to anon,authenticated,service_role;
create or replace view public.guidcy_profiles with(security_invoker=true,security_barrier=true) as select * from private.guidcy_profiles_rows();
grant select on public.guidcy_profiles to anon,authenticated,service_role;
create or replace function private.guidcy_consultants_rows() returns setof public.consultants
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); is_admin boolean:=public.guidcy_is_admin(auth.uid());
begin
 return query select masked.* from public.consultants r cross join lateral jsonb_populate_record(null::public.consultants,case when (r.profile_id=viewer) or is_admin then to_jsonb(r) else to_jsonb(r)-array['bank_ifsc','bank_account','upi_id','pan_number','bank_name','account_number','ifsc_code','total_earnings','rejection_reason','rejected_at','approved_by','profile_update_fields','profile_update_note','profile_hidden_snapshot','referral_code_used','referral_code_id','referred_by_ambassador','referred_at'] end) masked where (r.is_active and r.is_approved and r.approval_status='approved') or (r.profile_id=viewer) or is_admin;
end; $$;
revoke all on function private.guidcy_consultants_rows() from public;
grant execute on function private.guidcy_consultants_rows() to anon,authenticated,service_role;
create or replace view public.guidcy_consultants with(security_invoker=true,security_barrier=true) as select * from private.guidcy_consultants_rows();
grant select on public.guidcy_consultants to anon,authenticated,service_role;
create or replace function private.guidcy_webinars_rows() returns setof public.webinars
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); is_admin boolean:=public.guidcy_is_admin(auth.uid());
begin
 return query select masked.* from public.webinars r cross join lateral jsonb_populate_record(null::public.webinars,case when (r.created_by=viewer) or is_admin then to_jsonb(r) else to_jsonb(r)-array['meet_link','publisher_email','payout_status','payout_amount','payout_transaction_id','payout_mode','payout_paid_at','payout_paid_by','payout_marked_by','payout_note'] end) masked where (true) or (r.created_by=viewer) or is_admin;
end; $$;
revoke all on function private.guidcy_webinars_rows() from public;
grant execute on function private.guidcy_webinars_rows() to anon,authenticated,service_role;
create or replace view public.guidcy_webinars with(security_invoker=true,security_barrier=true) as select * from private.guidcy_webinars_rows();
grant select on public.guidcy_webinars to anon,authenticated,service_role;
