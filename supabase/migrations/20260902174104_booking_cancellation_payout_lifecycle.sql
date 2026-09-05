-- Keep payment history, cancellation, refund, and consultant payout state on
-- the same booking row.  A captured payment remains a successful payment even
-- after it is refunded; refund_status records the refund lifecycle separately.

alter table public.bookings
  drop constraint if exists bookings_payout_status_check;

alter table public.bookings
  add constraint bookings_payout_status_check
  check (payout_status in ('pending', 'paid', 'not_required', 'blocked', 'not_eligible'));

-- Older cancellation handling used payment_status = refunded.  That loses the
-- original payment fact in transaction history, so normalize verified rows to
-- the canonical paid value before deriving their refund/payout state.
update public.bookings
   set payment_status = 'success',
       updated_at = now()
 where lower(coalesce(payment_status, '')) = 'refunded'
   and payment_verified is true;

-- Reconcile existing cancellations first.  This keeps the audit row intact,
-- removes any joinable Meet link, and makes the cancellation financially
-- ineligible while a refund is outstanding.
update public.bookings
   set status = 'cancelled',
       session_status = 'cancelled',
       meet_link = null,
       meeting_status = 'disabled',
       meeting_disabled_at = coalesce(meeting_disabled_at, cancelled_at, now()),
       meeting_updated_at = now(),
       refund_status = case
         when payment_verified is true
          and lower(coalesce(payment_status, '')) = 'success'
          and coalesce(total_amount, payment_amount, amount, 0) > 0
           then case
             when lower(coalesce(refund_status, '')) = 'refunded'
               or refund_transaction_id is not null
               or refunded_at is not null then 'refunded'
             when lower(coalesce(refund_status, '')) = 'refund_processing' then 'refund_processing'
             when lower(coalesce(refund_status, '')) = 'refund_failed' then 'refund_failed'
             else 'refund_pending'
           end
         else 'not_required'
       end,
       refund_requested_at = case
         when payment_verified is true
          and lower(coalesce(payment_status, '')) = 'success'
          and coalesce(total_amount, payment_amount, amount, 0) > 0
           then coalesce(refund_requested_at, cancelled_at, now())
         else refund_requested_at
       end,
       updated_at = now()
 where lower(coalesce(status, '')) in ('cancelled', 'canceled')
    or lower(coalesce(session_status, '')) in ('cancelled', 'canceled');

update public.bookings
   set payout_status = case
     when lower(coalesce(refund_status, '')) in ('refunded', 'not_required') then 'not_eligible'
     else 'blocked'
   end,
       updated_at = now()
 where lower(coalesce(status, '')) = 'cancelled'
    or lower(coalesce(session_status, '')) = 'cancelled';

-- Only verified, successfully paid, fully completed sessions are eligible for
-- consultant payout.  This also repairs older confirmed/scheduled rows that
-- were incorrectly displayed as payout pending.
update public.bookings
   set payout_status = case
     when payment_verified is true
      and lower(coalesce(payment_status, '')) = 'success'
      and lower(coalesce(status, '')) = 'completed'
      and lower(coalesce(session_status, '')) = 'completed'
      and coalesce(total_amount, payment_amount, amount, 0) > 0
       then case when lower(coalesce(payout_status, '')) = 'paid' then 'paid' else 'pending' end
     else 'not_eligible'
   end,
       updated_at = now()
 where not (
   lower(coalesce(status, '')) = 'cancelled'
   or lower(coalesce(session_status, '')) = 'cancelled'
 );

create or replace function public.guidcy_enforce_booking_financial_lifecycle()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_cancelled boolean;
  v_completed boolean;
  v_verified_paid boolean;
  v_amount numeric;
