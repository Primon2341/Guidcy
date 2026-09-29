-- Run against Supabase: all schedule changes roll back.
begin;
select set_config('guidcy.test_consultant',(select id::text from public.consultants where is_active and is_approved and approval_status='approved' and profile_id is not null limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select profile_id from public.consultants where id=current_setting('guidcy.test_consultant')::uuid),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare changed integer;
begin
  update public.consultants set recurring_availability='{"enabled":true,"days":[1,2,3,4,5],"start":"18:00","end":"21:00","interval":60}', availability_map='{"2027-01-04":[],"2027-01-05":["7:00 PM"]}' where id=current_setting('guidcy.test_consultant')::uuid;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Owner could not save'; end if;
  if not exists(select 1 from public.guidcy_consultants where id=current_setting('guidcy.test_consultant')::uuid and recurring_availability->>'start'='18:00' and availability_map->'2027-01-04'='[]'::jsonb) then raise exception 'Owner read lost schedule'; end if;
  begin
    update public.consultants set recurring_availability='{"enabled":true,"days":[1],"start":"21:00","end":"18:00","interval":60}' where id=current_setting('guidcy.test_consultant')::uuid;
    raise exception 'Invalid hours accepted';
  exception when check_violation then null; end;
  if public.guidcy_valid_recurring_availability('{"enabled":true,"days":[1,1],"start":"18:00","end":"21:00","interval":60}') or public.guidcy_valid_recurring_availability('{"enabled":true,"days":[7],"start":"18:00","end":"21:00","interval":60}') then raise exception 'Invalid days accepted'; end if;
  update public.consultants set recurring_availability='{"enabled":true,"interval":60,"weekly":[{"start":"10:00","end":"18:00"},{"start":"19:00","end":"22:00"},{"start":"19:00","end":"22:00"},null,{"start":"19:00","end":"22:00"},{"start":"19:00","end":"22:00"},{"start":"10:00","end":"18:00"}]}' where id=current_setting('guidcy.test_consultant')::uuid;
  if not exists(select 1 from public.guidcy_consultants where id=current_setting('guidcy.test_consultant')::uuid and recurring_availability->'weekly'->3='null'::jsonb and availability_map->'2027-01-04'='[]'::jsonb) then raise exception 'Weekly hours lost date overrides'; end if;
  begin
    update public.consultants set recurring_availability=jsonb_set(recurring_availability,'{weekly,1,end}','"18:00"') where id=current_setting('guidcy.test_consultant')::uuid;
    raise exception 'Invalid weekday hours accepted';
  exception when check_violation then null; end;
  if public.guidcy_valid_recurring_availability('{"enabled":true,"interval":60,"weekly":[]}') or public.guidcy_valid_recurring_availability('{"enabled":true,"interval":60,"weekly":[null,null,null,null,null,null,{}]}') or public.guidcy_valid_recurring_availability('{"enabled":true,"weekly":[null,null,null,null,null,null,null]}') then raise exception 'Malformed weekly rule accepted'; end if;
  if not public.guidcy_valid_recurring_availability('{"enabled":true,"interval":60,"weekly":[null,null,null,null,null,null,null]}') then raise exception 'All days unavailable rejected'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  if not exists(select 1 from public.guidcy_consultants where id=current_setting('guidcy.test_consultant')::uuid and recurring_availability->>'enabled'='true' and recurring_availability->'weekly'->0->>'start'='10:00') then raise exception 'Public directory lost recurring hours'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare changed integer; begin
  update public.consultants set recurring_availability=null where id=current_setting('guidcy.test_consultant')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Another user changed availability'; end if;
end $$;
reset role;
rollback;

-- New bookings are video-only; historical session types remain updateable.
begin;
do $$
declare buyer uuid:=gen_random_uuid(); seller uuid:=gen_random_uuid(); expert uuid:=gen_random_uuid(); old_booking uuid; booked public.bookings; kind text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (buyer,buyer||'@example.invalid',now(),'{"full_name":"Availability test"}'),
    (seller,seller||'@example.invalid',now(),'{"full_name":"Availability test"}');
  insert into public.consultants(id,profile_id,name,is_active,is_approved,approval_status,video_price,audio_price,chat_price,session_types)
    values(expert,seller,'Availability test',true,true,'approved',1000,500,250,array['video','audio','chat']);
  insert into public.bookings(user_id,consultant_id,duration,session_type,status,payment_status,payment_gateway,amount,total_amount,platform_fee) values(buyer,expert,60,'video','pending_payment','pending','razorpay',1000,1050,50) returning id into old_booking;
  -- Simulate a record written before Video became the only supported new type.
  update public.bookings set session_type='audio' where id=old_booking;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  insert into public.bookings(user_id,consultant_id,duration,date_label,time_slot,amount,total_amount)
    values(buyer,expert,90,'Jan 4, 2029','7:00 PM',1,1) returning * into booked;
  if booked.session_type<>'video' or booked.amount<>1400 or booked.total_amount<>1470 or booked.payment_verified then raise exception 'Video booking price/default/payment validation failed'; end if;
  foreach kind in array array['audio','chat'] loop
    begin
      insert into public.bookings(user_id,consultant_id,duration,session_type) values(buyer,expert,60,kind);
      raise exception 'Unsupported session type accepted';
    exception when check_violation then null; end;
  end loop;
  update public.bookings set notes='Historical booking still works' where id=old_booking;
  if not exists(select 1 from public.bookings where id=old_booking and session_type='audio' and notes='Historical booking still works') then raise exception 'Historical booking changed'; end if;
  perform set_config('role','none',true);
end $$;
rollback;
