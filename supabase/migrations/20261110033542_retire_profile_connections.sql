-- Retire connection APIs; preserve historical records without public access.
create or replace function public.community_profile(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object(
 'cover_path',p.cover_path,'bio',coalesce(c.bio,p.bio,''),
 'city',case when p.show_location or p.id=auth.uid() then coalesce(p.city,'') else '' end,
 'show_location',p.show_location,'pronouns',p.pronouns,
 'website_url',case when p.website_public or p.id=auth.uid() then p.website_url else '' end,
 'website_public',p.website_public,
 'education',coalesce((select e.title from public.profile_entries e where e.profile_id=p.id and e.kind='education' order by e.start_date desc nulls last,e.created_at desc,e.id desc limit 1),''),
 'company_experience',coalesce(c.company_experience,p.company_experience,'[]'),
 'skills',case when c.id is not null then coalesce(c.tags,'{}'::text[]) else p.skills end,
 'review_count',(select count(*) from public.reviews r where r.consultant_id=c.id and r.is_published),
 'rating',(select round(avg(r.rating),1) from public.reviews r where r.consultant_id=c.id and r.is_published))
 from public.community_people(array[p_id]) person join public.profiles p on p.id=person.id
 left join public.consultants c on c.id=person.consultant_id
$$;

drop function if exists public.community_connection(uuid,text);
drop function if exists public.community_network(uuid,boolean,uuid);
revoke all privileges on table public.community_connections from public,anon,authenticated;
notify pgrst,'reload schema';
