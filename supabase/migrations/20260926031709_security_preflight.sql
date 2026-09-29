do $preflight$ begin
begin
if not exists(select 1 from pg_trigger where tgname='aaa_guidcy_guard_purchase') then
execute $migration$-- Security boundaries: privileged identity, prices and settlement never come
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

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,full_name,role,avatar_initials)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),
    case when new.raw_user_meta_data->>'role'='consultant' then 'consultant' else 'user' end,
    upper(left(coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),2)))
  on conflict(id) do nothing;
  return new;
end; $$;

create or replace function private.guidcy_guard_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare official_email text; admin_member boolean;
begin
  if private.guidcy_server() then return new; end if;
  if new.id<>auth.uid() then raise insufficient_privilege; end if;
  select email into official_email from auth.users where id=new.id;
  select exists(select 1 from private.guidcy_admins where user_id=new.id) into admin_member;
  if new.role='admin' and not admin_member then raise exception 'Role changes require administrator provisioning' using errcode='42501'; end if;
  new.email:=official_email;
  if admin_member then new.role:='admin'; end if;
  return new;
end; $$;
create trigger aaa_guidcy_guard_profile before insert or update on public.profiles
for each row execute function private.guidcy_guard_profile();
-- The archive is maintained by its existing profile trigger, never by clients.
revoke insert,update,delete on public.users from anon,authenticated;

create or replace function private.guidcy_guard_purchase() returns trigger
language plpgsql security definer set search_path='' as $$
declare n public.marketplace_notes; c public.consultants; w public.webinars;
  fee numeric; allowed text[]; oldj jsonb; newj jsonb;
