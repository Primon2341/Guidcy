-- Registrations were keyed on email only. "My Webinars" reads a signed-in
-- account's registrations, so link each row to the auth user that made it.
-- Email stays as the fallback for rows created before this column existed
-- (and for anything the backfill could not match).
alter table public.webinar_registrations
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists webinar_registrations_user_id_idx
  on public.webinar_registrations (user_id)
  where user_id is not null;

update public.webinar_registrations as registration
set user_id = profile.id
from public.profiles as profile
where registration.user_id is null
  and registration.email is not null
  and lower(btrim(registration.email)) = lower(btrim(profile.email));

-- The generated Google Meet link is readable only by a confirmed registrant.
-- Match that registrant by account id as well as by email.
drop policy if exists "Confirmed registrant reads webinar meeting" on public.webinar_meetings;
create policy "Confirmed registrant reads webinar meeting"
  on public.webinar_meetings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.webinar_registrations r
      where r.webinar_id = webinar_meetings.webinar_id
        and (r.user_id = auth.uid() or lower(r.email) = lower(coalesce(auth.email(), '')))
        and coalesce(r.is_deleted, false) = false
        and r.registration_status = 'confirmed'
        and (r.payment_verified = true or r.payment_status in ('free', 'success', 'paid'))
    )
  );
