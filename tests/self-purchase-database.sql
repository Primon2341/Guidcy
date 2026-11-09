begin;
do $$
declare seller uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); expert uuid:=gen_random_uuid();
 paid_note uuid:=gen_random_uuid(); free_note uuid:=gen_random_uuid(); note uuid; fee integer; denied boolean; booking uuid; purchase uuid;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 (seller,seller||'@example.invalid',now(),'{"full_name":"Seller fixture"}'),
 (buyer,buyer||'@example.invalid',now(),'{"full_name":"Buyer fixture"}');
 insert into public.consultants(id,profile_id,name,is_active,is_approved,approval_status,video_price,session_types)
 values(expert,seller,'Self-booking fixture',true,true,'approved',1000,array['video']);
 insert into public.marketplace_notes(id,uploader_id,title,category,description,file_path,price,is_free,status) values
 (paid_note,seller,'Paid fixture','Guide','Test',seller||'/paid.pdf',199,false,'active'),
 (free_note,seller,'Free fixture','Guide','Test',seller||'/free.pdf',0,true,'active');
 -- Authenticated buyers cannot forge a different seller to purchase their own upload.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',seller,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 foreach note in array array[paid_note,free_note] loop
  denied:=false;
  begin insert into public.marketplace_orders(note_id,buyer_id,seller_id) values(note,seller,buyer);
  exception when insufficient_privilege then
   if sqlerrm<>'You cannot purchase your own resource' then raise;end if;denied:=true;
  end;
  if not denied then raise exception 'Self-resource purchase allowed';end if;
 end loop;
 denied:=false;
 begin insert into public.bookings(user_id,consultant_id,duration,session_type) values(seller,expert,60,'video');
 exception when insufficient_privilege then
  if sqlerrm<>'You cannot book a session with yourself' then raise;end if;denied:=true;
 end;
 if not denied then raise exception 'Self-booking allowed';end if;
 -- Other customers retain paid and free purchase/booking flows.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated')::text,true);
 insert into public.bookings(user_id,consultant_id,duration,session_type) values(buyer,expert,60,'video') returning id into booking;
 insert into public.marketplace_orders(note_id,buyer_id,seller_id) values(paid_note,buyer,seller) returning id into purchase;
 insert into public.marketplace_orders(note_id,buyer_id,seller_id) values(free_note,buyer,seller);
 -- Server credentials do not bypass the business rule, including zero-price sessions.
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 foreach fee in array array[0,1000] loop
  update public.consultants set rate=fee,price=fee,video_price=fee where id=expert;
  denied:=false;
  begin insert into public.bookings(user_id,consultant_id,duration,session_type) values(seller,expert,60,'video');
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Server allowed self-booking';end if;
 end loop;
 foreach note in array array[paid_note,free_note] loop
  denied:=false;
  begin insert into public.marketplace_orders(note_id,buyer_id,seller_id) values(note,seller,buyer);
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Server allowed self-resource purchase';end if;
 end loop;
 -- Simulate a pending historical order becoming a self-purchase after ownership changes.
 update public.consultants set profile_id=buyer where id=expert;
 update public.marketplace_notes set uploader_id=buyer where id=paid_note;
 denied:=false;
 begin update public.bookings set razorpay_order_id='order_SELF' where id=booking;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Historical self-booking checkout allowed';end if;
 denied:=false;
 begin update public.marketplace_orders set payment_verified=true,download_granted=true where id=purchase;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Historical self-purchase settlement allowed';end if;
 update public.bookings set notes='Historical record remains manageable' where id=booking;
 update public.marketplace_orders set updated_at=now() where id=purchase;
end $$;
rollback;
select 'Self-bookings and paid/free self-purchases blocked for authenticated and server writes; other customer orders pass; rolled back.' as result;
