-- Use a literal-dot character class so migration transport cannot double-escape paths.
-- Keep the same owner folder, file type, authentication and length checks.
alter table public.profiles drop constraint profiles_community_cover_path;
alter table public.profiles add constraint profiles_community_cover_path
 check(cover_path is null or cover_path ~ ('^'||id::text||'/[a-f0-9-]{36}[.]webp$'));
alter table public.community_posts drop constraint community_posts_check1;
alter table public.community_posts add constraint community_posts_check1
 check(image_path is null or image_path ~ ('^'||author_id::text||'/[a-f0-9-]{36}[.]webp$'));
alter policy community_image_insert on storage.objects with check(
 bucket_id='community-images' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}[.]webp$');

create or replace function public.community_update_profile(p_name text,p_headline text,p_bio text,p_cover text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to edit your profile' using errcode='42501';end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or p_headline is null or char_length(p_headline)>180 or p_bio is null or char_length(p_bio)>2000 then raise exception 'Check the name, headline and bio lengths' using errcode='22023';end if;
 if p_cover is not null and p_cover !~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}[.]webp$') then raise exception 'Invalid cover image' using errcode='22023';end if;
 update public.profiles set full_name=btrim(p_name),current_position=btrim(p_headline),bio=btrim(p_bio),cover_path=p_cover,updated_at=now() where id=auth.uid();
 if not found then raise exception 'Profile unavailable';end if;
 update public.consultants set name=btrim(p_name),current_position=btrim(p_headline),bio=btrim(p_bio),updated_at=now() where profile_id=auth.uid();
end $$;
