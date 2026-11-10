-- Run after the retirement migration. This test does not change application data.
begin;
do $$
declare viewer record; profile jsonb; privilege text;
begin
 if to_regprocedure('public.community_connection(uuid,text)') is not null
 or to_regprocedure('public.community_network(uuid,boolean,uuid)') is not null
 then raise exception 'Connection APIs remain available';end if;
 if has_any_column_privilege('anon','public.community_connections','SELECT')
 or has_any_column_privilege('authenticated','public.community_connections','SELECT')
 or has_table_privilege('authenticated','public.community_connections','INSERT,UPDATE,DELETE')
 then raise exception 'Connection records remain accessible';end if;
 for viewer in select id from public.community_people(null) limit 3 loop
  profile:=public.community_profile(viewer.id);
  if profile ?| array['connections','connection_status','connection_requests']
  then raise exception 'Connection metadata remains public';end if;
  if not (profile ?& array['id','followers','following','is_following','consultant_id','company_experience'])
  then raise exception 'Existing profile/follow fields are missing';end if;
 end loop;
 foreach privilege in array array['SELECT','DELETE'] loop
  if not has_table_privilege('authenticated','public.community_follows',privilege)
  then raise exception 'Following permissions changed: %',privilege;end if;
 end loop;
 if not has_column_privilege('authenticated','public.community_follows','follower_id','INSERT')
 or not has_column_privilege('authenticated','public.community_follows','following_id','INSERT')
 then raise exception 'Following insert permissions changed';end if;
end $$;
rollback;
select 'Connection APIs retired; public profiles and Follow preserved.' as result;
