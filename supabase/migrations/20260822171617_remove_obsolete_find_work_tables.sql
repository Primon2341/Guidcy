-- Find Work has been removed. These two legacy tables are no longer read or
-- written by the site. Keep job_posts and job_applications for Careers, and
-- keep job_saves for the separate external Find Jobs page.
set lock_timeout = '5s';
set statement_timeout = '30s';

drop table if exists public.job_reports;
drop table if exists public.job_categories;
