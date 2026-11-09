-- Expert cards and professional profiles must agree, including explicit deletion.
create function public.community_sync_company_display() returns trigger
language plpgsql security definer set search_path='' as $$
declare company text;
begin
 if tg_op='INSERT' then
  company:=coalesce(new.current_company,new.current_company_college,'');
 elsif new.current_company_college is distinct from old.current_company_college
  and (new.current_company is not distinct from old.current_company or new.current_company is null) then
  -- Older dashboard editors may write only the combined display field.
  company:=coalesce(new.current_company_college,'');
 elsif new.current_company is distinct from old.current_company then
  company:=coalesce(new.current_company,'');
 else
  company:=coalesce(new.current_company,new.current_company_college,'');
 end if;
 new.current_company:=btrim(company);
 new.current_company_college:=new.current_company;
 new.current_company_normalized:=nullif(btrim(regexp_replace(regexp_replace(regexp_replace(lower(replace(new.current_company,'&',' and ')),'[^a-z0-9[:space:]]',' ','g'),'\m(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|company|co|technologies|technology|tech|india|services|solutions|systems|system|group|global)\M','','g'),'[[:space:]]+',' ','g')),'');
 return new;
end $$;
revoke all on function public.community_sync_company_display() from public,anon,authenticated;
-- Run after the existing current-experience trigger has selected/cleared the company.
create trigger z_company_display_sync before insert or update of current_company,current_company_college,company_experience on public.profiles
 for each row execute function public.community_sync_company_display();
create trigger z_company_display_sync before insert or update of current_company,current_company_college,company_experience on public.consultants
 for each row execute function public.community_sync_company_display();
