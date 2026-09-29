# Consultant availability

The consultant dashboard supports all twelve months, year selection, and weekly recurring working hours. Times use Asia/Kolkata (IST), matching existing bookings. Recurrence continues into future years without monthly updates or scheduled jobs.

`consultants.recurring_availability` stores `{enabled, days, start, end, interval}`. Days are 0–6 (Sunday–Saturday); start/end are `HH:mm`; start times repeat every 30 or 60 minutes. Recurring sessions must finish before the end time.

Existing `availability_map` entries remain date-specific start times. An explicit `[]` blocks that date. Removing an entry restores its recurring hours. Editing a date never changes the weekly rule or existing bookings. Disabling recurrence retains custom dates. Existing records with a null recurring rule keep their previous booking behavior.

The public booking calendar shows one month at a time with previous/next navigation. The shared resolver includes a rolling year and generates later months on demand, without a 14-date cutoff. Every saved future custom date remains available. Date selection is tracked by its ISO date through duration changes, midnight refreshes, and payment reloads; time slots stay in a scrollable container.

New consultations default to Video Session. There is no session-type selector, and the consultant availability editor only edits the Video rate. Supabase rejects new Audio/Message bookings; historical booking types and their update/refund workflows remain intact. Existing audio/chat prices are retained in the database. Supabase owner policies remain authoritative, and saving checks the original map and rule to detect conflicting changes.

Validation:

```sh
npm run build
node --test tests/availability.test.cjs tests/booking-flow-regression.test.mjs
node tests/availability-browser.cjs
```

The browser check requires Playwright and Google Chrome. It exercises monthly navigation, overrides, scrollable slots, duration changes, payment reloads, and a mocked Razorpay checkout. `tests/availability-database.sql` checks owner access, public reads, invalid schedules, unauthorized writes, Video defaults/pricing, and historical bookings inside transactions that roll back.
