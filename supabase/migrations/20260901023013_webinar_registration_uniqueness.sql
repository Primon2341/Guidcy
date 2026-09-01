-- Keep the strongest/most recent active registration when historical duplicate
-- rows exist. Older duplicates remain recoverable through the existing deleted
-- registration view instead of being physically removed.
with ranked_active_registrations as (
  select
    id,
    row_number() over (
      partition by webinar_id, lower(btrim(email))
      order by
        case
          when payment_verified is true
            and (
              lower(coalesce(payment_status, '')) in ('success', 'paid', 'completed', 'free')
              or lower(coalesce(registration_status, '')) in ('confirmed', 'registered', 'active')
            )
          then 0
          else 1
        end,
        registered_at desc nulls last,
        id desc
    ) as duplicate_rank
  from public.webinar_registrations
  where coalesce(is_deleted, false) is false
    and email is not null
    and btrim(email) <> ''
)
update public.webinar_registrations as registration
set
  is_deleted = true,
  registration_status = 'deleted',
  deleted_at = coalesce(registration.deleted_at, now()),
  delete_reason = coalesce(
    nullif(registration.delete_reason, ''),
    'Duplicate active webinar registration consolidated before uniqueness constraint'
  ),
  updated_at = now()
from ranked_active_registrations as ranked
where registration.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists webinar_registrations_one_active_email_per_webinar
  on public.webinar_registrations (webinar_id, lower(btrim(email)))
  where coalesce(is_deleted, false) is false
    and email is not null
    and btrim(email) <> '';
