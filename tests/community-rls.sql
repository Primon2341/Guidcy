-- Run in Supabase SQL editor or psql. All test rows are rolled back.
begin;
select set_config('test.owner',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.other',(select id::text from public.profiles where id::text<>current_setting('test.owner') order by id limit 1),true);
select set_config('test.post',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
insert into public.community_posts(id,author_id,body) values(current_setting('test.post')::uuid,auth.uid(),'Transactional social permissions test');
insert into public.community_follows(follower_id,following_id) values(auth.uid(),current_setting('test.other')::uuid);
insert into public.community_likes(post_id,user_id) values(current_setting('test.post')::uuid,auth.uid());
insert into public.community_saves(post_id,user_id) values(current_setting('test.post')::uuid,auth.uid());
insert into public.community_comments(post_id,author_id,body) values(current_setting('test.post')::uuid,auth.uid(),'Transactional comment');
do $$ begin
 if (select likes from public.community_feed(p_post=>current_setting('test.post')::uuid))<>1 then raise exception 'Like count is incorrect';end if;
 if (select comments from public.community_feed(p_post=>current_setting('test.post')::uuid))<>1 then raise exception 'Comment count is incorrect';end if;
 if not (select saved from public.community_feed(p_post=>current_setting('test.post')::uuid)) then raise exception 'Saved flag missing';end if;
 begin insert into public.community_follows(follower_id,following_id) values(auth.uid(),current_setting('test.other')::uuid);raise exception 'Duplicate follow allowed';exception when unique_violation then null;end;
 begin insert into public.community_follows(follower_id,following_id) values(auth.uid(),auth.uid());raise exception 'Self follow allowed';exception when check_violation then null;end;
 begin insert into public.community_posts(author_id,body) values(current_setting('test.other')::uuid,'Spoof');raise exception 'Spoofed author allowed';exception when insufficient_privilege then null;end;
 begin update public.community_posts set created_at=now()+interval '1 day' where id=current_setting('test.post')::uuid;raise exception 'Timestamp spoof allowed';exception when insufficient_privilege then null;end;
 begin insert into public.community_posts(author_id,body) values(auth.uid(),repeat('a',5001));raise exception 'Oversized post allowed';exception when check_violation then null;end;
 begin insert into public.community_posts(author_id,body,image_path) values(auth.uid(),'bad image',current_setting('test.other')||'/'||gen_random_uuid()||'.webp');raise exception 'Foreign image allowed';exception when check_violation then null;end;
end $$;
update public.community_posts set body='Edited transactional post',image_path=auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.webp' where id=current_setting('test.post')::uuid;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$ declare n integer;begin
 update public.community_posts set body='Hijacked' where id=current_setting('test.post')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Another user edited a post';end if;
 delete from public.community_posts where id=current_setting('test.post')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Another user deleted a post';end if;
 if exists(select 1 from public.community_saves where post_id=current_setting('test.post')::uuid) then raise exception 'Private save leaked';end if;
 delete from public.community_comments where post_id=current_setting('test.post')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Another user deleted a comment';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if (select count(*) from public.community_feed(p_post=>current_setting('test.post')::uuid))<>1 then raise exception 'Public permalink unavailable';end if;
 if (select saved from public.community_feed(p_post=>current_setting('test.post')::uuid)) then raise exception 'Anonymous save flag leaked';end if;
 if exists(select 1 from public.community_saves) then raise exception 'Anonymous private saves leaked';end if;
 begin insert into public.community_likes(post_id,user_id) values(current_setting('test.post')::uuid,current_setting('test.other')::uuid);raise exception 'Anonymous like allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
delete from public.community_posts where id=current_setting('test.post')::uuid;
do $$ begin
 if exists(select 1 from public.community_comments where post_id=current_setting('test.post')::uuid) or exists(select 1 from public.community_likes where post_id=current_setting('test.post')::uuid) or exists(select 1 from public.community_saves where post_id=current_setting('test.post')::uuid) then raise exception 'Post delete did not cascade';end if;
end $$;
reset role;
rollback;
select 'Community RLS checks passed; all test changes rolled back.' as result;
