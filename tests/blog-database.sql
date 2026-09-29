-- Run with the Supabase SQL editor or psql; all test changes roll back.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from private.guidcy_admins limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare article public.blog_posts; changed integer;
begin
  insert into public.blog_posts(title,slug,excerpt,content) values ('Blog access check','guidcy-blog-access-check-'||gen_random_uuid(),'Test excerpt','[{"type":"p","children":["Test content"]}]') returning * into article;
  perform set_config('guidcy.test_blog_id',article.id::text,true);
  if article.status <> 'draft' then raise exception 'New posts must default to draft'; end if;
  update public.blog_posts set title='Edited draft' where id=article.id and version=article.version;
  update public.blog_posts set title='Stale write' where id=article.id and version=article.version;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale version overwrote a post'; end if;
  update public.blog_posts set status='published',published_at=now()+interval '1 day' where id=article.id;
end $$;
reset role;
set local role anon;
do $$
begin
  if exists(select 1 from public.blog_posts where id=current_setting('guidcy.test_blog_id')::uuid) then raise exception 'Scheduled article leaked'; end if;
  begin
    insert into public.blog_posts(title,slug) values ('Unauthorized','forbidden-'||gen_random_uuid());
    raise exception 'Anonymous insert succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
update public.blog_posts set published_at=now()-interval '1 minute' where id=current_setting('guidcy.test_blog_id')::uuid;
do $$
begin
  begin
    update public.blog_posts set slug='changed-'||gen_random_uuid() where id=current_setting('guidcy.test_blog_id')::uuid;
    raise exception 'Slug changed' using errcode='23514';
  exception when raise_exception then null; end;
end $$;
reset role;
set local role anon;
do $$
begin
  if not exists(select 1 from public.blog_posts where id=current_setting('guidcy.test_blog_id')::uuid) then raise exception 'Published article hidden'; end if;
end $$;
reset role;
select set_config('guidcy.test_admin_claims',current_setting('request.jwt.claims'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare changed integer;
begin
  update public.blog_posts set title='Unauthorized' where id=current_setting('guidcy.test_blog_id')::uuid;
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'Non-admin update succeeded'; end if;
  delete from public.blog_posts where id=current_setting('guidcy.test_blog_id')::uuid;
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'Non-admin delete succeeded'; end if;
  begin
    insert into public.blog_posts(title,slug) values ('Unauthorized','forbidden-'||gen_random_uuid());
    raise exception 'Non-admin insert succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values ('blog-covers','forbidden-'||gen_random_uuid()||'.png');
    raise exception 'Non-admin cover upload succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',current_setting('guidcy.test_admin_claims'),true);
set local role authenticated;
update public.blog_posts set status='draft' where id=current_setting('guidcy.test_blog_id')::uuid;
reset role;
set local role anon;
do $$
begin
  if exists(select 1 from public.blog_posts where id=current_setting('guidcy.test_blog_id')::uuid) then raise exception 'Draft article leaked'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.blog_posts where id=current_setting('guidcy.test_blog_id')::uuid) then raise exception 'Draft leaked to signed-in non-admin'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',current_setting('guidcy.test_admin_claims'),true);
set local role authenticated;
delete from public.blog_posts where id=current_setting('guidcy.test_blog_id')::uuid;
do $$
begin
  if exists(select 1 from public.blog_posts where id=current_setting('guidcy.test_blog_id')::uuid) then raise exception 'Admin delete failed'; end if;
end $$;
reset role;
rollback;
