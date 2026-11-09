-- Run in a transaction. All writes (including pre-existing profile fields) roll back.
begin;
select set_config('test.owner',(select profile_id::text from public.consultants where is_active and is_approved and approval_status='approved' order by id limit 1),true);
select set_config('test.other',(select id::text from public.profiles where id::text<>current_setting('test.owner') order by id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.community_update_professional('experience','[{"company_name":"Portfolio Test Ltd","designation":"Research Engineer","employment_type":"Full-time","start_date":"2023-06","currently_working":true,"location":"Delhi","description":"Transactional professional record","skills":["Polymer Science"]}]',public.community_profile(auth.uid())->'company_experience');
select public.community_update_professional('skills','["Polymer Science","Optical Fiber"]');
with e as(insert into public.profile_entries(profile_id,kind,title,organization,start_date,end_date,grade,activities) values(auth.uid(),'education','Transactional degree','Transactional college','2020-01-01','2022-01-01','9.0','Research society') returning id) select set_config('test.education',(select id::text from e),true);
with e as(insert into public.profile_entries(profile_id,kind,title,url) values(auth.uid(),'project','Transactional project','https://example.com/project') returning id) select set_config('test.project',(select id::text from e),true);
insert into public.profile_featured(profile_id,entry_id) values(auth.uid(),current_setting('test.project')::uuid);
with p as(insert into public.community_posts(author_id,body,kind) values(auth.uid(),'Transactional achievement','Achievement') returning id) select set_config('test.post',(select id::text from p),true);
insert into public.profile_featured(profile_id,post_id) values(auth.uid(),current_setting('test.post')::uuid);
do $$ begin
 if not exists(select 1 from public.consultants where profile_id=auth.uid() and tags@>array['Polymer Science','Optical Fiber']) then raise exception 'Skills not synchronized with consultant discovery';end if;
 if public.community_profile(auth.uid())->'company_experience'->0->>'employment_type'<>'Full-time' then raise exception 'Experience metadata lost';end if;
 if jsonb_array_length(public.community_featured(auth.uid()))<2 then raise exception 'Featured content unavailable';end if;
 if not exists(select 1 from public.community_profile_activity(auth.uid(),'Achievement') where id=current_setting('test.post')::uuid) then raise exception 'Achievement activity is not using community posts';end if;
 begin perform public.community_update_professional('experience','[]','[]');raise exception 'Stale experience overwrite accepted';exception when serialization_failure then null;end;
 begin perform public.community_update_professional('skills','[1]');raise exception 'Invalid skill accepted';exception when invalid_parameter_value then null;end;
 begin perform public.community_update_professional('intro',null);raise exception 'Null profile data accepted';exception when invalid_parameter_value then null;end;
 begin insert into public.profile_entries(profile_id,kind,title) values(current_setting('test.other')::uuid,'project','Spoofed');raise exception 'Entry ownership bypass';exception when insufficient_privilege then null;end;
 begin update public.profile_entries set profile_id=current_setting('test.other')::uuid where id=current_setting('test.project')::uuid;raise exception 'Entry ownership mutable';exception when insufficient_privilege then null;end;
 begin insert into public.profile_entries(profile_id,kind,title,url) values(auth.uid(),'project','Invalid URL','javascript:alert(1)');raise exception 'Unsafe link accepted';exception when check_violation then null;end;
 begin insert into public.profile_entries(profile_id,kind,title,start_date,end_date) values(auth.uid(),'education','Invalid dates','2024-01-01','2020-01-01');raise exception 'Reversed dates accepted';exception when check_violation then null;end;
 begin insert into public.profile_featured(profile_id,post_id) values(auth.uid(),current_setting('test.post')::uuid);raise exception 'Duplicate feature accepted';exception when unique_violation then null;end;
 update public.consultants set bio='Changed through the original consultant dashboard' where profile_id=auth.uid();
 if public.community_profile(auth.uid())->>'bio'<>'Changed through the original consultant dashboard' then raise exception 'Dashboard bio changes hidden by the new profile';end if;
 update public.profile_entries set title='Updated degree' where id=current_setting('test.education')::uuid;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$ declare n integer;begin
 update public.profile_entries set title='Tampered' where id=current_setting('test.education')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Cross-owner update';end if;
 delete from public.profile_entries where id=current_setting('test.education')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Cross-owner delete';end if;
 begin insert into public.profile_featured(profile_id,entry_id) values(auth.uid(),current_setting('test.project')::uuid);raise exception 'Another persons work featured as own';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.profile_featured where profile_id=current_setting('test.owner')::uuid) then raise exception 'Private selection table leaked';end if;
 if not exists(select 1 from public.profile_entries where id=current_setting('test.education')::uuid and title='Updated degree') then raise exception 'Public education missing';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if jsonb_array_length(public.community_featured(current_setting('test.owner')::uuid))<2 then raise exception 'Public featured projection missing';end if;
 if public.community_profile(current_setting('test.owner')::uuid) ?| array['email','phone','account_number','bank_account','cover_private','completion'] then raise exception 'Private profile data exposed';end if;
 begin perform public.community_update_professional('skills','[]');raise exception 'Anonymous write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
delete from public.profile_entries where id=current_setting('test.project')::uuid;
do $$ begin
 if exists(select 1 from public.profile_featured where entry_id=current_setting('test.project')::uuid) then raise exception 'Dangling featured entry';end if;
end $$;
reset role;
rollback;
select 'Professional profile permissions, preservation, discovery and activity checks passed; all writes rolled back.' result;
