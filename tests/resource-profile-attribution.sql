begin;
do $$
declare publisher uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); expert uuid:=gen_random_uuid(); note uuid:=gen_random_uuid(); denied boolean;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 (publisher,publisher||'@example.invalid',now(),'{"full_name":"Publisher fixture"}'),
 (target,target||'@example.invalid',now(),'{"full_name":"Consultant fixture"}');
 insert into public.consultants(id,profile_id,name,is_active,is_approved,approval_status)
 values(expert,target,'Attribution fixture',true,true,'approved');
 insert into public.marketplace_notes(id,uploader_id,profile_consultant_id,uploader_name,title,category,description,file_path,price,is_free,status)
 values(note,publisher,expert,'Publisher fixture','Attributed resource fixture','Guide','Test',publisher||'/fixture.pdf',199,false,'active');
 -- Renaming the consultant never changes the association or the actual seller.
 update public.consultants set name='Renamed fixture' where id=expert;
 if not exists(select 1 from public.marketplace_notes where id=note and profile_consultant_id=expert and uploader_id=publisher) then raise exception 'Rename disconnected attribution';end if;
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 perform set_config('role','anon',true);
 if not exists(select 1 from public.marketplace_notes where id=note and profile_consultant_id=expert and status='active' and removed_at is null) then raise exception 'Anonymous visitor cannot see attributed resource';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 update public.marketplace_notes set title='Unauthorized edit' where id=note;
 if found then raise exception 'Display attribution granted ownership';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',publisher,'role','authenticated')::text,true);
 update public.marketplace_notes set description='Owner can still edit' where id=note;
 if not found then raise exception 'Original publisher lost ownership';end if;
 denied:=false;
 begin update public.marketplace_notes set profile_consultant_id=null where id=note;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Non-admin changed verified attribution';end if;
 denied:=false;
 begin insert into public.marketplace_orders(note_id,buyer_id,seller_id) values(note,publisher,target);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Original publisher bypassed self-purchase protection';end if;
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 update public.marketplace_notes set status='removed',removed_at=now() where id=note;
 perform set_config('role','anon',true);
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 if exists(select 1 from public.marketplace_notes where id=note) then raise exception 'Removed resource exposed by attribution';end if;
 perform set_config('role','postgres',true);
end $$;
rollback;
