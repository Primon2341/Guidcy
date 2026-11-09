begin;
select set_config('request.jwt.claim.sub',(select profile_id::text from public.consultants where profile_id is not null and is_active and is_approved order by id limit 1),true);
set local role authenticated;
delete from public.profile_entries where profile_id=auth.uid() and kind='education';
insert into public.profile_entries(profile_id,kind,title,organization) values(auth.uid(),'education','Bachelor of Dental Surgery (BDS)','Test Dental College');
do $$
declare degree text; entry_id uuid;
begin
 foreach degree in array array['Bachelor of Dental Surgery',' bachelor  of dental surgery (b.d.s.) ','Bachelor of Dental Surgery (BDS)'] loop
  begin
   insert into public.profile_entries(profile_id,kind,title,organization) values(auth.uid(),'education',degree,' TEST  DENTAL COLLEGE ');
   raise exception 'Duplicate education accepted: %',degree;
  exception when unique_violation then null; end;
 end loop;
 -- Different qualifications, specializations and attendance dates remain valid.
 insert into public.profile_entries(profile_id,kind,title,organization) values(auth.uid(),'education','Master of Dental Surgery','Test Dental College') returning id into entry_id;
 begin
  update public.profile_entries set title='Bachelor of Dental Surgery' where id=entry_id;
  raise exception 'Edit created duplicate education';
 exception when unique_violation then null; end;
 insert into public.profile_entries(profile_id,kind,title,organization,start_date) values(auth.uid(),'education','Bachelor of Dental Surgery','Test Dental College','2020-01-01');
 insert into public.profile_entries(profile_id,kind,title,organization,field) values(auth.uid(),'education','Bachelor of Dental Surgery','Test Dental College','Another specialization');
 insert into public.profile_entries(profile_id,kind,title,organization) values(auth.uid(),'education','Bachelor of Dental Surgery (Honours)','Test Dental College');
 if (select count(*) from public.profile_entries where profile_id=auth.uid() and kind='education')<>5 then raise exception 'Distinct qualifications were lost';end if;
 -- Existing summary editors update the current record rather than inserting a copy.
 update public.profiles set highest_education='Bachelor of Dental Surgery (BDS)',college='Test Dental College' where id=auth.uid();
 if (select count(*) from public.profile_entries where profile_id=auth.uid() and kind='education')<>5 then raise exception 'Legacy editor duplicated education';end if;
end $$;
rollback;
