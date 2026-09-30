-- Downloads are a paid add-on (separate Stripe subscription).
alter table public.profiles
  add column if not exists downloads_addon boolean not null default false,
  add column if not exists addon_subscription_id text,
  add column if not exists addon_status text,
  add column if not exists addon_period_end timestamptz;

-- Users must not be able to grant themselves the add-on: profiles has no update policy (writes are service-role only),
-- so nothing else to do here.
