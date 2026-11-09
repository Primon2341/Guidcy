begin;
select set_config('test.photo_owner',(select p.id::text from public.profiles p join public.consultants c on c.profile_id=p.id order by p.id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.photo_owner'),true);
set local role authenticated;
do $$
declare before_profile jsonb; after_profile jsonb; value text:='data:image/jpeg;base64,/9j/2Q=='; path text:=auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-000000000003.webp';
begin
 select to_jsonb(p)-array['updated_at','avatar_url','cover_path'] into before_profile from public.profiles p where id=auth.uid();
 perform public.community_update_photo('avatar',value);
 if exists(select 1 from public.consultants where profile_id=auth.uid() and avatar_url is distinct from value) then raise exception 'Consultant photo not synchronized';end if;
 if public.community_profile(auth.uid())->>'avatar_url' is distinct from value then raise exception 'Public photo not updated';end if;
 perform public.community_update_photo('cover',path);
 if public.community_profile(auth.uid())->>'cover_path' is distinct from path then raise exception 'Cover not updated';end if;
 begin perform public.community_update_photo('cover','00000000-0000-4000-8000-000000000000/aaaaaaaa-aaaa-4aaa-8aaa-000000000003.webp');raise exception 'Foreign cover accepted';exception when invalid_parameter_value then null;end;
 begin perform public.community_update_photo('avatar','javascript:alert(1)');raise exception 'Unsafe image accepted';exception when invalid_parameter_value then null;end;
 begin perform public.community_update_photo('avatar','data:image/svg+xml;base64,AAAA');raise exception 'SVG accepted';exception when invalid_parameter_value then null;end;
 begin perform public.community_update_photo('avatar','data:image/jpeg;base64,'||repeat('A',2097152));raise exception 'Oversized avatar accepted';exception when invalid_parameter_value then null;end;
 perform public.community_update_photo('avatar',null);
 perform public.community_update_photo('cover',null);
 if coalesce(public.community_profile(auth.uid())->>'avatar_url','')<>'' or public.community_profile(auth.uid())->>'cover_path' is not null then raise exception 'Photo removal failed';end if;
 if exists(select 1 from public.consultants where profile_id=auth.uid() and coalesce(avatar_url,'')<>'') then raise exception 'Consultant photo removal failed';end if;
 select to_jsonb(p)-array['updated_at','avatar_url','cover_path'] into after_profile from public.profiles p where id=auth.uid();
 if before_profile is distinct from after_profile then raise exception 'Unrelated profile fields changed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.community_update_photo('cover',null);raise exception 'Anonymous photo write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Photo-only updates, consultant synchronization, removal, validation and anonymous restrictions passed; rolled back.' as result;
