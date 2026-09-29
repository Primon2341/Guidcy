begin;
create or replace function public.guidcy_valid_recurring_availability(rule jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare start_minutes integer; end_minutes integer; hours jsonb;
begin
  if rule is null then return true; end if;
  -- New schedules store Sunday through Saturday; null means unavailable.
  if rule ? 'weekly' then
    if jsonb_typeof(rule) is distinct from 'object' or jsonb_typeof(rule->'enabled') is distinct from 'boolean' or not coalesce(rule->'interval' in ('30'::jsonb,'60'::jsonb),false) then return false; end if;
    if jsonb_typeof(rule->'weekly') is distinct from 'array' then return false; end if;
    if jsonb_array_length(rule->'weekly')<>7 then return false; end if;
    for hours in select value from jsonb_array_elements(rule->'weekly') loop
      if hours='null'::jsonb then continue; end if;
      if jsonb_typeof(hours) is distinct from 'object' or jsonb_typeof(hours->'start') is distinct from 'string' or jsonb_typeof(hours->'end') is distinct from 'string' then return false; end if;
      if (hours->>'start')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (hours->>'end')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
      start_minutes:=split_part(hours->>'start',':',1)::integer*60+split_part(hours->>'start',':',2)::integer;
      end_minutes:=split_part(hours->>'end',':',1)::integer*60+split_part(hours->>'end',':',2)::integer;
      if end_minutes-start_minutes<30 then return false; end if;
    end loop;
    return true;
  end if;
  -- Continue accepting the original shared-hours format without rewriting data.
  if jsonb_typeof(rule)<>'object' or not(rule ?& array['enabled','days','start','end','interval']) then return false; end if;
  if jsonb_typeof(rule->'enabled')<>'boolean' or jsonb_typeof(rule->'days')<>'array' or jsonb_typeof(rule->'start')<>'string' or jsonb_typeof(rule->'end')<>'string' then return false; end if;
  if jsonb_array_length(rule->'days')>7 or exists(select 1 from jsonb_array_elements(rule->'days') d where d::text !~ '^[0-6]$') then return false; end if;
  if (select count(*)<>count(distinct d) from jsonb_array_elements(rule->'days') d) then return false; end if;
  if (rule->>'start')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (rule->>'end')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or rule->'interval' not in ('30'::jsonb,'60'::jsonb) then return false; end if;
  start_minutes:=split_part(rule->>'start',':',1)::integer*60+split_part(rule->>'start',':',2)::integer;
  end_minutes:=split_part(rule->>'end',':',1)::integer*60+split_part(rule->>'end',':',2)::integer;
  return end_minutes>start_minutes and (not (rule->>'enabled')::boolean or (jsonb_array_length(rule->'days')>0 and end_minutes-start_minutes>=30));
end $$;
alter table public.consultants drop constraint consultant_recurring_availability_valid;
alter table public.consultants add constraint consultant_recurring_availability_valid check (public.guidcy_valid_recurring_availability(recurring_availability));
comment on column public.consultants.recurring_availability is 'IST weekly hours: enabled, interval 30/60, weekly array Sunday-Saturday of {start,end} HH:MM or null (unavailable). Legacy days/start/end rules remain supported. Dated availability_map entries override recurrence; [] blocks a date.';
commit;
