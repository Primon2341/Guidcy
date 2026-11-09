begin;
select set_config('test.speaker',(select p.id::text from public.profiles p join public.consultants c on c.profile_id=p.id where c.is_active and c.is_approved order by p.id limit 1),true);
select set_config('test.host',(select id::text from public.profiles where id::text<>current_setting('test.speaker') order by id limit 1),true);
select set_config('test.event','portfolio-check-'||gen_random_uuid()::text,true);
insert into public.webinars(id,title,description,speaker,created_by,seats,date,time,meet_link,publisher_email)
values(current_setting('test.event'),'Transactional speaker appearance','Public event details',public.community_profile(current_setting('test.speaker')::uuid)->>'name',current_setting('test.host')::uuid,10,'2099-01-01','12:00','PRIVATE_LINK','private@example.com');
select set_config('request.jwt.claim.sub',current_setting('test.speaker'),true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.community_featureable_webinars() where id=current_setting('test.event')) then raise exception 'Existing named speaker cannot feature appearance';end if;
 insert into public.profile_featured(profile_id,webinar_id) values(auth.uid(),current_setting('test.event'));
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ declare featured jsonb;begin
 featured:=public.community_featured(current_setting('test.speaker')::uuid);
 if featured::text not like '%Transactional speaker appearance%' then raise exception 'Speaker appearance missing from public profile';end if;
 if featured::text like '%PRIVATE_LINK%' or featured::text like '%private@example.com%' then raise exception 'Webinar private details leaked';end if;
end $$;
reset role;
rollback;
select 'Existing webinar host/speaker matching and public projection passed; test writes rolled back.' result;
