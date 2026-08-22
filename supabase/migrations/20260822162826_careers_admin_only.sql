-- Careers replaces the former open work marketplace. Only trusted admins can
-- create or modify Guidcy job posts. Authorization uses immutable JWT app
-- metadata or the configured founding admin email.
alter table public.job_posts enable row level security;

create policy "careers_admin_insert_permissive"
on public.job_posts
as permissive
for insert
to authenticated
with check (
  (
    coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'tripathiprakhar41@gmail.com'
  )
  and posted_by = (select auth.uid())
  and posted_by_role = 'admin'
  and lower(company_name) in ('guidcy', 'guidcy technologies', 'guidcy technologies pvt. ltd.')
);

create policy "careers_admin_insert_restrictive"
on public.job_posts
as restrictive
for insert
to authenticated
with check (
  (
    coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'tripathiprakhar41@gmail.com'
  )
  and posted_by = (select auth.uid())
  and posted_by_role = 'admin'
  and lower(company_name) in ('guidcy', 'guidcy technologies', 'guidcy technologies pvt. ltd.')
);

create policy "careers_admin_update_restrictive"
on public.job_posts
as restrictive
for update
to authenticated
using (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'tripathiprakhar41@gmail.com'
)
with check (
  (
    coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'tripathiprakhar41@gmail.com'
  )
  and posted_by_role = 'admin'
  and lower(company_name) in ('guidcy', 'guidcy technologies', 'guidcy technologies pvt. ltd.')
);

create policy "careers_admin_delete_restrictive"
on public.job_posts
as restrictive
for delete
to authenticated
using (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'tripathiprakhar41@gmail.com'
);
