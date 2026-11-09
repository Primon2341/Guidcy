-- Additive social layer. Existing identity, consultant and booking tables are untouched.
create table public.community_posts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null default '' check (char_length(body) <= 5000),
 kind text not null default 'Insight' check (kind in ('Insight','Achievement','Career update','Learning','Opportunity','Project')),
 image_path text,
 image_alt text not null default '' check (char_length(image_alt) <= 300),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (length(btrim(body)) > 0 or image_path is not null),
 check (image_path is null or image_path ~ ('^' || author_id::text || '/[a-f0-9-]{36}\.webp$'))
);
create table public.community_follows (
 follower_id uuid not null references public.profiles(id) on delete cascade,
 following_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (follower_id,following_id), check (follower_id <> following_id)
);
create table public.community_likes (
 post_id uuid not null references public.community_posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create table public.community_saves (
 post_id uuid not null references public.community_posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create table public.community_comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.community_posts(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check (char_length(btrim(body)) between 1 and 1500),
 created_at timestamptz not null default now()
);
create index community_posts_time on public.community_posts(created_at desc,id desc);
create index community_posts_author on public.community_posts(author_id,created_at desc,id desc);
create index community_follows_target on public.community_follows(following_id);
create index community_likes_user on public.community_likes(user_id);
create index community_saves_user on public.community_saves(user_id,post_id);
create index community_comments_post on public.community_comments(post_id,created_at,id);
create index community_comments_author on public.community_comments(author_id);

alter table public.community_posts enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_saves enable row level security;
alter table public.community_comments enable row level security;
create policy public_read on public.community_posts for select to anon,authenticated using(true);
create policy own_insert on public.community_posts for insert to authenticated with check(author_id=(select auth.uid()));
create policy own_update on public.community_posts for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
create policy own_delete on public.community_posts for delete to authenticated using(author_id=(select auth.uid()));
create policy public_read on public.community_follows for select to anon,authenticated using(true);
create policy own_insert on public.community_follows for insert to authenticated with check(follower_id=(select auth.uid()));
create policy own_delete on public.community_follows for delete to authenticated using(follower_id=(select auth.uid()));
create policy public_read on public.community_likes for select to anon,authenticated using(true);
create policy own_insert on public.community_likes for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_delete on public.community_likes for delete to authenticated using(user_id=(select auth.uid()));
create policy own_read on public.community_saves for select to authenticated using(user_id=(select auth.uid()));
create policy own_insert on public.community_saves for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_delete on public.community_saves for delete to authenticated using(user_id=(select auth.uid()));
create policy public_read on public.community_comments for select to anon,authenticated using(true);
create policy own_insert on public.community_comments for insert to authenticated with check(author_id=(select auth.uid()));
create policy own_delete on public.community_comments for delete to authenticated using(author_id=(select auth.uid()));

-- Explicit column grants prevent spoofing timestamps or moving records between authors.
revoke all on public.community_posts,public.community_follows,public.community_likes,public.community_saves,public.community_comments from anon,authenticated;
grant select on public.community_posts,public.community_follows,public.community_likes,public.community_comments to anon,authenticated;
grant select on public.community_saves to authenticated;
grant delete on public.community_posts,public.community_follows,public.community_likes,public.community_saves,public.community_comments to authenticated;
grant insert(id,author_id,body,kind,image_path,image_alt),update(body,kind,image_path,image_alt) on public.community_posts to authenticated;
grant insert(follower_id,following_id) on public.community_follows to authenticated;
grant insert(post_id,user_id) on public.community_likes,public.community_saves to authenticated;
grant insert(post_id,author_id,body) on public.community_comments to authenticated;
create function public.community_touch_post() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create trigger community_post_updated before update on public.community_posts for each row execute function public.community_touch_post();
revoke all on function public.community_touch_post() from public;

-- A narrow public projection of existing identities, never a second profile store.
create function public.community_people(p_ids uuid[] default null)
returns table(id uuid,name text,avatar_url text,headline text,company text,college text,experience text,expertise text[],certifications text[],consultant_id uuid,followers bigint,following bigint,is_following boolean)
language sql stable security definer set search_path='' as $$
 select p.id,coalesce(nullif(c.name,''),p.full_name,'Guidcy member'),coalesce(nullif(c.avatar_url,''),p.avatar_url),
 coalesce(nullif(c.current_position,''),nullif(p.current_position,''),nullif(c.specialty,''),p.current_work,''),
 coalesce(nullif(c.current_company,''),nullif(p.current_company,''),p.current_company_college,''),
 coalesce(c.college,p.college,''),coalesce(c.experience,''),coalesce(c.tags,'{}'),coalesce(c.certs,'{}'),c.id,
 (select count(*) from public.community_follows f where f.following_id=p.id),
 (select count(*) from public.community_follows f where f.follower_id=p.id),
 exists(select 1 from public.community_follows f where f.follower_id=auth.uid() and f.following_id=p.id)
 from public.profiles p left join lateral (
   select c.* from public.consultants c where c.profile_id=p.id and c.is_active and c.is_approved and c.approval_status='approved' and not coalesce(c.profile_update_required,false)
   order by c.created_at,c.id limit 1
 ) c on true
 where (p_ids is not null and p.id=any(p_ids[1:50])) or
 (p_ids is null and c.id is not null and p.id is distinct from auth.uid() and not exists(select 1 from public.community_follows f where f.follower_id=auth.uid() and f.following_id=p.id))
 order by (c.id is not null) desc,p.created_at desc,p.id limit case when p_ids is null then 5 else 50 end
$$;
revoke all on function public.community_people(uuid[]) from public;
grant execute on function public.community_people(uuid[]) to anon,authenticated;

-- Keyset pagination. Two indexed, bounded streams let followed authors receive
-- a 12-hour recency boost without sorting the complete post database.
create function public.community_feed(p_mode text default 'community',p_before timestamptz default null,p_before_id uuid default null,p_as_of timestamptz default now(),p_post uuid default null,p_author uuid default null)
returns table(id uuid,author_id uuid,body text,kind text,image_path text,image_alt text,created_at timestamptz,updated_at timestamptz,rank_at timestamptz,likes bigint,comments bigint,liked boolean,saved boolean)
language sql stable security invoker set search_path='' as $$
 with candidates as (
  (select p.*,p.created_at+interval '12 hours' as rank_at from public.community_posts p
   where p.created_at<=p_as_of and p_mode='community' and p_post is null and p_author is null
   and exists(select 1 from public.community_follows f where f.follower_id=auth.uid() and f.following_id=p.author_id)
   and (p_before is null or (p.created_at,p.id)<(p_before-interval '12 hours',p_before_id))
   order by p.created_at desc,p.id desc limit 13)
  union all
  (select p.*,p.created_at as rank_at from public.community_posts p
   where p.created_at<=p_as_of and (p_post is null or p.id=p_post) and (p_author is null or p.author_id=p_author)
   and (p_mode<>'mine' or p.author_id=auth.uid())
   and (p_mode<>'saved' or exists(select 1 from public.community_saves s where s.user_id=auth.uid() and s.post_id=p.id))
   and (p_mode<>'following' or exists(select 1 from public.community_follows f where f.follower_id=auth.uid() and f.following_id=p.author_id))
   and (p_mode<>'community' or p_post is not null or p_author is not null or not exists(select 1 from public.community_follows f where f.follower_id=auth.uid() and f.following_id=p.author_id))
   and (p_before is null or (p.created_at,p.id)<(p_before,p_before_id))
   order by p.created_at desc,p.id desc limit 13)
 ), page as (select * from candidates order by rank_at desc,id desc limit 13)
 select p.id,p.author_id,p.body,p.kind,p.image_path,p.image_alt,p.created_at,p.updated_at,p.rank_at,
 (select count(*) from public.community_likes l where l.post_id=p.id),
 (select count(*) from public.community_comments c where c.post_id=p.id),
 exists(select 1 from public.community_likes l where l.post_id=p.id and l.user_id=auth.uid()),
 exists(select 1 from public.community_saves s where s.post_id=p.id and s.user_id=auth.uid())
 from page p order by p.rank_at desc,p.id desc
$$;
-- Anonymous feed must be able to evaluate the private-save subquery; RLS hides all rows.
grant select on public.community_saves to anon;
revoke all on function public.community_feed(text,timestamptz,uuid,timestamptz,uuid,uuid) from public;
grant execute on function public.community_feed(text,timestamptz,uuid,timestamptz,uuid,uuid) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('community-images','community-images',true,2097152,array['image/webp']);
create policy community_image_insert on storage.objects for insert to authenticated with check(bucket_id='community-images' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$');
create policy community_image_read on storage.objects for select to authenticated using(bucket_id='community-images' and owner_id=(select auth.uid())::text);
create policy community_image_delete on storage.objects for delete to authenticated using(bucket_id='community-images' and owner_id=(select auth.uid())::text);
