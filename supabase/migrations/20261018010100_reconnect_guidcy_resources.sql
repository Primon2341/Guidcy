-- User confirmed the Prakhar Tripathi consultant was renamed Guidcy Technologies.
-- Resolve the existing records using both the current identity and booking history.
-- Keep original uploader IDs, storage paths, orders, prices and removal states.
do $$
declare publisher uuid; consultant uuid; display_name text; affected integer;
begin
 select id into strict publisher from public.profiles
 where full_name='Prakhar Tripathi' and role='admin';
 select c.id,c.name into strict consultant,display_name from public.consultants c
 join public.profiles p on p.id=c.profile_id
 where c.name='Guidcy Technologies' and p.full_name=c.name
 and exists(select 1 from public.bookings b where b.consultant_id=c.id and b.consultant_name='Prakhar Tripathi');
 update public.marketplace_notes set profile_consultant_id=consultant,uploader_name=display_name,updated_at=now()
 where uploader_id=publisher and uploader_name='Prakhar Tripathi' and status='active' and removed_at is null
 and profile_consultant_id is null;
 get diagnostics affected=row_count;
 if affected<>4 then raise exception 'Expected four confirmed legacy resources, found %',affected;end if;
end $$;
-- Rollback in a forward data migration: clear profile_consultant_id and restore
-- uploader_name='Prakhar Tripathi' for these four still-linked legacy listings,
-- resolving the same publisher/consultant as above and checking the affected count.
