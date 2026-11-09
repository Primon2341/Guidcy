begin;
select set_config('test.owner',(select profile_id::text from public.consultants where profile_id is not null and is_active and is_approved and approval_status='approved' order by id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.community_update_professional('intro','{"name":"Company deletion fixture","headline":"Engineer","bio":"Test","company":"HFCL"}');
do $$ begin
 if exists(select 1 from public.consultants where profile_id=auth.uid() and (current_company<>'HFCL' or current_company_college<>'HFCL' or current_company_normalized<>'hfcl')) then raise exception 'Company aliases not synchronized';end if;
end $$;
select public.community_update_professional('intro','{"name":"Company deletion fixture","headline":"Engineer","bio":"Test","company":""}');
do $$ begin
 if exists(select 1 from public.consultants where profile_id=auth.uid() and (current_company<>'' or current_company_college<>'' or current_company_normalized is not null)) or exists(select 1 from public.profiles where id=auth.uid() and (current_company<>'' or current_company_college<>'' or current_company_normalized is not null)) then raise exception 'Deleted company remains on expert card';end if;
 update public.consultants set current_company_college='Legacy Company Ltd' where profile_id=auth.uid();
 if exists(select 1 from public.consultants where profile_id=auth.uid() and (current_company<>'Legacy Company Ltd' or current_company_normalized<>'legacy')) then raise exception 'Legacy dashboard save no longer works';end if;
 update public.consultants set current_company_college='' where profile_id=auth.uid();
 if exists(select 1 from public.consultants where profile_id=auth.uid() and current_company<>'') then raise exception 'Legacy deletion did not clear canonical company';end if;
end $$;
select public.community_update_professional('experience','[{"company_name":"HFCL","designation":"Engineer","currently_working":true}]',public.community_profile(auth.uid())->'company_experience');
select public.community_update_professional('experience','[]',public.community_profile(auth.uid())->'company_experience');
do $$ begin
 if exists(select 1 from public.consultants where profile_id=auth.uid() and (current_company<>'' or current_company_college<>'' or current_company_normalized is not null)) then raise exception 'Experience deletion leaves expert-card company';end if;
 if public.community_profile(auth.uid())->>'company'<>'' then raise exception 'Professional profile disagrees';end if;
end $$;
reset role;
rollback;
select 'Intro and experience deletion, display/search aliases and legacy editors passed; rolled back.' as result;
