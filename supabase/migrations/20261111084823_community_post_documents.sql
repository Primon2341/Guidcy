-- Add PDF attachments without changing the existing feed/activity RPC contracts.
alter table public.community_posts
 add column document_path text,
 add column document_name text,
 add column document_pages smallint,
 add column document_bytes integer;
alter table public.community_posts drop constraint community_posts_check;
alter table public.community_posts add constraint community_posts_content_check
 check(length(btrim(body))>0 or image_path is not null or document_path is not null);
alter table public.community_posts add constraint community_posts_single_attachment
 check(num_nonnulls(image_path,document_path)<=1);
alter table public.community_posts add constraint community_posts_document_check check(
 (document_path is null and document_name is null and document_pages is null and document_bytes is null)
 or (document_path is not null and document_name is not null and document_pages is not null and document_bytes is not null
 and document_path ~ ('^'||author_id::text||'/[a-f0-9-]{36}[.]pdf$')
 and char_length(btrim(document_name)) between 1 and 200
 and document_pages between 1 and 200 and document_bytes between 1 and 20971520));
grant insert(document_path,document_name,document_pages,document_bytes),
 update(document_path,document_name,document_pages,document_bytes) on public.community_posts to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('community-documents','community-documents',true,20971520,array['application/pdf']) on conflict(id) do nothing;
create policy community_document_insert on storage.objects for insert to authenticated with check(
 bucket_id='community-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}[.]pdf$');
create policy community_document_read on storage.objects for select to authenticated using(
 bucket_id='community-documents' and owner_id=(select auth.uid())::text);
create policy community_document_delete on storage.objects for delete to authenticated using(
 bucket_id='community-documents' and owner_id=(select auth.uid())::text);

-- Reuse the bounded, indexed community feed and its ranking. Old clients still
-- receive the exact previous projection; new clients receive attachment metadata.
create function public.community_feed_with_documents(
 p_mode text default 'community',p_before timestamptz default null,p_before_id uuid default null,
 p_as_of timestamptz default now(),p_post uuid default null,p_author uuid default null)
returns table(id uuid,author_id uuid,body text,kind text,image_path text,image_alt text,
 created_at timestamptz,updated_at timestamptz,rank_at timestamptz,likes bigint,comments bigint,liked boolean,saved boolean,
 document_path text,document_name text,document_pages smallint,document_bytes integer)
language sql stable security invoker set search_path='' as $$
 select f.*,p.document_path,p.document_name,p.document_pages,p.document_bytes
 from public.community_feed(p_mode,p_before,p_before_id,p_as_of,p_post,p_author) f
 join public.community_posts p on p.id=f.id order by f.rank_at desc,f.id desc
$$;
revoke all on function public.community_feed_with_documents(text,timestamptz,uuid,timestamptz,uuid,uuid) from public;
grant execute on function public.community_feed_with_documents(text,timestamptz,uuid,timestamptz,uuid,uuid) to anon,authenticated;

create function public.community_profile_activity_with_documents(
 p_id uuid,p_kind text default null,p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,author_id uuid,body text,kind text,image_path text,image_alt text,
 created_at timestamptz,updated_at timestamptz,likes bigint,comments bigint,liked boolean,saved boolean,
 document_path text,document_name text,document_pages smallint,document_bytes integer)
language sql stable security invoker set search_path='' as $$
 select f.*,p.document_path,p.document_name,p.document_pages,p.document_bytes
 from public.community_profile_activity(p_id,p_kind,p_before,p_before_id) f
 join public.community_posts p on p.id=f.id order by f.created_at desc,f.id desc
$$;
revoke all on function public.community_profile_activity_with_documents(uuid,text,timestamptz,uuid) from public;
grant execute on function public.community_profile_activity_with_documents(uuid,text,timestamptz,uuid) to anon,authenticated;
notify pgrst,'reload schema';
