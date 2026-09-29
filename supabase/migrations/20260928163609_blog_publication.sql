-- Blog publication is independent of the existing marketplace and webinar tables.
begin;
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  slug text not null unique check (char_length(slug) between 1 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  cover_image text not null default '' check (cover_image = '' or (cover_image ~ '^https://[^[:space:]]+$' and char_length(cover_image) <= 2048)),
  cover_alt text not null default '' check (char_length(cover_alt) <= 200),
  excerpt text not null default '' check (char_length(excerpt) <= 500),
  content jsonb not null default '[]'::jsonb check (jsonb_typeof(content) = 'array' and octet_length(content::text) <= 200000),
  author text not null default 'Guidcy' check (char_length(btrim(author)) between 1 and 120),
  category text not null default 'Guidance' check (char_length(btrim(category)) between 1 and 80),
  published_at timestamptz,
  meta_title text not null default '' check (char_length(meta_title) <= 200),
  meta_description text not null default '' check (char_length(meta_description) <= 300),
  status text not null default 'draft' check (status in ('draft','published')),
  first_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint blog_publish_complete check (status <> 'published' or (published_at is not null and char_length(btrim(excerpt)) > 0 and jsonb_array_length(content) > 0))
);
create index blog_posts_public_date_idx on public.blog_posts (published_at desc,id) where status = 'published';
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
grant select on public.blog_posts to anon;
grant select, insert, update, delete on public.blog_posts to authenticated;
create policy blog_public_read on public.blog_posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());
create policy blog_admin_read on public.blog_posts for select to authenticated
  using ((select public.guidcy_is_admin(auth.uid())));
create policy blog_admin_insert on public.blog_posts for insert to authenticated
  with check ((select public.guidcy_is_admin(auth.uid())));
create policy blog_admin_update on public.blog_posts for update to authenticated
  using ((select public.guidcy_is_admin(auth.uid()))) with check ((select public.guidcy_is_admin(auth.uid())));
create policy blog_admin_delete on public.blog_posts for delete to authenticated
  using ((select public.guidcy_is_admin(auth.uid())));
create function public.guidcy_blog_before_write() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if old.first_published_at is not null and new.slug <> old.slug then
      raise exception 'Published article URLs cannot be changed';
    end if;
    new.created_at := old.created_at;
    new.first_published_at := old.first_published_at;
    new.version := old.version + 1;
  else
    new.created_at := now();
    new.first_published_at := null;
    new.version := 1;
  end if;
  if new.status = 'published' then
    new.published_at := coalesce(new.published_at,now());
    new.first_published_at := coalesce(new.first_published_at,now());
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.guidcy_blog_before_write() from public, anon, authenticated;
create trigger blog_before_write before insert or update on public.blog_posts for each row execute function public.guidcy_blog_before_write();

-- Cover uploads use Supabase Storage; only trusted administrators may manage them.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('blog-covers','blog-covers',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy blog_cover_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'blog-covers' and (select public.guidcy_is_admin(auth.uid())));
create policy blog_cover_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'blog-covers' and (select public.guidcy_is_admin(auth.uid())));
create policy blog_cover_delete on storage.objects for delete to authenticated
  using (bucket_id = 'blog-covers' and (select public.guidcy_is_admin(auth.uid())));

-- Preserve the article previously shipped publicly in seo.js.
insert into public.blog_posts (title,slug,excerpt,content,author,category,published_at,status)
values ('How Guidance Can Change Your Life','how-guidance-can-change-your-life','The right guidance can bring clarity, build confidence, and help you move forward in your personal and professional life.','[{"type":"p","children":["Guidance plays a major role in shaping both personal and professional life. No matter how talented or hardworking a person is, the right direction can save time, reduce mistakes, and help achieve goals faster."]},{"type":"p","children":["In personal life, guidance helps us make better decisions, handle challenges, and stay motivated during difficult times. Parents, teachers, friends, or mentors often help us see solutions that we may not notice ourselves. A single piece of good advice can sometimes completely change the direction of someone’s life."]},{"type":"p","children":["Professionally, guidance is even more important. Every field has practical challenges that cannot be learned only from books or the internet. Experienced mentors help us understand industry expectations, improve skills, and avoid common mistakes. This not only increases confidence but also accelerates career growth."]},{"type":"p","children":["One of the biggest advantages of proper guidance is clarity. Instead of feeling lost or confused, we gain a better understanding of what to do and how to move forward. It also helps build confidence because someone with experience is supporting and directing us."]},{"type":"p","children":["Success is rarely achieved alone. Behind most successful people, there is always someone who guided, motivated, or inspired them at the right time. The right guidance does not just improve performance - it transforms thinking, decision-making, and overall growth."]},{"type":"p","children":["In the end, guidance is like a compass in life. It may not remove every obstacle, but it helps us move in the right direction with confidence and purpose."]}]'::jsonb,'Guidcy','Guidance','2026-05-10T00:00:00+05:30','published');
commit;
