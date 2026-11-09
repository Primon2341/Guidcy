begin;
select set_config('test.actor',(select id::text from public.profiles where not public.guidcy_is_admin(id) order by id limit 1),true);
select set_config('test.admin',(select id::text from public.profiles where public.guidcy_is_admin(id) order by id limit 1),true);
insert into public.community_organizations(kind,name,logo_url,is_approved) values('company','Presence test organization 7f39','https://example.com/logo.png',true),('college','Presence hidden institution 7f39','https://example.com/college.png',false);
select set_config('request.jwt.claim.sub',current_setting('test.actor'),true);
set local role authenticated;
select public.community_update_identity(jsonb_build_object('name','Presence fixture','headline','Engineer','bio','Test','city','Hyderabad','show_location',false,'professional_status','hiring'));
do $$ begin
 if public.community_profile(auth.uid())->>'city'<>'Hyderabad' then raise exception 'Owner lost saved city';end if;
 if public.community_profile(auth.uid()) ? 'professional_status' then raise exception 'Retired status exposed';end if;
 begin insert into public.community_organizations(kind,name,is_approved) values('company','Unauthorized organization',true);raise exception 'Member approved an organization';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.community_organizations where name='Presence hidden institution 7f39') then raise exception 'Hidden organization leaked to member';end if;
 update public.community_organizations set logo_url='https://example.com/attacker.png' where name='Presence test organization 7f39';
 if found then raise exception 'Member changed approved logo';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if public.community_profile(current_setting('test.actor')::uuid)->>'city'<>'' then raise exception 'Hidden city leaked publicly';end if;
 if not exists(select 1 from public.community_organizations where name_key='presence test organization 7f39') then raise exception 'Approved organization is not public';end if;
 if exists(select 1 from public.community_organizations where name='Presence hidden institution 7f39') then raise exception 'Hidden directory entry leaked publicly';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.actor'),true);
set local role authenticated;
select public.community_update_identity(jsonb_build_object('name','Presence fixture','headline','Engineer','bio','Test','city','Hyderabad','show_location',true,'professional_status','content'));
do $$ begin
 if public.community_profile(auth.uid()) ? 'professional_status' then raise exception 'Retired status exposed';end if;
 begin perform public.community_update_identity(jsonb_build_object('name','Invalid pronouns','headline','Engineer','bio','Test','pronouns',repeat('a',41)));raise exception 'Invalid pronouns accepted';exception when check_violation then null;end;
 if public.community_profile(auth.uid())->>'name'<>'Presence fixture' then raise exception 'Invalid update was not atomic';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
set local role authenticated;
do $$ begin
 if not public.guidcy_is_admin(auth.uid()) then raise exception 'An existing administrator is required for this rollback test';end if;
 insert into public.community_organizations(kind,name,logo_url,is_approved) values('college','Directory Admin Test 7f39','https://example.com/logo.png',true);
 begin insert into public.community_organizations(kind,name) values('college','  directory   admin test 7f39  ');raise exception 'Duplicate organization accepted';exception when unique_violation then null;end;
 begin insert into public.community_organizations(kind,name,logo_url) values('college','Unsafe logo','javascript:alert(1)');raise exception 'Unsafe logo accepted';exception when check_violation then null;end;
 update public.community_organizations set is_approved=false where name='Directory Admin Test 7f39';
 if not found then raise exception 'Admin cannot hide a directory entry';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if public.community_profile(current_setting('test.actor')::uuid)->>'city'<>'Hyderabad' then raise exception 'Public city not restored';end if;
 if exists(select 1 from public.community_organizations where name='Directory Admin Test 7f39') then raise exception 'Revoked approval still public';end if;
end $$;
reset role;
rollback;
select 'Status retirement, location visibility, approved logos, admin-only writes and name deduplication passed; rolled back.' as result;
