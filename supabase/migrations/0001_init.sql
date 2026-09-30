-- ClipScribe schema: profiles, jobs, transcripts, credit ledger, queue + credit functions.
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',                 -- free | starter | pro | business
  sub_minutes integer not null default 0 check (sub_minutes >= 0),   -- resets each billing period
  pack_minutes integer not null default 0 check (pack_minutes >= 0), -- purchased/bonus, never expires
  stripe_customer_id text unique,
  stripe_subscription_id text,
  sub_status text,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

-- New users get a free trial balance (10 minutes). Change the number to taste.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, pack_minutes) values (new.id, new.email, 10);
  insert into public.credit_ledger (user_id, delta, reason, bucket)
  values (new.id, 10, 'signup_bonus', 'pack');
  return new;
end $$;

-- ---------------------------------------------------------------- ledger
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null,          -- signup_bonus | job | refund | subscription | pack | adjustment
  bucket text,                   -- sub | pack | mixed
  job_id uuid,
  stripe_ref text,               -- idempotency key for Stripe-originated grants
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index credit_ledger_stripe_ref_uq on public.credit_ledger(stripe_ref) where stripe_ref is not null;
create unique index credit_ledger_job_once_uq on public.credit_ledger(job_id, reason) where reason in ('job','refund');
create index credit_ledger_user_idx on public.credit_ledger(user_id, created_at desc);

-- trigger must be created after credit_ledger exists
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- jobs
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('url','upload')),
  source_url text,
  upload_path text,                       -- path inside the `uploads` bucket
  original_filename text,
  want_transcript boolean not null default true,
  want_download boolean not null default false,
  download_format text not null default 'mp4' check (download_format in ('mp4','mp3')),
  download_quality integer not null default 1080,   -- max height for video
  source_language text,                   -- ISO-639-1 or null = auto-detect
  target_languages text[] not null default '{}',

  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  stage text,                             -- probing | downloading | extracting | transcribing | translating | uploading
  progress integer not null default 0,
  error text,
  attempts integer not null default 0,
  worker_id text,
  heartbeat_at timestamptz,

  title text,
  platform text,
  thumbnail text,
  duration_seconds integer,
  detected_language text,
  credit_cost integer,
  credits_charged boolean not null default false,
  media_path text,                        -- path inside the `outputs` bucket
  media_filename text,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index jobs_user_idx on public.jobs(user_id, created_at desc);
create index jobs_queue_idx on public.jobs(created_at) where status = 'queued';

create table public.transcripts (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  lang text not null,                     -- ISO code of this version
  is_original boolean not null default false,
  segments jsonb not null,                -- [{start,end,text}]
  created_at timestamptz not null default now(),
  unique (job_id, lang)
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.transcripts enable row level security;
alter table public.credit_ledger enable row level security;

create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own jobs" on public.jobs for select using (auth.uid() = user_id);
create policy "own transcripts" on public.transcripts for select
  using (exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()));
create policy "own ledger" on public.credit_ledger for select using (auth.uid() = user_id);
-- No insert/update/delete policies: all writes go through the service role (API routes + worker).

-- ---------------------------------------------------------------- queue
-- Atomically claim the oldest queued job.
create or replace function public.claim_job(p_worker text) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  select * into j from public.jobs
   where status = 'queued'
   order by created_at
   for update skip locked
   limit 1;
  if not found then return null; end if;
  update public.jobs
     set status = 'processing', worker_id = p_worker, heartbeat_at = now(),
         started_at = coalesce(started_at, now()), attempts = attempts + 1,
         stage = 'probing', progress = 0, error = null
   where id = j.id
   returning * into j;
  return j;
end $$;

-- Jobs whose worker died (no heartbeat) go back to the queue, or fail after 3 attempts.
create or replace function public.requeue_stale_jobs(p_stale_seconds integer default 600) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  for r in select id, attempts from public.jobs
            where status = 'processing' and heartbeat_at < now() - make_interval(secs => p_stale_seconds)
            for update skip locked
  loop
    if r.attempts >= 3 then
      update public.jobs set status = 'failed', error = 'Processing timed out. Please try again.',
             finished_at = now() where id = r.id;
      perform public.refund_job_credits(r.id);
    else
      update public.jobs set status = 'queued', worker_id = null where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- credits
