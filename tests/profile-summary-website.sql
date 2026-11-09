begin;
select set_config('test.owner',(select profile_id::text from public.consultants where profile_id is not null and is_active and is_approved and approval_status='approved' order by id limit 1),true);
select set_config('test.other',(select id::text from public.profiles where not public.guidcy_is_admin(id) and id::text<>current_setting('test.owner') order by id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
-- Replace test-owner education only within this rollback transaction.
delete from public.profile_entries where profile_id=auth.uid() and kind='education';
insert into public.profile_entries(profile_id,kind,title,organization,start_date) values(auth.uid(),'education','Earlier degree','Earlier college','2010-01-01'),(auth.uid(),'education','Latest degree','Latest college','2020-01-01');
do $$ begin
 if public.community_profile(auth.uid())->>'college'<>'Latest college' then raise exception 'Latest college not displayed';end if;
 delete from public.profile_entries where profile_id=auth.uid() and organization='Latest college';
 if public.community_profile(auth.uid())->>'college'<>'Earlier college' then raise exception 'Deleted college persisted';end if;
 delete from public.profile_entries where profile_id=auth.uid() and kind='education';
 if public.community_profile(auth.uid())->>'college'<>'' or public.community_profile(auth.uid())->>'education'<>'' then raise exception 'Deleted education resurrected';end if;
 if exists(select 1 from public.consultants where profile_id=auth.uid() and (college<>'' or highest_education<>'' or education<>'')) then raise exception 'Consultant education copy is stale';end if;
 -- Existing dashboard edits still populate the professional profile.
 update public.consultants set college='Dashboard college',highest_education='Dashboard degree' where profile_id=auth.uid();
 if public.community_profile(auth.uid())->>'college'<>'Dashboard college' then raise exception 'Dashboard education failed';end if;
 update public.profiles set college='User dashboard college',highest_education='User dashboard degree' where id=auth.uid();
 if public.community_profile(auth.uid())->>'college'<>'User dashboard college' then raise exception 'User education failed';end if;
end $$;
select public.community_update_professional('experience','[{"company_name":"Current test company","designation":"Engineer","currently_working":true}]',public.community_profile(auth.uid())->'company_experience');
do $$ begin
 if public.community_profile(auth.uid())->>'company'<>'Current test company' then raise exception 'Current company did not synchronize';end if;
end $$;
select public.community_update_professional('experience','[]',public.community_profile(auth.uid())->'company_experience');
do $$ begin
 if public.community_profile(auth.uid())->>'company'<>'' then raise exception 'Removed current company persists';end if;
 -- The old combined company/college field must not override an explicit blank.
 update public.profiles set current_company='',current_company_college='Stale company' where id=auth.uid();
 update public.consultants set current_company='' where profile_id=auth.uid();
 if public.community_profile(auth.uid())->>'company'<>'' then raise exception 'Blank company fell back to stale text';end if;
end $$;
select public.community_update_identity(jsonb_build_object('name','Website fixture','headline','Engineer','bio','Test','website_url','https://example.com/my-work','website_public',false));
do $$ begin
 if public.community_profile(auth.uid())->>'website_url'<>'https://example.com/my-work' then raise exception 'Owner cannot edit private website';end if;
 begin perform public.community_update_identity(jsonb_build_object('name','Unsafe website','headline','Engineer','bio','Test','website_url','javascript:alert(1)','website_public',true));raise exception 'Unsafe website accepted';exception when check_violation then null;end;
 if public.community_profile(auth.uid())->>'name'<>'Website fixture' then raise exception 'Invalid website save was not atomic';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$ begin
 if public.community_profile(current_setting('test.owner')::uuid)->>'website_url'<>'' then raise exception 'Private website exposed to member';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.community_update_identity(jsonb_build_object('name','Website fixture','headline','Engineer','bio','Test','website_public',true));
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if public.community_profile(current_setting('test.owner')::uuid)->>'website_url'<>'https://example.com/my-work' then raise exception 'Published website unavailable';end if;
 if public.community_profile(current_setting('test.owner')::uuid) ?| array['public_contact_email','linkedin_url','phone','email','professional_status'] then raise exception 'Retired contact/status fields returned';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.community_update_identity(jsonb_build_object('name','Website fixture','headline','Engineer','bio','Test','website_url','','website_public',true));
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if public.community_profile(current_setting('test.owner')::uuid)->>'website_url'<>'' then raise exception 'Removed website persisted';end if;
end $$;
reset role;
rollback;
select 'Education/company deletion, legacy editors, website opt-in/removal and private contacts passed; rolled back.' as result;
