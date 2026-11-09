-- Imported user/consultant summaries can differ only by an expanded acronym.
create function public.community_education_title_key(value text) returns text
language plpgsql immutable strict parallel safe set search_path='' as $$
declare normalized text; expanded text; abbreviation text; initials text;
begin
 normalized:=lower(btrim(regexp_replace(value,'[[:space:]]+',' ','g')));
 abbreviation:=substring(normalized from ' \(([a-z.]{2,12})\)$');
 if abbreviation is not null then
  expanded:=regexp_replace(normalized,' \([a-z.]{2,12}\)$','');
  select string_agg(left(word,1),'' order by ordinal) into initials
   from regexp_split_to_table(expanded,'[^a-z]+') with ordinality words(word,ordinal)
   where word not in ('','of','in','and','the');
  if replace(abbreviation,'.','')=initials then normalized:=expanded; end if;
 end if;
 return normalized;
end $$;
revoke all on function public.community_education_title_key(text) from public;
grant execute on function public.community_education_title_key(text) to anon,authenticated,service_role;

-- Remove only redundant copies with identical details, retaining the fuller title.
delete from public.profile_entries duplicate using public.profile_entries retained
where duplicate.kind='education' and retained.kind='education'
 and duplicate.profile_id=retained.profile_id
 and public.community_education_title_key(duplicate.title)=public.community_education_title_key(retained.title)
 and lower(btrim(regexp_replace(duplicate.organization,'[[:space:]]+',' ','g')))=lower(btrim(regexp_replace(retained.organization,'[[:space:]]+',' ','g')))
 and (to_jsonb(duplicate)-array['id','created_at','title','organization'])=(to_jsonb(retained)-array['id','created_at','title','organization'])
 and (length(duplicate.title),duplicate.id)<(length(retained.title),retained.id);

-- A unique index also protects concurrent saves and legacy dashboard writes.
create unique index profile_education_unique on public.profile_entries (
 profile_id,
 (lower(btrim(regexp_replace(organization,'[[:space:]]+',' ','g')))),
 public.community_education_title_key(title),
 (lower(btrim(regexp_replace(field,'[[:space:]]+',' ','g')))),
 (coalesce(start_date,'-infinity'::date)),
 (coalesce(end_date,'infinity'::date))
) where kind='education';
