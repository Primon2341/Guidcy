-- The owner confirmed this support mailbox belongs to a consultant account.
-- Revoke the mistaken administrator provisioning without altering consultant data.
delete from private.guidcy_admins a
using auth.users u
where a.user_id=u.id and lower(u.email)='guidcytechnologies@gmail.com';

update public.profiles p set role='consultant'
from auth.users u
where p.id=u.id and lower(u.email)='guidcytechnologies@gmail.com';

do $$ begin
  if exists(select 1 from private.guidcy_admins a join auth.users u on u.id=a.user_id
    where lower(u.email)='guidcytechnologies@gmail.com') then
    raise exception 'Consultant account must not retain administrator membership';
  end if;
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    join public.consultants c on c.profile_id=p.id
    where lower(u.email)='guidcytechnologies@gmail.com' and p.role='consultant') then
    raise exception 'Expected consultant profile is missing';
  end if;
end $$;
