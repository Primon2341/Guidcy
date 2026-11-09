-- A legacy publisher may upload through an admin account for an existing consultant.
-- Attribution affects profile discovery only; uploader_id still owns files and sales.
alter table public.marketplace_notes add column profile_consultant_id uuid
 references public.consultants(id) on delete set null;
create index marketplace_notes_profile_consultant on public.marketplace_notes(profile_consultant_id,created_at desc,id desc)
 where status='active' and removed_at is null;

-- Keep attribution administrator-controlled, like the existing uploader identity.
do $$
declare definition text;
begin
 select pg_get_functiondef('private.guidcy_guard_listing()'::regprocedure) into definition;
 if position('new.uploader_id:=auth.uid();new.removed_at' in definition)=0
 or position('(new.id,new.uploader_id) is distinct from (old.id,old.uploader_id)' in definition)=0 then
  raise exception 'Listing guard changed; review attribution protection before applying';
 end if;
 definition:=replace(definition,'new.uploader_id:=auth.uid();new.removed_at','new.uploader_id:=auth.uid();new.profile_consultant_id:=null;new.removed_at');
 definition:=replace(definition,'(new.id,new.uploader_id) is distinct from (old.id,old.uploader_id)',
 '(new.id,new.uploader_id,new.profile_consultant_id) is distinct from (old.id,old.uploader_id,old.profile_consultant_id)');
 execute definition;
end $$;
-- Rollback in a forward migration: first remove the two profile_consultant_id
-- references from guidcy_guard_listing(), then drop this column (and its index).
