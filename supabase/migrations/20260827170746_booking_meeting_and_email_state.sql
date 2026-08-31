-- Persist booking meeting-link generation and confirmation-email state.
-- Existing installations can apply this safely more than once.
alter table if exists public.bookings
  add column if not exists user_email_sent boolean not null default false,
  add column if not exists user_email_sent_at timestamptz,
  add column if not exists consultant_email_sent boolean not null default false,
  add column if not exists consultant_email_sent_at timestamptz,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists payment_email_sent_at timestamptz,
  add column if not exists email_last_error text,
  add column if not exists meeting_status text not null default 'pending',
  add column if not exists meeting_last_error text,
  add column if not exists meeting_updated_at timestamptz;

comment on column public.bookings.meeting_status is
  'Meeting-link lifecycle: pending until a valid Google Meet URL is persisted, then ready.';
