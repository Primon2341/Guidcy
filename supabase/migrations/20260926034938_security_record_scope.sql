do $$
declare definition text; old_check text:=$old$if tg_table_name='bookings' and new.meet_link is not null and new.meet_link<>'' and new.meet_link !~ '^https://meet[.]google[.]com/[a-z-]+$' then raise exception 'Invalid meeting link'; end if;$old$;
begin
 definition:=pg_get_functiondef('private.guidcy_guard_purchase()'::regprocedure);
 if position(old_check in definition)=0 then raise exception 'Expected booking link guard missing'; end if;
 execute replace(definition,old_check,$new$if tg_table_name='bookings' then
   if new.meet_link is not null and new.meet_link<>'' and new.meet_link !~ '^https://meet[.]google[.]com/[a-z-]+$' then raise exception 'Invalid meeting link'; end if;
 end if;$new$);
end $$;