begin
  -- A late payment callback or stale browser write must never resurrect a
  -- cancellation back into an upcoming/confirmed booking.
  if tg_op = 'UPDATE'
     and (
       lower(coalesce(old.status, '')) in ('cancelled', 'canceled')
       or lower(coalesce(old.session_status, '')) in ('cancelled', 'canceled')
     ) then
    new.status := 'cancelled';
    new.session_status := 'cancelled';
  end if;

  -- The database uses success as the canonical stored value for a captured
  -- payment.  Refund lifecycle belongs in refund_status, not payment_status.
  if lower(coalesce(new.payment_status, '')) in ('paid', 'refunded')
     and new.payment_verified is true then
    new.payment_status := 'success';
  end if;

  v_cancelled := lower(coalesce(new.status, '')) in ('cancelled', 'canceled')
    or lower(coalesce(new.session_status, '')) in ('cancelled', 'canceled');
  v_completed := lower(coalesce(new.status, '')) = 'completed'
    and lower(coalesce(new.session_status, '')) = 'completed';
  v_amount := coalesce(new.total_amount, new.payment_amount, new.amount, 0);
  v_verified_paid := new.payment_verified is true
    and lower(coalesce(new.payment_status, '')) = 'success'
    and v_amount > 0;

  if v_cancelled then
    new.status := 'cancelled';
    new.session_status := 'cancelled';
    new.meet_link := null;
    new.meeting_status := 'disabled';
    new.meeting_disabled_at := coalesce(new.meeting_disabled_at, new.cancelled_at, now());
    new.meeting_updated_at := now();

    if v_verified_paid then
      if lower(coalesce(new.refund_status, '')) not in ('refund_pending', 'refund_processing', 'refunded', 'refund_failed') then
        new.refund_status := 'refund_pending';
      end if;
      new.refund_requested_at := coalesce(new.refund_requested_at, new.cancelled_at, now());
    else
      new.refund_status := 'not_required';
    end if;

    new.payout_status := case
      when lower(coalesce(new.refund_status, '')) in ('refunded', 'not_required') then 'not_eligible'
      else 'blocked'
    end;
  elsif v_completed and v_verified_paid then
    -- Pending means eligible for the admin's manual payout action.  The admin
    -- may transition it to paid only while the booking remains eligible.
    if lower(coalesce(new.payout_status, '')) <> 'paid' then
      new.payout_status := 'pending';
    end if;
  else
    if lower(coalesce(new.payout_status, '')) = 'paid' then
      raise exception 'Only verified, fully completed bookings can be marked paid out'
        using errcode = '23514';
    end if;
    new.payout_status := 'not_eligible';
  end if;

  return new;
end;
$$;

drop trigger if exists guidcy_enforce_booking_financial_lifecycle on public.bookings;
create trigger guidcy_enforce_booking_financial_lifecycle
before insert or update on public.bookings
for each row
execute function public.guidcy_enforce_booking_financial_lifecycle();

-- Consultant totals are derived only from the same canonical eligible rows
-- used by the payout screen.  Cancelled payments are deliberately excluded.
create or replace function public.guidcy_sync_consultant_totals(target uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if target is null then
    return;
  end if;

  update public.consultants c
     set total_sessions = t.sessions,
         total_earnings = t.paise
    from (
      select count(*)::int as sessions,
             coalesce(round(sum(
               case
                 when coalesce(b.consultant_payout_amount, 0) > 0 then b.consultant_payout_amount
                 else coalesce(b.total_amount, 0) * (1 - 0.15)
               end
             ) * 100), 0)::int as paise
        from public.bookings b
       where b.consultant_id = target
         and b.payment_verified is true
         and lower(coalesce(b.payment_status, '')) = 'success'
         and lower(coalesce(b.status, '')) = 'completed'
         and lower(coalesce(b.session_status, '')) = 'completed'
         and lower(coalesce(b.payout_status, '')) in ('pending', 'paid')
    ) t
   where c.id = target;
end;
$$;

drop trigger if exists bookings_sync_consultant_totals on public.bookings;
create trigger bookings_sync_consultant_totals
after insert or delete or update of consultant_id, status, session_status,
  payment_status, payment_verified, payout_status, consultant_payout_amount,
  total_amount, payment_amount, amount on public.bookings
for each row
execute function public.guidcy_bookings_touch_consultant_totals();

-- Recalculate totals once after the data reconciliation above.
do $$
declare
  consultant_row record;
begin
  for consultant_row in select id from public.consultants loop
    perform public.guidcy_sync_consultant_totals(consultant_row.id);
  end loop;
end;
$$;
