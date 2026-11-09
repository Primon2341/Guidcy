-- Shared organization metadata, not a second user or consultant system.
create table public.community_organizations (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('company','college')),
 name text not null check(char_length(btrim(name)) between 1 and 160),
 name_key text generated always as (lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g')))) stored,
 logo_url text not null default '' check(char_length(logo_url)<=1500 and (logo_url='' or logo_url ~ '^https://[^[:space:]]+$')),
 is_approved boolean not null default false,
 created_at timestamptz not null default now(),
 unique(kind,name_key)
);
create index community_organizations_lookup on public.community_organizations(name_key text_pattern_ops) where is_approved;
alter table public.community_organizations enable row level security;
create policy organizations_public on public.community_organizations for select to anon,authenticated using(is_approved or (select public.guidcy_is_admin(auth.uid())));
create policy organizations_admin_insert on public.community_organizations for insert to authenticated with check((select public.guidcy_is_admin(auth.uid())));
create policy organizations_admin_update on public.community_organizations for update to authenticated using((select public.guidcy_is_admin(auth.uid()))) with check((select public.guidcy_is_admin(auth.uid())));
revoke all on public.community_organizations from anon,authenticated;
grant select on public.community_organizations to anon,authenticated;
grant insert(kind,name,logo_url,is_approved),update(kind,name,logo_url,is_approved) on public.community_organizations to authenticated;
-- Existing text fields remain valid. Exact normalized-name matching also covers legacy entries.
