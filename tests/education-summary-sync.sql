begin;
select set_config('request.jwt.claim.sub',(select profile_id::text from public.consultants where profile_id is not null and is_active and is_approved and approval_status='approved' order by id limit 1),true);
set local role authenticated;
delete from public.profile_entries where profile_id=auth.uid() and kind='education';
-- Both old dashboard editors must update the portfolio and BOTH display copies.
update public.profiles set highest_education='Profile degree',college='Profile college' where id=auth.uid();
do $$ begin
 if not exists(select 1 from public.consultants where profile_id=auth.uid() and highest_education='Profile degree' and education='Profile degree' and college='Profile college') then raise exception 'Profile editor left stale consultant education';end if;
end $$;
update public.consultants set highest_education='Consultant degree',college='Consultant college' where profile_id=auth.uid();
do $$ begin
 if not exists(select 1 from public.profiles where id=auth.uid() and highest_education='Consultant degree' and education='Consultant degree' and college='Consultant college') then raise exception 'Consultant editor left stale profile education';end if;
 if public.community_profile(auth.uid())->>'college'<>'Consultant college' then raise exception 'Public profile differs from expert card';end if;
end $$;
update public.profiles set highest_education='',college='' where id=auth.uid();
do $$ begin
 if exists(select 1 from public.consultants where profile_id=auth.uid() and (coalesce(highest_education,'')<>'' or coalesce(education,'')<>'' or coalesce(college,'')<>'')) then raise exception 'Deleted education remains on expert card';end if;
 if exists(select 1 from public.profile_entries where profile_id=auth.uid() and kind='education') then raise exception 'Deleted education entry remains';end if;
end $$;
-- Deleting the latest education preserves another qualification, then clears the last one.
insert into public.profile_entries(profile_id,kind,title,organization,start_date) values
(auth.uid(),'education','Earlier degree','Earlier college','2010-01-01'),
(auth.uid(),'education','Latest degree','Latest college','2020-01-01');
update public.consultants set highest_education='',college='' where profile_id=auth.uid();
do $$ begin
 if not exists(select 1 from public.consultants where profile_id=auth.uid() and highest_education='Earlier degree' and college='Earlier college') then raise exception 'Remaining qualification lost';end if;
 if public.community_profile(auth.uid())->>'college'<>'Earlier college' then raise exception 'Remaining public qualification differs';end if;
end $$;
delete from public.profile_entries where profile_id=auth.uid() and kind='education';
do $$ begin
 if exists(select 1 from public.profiles where id=auth.uid() and (coalesce(highest_education,'')<>'' or coalesce(education,'')<>'' or coalesce(college,'')<>'')) then raise exception 'Entry deletion left stale profile education';end if;
 if exists(select 1 from public.consultants where profile_id=auth.uid() and (coalesce(highest_education,'')<>'' or coalesce(education,'')<>'' or coalesce(college,'')<>'')) then raise exception 'Entry deletion left stale consultant education';end if;
end $$;
reset role;
rollback;
select 'Both dashboard editors and portfolio deletion keep education summaries synchronized; rolled back.' as result;
