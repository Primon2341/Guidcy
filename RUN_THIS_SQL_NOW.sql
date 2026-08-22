-- Run this SQL now for the latest Guidcy update.
-- Purpose: previous company experience + current position support.
-- Safe additive migration for existing users and consultants.

alter table public.profiles
  add column if not exists current_position text,
  add column if not exists current_company text,
  add column if not exists current_company_normalized text,
  add column if not exists company_experience jsonb not null default '[]'::jsonb,
  add column if not exists experience_companies_normalized text[] not null default '{}'::text[];

alter table public.consultants
  add column if not exists current_position text,
  add column if not exists current_company text,
  add column if not exists current_company_normalized text,
  add column if not exists company_experience jsonb not null default '[]'::jsonb,
  add column if not exists experience_companies_normalized text[] not null default '{}'::text[];

update public.profiles
set
  current_position = coalesce(current_position, current_work),
  company_experience = coalesce(company_experience, '[]'::jsonb),
  experience_companies_normalized = coalesce(experience_companies_normalized, '{}'::text[])
where current_position is null
   or company_experience is null
   or experience_companies_normalized is null;

update public.consultants
set
  current_position = coalesce(current_position, current_work, specialty, category),
  company_experience = coalesce(company_experience, '[]'::jsonb),
  experience_companies_normalized = coalesce(experience_companies_normalized, '{}'::text[])
where current_position is null
   or company_experience is null
   or experience_companies_normalized is null;

create index if not exists idx_profiles_experience_companies_normalized
  on public.profiles using gin (experience_companies_normalized);

create index if not exists idx_consultants_experience_companies_normalized
  on public.consultants using gin (experience_companies_normalized);

create index if not exists idx_profiles_current_company_normalized
  on public.profiles (current_company_normalized);

create index if not exists idx_consultants_current_company_normalized
  on public.consultants (current_company_normalized);

comment on column public.profiles.company_experience is
  'JSON array of prior/current company experience objects: company_name, designation, department, start_date, end_date, currently_working.';

comment on column public.consultants.company_experience is
  'JSON array of prior/current company experience objects: company_name, designation, department, start_date, end_date, currently_working.';
