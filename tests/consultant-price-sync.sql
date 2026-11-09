begin;
do $$
declare c public.consultants; field text; invalid numeric;
begin
 insert into public.consultants(name,video_price) values('Price regression fixture',499) returning * into c;
 if c.rate<>499 or c.price<>499 or c.video_price<>499 then raise exception 'Insert aliases disagree'; end if;
 foreach field in array array['rate','price','video_price'] loop
  execute format('update public.consultants set %I=0 where id=$1 returning *',field) into c using c.id;
  if c.rate<>0 or c.price<>0 or c.video_price<>0 then raise exception 'Free price not synchronized'; end if;
  execute format('update public.consultants set %I=499 where id=$1 returning *',field) into c using c.id;
  if c.rate<>499 or c.price<>499 or c.video_price<>499 then raise exception 'Paid price not synchronized'; end if;
 end loop;
 begin
  update public.consultants set rate=600,video_price=1 where id=c.id;
  raise exception 'Conflicting amounts accepted';
 exception when check_violation then null; end;
 foreach invalid in array array[-1::numeric,0.5,2147483648,'NaN'::numeric,null] loop
  begin
   update public.consultants set price=invalid where id=c.id;
   raise exception 'Invalid price accepted: %',invalid;
  exception when check_violation then null; end;
 end loop;
 update public.consultants set bio='Unrelated edit',audio_price=123,chat_price=45 where id=c.id returning * into c;
 if c.rate<>499 or c.video_price<>499 or c.price<>499 or c.audio_price<>123 or c.chat_price<>45 then raise exception 'Independent fields changed'; end if;
 update public.consultants set price=1 where id=c.id returning * into c;
 if c.rate<>1 or c.video_price<>1 then raise exception 'Intentional one-rupee rate rejected'; end if;
 insert into public.consultants(name) values('Default price fixture') returning * into c;
 if c.rate<>2000 or c.price<>2000 or c.video_price<>2000 then raise exception 'Legacy default lost'; end if;
 begin
  insert into public.consultants(name,rate,video_price) values('Conflicting fixture',499,1);
  raise exception 'Conflicting insert accepted';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select profile_id::text from public.consultants where profile_id is not null and is_active and is_approved order by id limit 1),true);
set local role authenticated;
update public.consultants set video_price=750 where profile_id=auth.uid();
do $$ begin
 if not exists(select 1 from public.consultants where profile_id=auth.uid() and rate=750 and price=750 and video_price=750) then raise exception 'Owner price update failed';end if;
end $$;
rollback;
