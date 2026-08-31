-- Keep disputes fully sourced from Supabase while preserving removed cases for audit.
alter table public.disputes
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

create index if not exists disputes_active_created_idx
  on public.disputes (created_at desc)
  where is_deleted = false;

-- Older UI code created a dispute merely by opening the admin page whenever a
-- booking carried status='disputed'. These rows were not submitted by a user or
-- consultant. Preserve them for audit but do not present them as live cases.
update public.disputes
set is_deleted = true,
    deleted_at = coalesce(deleted_at, now()),
    status = 'Closed',
    updated_at = now()
where is_deleted = false
  and created_by is null
  and raised_by is null
  and booking_id is null
  and issue_type = 'Session issue (raised by consultant)';

-- Public tracking returns only a narrow, non-sensitive projection and never
-- returns an administratively removed case.
create or replace function public.track_dispute(p_code text)
returns table(
  dispute_code text,
  issue_type text,
  preferred_resolution text,
  status text,
  admin_comment text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    d.dispute_code,
    d.issue_type,
    d.preferred_resolution,
    d.status,
    d.admin_comment,
    d.created_at
  from public.disputes as d
  where d.dispute_code = p_code
    and d.is_deleted = false
  limit 1;
$$;

revoke all on function public.track_dispute(text) from public;
grant execute on function public.track_dispute(text) to anon, authenticated, service_role;
