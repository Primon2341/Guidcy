-- Extend the existing profile, without replacing its identity or permissions.
alter table public.profiles add column cover_path text;
alter table public.profiles add column bio text not null default '';
alter table public.profiles add constraint profiles_community_cover_path check(cover_path is null or cover_path ~ ('^'||id::text||'/[a-f0-9-]{36}\.webp$'));
alter table public.profiles add constraint profiles_community_bio_length check(char_length(bio)<=2000);

create function public.community_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(person)||jsonb_build_object('cover_path',p.cover_path,'bio',coalesce(nullif(p.bio,''),c.bio,''),'city',coalesce(p.city,''),'education',coalesce(nullif(c.highest_education,''),nullif(p.highest_education,''),p.education,''))
 from public.community_people(array[p_id]) person join public.profiles p on p.id=person.id
 left join public.consultants c on c.id=person.consultant_id
$$;
revoke all on function public.community_profile(uuid) from public;
grant execute on function public.community_profile(uuid) to anon,authenticated;

create function public.community_update_profile(p_name text,p_headline text,p_bio text,p_cover text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to edit your profile' using errcode='42501';end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or p_headline is null or char_length(p_headline)>180 or p_bio is null or char_length(p_bio)>2000 then raise exception 'Check the name, headline and bio lengths' using errcode='22023';end if;
 if p_cover is not null and p_cover !~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}\.webp$') then raise exception 'Invalid cover image' using errcode='22023';end if;
 update public.profiles set full_name=btrim(p_name),current_position=btrim(p_headline),bio=btrim(p_bio),cover_path=p_cover,updated_at=now() where id=auth.uid();
 if not found then raise exception 'Profile unavailable';end if;
 update public.consultants set name=btrim(p_name),current_position=btrim(p_headline),bio=btrim(p_bio),updated_at=now() where profile_id=auth.uid();
end $$;
revoke all on function public.community_update_profile(text,text,text,text) from public;
grant execute on function public.community_update_profile(text,text,text,text) to authenticated;

-- Minimal private messaging between existing members. No separate account or conversation store.
create table public.community_messages (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 check(sender_id<>recipient_id)
);
create index community_messages_sender on public.community_messages(sender_id,created_at desc,id desc);
create index community_messages_recipient on public.community_messages(recipient_id,created_at desc,id desc);
alter table public.community_messages enable row level security;
create policy participants_read on public.community_messages for select to authenticated using((select auth.uid()) in (sender_id,recipient_id));
create policy sender_insert on public.community_messages for insert to authenticated with check(sender_id=(select auth.uid()));
revoke all on public.community_messages from anon,authenticated;
grant select on public.community_messages to authenticated;
grant insert(sender_id,recipient_id,body) on public.community_messages to authenticated;
