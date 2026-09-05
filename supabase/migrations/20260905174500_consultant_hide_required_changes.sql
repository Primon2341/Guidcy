-- The admin now says WHICH details must change, and the profile only comes back
-- once those specific fields are both filled in and actually different from what
-- they were when it was hidden. Without the snapshot, pressing Save with no edits
-- restored a profile whose fields merely happened to be non-empty.
alter table public.consultants
  add column if not exists profile_update_fields text[] not null default '{}',
  add column if not exists profile_update_note text,
  add column if not exists profile_hidden_snapshot jsonb not null default '{}'::jsonb;

comment on column public.consultants.profile_update_fields is
  'Column names the admin requires the consultant to change before the profile is listed again.';
comment on column public.consultants.profile_hidden_snapshot is
  'Values of those columns at the moment of hiding, so a no-op save cannot satisfy the requirement.';
