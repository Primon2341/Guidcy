-- Guidcy Razorpay payment migration
-- Run once in the Supabase SQL editor before enabling live Razorpay payments.

alter table if exists public.bookings
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text,
  add column if not exists razorpay_status text,
  add column if not exists payment_response jsonb,
  add column if not exists payment_verified boolean default false,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table if exists public.webinar_registrations
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text,
  add column if not exists razorpay_status text,
  add column if not exists payment_response jsonb,
  add column if not exists payment_verified boolean default false,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table if exists public.marketplace_orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text,
  add column if not exists razorpay_status text,
  add column if not exists payment_response jsonb,
  add column if not exists payment_verified boolean default false,
  add column if not exists updated_at timestamptz;

create unique index if not exists bookings_razorpay_order_id_uq
  on public.bookings (razorpay_order_id)
  where razorpay_order_id is not null;

create unique index if not exists bookings_razorpay_payment_id_uq
  on public.bookings (razorpay_payment_id)
  where razorpay_payment_id is not null;

create unique index if not exists webinar_registrations_razorpay_order_id_uq
  on public.webinar_registrations (razorpay_order_id)
  where razorpay_order_id is not null;

create unique index if not exists webinar_registrations_razorpay_payment_id_uq
  on public.webinar_registrations (razorpay_payment_id)
  where razorpay_payment_id is not null;

create unique index if not exists marketplace_orders_razorpay_order_id_uq
  on public.marketplace_orders (razorpay_order_id)
  where razorpay_order_id is not null;

create unique index if not exists marketplace_orders_razorpay_payment_id_uq
  on public.marketplace_orders (razorpay_payment_id)
  where razorpay_payment_id is not null;
