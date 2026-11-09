-- These are aliases for the same 60-minute video rate, not independent prices.
-- Move the existing default into the trigger so an omitted rate cannot conflict
-- with a caller supplying only video_price or price.
alter table public.consultants alter column rate drop default;

create function public.guidcy_sync_consultant_price() returns trigger
language plpgsql set search_path='' as $$
declare values_to_save numeric[]; amount numeric;
begin
 if tg_op='INSERT' then
  values_to_save:=array_remove(array[new.rate::numeric,new.price,new.video_price::numeric],null);
  if cardinality(values_to_save)=0 then values_to_save:=array[2000::numeric]; end if;
 else
  values_to_save:=array[]::numeric[];
  if new.rate is distinct from old.rate then values_to_save:=array_append(values_to_save,new.rate::numeric); end if;
  if new.price is distinct from old.price then values_to_save:=array_append(values_to_save,new.price); end if;
  if new.video_price is distinct from old.video_price then values_to_save:=array_append(values_to_save,new.video_price::numeric); end if;
  if cardinality(values_to_save)=0 then return new; end if;
 end if;
 amount:=values_to_save[1];
 if exists(select 1 from unnest(values_to_save) v where v is null or v<0 or v>2147483647 or v<>trunc(v)) then
  raise exception 'Enter a non-negative whole-rupee session price; use 0 for a free session.' using errcode='23514';
 end if;
 if exists(select 1 from unnest(values_to_save) v where v is distinct from amount) then
  raise exception 'Conflicting session prices. Save one consistent video rate.' using errcode='23514';
 end if;
 new.rate:=amount; new.price:=amount; new.video_price:=amount;
 return new;
end $$;
revoke all on function public.guidcy_sync_consultant_price() from public,anon,authenticated;
create trigger z_consultant_price_sync before insert or update of rate,price,video_price on public.consultants
 for each row execute function public.guidcy_sync_consultant_price();

-- Fill missing aliases only when all existing amounts already agree.
update public.consultants c
set rate=coalesce(c.video_price,c.rate,c.price),price=coalesce(c.video_price,c.rate,c.price),video_price=coalesce(c.video_price,c.rate,c.price)
where (c.rate is null or c.price is null or c.video_price is null)
 and (select count(distinct v) from unnest(array[c.rate::numeric,c.price,c.video_price::numeric]) v)=1;
