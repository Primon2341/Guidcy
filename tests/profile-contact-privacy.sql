begin;
select set_config('test.owner',(select profile_id::text from public.consultants where profile_id is not null and is_active and is_approved and approval_status='approved' order by id limit 1),true);
select set_config('test.other',(select id::text from public.profiles where not public.guidcy_is_admin(id) and id::text<>current_setting('test.owner') order by id limit 1),true);
select set_config('test.account_email',(select coalesce(email,'') from public.profiles where id=current_setting('test.owner')::uuid),true);
update public.profiles set website_public=false,public_contact_email='private-fixture@example.com',website_url='https://example.com/private',linkedin_url='https://example.com/private-link',linkedin='https://example.com/legacy-link',professional_status='open_to_work',professional_status_note='Retired status' where id=current_setting('test.owner')::uuid;
update public.consultants set linkedin_url='https://example.com/private-link',linkedin='https://example.com/legacy-link' where profile_id=current_setting('test.owner')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.community_update_identity(jsonb_build_object('name','Privacy fixture','headline','Engineer','bio','Professional summary','pronouns','They/Them','professional_status','hiring','public_contact_email','should-not-save@example.com','linkedin_url','https://example.com/should-not-save'));
do $$ declare row public.profiles; begin
 select * into row from public.profiles where id=auth.uid();
 if row.public_contact_email<>'private-fixture@example.com' or row.linkedin_url<>'https://example.com/private-link' or row.professional_status<>'open_to_work' then raise exception 'Retired editor fields changed private stored data';end if;
 if coalesce(row.email,'')<>current_setting('test.account_email') then raise exception 'Account email changed';end if;
 if public.community_profile(auth.uid()) ?| array['email','phone','public_contact_email','linkedin_url','linkedin','professional_status','professional_status_note'] then raise exception 'Retired fields still in profile RPC';end if;
 if not exists(select 1 from public.guidcy_consultants where profile_id=auth.uid() and linkedin_url='https://example.com/private-link') then raise exception 'Owner lost access to existing private data';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$ begin
 if coalesce(public.community_profile(current_setting('test.owner')::uuid)->>'website_url','')<>'' then raise exception 'Private website exposed';end if;
 if public.community_profile(current_setting('test.owner')::uuid) ?| array['email','phone','public_contact_email','linkedin_url','professional_status'] then raise exception 'Contacts exposed to another member';end if;
 if exists(select 1 from public.guidcy_profiles r where id=current_setting('test.owner')::uuid and (to_jsonb(r)->>'email' is not null or to_jsonb(r)->>'phone' is not null or to_jsonb(r)->>'public_contact_email' is not null or to_jsonb(r)->>'website_url' is not null or to_jsonb(r)->>'linkedin_url' is not null or to_jsonb(r)->>'linkedin' is not null)) then raise exception 'Profile directory exposed contacts';end if;
 if exists(select 1 from public.guidcy_consultants where profile_id=current_setting('test.owner')::uuid and (linkedin_url is not null or linkedin is not null)) then raise exception 'Consultant directory exposed contacts';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if coalesce(public.community_profile(current_setting('test.owner')::uuid)->>'website_url','')<>'' then raise exception 'Private website exposed';end if;
 if public.community_profile(current_setting('test.owner')::uuid) ?| array['email','phone','public_contact_email','linkedin_url','professional_status'] then raise exception 'Public profile exposed contacts';end if;
 if exists(select 1 from public.guidcy_consultants where profile_id=current_setting('test.owner')::uuid and (linkedin_url is not null or linkedin is not null)) then raise exception 'Anonymous directory exposed contacts';end if;
 begin perform public.community_update_identity('{}');raise exception 'Anonymous editing allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.guidcy_profiles_rows() where id=current_setting('test.owner')::uuid and (public_contact_email is not null or website_url is not null or professional_status is not null or professional_status_note is not null)) then raise exception 'New columns leaked through public projection';end if;
end $$;
rollback;
select 'Public contact/status removal, owner access, account preservation and anonymous restrictions passed; rolled back.' as result;
