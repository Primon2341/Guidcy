-- These routines are invoked internally by booking table triggers.  They are
-- not application RPC endpoints, so do not leave their SECURITY DEFINER
-- execution available to anonymous or authenticated callers.
revoke all on function public.guidcy_bookings_touch_consultant_totals() from public, anon, authenticated;
revoke all on function public.guidcy_sync_consultant_totals(uuid) from public, anon, authenticated;
revoke all on function public.guidcy_enforce_booking_financial_lifecycle() from public, anon, authenticated;
