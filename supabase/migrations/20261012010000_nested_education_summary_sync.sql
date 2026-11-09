-- Legacy dashboard edits reach entries at trigger depth 2. Their summaries must still sync.
-- The legacy-education trigger already stops recursive writes to entries.
-- Rollback: restore the prior function in a forward migration; no schema/data is removed.
create or replace function public.community_sync_education_entry() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid; chosen public.profile_entries;
begin
 if coalesce(new.kind,'')<>'education' and coalesce(old.kind,'')<>'education' then return null;end if;
 owner:=coalesce(new.profile_id,old.profile_id);
 perform 1 from public.profiles where id=owner for update;
 select * into chosen from public.profile_entries where profile_id=owner and kind='education' order by start_date desc nulls last,created_at desc,id desc limit 1;
 update public.profiles set college=coalesce(chosen.organization,''),highest_education=coalesce(chosen.title,''),education=coalesce(chosen.title,'') where id=owner;
 update public.consultants set college=coalesce(chosen.organization,''),highest_education=coalesce(chosen.title,''),education=coalesce(chosen.title,'') where profile_id=owner;
 return null;
end $$;
revoke all on function public.community_sync_education_entry() from public,anon,authenticated;
