-- Transactional regression: real deployed checks and policies; no changes persist.
begin;
select set_config('test.owner',(select id::text from public.profiles order by id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare image text:=auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.webp'; replacement text:=auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-000000000002.webp';
begin
 insert into storage.objects(bucket_id,name,owner_id) values('community-images',image,auth.uid()::text);
 perform public.community_update_professional('intro',jsonb_build_object('name','Transactional cover test','headline','Test headline','bio','Test bio','cover',image));
 if public.community_profile(auth.uid())->>'cover_path' is distinct from image then raise exception 'Cover upload failed';end if;
 perform public.community_update_professional('intro',jsonb_build_object('name','Transactional cover test','headline','Test headline','bio','Test bio','cover',replacement));
 if public.community_profile(auth.uid())->>'cover_path' is distinct from replacement then raise exception 'Cover replacement failed';end if;
 perform public.community_update_profile('Transactional cover test','Test headline','Test bio',null);
 if public.community_profile(auth.uid())->>'cover_path' is not null then raise exception 'Cover removal failed';end if;
 insert into public.community_posts(author_id,body,image_path) values(auth.uid(),'Image path regression',image);
 begin
  perform public.community_update_profile('Test','Headline','Bio','00000000-0000-4000-8000-000000000000/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.webp');
  raise exception 'Cross-owner cover accepted';
 exception when invalid_parameter_value then null;end;
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('community-images',replace(image,'.webp','xwebp'),auth.uid()::text);
  raise exception 'Invalid extension accepted';
 exception when insufficient_privilege then null;end;
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('community-images','00000000-0000-4000-8000-000000000000/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.webp',auth.uid()::text);
  raise exception 'Cross-owner upload accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Cover upload, replacement, removal, post images and ownership checks passed; rolled back.' as result;
