begin;
select set_config('test.actor',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.other',(select id::text from public.profiles where id::text<>current_setting('test.actor') order by id limit 1),true);
select set_config('test.outsider',(select id::text from public.profiles where id::text not in(current_setting('test.actor'),current_setting('test.other')) order by id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.actor'),true);
set local role authenticated;
select public.community_update_identity(jsonb_build_object('name','Network test','headline',repeat('a',220),'bio','Test','pronouns','They/Them'));
select public.community_update_professional('skills','["Polymer Science"]');
do $$ begin
 if public.community_profile(auth.uid())->>'pronouns'<>'They/Them' or length(public.community_profile(auth.uid())->>'headline')<>220 then raise exception 'Identity did not save';end if;
 begin perform public.community_update_identity(jsonb_build_object('name','Invalid pronouns','headline','Test','bio','Test','pronouns',repeat('a',41)));raise exception 'Oversized pronouns accepted';exception when check_violation then null;end;
 if public.community_profile(auth.uid())->>'name'<>'Network test' then raise exception 'Failed identity save was not atomic';end if;
 begin perform public.community_endorse_skill(auth.uid(),'Polymer Science',true);raise exception 'Self endorsement allowed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
select public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',true);
select public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',true);
do $$ begin
 if not exists(select 1 from public.community_skill_endorsements(current_setting('test.actor')::uuid) where endorsements=1 and endorsed) then raise exception 'Endorsement count incorrect';end if;
 begin perform public.community_endorse_skill(current_setting('test.actor')::uuid,'Invented skill',true);raise exception 'Unlisted skill allowed';exception when invalid_parameter_value then null;end;
end $$;
select public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',false);
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if public.community_profile(current_setting('test.actor')::uuid) ?| array['connections','connection_status','connection_requests'] then raise exception 'Retired connection metadata exposed';end if;
 begin perform public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',true);raise exception 'Anonymous endorsement allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Identity, endorsements and anonymous restrictions passed without connection dependencies; rolled back.' as result;
