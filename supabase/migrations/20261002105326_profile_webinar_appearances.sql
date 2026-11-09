-- Reuse the existing host/speaker fields; never expose registration or payment data.
create or replace function public.community_portfolio_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Serialize owner inserts to enforce bounded profile payloads even under concurrency.
 perform 1 from public.profiles where id=new.profile_id for update;
 if tg_table_name='profile_entries' then
  if (select count(*) from public.profile_entries where profile_id=new.profile_id)>=100 then raise exception 'A profile can contain up to 100 portfolio entries';end if;
 else
  if (select count(*) from public.profile_featured where profile_id=new.profile_id)>=8 then raise exception 'Feature up to eight items';end if;
  if not (
   exists(select 1 from public.community_posts where id=new.post_id and author_id=new.profile_id) or
   exists(select 1 from public.marketplace_notes where id=new.resource_id and uploader_id=new.profile_id and status='active' and removed_at is null) or
   exists(select 1 from public.profile_entries where id=new.entry_id and profile_id=new.profile_id and kind in ('project','achievement','publication','award','patent','certification')) or
   exists(select 1 from public.webinars where id=new.webinar_id and (created_by=new.profile_id or (btrim(speaker)<>'' and lower(btrim(speaker))=lower(btrim(public.community_profile(new.profile_id)->>'name')))))
  ) then raise exception 'Choose an item belonging to your profile' using errcode='42501';end if;
 end if;
 return new;
end $$;

create or replace function public.community_featured(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by created_at desc,id),'[]'::jsonb) from (
 select f.id,f.created_at,jsonb_build_object('id',f.id,'post_id',p.id,'resource_id',n.id,'entry_id',e.id,'webinar_id',w.id,
 'kind',case when p.id is not null then 'Post' when n.id is not null then 'Resource' when e.id is not null then initcap(e.kind) else 'Webinar' end,
 'title',coalesce(left(p.body,180),n.title,e.title,w.title),'description',coalesce(n.description,e.description,w.description,''),
 'price',n.price,'is_free',n.is_free,'image',n.thumbnail_url,'url',e.url) item
 from public.profile_featured f
 left join public.community_posts p on p.id=f.post_id and p.author_id=f.profile_id
 left join public.marketplace_notes n on n.id=f.resource_id and n.uploader_id=f.profile_id and n.status='active' and n.removed_at is null
 left join public.profile_entries e on e.id=f.entry_id and e.profile_id=f.profile_id
 left join public.webinars w on w.id=f.webinar_id and (w.created_by=f.profile_id or (btrim(w.speaker)<>'' and lower(btrim(w.speaker))=lower(btrim(public.community_profile(f.profile_id)->>'name'))))
 where f.profile_id=p_id and coalesce(p.id::text,n.id::text,e.id::text,w.id) is not null
 order by f.created_at desc,f.id limit 8
 ) visible
$$;

create function public.community_featureable_webinars(p_before text default null)
returns table(id text,title text,speaker text) language sql stable security definer set search_path='' as $$
 select w.id,w.title,w.speaker from public.webinars w
 where auth.uid() is not null and (p_before is null or w.id>p_before)
 and (w.created_by=auth.uid() or (btrim(w.speaker)<>'' and lower(btrim(w.speaker))=lower(btrim(public.community_profile(auth.uid())->>'name'))))
 order by w.id limit 21
$$;
revoke all on function public.community_featureable_webinars(text) from public;
grant execute on function public.community_featureable_webinars(text) to authenticated;
