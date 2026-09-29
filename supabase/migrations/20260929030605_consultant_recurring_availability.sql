begin;
-- Null keeps the existing dated/legacy availability behavior until an owner saves.
alter table public.consultants add column recurring_availability jsonb;
create function public.guidcy_valid_recurring_availability(rule jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare start_minutes integer; end_minutes integer;
begin
  if rule is null then return true; end if;
  if jsonb_typeof(rule)<>'object' or not(rule ?& array['enabled','days','start','end','interval']) then return false; end if;
  if jsonb_typeof(rule->'enabled')<>'boolean' or jsonb_typeof(rule->'days')<>'array' or jsonb_typeof(rule->'start')<>'string' or jsonb_typeof(rule->'end')<>'string' then return false; end if;
  if jsonb_array_length(rule->'days')>7 or exists(select 1 from jsonb_array_elements(rule->'days') d where d::text !~ '^[0-6]$') then return false; end if;
  if (select count(*)<>count(distinct d) from jsonb_array_elements(rule->'days') d) then return false; end if;
  if (rule->>'start')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (rule->>'end')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or rule->'interval' not in ('30'::jsonb,'60'::jsonb) then return false; end if;
  start_minutes:=split_part(rule->>'start',':',1)::integer*60+split_part(rule->>'start',':',2)::integer;
  end_minutes:=split_part(rule->>'end',':',1)::integer*60+split_part(rule->>'end',':',2)::integer;
  return end_minutes>start_minutes and (not (rule->>'enabled')::boolean or (jsonb_array_length(rule->'days')>0 and end_minutes-start_minutes>=30));
end $$;
revoke all on function public.guidcy_valid_recurring_availability(jsonb) from public;
grant execute on function public.guidcy_valid_recurring_availability(jsonb) to anon,authenticated,service_role;
alter table public.consultants add constraint consultant_recurring_availability_valid check (public.guidcy_valid_recurring_availability(recurring_availability));
-- Retain the existing masked directory and its ownership/approval filtering.
create or replace view public.guidcy_consultants with(security_invoker=true,security_barrier=true) as select * from private.guidcy_consultants_rows();
grant select on public.guidcy_consultants to anon,authenticated,service_role;
comment on column public.consultants.recurring_availability is 'IST weekly hours: enabled, days (0=Sunday), start/end HH:MM, interval 30/60. Dated availability_map entries override recurrence; [] blocks a date.';
notify pgrst, 'reload schema';
commit;
