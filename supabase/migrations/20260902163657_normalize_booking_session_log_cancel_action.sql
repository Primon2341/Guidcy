-- The existing audit table uses the canonical action type "session_cancelled".
-- Older cancellation RPC versions emit "cancelled". Normalize that one legacy
-- spelling before its established check constraint is evaluated, without
-- weakening the constraint or changing any booking/payment data.
create or replace function public.guidcy_normalize_booking_session_log_action_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(trim(coalesce(new.action_type, ''))) = 'cancelled' then
    new.action_type := 'session_cancelled';
  end if;

  return new;
end;
$$;

drop trigger if exists guidcy_normalize_booking_session_log_action_type
  on public.booking_session_logs;

create trigger guidcy_normalize_booking_session_log_action_type
before insert or update of action_type on public.booking_session_logs
for each row
execute function public.guidcy_normalize_booking_session_log_action_type();
