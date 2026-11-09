begin;
select set_config('test.organization_consultant',(select id::text from public.consultants where is_active and is_approved and approval_status='approved' and not coalesce(profile_update_required,false) order by id limit 1),true);
update public.consultants set name='Lookup Fixture Technologies',avatar_url='data:image/png;base64,aGVsbG8=' where id=current_setting('test.organization_consultant')::uuid;
insert into public.community_organizations(kind,name,logo_url,is_approved) values
 ('company','Lookup Fixture','https://example.com/exact.png',true),
 ('college','Institute of Lookup Fixture Science','https://example.com/college.png',true),
 ('company','Lookup Fixture Hidden','https://example.com/hidden.png',false);
set local role anon;
do $$ begin
 if (select name from public.community_organization_matches('company','lookup fixture') limit 1)<>'Lookup Fixture' then raise exception 'Exact match must rank first';end if;
 if not exists(select 1 from public.community_organization_matches('company','lookup fixture') where name='Lookup Fixture Technologies' and source='consultant' and consultant_id=current_setting('test.organization_consultant')::uuid and logo_url='data:image/png;base64,aGVsbG8=') then raise exception 'Registered company missing';end if;
 if not exists(select 1 from public.community_organization_matches('company','technologies') where name='Lookup Fixture Technologies') then raise exception 'Partial name not found';end if;
 if not exists(select 1 from public.community_organization_matches('company',null,array['  LOOKUP   FIXTURE TECHNOLOGIES  ']) where source='consultant') then raise exception 'Normalized exact logo resolution failed';end if;
 if exists(select 1 from public.community_organization_matches('company',null,array['Lookup Fix'])) then raise exception 'Partial name must not guess a logo';end if;
 if not exists(select 1 from public.community_organization_matches('college','lookup fixture') where name='Institute of Lookup Fixture Science') then raise exception 'College search failed';end if;
 if not exists(select 1 from public.community_organization_matches('college','lookup fixture') where name='Lookup Fixture Technologies' and consultant_id=current_setting('test.organization_consultant')::uuid) then raise exception 'Registered education profile link missing';end if;
 if exists(select 1 from public.community_organization_matches('college','lookup fixture') where name='Institute of Lookup Fixture Science' and consultant_id is not null) then raise exception 'Unregistered college got an invented profile';end if;
 if exists(select 1 from public.community_organization_matches('company','lookup fixture') where name='Lookup Fixture Hidden') then raise exception 'Hidden directory record leaked';end if;
 if exists(select 1 from public.community_organization_matches('company','')) or exists(select 1 from public.community_organization_matches('invalid','lookup fixture')) then raise exception 'Invalid/bulk enumeration query accepted';end if;
 if exists(select 1 from public.community_organization_matches('company','%')) then raise exception 'Wildcards treated as search syntax';end if;
end $$;
reset role;
update public.consultants set is_active=false where id=current_setting('test.organization_consultant')::uuid;
set local role anon;
do $$ begin
 if exists(select 1 from public.community_organization_matches('company','lookup fixture') where source='consultant') then raise exception 'Inactive consultant leaked';end if;
end $$;
reset role;
update public.consultants set is_active=true where id=current_setting('test.organization_consultant')::uuid;
insert into public.community_organizations(kind,name,logo_url,is_approved) values('company','Lookup Fixture Technologies','https://example.com/official.png',true);
set local role anon;
do $$ begin
 if (select count(*) from public.community_organization_matches('company',null,array['lookup fixture technologies']))<>1 or not exists(select 1 from public.community_organization_matches('company',null,array['lookup fixture technologies']) where source='directory' and consultant_id=current_setting('test.organization_consultant')::uuid and logo_url='https://example.com/official.png') then raise exception 'Directory override failed';end if;
end $$;
reset role;
update public.community_organizations set is_approved=false where name='Lookup Fixture Technologies';
set local role anon;
do $$ begin
 if exists(select 1 from public.community_organization_matches('company',null,array['lookup fixture technologies'])) then raise exception 'Hidden directory entry bypassed via consultant';end if;
end $$;
reset role;
rollback;
select 'Registered organization suggestions, exact logo resolution, ranking, legacy images and public visibility passed; rolled back.' as result;