-- Spend credits: subscription minutes first, then purchased minutes. Returns false if insufficient.
create or replace function public.consume_credits(p_user uuid, p_amount integer, p_job uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare s integer; p integer; use_sub integer; use_pack integer;
begin
  if p_amount <= 0 then return true; end if;
  select sub_minutes, pack_minutes into s, p from public.profiles where id = p_user for update;
  if not found or s + p < p_amount then return false; end if;
  use_sub := least(s, p_amount);
  use_pack := p_amount - use_sub;
  update public.profiles set sub_minutes = sub_minutes - use_sub, pack_minutes = pack_minutes - use_pack
   where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, bucket, job_id, meta)
  values (p_user, -p_amount, 'job', 'mixed', p_job, jsonb_build_object('sub', use_sub, 'pack', use_pack));
  update public.jobs set credits_charged = true, credit_cost = p_amount where id = p_job;
  return true;
end $$;

-- Refund a job's credits to the buckets they came from (once).
create or replace function public.refund_job_credits(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.credit_ledger; sub_amt integer; pack_amt integer;
begin
  select * into l from public.credit_ledger where job_id = p_job and reason = 'job';
  if not found then return; end if;
  if exists (select 1 from public.credit_ledger where job_id = p_job and reason = 'refund') then return; end if;
  sub_amt := coalesce((l.meta->>'sub')::int, 0);
  pack_amt := coalesce((l.meta->>'pack')::int, 0);
  update public.profiles set sub_minutes = sub_minutes + sub_amt, pack_minutes = pack_minutes + pack_amt
   where id = l.user_id;
  insert into public.credit_ledger (user_id, delta, reason, bucket, job_id, meta)
  values (l.user_id, -l.delta, 'refund', 'mixed', p_job, l.meta);
  update public.jobs set credits_charged = false where id = p_job;
end $$;

-- Subscription period grant: RESETS sub_minutes to the plan allowance (no rollover). Idempotent per Stripe ref.
create or replace function public.grant_subscription_minutes(p_user uuid, p_minutes integer, p_ref text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur integer;
begin
  select sub_minutes into cur from public.profiles where id = p_user for update;
  if not found then return false; end if;
  begin
    insert into public.credit_ledger (user_id, delta, reason, bucket, stripe_ref)
    values (p_user, p_minutes - cur, 'subscription', 'sub', p_ref);
  exception when unique_violation then
    return false;
  end;
  update public.profiles set sub_minutes = p_minutes where id = p_user;
  return true;
end $$;

-- Purchased pack (or any permanent top-up). Idempotent per Stripe ref.
create or replace function public.add_pack_minutes(p_user uuid, p_minutes integer, p_ref text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then return false; end if;
  begin
    insert into public.credit_ledger (user_id, delta, reason, bucket, stripe_ref)
    values (p_user, p_minutes, 'pack', 'pack', p_ref);
  exception when unique_violation then
    return false;
  end;
  update public.profiles set pack_minutes = pack_minutes + p_minutes where id = p_user;
  return true;
end $$;

-- Lock the functions down: only the service role may call them.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.claim_job(text) from public, anon, authenticated;
revoke all on function public.requeue_stale_jobs(integer) from public, anon, authenticated;
revoke all on function public.consume_credits(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.refund_job_credits(uuid) from public, anon, authenticated;
revoke all on function public.grant_subscription_minutes(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.add_pack_minutes(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_job(text) to service_role;
grant execute on function public.requeue_stale_jobs(integer) to service_role;
grant execute on function public.consume_credits(uuid, integer, uuid) to service_role;
grant execute on function public.refund_job_credits(uuid) to service_role;
grant execute on function public.grant_subscription_minutes(uuid, integer, text) to service_role;
grant execute on function public.add_pack_minutes(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------- storage
-- Private buckets. Uploads go through signed upload URLs minted by the API; downloads through signed URLs.
-- NOTE: the effective max file size is also capped by Supabase project settings
-- (Dashboard > Storage > Settings > Global file size limit; needs a paid plan above 50 MB).
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 2147483648),
       ('outputs', 'outputs', false, 2147483648)
on conflict (id) do nothing;
