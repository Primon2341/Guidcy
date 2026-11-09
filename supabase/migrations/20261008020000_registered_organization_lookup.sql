-- Reuse public consultant identities alongside curated organization metadata.
-- Selection saves the official name in existing profile/experience/education fields.
create index consultants_organization_name_lookup on public.consultants
 ((lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g')))) text_pattern_ops)
 where is_active and is_approved and approval_status='approved' and not coalesce(profile_update_required,false);

create function public.community_organization_matches(p_kind text,p_query text default null,p_names text[] default null)
returns table(id uuid,kind text,name text,name_key text,logo_url text,source text)
language sql stable security definer set search_path='' as $$
 with input as (
  select lower(btrim(regexp_replace(left(coalesce(p_query,''),160),'[[:space:]]+',' ','g'))) as term,
   array(select lower(btrim(regexp_replace(left(n,160),'[[:space:]]+',' ','g'))) from unnest(p_names[1:150]) n) as names
 ), candidates as (
  select o.id,o.kind,o.name,o.name_key,o.logo_url,'directory'::text as source
  from public.community_organizations o cross join input i
  where p_kind in ('company','college') and o.kind=p_kind and o.is_approved
   and case when p_names is not null then o.name_key=any(i.names)
    else length(i.term)>=2 and position(i.term in o.name_key)>0 end
  union all
  select c.id,p_kind,c.name,lower(btrim(regexp_replace(c.name,'[[:space:]]+',' ','g'))),coalesce(c.avatar_url,''),'consultant'
  from public.consultants c cross join input i
  where p_kind in ('company','college') and c.is_active and c.is_approved and c.approval_status='approved' and not coalesce(c.profile_update_required,false)
   and length(btrim(c.name)) between 1 and 160
   and case when p_names is not null then lower(btrim(regexp_replace(c.name,'[[:space:]]+',' ','g')))=any(i.names)
    else length(i.term)>=2 and position(i.term in lower(btrim(regexp_replace(c.name,'[[:space:]]+',' ','g'))))>0 end
   -- A curated name (including one hidden by an admin) takes precedence.
   and not exists(select 1 from public.community_organizations o where o.kind=p_kind and o.name_key=lower(btrim(regexp_replace(c.name,'[[:space:]]+',' ','g'))))
 ), unique_names as (
  select c.*,count(*) over(partition by c.name_key) as matches from candidates c
 )
 select c.id,c.kind,c.name,c.name_key,c.logo_url,c.source from unique_names c cross join input i
 -- Never arbitrarily attach one of several accounts sharing the same name.
 where c.matches=1
 order by case when c.name_key=i.term then 0 when starts_with(c.name_key,i.term) then 1 else 2 end,length(c.name_key),c.name_key,c.id
 limit case when p_names is not null then 150 else 8 end
$$;
revoke all on function public.community_organization_matches(text,text,text[]) from public;
grant execute on function public.community_organization_matches(text,text,text[]) to anon,authenticated;
