-- Read/write permission checks with existing identities; rollback leaves no test data.
begin;
select set_config('test.owner',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.recipient',(select id::text from public.profiles where id::text<>current_setting('test.owner') order by id limit 1),true);
select set_config('test.outsider',(select id::text from public.profiles where id::text not in(current_setting('test.owner'),current_setting('test.recipient')) order by id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
select public.community_update_profile('Transactional test member','Optical fiber researcher','A brief professional bio.',auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.webp');
insert into public.community_messages(sender_id,recipient_id,body) values(auth.uid(),current_setting('test.recipient')::uuid,'Transactional private message');
do $$ begin
 if (public.community_profile(auth.uid())->>'bio')<>'A brief professional bio.' then raise exception 'Bio did not save';end if;
 if (public.community_profile(auth.uid())->>'cover_path') is null then raise exception 'Cover did not save';end if;
 if public.community_profile(auth.uid()) ?| array['email','phone','bank_account','refund_account_number'] then raise exception 'Public profile leaked private data';end if;
 begin perform public.community_update_profile('Test','Headline','Bio',current_setting('test.recipient')||'/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.webp');raise exception 'Cross-owner cover accepted';exception when invalid_parameter_value then null;end;
 begin insert into public.community_messages(sender_id,recipient_id,body) values(current_setting('test.recipient')::uuid,auth.uid(),'Spoofed sender');raise exception 'Spoofed sender allowed';exception when insufficient_privilege then null;end;
 begin insert into public.community_messages(sender_id,recipient_id,body) values(auth.uid(),current_setting('test.recipient')::uuid,repeat('a',2001));raise exception 'Oversized message accepted';exception when check_violation then null;end;
 begin update public.community_messages set body='Tampered';raise exception 'Message edit allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.recipient'),true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.community_messages where sender_id=current_setting('test.owner')::uuid and recipient_id=auth.uid() and body='Transactional private message') then raise exception 'Recipient cannot read message';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.outsider'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.community_messages where sender_id=current_setting('test.owner')::uuid and recipient_id=current_setting('test.recipient')::uuid) then raise exception 'Third-party message leak';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if (public.community_profile(current_setting('test.owner')::uuid)->>'bio') is null then raise exception 'Public profile unavailable';end if;
 begin perform public.community_update_profile('Anonymous','Test','Test',null);raise exception 'Anonymous profile write allowed';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.community_messages;raise exception 'Anonymous message read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Profile cover, owner update and private messaging permissions passed; all test changes rolled back.' as result;
