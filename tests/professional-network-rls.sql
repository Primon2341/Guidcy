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
select public.community_connection(current_setting('test.other')::uuid,'request');
select public.community_connection(current_setting('test.other')::uuid,'request');
do $$ begin
 if (select count(*) from public.community_connections where requested_by=auth.uid() and current_setting('test.other')::uuid in(member_a,member_b))<>1 then raise exception 'Duplicate connection';end if;
 begin perform public.community_connection(current_setting('test.other')::uuid,'accept');raise exception 'Requester accepted own invitation';exception when invalid_parameter_value then null;end;
 begin update public.community_connections set status='accepted';raise exception 'Direct connection write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.outsider'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.community_connections where requested_by=current_setting('test.actor')::uuid) then raise exception 'Pending invitation leaked';end if;
 begin perform public.community_network(current_setting('test.actor')::uuid,true);raise exception 'Private invitation list leaked';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
select public.community_connection(current_setting('test.actor')::uuid,'accept');
select public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',true);
select public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',true);
do $$ begin
 if public.community_profile(auth.uid())->>'connection_status' is distinct from 'none' then raise exception 'Own profile has a self connection';end if;
 if public.community_profile(current_setting('test.actor')::uuid)->>'connection_status'<>'connected' then raise exception 'Accepted connection missing';end if;
 if not exists(select 1 from public.community_skill_endorsements(current_setting('test.actor')::uuid) where endorsements=1 and endorsed) then raise exception 'Endorsement count incorrect';end if;
 begin perform public.community_endorse_skill(current_setting('test.actor')::uuid,'Invented skill',true);raise exception 'Unlisted skill allowed';exception when invalid_parameter_value then null;end;
end $$;
select public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',false);
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if public.community_profile(current_setting('test.actor')::uuid)->>'connections'<>'1' then raise exception 'Public connection count incorrect';end if;
 if public.community_profile(current_setting('test.actor')::uuid)->>'connection_requests' is not null then raise exception 'Private request count leaked';end if;
 if (select count(*) from public.community_network(current_setting('test.actor')::uuid))<>1 then raise exception 'Public network missing';end if;
 begin perform public.community_connection(current_setting('test.actor')::uuid,'request');raise exception 'Anonymous connection allowed';exception when insufficient_privilege then null;end;
 begin perform public.community_endorse_skill(current_setting('test.actor')::uuid,'Polymer Science',true);raise exception 'Anonymous endorsement allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
select public.community_connection(current_setting('test.actor')::uuid,'remove');
do $$ begin
 if public.community_profile(current_setting('test.actor')::uuid)->>'connections'<>'0' then raise exception 'Connection removal failed';end if;
end $$;
reset role;
rollback;
select 'Identity, connection consent/privacy/deduplication, endorsements and anonymous restrictions passed; rolled back.' as result;
