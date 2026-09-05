-- Auto-generated webinar meetings.
--
-- The host used to paste a Meet link into webinars.meet_link. That column is
-- readable by everyone: public.webinars has a SELECT policy of `true`, so any
-- visitor could read the join link without registering. The generated link
-- therefore lives here instead, behind RLS, and is only ever handed to the host,
-- an admin, or someone with a confirmed registration.
--
-- One row per webinar, so publishing twice or editing the webinar reuses the
-- same Google Calendar event instead of creating another meeting.

create table if not exists public.webinar_meetings (
  webinar_id   text primary key references public.webinars(id) on delete cascade,
  meet_link    text not null,
  event_id     text,
  start_at     timestamptz,
  end_at       timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.webinar_meetings is
  'Generated Google Meet link per webinar. Not public: readable only by the host, an admin, or a confirmed registrant.';

alter table public.webinar_meetings enable row level security;

-- The host of the webinar, and admins.
drop policy if exists "Host and admin read webinar meeting" on public.webinar_meetings;
create policy "Host and admin read webinar meeting"
  on public.webinar_meetings for select to authenticated
  using (
    exists (
      select 1 from public.webinars w
       where w.id = webinar_meetings.webinar_id
         and (w.created_by = auth.uid() or w.publisher_email = auth.email())
    )
    or guidcy_is_admin(auth.uid())
  );

-- Anyone holding a confirmed registration for that webinar.
drop policy if exists "Confirmed registrant reads webinar meeting" on public.webinar_meetings;
create policy "Confirmed registrant reads webinar meeting"
  on public.webinar_meetings for select to authenticated
  using (
    exists (
      select 1 from public.webinar_registrations r
       where r.webinar_id = webinar_meetings.webinar_id
         and lower(r.email) = lower(coalesce(auth.email(), ''))
         and coalesce(r.is_deleted, false) = false
         and r.registration_status = 'confirmed'
         and (r.payment_verified = true or r.payment_status in ('free', 'success', 'paid'))
    )
  );

-- Writes are the server's job only: no insert/update/delete policy is granted,
-- so only the service role (which bypasses RLS) can create or move a meeting.
