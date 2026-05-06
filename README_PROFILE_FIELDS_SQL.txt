Run this once in Supabase SQL Editor before testing profile picture + education fields:

alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists highest_education text;
alter table profiles add column if not exists college text;
alter table profiles add column if not exists current_work text;
alter table profiles add column if not exists linkedin_url text;

alter table consultants add column if not exists avatar_url text;
alter table consultants add column if not exists highest_education text;
alter table consultants add column if not exists college text;
alter table consultants add column if not exists current_work text;
alter table consultants add column if not exists linkedin_url text;

Notes:
- Profile pictures are compressed in-browser and saved as avatar_url text data URLs, so you do not need to configure Supabase Storage bucket right now.
- Highest education, college, and current job/work are mandatory during signup and profile update.
- LinkedIn URL remains optional.