begin
  if private.guidcy_server() then return new; end if;
  if tg_op='UPDATE' then
    if tg_table_name='bookings' then
      allowed:=array['notes','meet_link','google_calendar_event_id','meeting_status','meeting_updated_at','meeting_last_error','updated_at',
        'status','session_status','session_completed_at','session_completed_by','session_notes','cancelled_by','cancelled_at',
        'cancellation_reason','cancelled_by_id','previous_status','last_status_updated_at','last_status_updated_by','issue_reason','issue_raised_at','issue_raised_by'];
      if new.status in ('confirmed','completed') and (old.payment_verified is not true or old.payment_status<>'success') then
        raise exception 'Verified payment required' using errcode='42501';
      end if;
      if public.guidcy_is_admin(auth.uid()) then
        allowed:=allowed||array['admin_review_status','admin_notes','payout_status','payout_transaction_id','payout_paid_at','payout_paid_by','payout_remarks','payout_mode','payout_note','payout_marked_by'];
      end if;
    elsif tg_table_name='marketplace_orders' then
      allowed:=array['updated_at','download_url_created_at'];
      if public.guidcy_is_admin(auth.uid()) then allowed:=allowed||array['seller_payout_status','seller_payout_id','seller_payout_paid_at','seller_payout_transaction_id','seller_payout_mode','seller_payout_note','seller_payout_marked_by']; end if;
    else
      allowed:=array['name','phone','role','goal','updated_at'];
      if public.guidcy_is_admin(auth.uid()) then allowed:=allowed||array['is_deleted','deleted_at','deleted_by','delete_reason','registration_status']; end if;
    end if;
    if (to_jsonb(new)-allowed) is distinct from (to_jsonb(old)-allowed) then
      raise exception 'Payment and identity fields are server controlled' using errcode='42501';
    end if;
    return new;
  end if;
  if auth.uid() is null then raise insufficient_privilege; end if;
  if tg_table_name='marketplace_orders' then
    if new.buyer_id<>auth.uid() then raise insufficient_privilege; end if;
    select * into n from public.marketplace_notes where id=new.note_id and status='active' and removed_at is null;
    if not found then raise exception 'Resource unavailable'; end if;
    new.price:=case when n.is_free then 0 else n.price end;
    if new.price is null or new.price<0 then raise exception 'Invalid resource price'; end if;
    new.seller_id:=n.uploader_id; new.note_title:=n.title;new.note_category:=n.category;
    select email,full_name,phone into new.buyer_email,new.buyer_name,new.buyer_phone from public.profiles where id=auth.uid();
    select email,full_name into new.seller_email,new.seller_name from public.profiles where id=n.uploader_id;
    new.commission_percent:=15;new.commission_amount:=round(new.price*0.15,2);new.seller_payable:=new.price-new.commission_amount;
    new.payment_verified:=new.price=0;new.download_granted:=new.price=0;
    new.payment_status:=case when new.price=0 then 'free' else 'pending' end;
    new.order_status:=case when new.price=0 then 'completed' else 'pending' end;
    new.payment_gateway:=case when new.price=0 then 'free' else 'razorpay' end;
    new.seller_payout_status:=case when new.price=0 then 'not_required' else 'awaiting_payment' end;
    new.payment_transaction_id:=null;new.order_reference:=null;new.seller_payout_id:=null;
    new.seller_payout_paid_at:=null;new.seller_payout_transaction_id:=null;new.seller_payout_marked_by:=null;
    new.buyer_email_sent:=false;new.seller_email_sent:=false;
  elsif tg_table_name='bookings' then
    if new.user_id<>auth.uid() then raise insufficient_privilege; end if;
    select * into c from public.consultants where id=new.consultant_id and is_active and is_approved and approval_status='approved';
    if not found then raise exception 'Consultant unavailable'; end if;
    if new.duration is null or new.duration not in (30,60,90) or new.session_type is null or not(new.session_type=any(c.session_types)) then raise exception 'Invalid session selection'; end if;
    fee:=case new.session_type when 'audio' then c.audio_price when 'chat' then c.chat_price else coalesce(c.video_price,c.rate,c.price) end;
    if fee is null or fee<0 then raise exception 'Session price unavailable'; end if;
    fee:=case new.duration when 30 then round(fee*0.5) when 90 then round(fee*1.4) else fee end;
    new.amount:=fee;new.platform_fee:=round(fee*0.05,2);new.total_amount:=fee+new.platform_fee;new.payment_amount:=new.total_amount;
    new.consultant_payout_amount:=fee-round(fee*0.15,2);new.consultant_name:=c.name;
    select email,full_name into new.user_email,new.user_name from public.profiles where id=auth.uid();
    select email into new.consultant_email from public.profiles where id=c.profile_id;
    new.payment_verified:=fee=0;new.payment_status:=case when fee=0 then 'success' else 'pending' end;
    new.payment_gateway:=case when fee=0 then 'free' else 'razorpay' end;
    new.status:=case when fee=0 then 'confirmed' else 'pending_payment' end;new.session_status:='scheduled';
    new.payment_id:=null;new.payout_status:='not_eligible';new.refund_status:='not_required';new.refund_amount:=null;
    new.payout_transaction_id:=null;new.payout_paid_at:=null;new.refund_transaction_id:=null;new.refund_response:=null;
    new.user_email_sent:=false;new.consultant_email_sent:=false;
  else
    new.user_id:=auth.uid();
    select email into new.email from auth.users where id=auth.uid();
    select * into w from public.webinars where id=new.webinar_id;
    if not found then raise exception 'Webinar unavailable'; end if;
    new.webinar_title:=w.title;
    new.amount_paid:=0;new.payment_amount:=case when w.is_paid or w.price_type='paid' then w.price_amount else 0 end;
    new.payment_status:='pending';new.payment_verified:=false;new.registration_status:='payment_pending';
    new.payment_id:=null;new.payment_gateway:=null;new.paid_at:=null;
    new.registration_email_sent:=false;new.confirmation_email_sent:=false;new.is_deleted:=false;
  end if;
  new.razorpay_order_id:=null;new.razorpay_payment_id:=null;new.razorpay_signature:=null;new.razorpay_status:=null;new.payment_response:=null;
  return new;
end; $$;
create trigger aaa_guidcy_guard_purchase before insert or update on public.marketplace_orders for each row execute function private.guidcy_guard_purchase();
create trigger aaa_guidcy_guard_purchase before insert or update on public.bookings for each row execute function private.guidcy_guard_purchase();
create trigger aaa_guidcy_guard_purchase before insert or update on public.webinar_registrations for each row execute function private.guidcy_guard_purchase();

-- Remove overlapping permissive policies before installing one access model.
do $$ declare p record; begin
  for p in select * from pg_policies where schemaname='public' and tablename in
    ('profiles','consultants','webinars','webinar_registrations','bookings','marketplace_orders','support_tickets','notification_logs','notifications') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
