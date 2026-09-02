-- Keep one booking row authoritative across cancellation, meeting disablement,
-- consultant payout exclusion, and the Razorpay refund lifecycle.

alter table if exists public.bookings
  add column if not exists meeting_status text not null default 'pending',
  add column if not exists meeting_last_error text,
  add column if not exists meeting_updated_at timestamptz,
  add column if not exists google_calendar_event_id text,
  add column if not exists meeting_disabled_at timestamptz,
  add column if not exists refund_status text not null default 'not_required',
  add column if not exists refund_amount numeric(12,2),
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_processing_started_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_failed_at timestamptz,
  add column if not exists refund_transaction_id text,
  add column if not exists refund_gateway_status text,
  add column if not exists refund_failure_reason text,
  add column if not exists refund_notes text,
  add column if not exists refund_actioned_by uuid,
  add column if not exists refund_idempotency_key text,
  add column if not exists refund_last_synced_at timestamptz,
  add column if not exists refund_response jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_meeting_status_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_meeting_status_check
      check (meeting_status in ('pending', 'ready', 'disabled', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_refund_status_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_refund_status_check
      check (refund_status in (
        'not_required',
        'refund_pending',
        'refund_processing',
        'refunded',
        'refund_failed'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_refund_amount_nonnegative_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_refund_amount_nonnegative_check
      check (refund_amount is null or refund_amount >= 0);
  end if;
end
$$;

create index if not exists bookings_refund_queue_idx
  on public.bookings (refund_status, cancelled_at desc)
  where status = 'cancelled'
    and refund_status in ('refund_pending', 'refund_processing', 'refund_failed');

create unique index if not exists bookings_refund_transaction_unique_idx
  on public.bookings (refund_transaction_id)
  where refund_transaction_id is not null;

create unique index if not exists bookings_refund_idempotency_unique_idx
  on public.bookings (refund_idempotency_key)
  where refund_idempotency_key is not null;

-- Older browser cancellation code wrote "refunded" immediately, before any
-- gateway refund existed. Preserve the captured payment and queue the actual
-- refund instead. The production data had one such row and no refund ID.
update public.bookings
set payment_status = 'success',
    updated_at = now()
where status = 'cancelled'
  and payment_status = 'refunded'
  and payment_verified is true
  and coalesce(razorpay_payment_id, payment_id, '') <> ''
  and refund_transaction_id is null
  and refunded_at is null;

update public.bookings
set meeting_status = case
      when status = 'cancelled' or session_status = 'cancelled' then 'disabled'
      when coalesce(meet_link, '') <> '' then 'ready'
      else coalesce(nullif(meeting_status, ''), 'pending')
    end,
    meeting_updated_at = coalesce(meeting_updated_at, updated_at, created_at, now());

update public.bookings
set meet_link = null,
    meeting_status = 'disabled',
    meeting_disabled_at = coalesce(meeting_disabled_at, cancelled_at, now()),
    meeting_updated_at = now(),
    payout_status = case when payout_status = 'paid' then 'paid' else 'not_required' end,
    refund_status = case
      when refund_transaction_id is not null or refunded_at is not null then 'refunded'
      when payment_verified is true
        and payment_status = 'success'
        and coalesce(razorpay_payment_id, payment_id, '') <> ''
        and coalesce(total_amount, payment_amount, amount, 0) > 0
        then 'refund_pending'
      else 'not_required'
    end,
    refund_amount = case
      when payment_verified is true
        and payment_status = 'success'
        and coalesce(razorpay_payment_id, payment_id, '') <> ''
        and coalesce(total_amount, payment_amount, amount, 0) > 0
        then coalesce(refund_amount, total_amount, payment_amount, amount)
      else refund_amount
    end,
    refund_requested_at = case
      when payment_verified is true
        and payment_status = 'success'
        and coalesce(razorpay_payment_id, payment_id, '') <> ''
        and coalesce(total_amount, payment_amount, amount, 0) > 0
        then coalesce(refund_requested_at, cancelled_at, now())
      else refund_requested_at
    end,
    updated_at = now()
where status = 'cancelled' or session_status = 'cancelled';

comment on column public.bookings.google_calendar_event_id is
  'Google Calendar event used to create the Meet link; retained for cancellation/audit.';
comment on column public.bookings.refund_status is
  'Refund lifecycle: not_required, refund_pending, refund_processing, refunded, refund_failed.';

create or replace function public.guidcy_cancel_booking(
  p_booking_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text default null
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_result public.bookings%rowtype;
  v_actor_role text := lower(trim(coalesce(p_actor_role, '')));
  v_previous_status text;
  v_effective_payment_status text;
  v_paid boolean;
  v_refund_status text;
  v_refund_amount numeric(12,2);
begin
  if p_booking_id is null or p_actor_id is null then
    raise exception 'Booking and actor are required' using errcode = '22023';
  end if;

  if v_actor_role not in ('user', 'consultant', 'admin') then
    raise exception 'Invalid cancellation actor role' using errcode = '22023';
  end if;

  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_actor_role = 'user' and v_booking.user_id is distinct from p_actor_id then
    raise exception 'This booking does not belong to the user' using errcode = '42501';
  elsif v_actor_role = 'consultant' and not exists (
    select 1
    from public.consultants c
    where c.id = v_booking.consultant_id
      and c.profile_id = p_actor_id
  ) then
    raise exception 'This booking is not assigned to the consultant' using errcode = '42501';
  elsif v_actor_role = 'admin' and not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and lower(p.role) = 'admin'
  ) then
    raise exception 'Admin access is required' using errcode = '42501';
  end if;

  if lower(coalesce(v_booking.status, '')) in ('completed', 'no_show', 'disputed')
     or lower(coalesce(v_booking.session_status, '')) in ('completed', 'no_show', 'disputed') then
    raise exception 'A completed or review-state session cannot be cancelled' using errcode = '22023';
  end if;

  v_previous_status := coalesce(v_booking.status, v_booking.session_status, 'scheduled');
  v_effective_payment_status := case
    when lower(coalesce(v_booking.payment_status, '')) = 'refunded'
      and v_booking.refund_transaction_id is null
      and v_booking.refunded_at is null
      and v_booking.payment_verified is true
      then 'success'
    else lower(coalesce(v_booking.payment_status, 'pending'))
  end;
  v_refund_amount := coalesce(v_booking.refund_amount, v_booking.total_amount, v_booking.payment_amount, v_booking.amount, 0);
  v_paid := v_booking.payment_verified is true
    and v_effective_payment_status = 'success'
    and coalesce(v_booking.razorpay_payment_id, v_booking.payment_id, '') <> ''
    and v_refund_amount > 0;

  v_refund_status := case
    when v_booking.refund_status in ('refund_processing', 'refunded', 'refund_failed')
      then v_booking.refund_status
    when v_paid then 'refund_pending'
    else 'not_required'
  end;

  update public.bookings b
  set status = 'cancelled',
      session_status = 'cancelled',
      previous_status = case
        when lower(coalesce(v_booking.status, '')) = 'cancelled'
          then coalesce(v_booking.previous_status, v_previous_status)
        else v_previous_status
      end,
      cancelled_by = v_actor_role,
      cancelled_by_id = p_actor_id,
      cancelled_at = coalesce(v_booking.cancelled_at, now()),
      cancellation_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), v_booking.cancellation_reason),
      meet_link = null,
      meeting_status = 'disabled',
      meeting_last_error = null,
      meeting_disabled_at = coalesce(v_booking.meeting_disabled_at, now()),
      meeting_updated_at = now(),
      payment_status = v_effective_payment_status,
      payout_status = case when v_booking.payout_status = 'paid' then 'paid' else 'not_required' end,
      refund_status = v_refund_status,
      refund_amount = case when v_refund_status = 'not_required' then v_booking.refund_amount else v_refund_amount end,
      refund_requested_at = case
        when v_refund_status = 'refund_pending' then coalesce(v_booking.refund_requested_at, now())
        else v_booking.refund_requested_at
      end,
      admin_review_status = case
        when v_actor_role = 'consultant' and coalesce(v_booking.admin_review_status, 'not_required') = 'not_required'
          then 'pending_review'
        else v_booking.admin_review_status
      end,
      last_status_updated_at = now(),
      last_status_updated_by = p_actor_id,
      updated_at = now()
  where b.id = p_booking_id
  returning b.* into v_result;

  if lower(coalesce(v_booking.status, '')) <> 'cancelled'
     or lower(coalesce(v_booking.session_status, '')) <> 'cancelled' then
    insert into public.booking_session_logs (
      booking_id,
      action_type,
      old_status,
      new_status,
      actor_role,
      actor_id,
      comment,
      metadata
    ) values (
      p_booking_id,
      'cancelled',
      v_previous_status,
      'cancelled',
      v_actor_role,
      p_actor_id,
      nullif(trim(coalesce(p_reason, '')), ''),
      jsonb_build_object(
        'source', 'guidcy_cancel_booking',
        'payment_status', v_effective_payment_status,
        'refund_status', v_refund_status,
        'refund_amount', case when v_refund_status = 'not_required' then null else v_refund_amount end,
        'meeting_link_disabled', coalesce(v_booking.meet_link, '') <> ''
      )
    );
  end if;

  return v_result;
end
$$;

revoke all on function public.guidcy_cancel_booking(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.guidcy_cancel_booking(uuid, uuid, text, text)
  to service_role;
