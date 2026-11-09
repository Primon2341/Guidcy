-- Enforce ownership from the listing, not caller-supplied seller fields or auth role.
-- Existing transaction history can still be cancelled, refunded and administered.
-- Rollback: drop these two triggers and the function in a forward migration.
create function private.guidcy_prevent_self_purchase() returns trigger
language plpgsql security definer set search_path='' as $$
declare seller uuid;
begin
 if tg_table_name='bookings' then
  if tg_op='UPDATE' and (new.user_id,new.consultant_id) is not distinct from (old.user_id,old.consultant_id)
   and not (new.payment_verified is true and old.payment_verified is not true)
   and not (new.razorpay_order_id is not null and new.razorpay_order_id is distinct from old.razorpay_order_id) then return new;end if;
  select profile_id into seller from public.consultants where id=new.consultant_id;
  if seller=new.user_id then raise exception 'You cannot book a session with yourself' using errcode='42501';end if;
 else
  if tg_op='UPDATE' and (new.buyer_id,new.note_id) is not distinct from (old.buyer_id,old.note_id)
   and not (new.payment_verified is true and old.payment_verified is not true)
   and not (new.razorpay_order_id is not null and new.razorpay_order_id is distinct from old.razorpay_order_id) then return new;end if;
  select uploader_id into seller from public.marketplace_notes where id=new.note_id;
  if seller=new.buyer_id then raise exception 'You cannot purchase your own resource' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function private.guidcy_prevent_self_purchase() from public,anon,authenticated;
create trigger z_prevent_self_purchase before insert or update on public.bookings
 for each row execute function private.guidcy_prevent_self_purchase();
create trigger z_prevent_self_purchase before insert or update on public.marketplace_orders
 for each row execute function private.guidcy_prevent_self_purchase();
