-- Each dashboard only repainted after its OWN write, so the other party to a
-- booking never heard about it: a consultant watching Booking Requests saw a
-- new booking on their next render, not when it happened. Publishing
-- `public.bookings` lets a signed-in client be woken by the change instead.
--
-- Row Level Security still applies to postgres_changes, so a subscriber is only
-- notified about rows its existing SELECT policies already let it read - the
-- booker's own rows (auth.uid() = user_id) and the booked consultant's
-- (consultant_id in the caller's consultants). No new data is exposed.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
