-- Repair only confirmed deletion: empty profile summary and no remaining education entries.
-- Irreversible repair of obsolete display copies; no education entries are deleted.
update public.consultants c
set highest_education='',education='',college='',updated_at=now()
from public.profiles p
where p.id=c.profile_id and p.highest_education='' and p.college=''
  and coalesce(p.education,'')=''
  and not exists(select 1 from public.profile_entries e where e.profile_id=p.id and e.kind='education')
  and (coalesce(c.highest_education,'')<>'' or coalesce(c.education,'')<>'' or coalesce(c.college,'')<>'');
