-- Admin can hide a consultant whose profile is incomplete, and the consultant
-- comes back automatically once they fill it in.
--
-- Deliberately reuses the visibility gates the public queries already apply
-- (is_active = true, and is_approved = true / approval_status = 'approved'), so
-- no listing or search query has to change. The new flag only records WHY the
-- row was hidden, which is what lets the restore be automatic and lets it stay
-- clear of accounts a human suspended or rejected.
--
-- approval_status is deliberately left at 'approved' while hidden: the consultant
-- dashboard gate treats a pending/unapproved status as "under review" and replaces
-- the dashboard with a notice, which would stop them editing the very profile we
-- are asking them to complete.

alter table public.consultants
  add column if not exists profile_update_required boolean not null default false,
  add column if not exists profile_hidden_at timestamptz;

comment on column public.consultants.profile_update_required is
  'Set by an admin when the profile is hidden pending an update. Cleared automatically when the consultant saves a complete profile. Never set for suspended or rejected accounts.';

-- Only rows hidden by this mechanism are ever auto-restored, so the partial index
-- keeps that lookup cheap and documents the intent.
create index if not exists idx_consultants_profile_update_required
  on public.consultants (profile_update_required)
  where profile_update_required = true;
