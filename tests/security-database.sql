-- Run against Supabase after the security migration. Every fixture and claim
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
  update public.marketplace_orders set download_url_created_at=now() where id=order_id;
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