create policy profiles_owner_read on public.profiles for select to authenticated using(id=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy profiles_owner_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profiles_owner_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy consultants_owner_read on public.consultants for select to authenticated using(profile_id=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy consultants_owner_insert on public.consultants for insert to authenticated with check(profile_id=auth.uid());
create policy consultants_owner_update on public.consultants for update to authenticated using(profile_id=auth.uid() or public.guidcy_is_admin(auth.uid())) with check(profile_id=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy consultants_admin_delete on public.consultants for delete to authenticated using(public.guidcy_is_admin(auth.uid()));
create policy webinars_owner_read on public.webinars for select to authenticated using(created_by=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy webinars_owner_insert on public.webinars for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role in ('consultant','admin')));
create policy webinars_owner_update on public.webinars for update to authenticated using(created_by=auth.uid() or public.guidcy_is_admin(auth.uid())) with check(created_by=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy webinars_owner_delete on public.webinars for delete to authenticated using(created_by=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy registrations_owner_read on public.webinar_registrations for select to authenticated using(user_id=auth.uid() or (user_id is null and lower(email)=lower(auth.email())) or public.guidcy_is_admin(auth.uid()) or exists(select 1 from public.webinars w where w.id=webinar_id and w.created_by=auth.uid()));
create policy registrations_owner_insert on public.webinar_registrations for insert to authenticated with check(user_id=auth.uid() and lower(email)=lower(auth.email()));
create policy registrations_owner_update on public.webinar_registrations for update to authenticated using(user_id=auth.uid() or public.guidcy_is_admin(auth.uid())) with check(user_id=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy registrations_admin_delete on public.webinar_registrations for delete to authenticated using(public.guidcy_is_admin(auth.uid()));
create policy bookings_participant_read on public.bookings for select to authenticated using(user_id=auth.uid() or public.guidcy_is_admin(auth.uid()) or exists(select 1 from public.consultants c where c.id=consultant_id and c.profile_id=auth.uid()));
create policy bookings_owner_insert on public.bookings for insert to authenticated with check(user_id=auth.uid());
create policy bookings_participant_update on public.bookings for update to authenticated using(user_id=auth.uid() or public.guidcy_is_admin(auth.uid()) or exists(select 1 from public.consultants c where c.id=consultant_id and c.profile_id=auth.uid()));
create policy orders_participant_read on public.marketplace_orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy orders_owner_insert on public.marketplace_orders for insert to authenticated with check(buyer_id=auth.uid());
create policy orders_owner_update on public.marketplace_orders for update to authenticated using(buyer_id=auth.uid() or public.guidcy_is_admin(auth.uid())) with check(buyer_id=auth.uid() or public.guidcy_is_admin(auth.uid()));
create policy support_owner_read on public.support_tickets for select to authenticated using(created_by=auth.uid() or lower(email)=lower(auth.email()) or public.guidcy_is_admin(auth.uid()));
create policy support_insert on public.support_tickets for insert to anon,authenticated with check((created_by is null or created_by=auth.uid()) and status='Open' and admin_comment is null and resolved_at is null);
create policy support_admin_update on public.support_tickets for update to authenticated using(public.guidcy_is_admin(auth.uid()));
create policy support_admin_delete on public.support_tickets for delete to authenticated using(public.guidcy_is_admin(auth.uid()));
create policy notification_logs_admin_read on public.notification_logs for select to authenticated using(public.guidcy_is_admin(auth.uid()));
create policy notifications_owner_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_owner_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke insert on public.notification_logs from anon,authenticated;
grant insert on public.notifications to authenticated;
create policy notifications_event_insert on public.notifications for insert to authenticated with check(auth.uid() is not null);
drop policy if exists "Buyer can create pending marketplace payout record via purchase" on public.marketplace_payouts;

update storage.buckets set file_size_limit=15728640,allowed_mime_types=array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','text/plain'] where id='job-resumes';
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

create or replace function private.guidcy_guard_listing() returns trigger
language plpgsql security definer set search_path='' as $$
declare protected text[]; field text; requirements_met boolean; oldj jsonb; newj jsonb;
begin
  if private.guidcy_server() or public.guidcy_is_admin(auth.uid()) then return new; end if;
  if auth.uid() is null then raise insufficient_privilege; end if;
  if tg_table_name='consultants' then
    protected:=array['id','profile_id','badge','is_active','is_approved','approval_status','approved_at','approved_by','rejection_reason','rejected_at',
      'profile_update_required','profile_hidden_at','profile_update_fields','profile_update_note','profile_hidden_snapshot'];
    if tg_op='INSERT' then
      new.profile_id:=auth.uid();new.is_active:=false;new.is_approved:=false;new.approval_status:='pending';new.badge:='pending';
      new.approved_at:=null;new.approved_by:=null;new.rejected_at:=null;new.rejection_reason:=null;
      new.rating:=0;new.review_count:=0;new.total_sessions:=0;new.total_earnings:=0;
      new.profile_update_required:=false;new.profile_hidden_snapshot:='{}';new.profile_update_fields:='{}';
    else
      if pg_trigger_depth()<=1 and (new.rating,new.review_count,new.total_sessions,new.total_earnings) is distinct from (old.rating,old.review_count,old.total_sessions,old.total_earnings) then
        raise exception 'Consultant statistics are server controlled' using errcode='42501';
      end if;
      oldj:=to_jsonb(old);newj:=to_jsonb(new);
      -- Preserve the existing approved-profile restoration workflow, but evaluate
      -- the administrator's required edits on the server.
      requirements_met:=old.profile_update_required and old.approval_status='approved';
      if requirements_met then
        if coalesce(array_length(old.profile_update_fields,1),0)>0 then
          foreach field in array old.profile_update_fields loop
            if btrim(coalesce(newj->>field,''))='' or btrim(coalesce(newj->>field,''))=btrim(coalesce(old.profile_hidden_snapshot->>field,'')) then requirements_met:=false; end if;
          end loop;
        else requirements_met:=btrim(coalesce(new.name,''))<>'' and btrim(coalesce(new.specialty,new.category,''))<>'' and btrim(coalesce(new.bio,''))<>'';
        end if;
      end if;
      foreach field in array protected loop
        if newj->field is distinct from oldj->field and not (requirements_met and field=any(array['is_active','is_approved','profile_update_required','profile_hidden_at','profile_update_fields','profile_update_note','profile_hidden_snapshot'])) then
          raise exception 'Approval and ownership are administrator controlled' using errcode='42501';
        end if;
      end loop;
      if requirements_met then
        new.is_active:=true;new.is_approved:=true;new.profile_update_required:=false;new.profile_hidden_at:=null;
        new.profile_update_fields:='{}';new.profile_update_note:=null;new.profile_hidden_snapshot:='{}';
      end if;
    end if;
  elsif tg_table_name='marketplace_notes' then
    if tg_op='INSERT' then
      new.uploader_id:=auth.uid();new.removed_at:=null;new.removed_by:=null;new.downloads_count:=0;new.purchases_count:=0;
      if new.status not in ('active','draft') then raise exception 'Invalid listing status'; end if;
      if split_part(new.file_path,'/',1)<>auth.uid()::text or split_part(coalesce(new.preview_file_path,new.file_path),'/',1)<>auth.uid()::text then raise insufficient_privilege; end if;
    else
      if (new.id,new.uploader_id) is distinct from (old.id,old.uploader_id)
        or ((new.removed_at,new.removed_by) is distinct from (old.removed_at,old.removed_by) and not(new.status='removed' and new.removed_by=auth.uid() and new.removed_at is not null))
        or (old.status in ('rejected','inactive','deleted','unpublished','removed') and new.status is distinct from old.status) then
        raise exception 'Moderated resources require administrator review' using errcode='42501';
      end if;
      if split_part(new.file_path,'/',1)<>auth.uid()::text or (new.preview_file_path is not null and split_part(new.preview_file_path,'/',1)<>auth.uid()::text) then raise insufficient_privilege; end if;
      new.downloads_count:=old.downloads_count;new.purchases_count:=old.purchases_count;
    end if;
  elsif tg_table_name='webinars' then
    if tg_op='INSERT' then
      new.created_by:=auth.uid();select email into new.publisher_email from auth.users where id=auth.uid();
      new.payout_status:='pending';new.payout_amount:=null;new.payout_transaction_id:=null;new.payout_paid_at:=null;new.payout_paid_by:=null;new.payout_marked_by:=null;
      new.meet_link:=null;
    elsif (to_jsonb(new)-array['title','category','description','date','time','duration','seats','speaker','speaker_role','price_type','price_amount','is_paid','publisher_name'])
      is distinct from (to_jsonb(old)-array['title','category','description','date','time','duration','seats','speaker','speaker_role','price_type','price_amount','is_paid','publisher_name']) then
      raise exception 'Webinar ownership, meetings and payouts are server controlled' using errcode='42501';
    end if;
    if new.seats<1 or new.price_amount<0 then raise exception 'Invalid webinar price or capacity'; end if;
  end if;
  return new;
end; $$;
create trigger aaa_guidcy_guard_listing before insert or update on public.consultants for each row execute function private.guidcy_guard_listing();
create trigger aaa_guidcy_guard_listing before insert or update on public.marketplace_notes for each row execute function private.guidcy_guard_listing();
create trigger aaa_guidcy_guard_listing before insert or update on public.webinars for each row execute function private.guidcy_guard_listing();

-- Non-public trigger functions are not RPCs. Read-only helpers used by RLS stay
-- callable where necessary; their identities/data come from the current JWT.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,p.prorettype='trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' loop
    if f.is_trigger then execute format('revoke execute on function %s from public,anon,authenticated',f.signature); end if;
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proconfig is null loop
    execute format('alter function %s set search_path=public,extensions,pg_temp',f.signature);
  end loop;
end $$;
revoke all on function private.guidcy_guard_profile(),private.guidcy_guard_purchase(),private.guidcy_guard_listing() from public,anon,authenticated;

-- Authenticated ownership must hold even if another permissive policy is added.
create policy marketplace_owner_required on public.marketplace_notes as restrictive for insert to authenticated with check(uploader_id=auth.uid());
drop policy if exists reviews_insert_authenticated on public.reviews;
drop policy if exists reviews_select_all on public.reviews;

-- Notification recipients must participate in the persisted event. Never trust
-- browser-provided financial claims in a message shown to another account.
create or replace function private.guidcy_guard_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings; consultant_user uuid;
begin
 if private.guidcy_server() then return new; end if;
 if tg_op='UPDATE' then
   if (to_jsonb(new)-'is_read') is distinct from (to_jsonb(old)-'is_read') then raise insufficient_privilege; end if;
   return new;
 end if;
 if public.guidcy_is_admin(auth.uid()) then return new; end if;
 if new.booking_id is null then
   if new.user_id is distinct from auth.uid() then raise insufficient_privilege; end if;
 else
   select * into b from public.bookings where id=new.booking_id;
   select profile_id into consultant_user from public.consultants where id=b.consultant_id;
   if not found or auth.uid() is null or not(auth.uid()=b.user_id or auth.uid()=consultant_user)
     or not(new.user_id=b.user_id or new.user_id=consultant_user) then raise insufficient_privilege; end if;
   new.text:='Your Guidcy session with '||case when new.user_id=b.user_id then coalesce(b.consultant_name,'your consultant') else coalesce(b.user_name,'your client') end||' has an update. Open your dashboard for details.';
   new.type:='booking';new.link:=null;
 end if;
 new.is_read:=false;new.created_at:=now();
 return new;
end; $$;
create trigger aaa_guidcy_guard_notification before insert or update on public.notifications for each row execute function private.guidcy_guard_notification();
revoke all on function private.guidcy_guard_notification() from public,anon,authenticated;
revoke create on schema public from public,anon,authenticated;
-- Do not let an unrelated consultant attach a dispute to someone else's session.
create policy disputes_identity_required on public.disputes as restrictive for insert to authenticated
with check(raised_by=auth.uid() and (booking_id is null or exists(select 1 from public.bookings b where b.id=booking_id and (b.user_id=auth.uid() or exists(select 1 from public.consultants c where c.id=b.consultant_id and c.profile_id=auth.uid())))));

notify pgrst,'reload schema';
$migration$;
end if;
execute $checks$-- Run against Supabase after the security migration. Every fixture and claim
-- change is rolled back inside the exception block; no email/payment is sent.
do $$
declare buyer uuid:=gen_random_uuid(); seller uuid:=gen_random_uuid(); expert uuid:=gen_random_uuid();
 note_id uuid:=gen_random_uuid(); free_id uuid:=gen_random_uuid(); order_id uuid; booking_id uuid;
 webinar_id text:='security-test-'||gen_random_uuid(); row_data jsonb; denied boolean;
begin
 begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
   (buyer,buyer||'@example.invalid',now(),'{"role":"admin","full_name":"Security fixture"}'),
   (seller,seller||'@example.invalid',now(),'{"role":"consultant","full_name":"Security fixture"}');
  if (select role from public.profiles where id=buyer)<>'user' then raise exception 'Signup can assign admin'; end if;
  insert into public.consultants(id,profile_id,name,is_active,is_approved,approval_status,video_price,session_types,bank_account)
   values(expert,seller,'Security fixture',true,true,'approved',1000,array['video'],'private-bank-fixture');
  insert into public.marketplace_notes(id,uploader_id,title,category,description,file_path,price,is_free,status)
   values(note_id,seller,'Security fixture','Guide','Fixture',seller||'/fixture.pdf',199,false,'active'),
   (free_id,seller,'Free fixture','Guide','Fixture',seller||'/free.pdf',0,true,'active');
  insert into public.webinars(id,title,date,time,created_by,price_type,price_amount,is_paid)
   values(webinar_id,'Security fixture','2099-01-01','12:00',seller,'paid',199,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated','email',buyer||'@example.invalid')::text,true);
  perform set_config('role','authenticated',true);
  denied:=false;
  begin update public.profiles set role='admin' where id=buyer; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Profile role escalation allowed'; end if;
  update public.profiles set full_name='Allowed profile edit' where id=buyer;
  if exists(select 1 from public.guidcy_consultants where id=expert and bank_account is not null) then raise exception 'Bank data leaked'; end if;
  if exists(select 1 from public.profiles where id=seller) then raise exception 'Other private profile visible'; end if;
  insert into public.marketplace_orders(note_id,buyer_id,seller_id,price,payment_verified,payment_status,download_granted)
   values(note_id,buyer,buyer,0,true,'success',true) returning id,to_jsonb(marketplace_orders.*) into order_id,row_data;
  if (row_data->>'price')::numeric<>199 or (row_data->>'payment_verified')::boolean or (row_data->>'download_granted')::boolean then raise exception 'Forged purchase accepted'; end if;
  denied:=false;
  begin update public.marketplace_orders set payment_verified=true,download_granted=true where id=order_id; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Purchase flag update accepted'; end if;
  insert into public.marketplace_orders(note_id,buyer_id,seller_id) values(free_id,buyer,seller) returning to_jsonb(marketplace_orders.*) into row_data;
  if not (row_data->>'download_granted')::boolean or row_data->>'payment_status'<>'free' then raise exception 'Free purchase broken'; end if;
  insert into public.bookings(user_id,consultant_id,duration,session_type,amount,total_amount,payment_verified,payment_status,status)
   values(buyer,expert,60,'video',0,0,true,'success','confirmed') returning id,to_jsonb(bookings.*) into booking_id,row_data;
  if (row_data->>'total_amount')::numeric<>1050 or (row_data->>'payment_verified')::boolean then raise exception 'Booking price bypass'; end if;
  denied:=false;
  begin update public.bookings set payment_verified=true where id=booking_id; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Booking payment update allowed'; end if;
  insert into public.webinar_registrations(id,webinar_id,name,email,phone,payment_status,payment_verified,registration_status)
   values(webinar_id,webinar_id,'Fixture','forged@example.invalid','000','success',true,'confirmed') returning to_jsonb(webinar_registrations.*) into row_data;
  if row_data->>'user_id'<>buyer::text or row_data->>'email'<>buyer||'@example.invalid' or (row_data->>'payment_verified')::boolean or (row_data->>'payment_amount')::numeric<>199 then raise exception 'Webinar registration bypass'; end if;
  insert into public.notifications(user_id,booking_id,text) values(seller,booking_id,'Forged payment success');
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  if exists(select 1 from public.profiles) or exists(select 1 from public.webinar_registrations) then raise exception 'Anonymous private read allowed'; end if;
  if not exists(select 1 from public.guidcy_consultants where id=expert) then raise exception 'Public directory broken'; end if;
  raise exception using errcode='ZX001',message='All security assertions passed; roll back fixtures';
 exception when sqlstate 'ZX001' then null;
 end;
end $$;
$checks$;
raise exception using errcode='ZX002',message='Rollback preflight';
exception when sqlstate 'ZX002' then null;
end;
end $preflight$;
