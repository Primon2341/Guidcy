begin;
-- Existing bookings retain their original type and remain updateable/refundable.
alter table public.bookings alter column session_type set default 'video';
create function private.guidcy_video_booking() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.session_type is distinct from 'video' then
    raise exception 'Only Video Sessions are available for new bookings' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.guidcy_video_booking() from public,anon,authenticated;
create trigger aaa_guidcy_booking_video before insert on public.bookings
for each row execute function private.guidcy_video_booking();
commit;
