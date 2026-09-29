-- Tracking IDs are capabilities: new guest cases use 128 random bits, never
-- the previous six timestamp digits. Email-only lookup remains owner-scoped.
create or replace function public.guidcy_track_support_ticket(p_code text)
returns table(ticket_code text,topic text,status text,priority text,admin_comment text)
language sql stable security definer set search_path='' as $$
 select s.ticket_code,s.topic,s.status,s.priority,s.admin_comment from public.support_tickets s
 where lower(s.ticket_code)=lower(p_code) and
 (p_code ~* '^HLP-[0-9a-f]{32}$' or s.created_by=auth.uid() or lower(s.email)=lower(auth.email()) or public.guidcy_is_admin(auth.uid())) limit 1;
$$;
create or replace function public.track_dispute(p_code text)
returns table(dispute_code text,issue_type text,preferred_resolution text,status text,admin_comment text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select d.dispute_code,d.issue_type,d.preferred_resolution,d.status,d.admin_comment,d.created_at
 from public.disputes d where d.dispute_code=p_code and not d.is_deleted and
 (p_code ~* '^DSP-[0-9a-f]{32}$' or d.created_by=auth.uid() or d.raised_by=auth.uid() or lower(d.email)=lower(auth.email()) or public.guidcy_is_admin(auth.uid())) limit 1;
$$;
-- Internal aggregate refresh is called by its trigger, not a public RPC.
revoke execute on function public.refresh_job_applicants_count(uuid) from public,anon,authenticated;
grant execute on function public.refresh_job_applicants_count(uuid) to service_role;
notify pgrst,'reload schema';
