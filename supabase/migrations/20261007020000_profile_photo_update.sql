-- Photo-only writes reuse existing profile/consultant fields and preserve all other settings.
create function public.community_update_photo(p_kind text,p_value text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); updated public.profiles;
begin
 if actor is null then raise insufficient_privilege;end if;
 if p_kind='cover' then
  if p_value is not null and p_value !~ ('^'||actor::text||'/[a-f0-9-]{36}[.]webp$') then raise exception 'Invalid cover image' using errcode='22023';end if;
  update public.profiles set cover_path=p_value,updated_at=now() where id=actor returning * into updated;
 elsif p_kind='avatar' then
  if p_value is not null and p_value<>'' and (char_length(p_value)>2097152 or p_value !~ '^data:image/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$') then raise exception 'Invalid profile photo' using errcode='22023';end if;
  update public.profiles set avatar_url=coalesce(p_value,''),updated_at=now() where id=actor returning * into updated;
  if not found then raise exception 'Profile unavailable';end if;
  update public.consultants set avatar_url=coalesce(p_value,''),updated_at=now() where profile_id=actor;
 else raise exception 'Unknown photo type' using errcode='22023';end if;
 if updated.id is null then raise exception 'Profile unavailable';end if;
 return to_jsonb(updated);
end $$;
revoke all on function public.community_update_photo(text,text) from public;
grant execute on function public.community_update_photo(text,text) to authenticated;
