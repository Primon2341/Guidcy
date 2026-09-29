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
      if new.status='disputed' and new.admin_review_status='pending_review' then allowed:=allowed||array['admin_review_status']; end if;
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
    if tg_table_name='bookings' and new.meet_link is not null and new.meet_link<>'' and new.meet_link !~ '^https://meet[.]google[.]com/[a-z-]+$' then raise exception 'Invalid meeting link'; end if;
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
