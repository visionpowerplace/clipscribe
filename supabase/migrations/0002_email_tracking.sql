alter table public.profiles add column if not exists welcome_sent_at timestamptz;
update public.profiles set welcome_sent_at = now() where welcome_sent_at is null;
create table if not exists public.email_log (
  ref text primary key,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.email_log enable row level security;
