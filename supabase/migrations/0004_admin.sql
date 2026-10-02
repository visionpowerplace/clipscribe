-- Owner admin tooling: account suspension, internal notes, an audit log, and a safe minutes-adjustment function.
alter table public.profiles
  add column if not exists suspended boolean not null default false,
  add column if not exists suspended_reason text,
  add column if not exists admin_note text;

create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  admin_email text not null,
  user_id uuid,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_user_idx on public.admin_actions(user_id, created_at desc);
alter table public.admin_actions enable row level security;   -- no policies: service role only

-- Add (positive) or remove (negative) permanent pack minutes. Never goes below zero. Returns the applied change.
create or replace function public.admin_adjust_minutes(p_user uuid, p_delta integer, p_note text) returns integer
language plpgsql security definer set search_path = public as $$
declare cur integer; applied integer;
begin
  select pack_minutes into cur from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  applied := greatest(p_delta, -cur);
  if applied = 0 then return 0; end if;
  update public.profiles set pack_minutes = pack_minutes + applied where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, bucket, meta)
  values (p_user, applied, 'adjustment', 'pack', jsonb_build_object('note', left(coalesce(p_note, ''), 200)));
  return applied;
end $$;
revoke all on function public.admin_adjust_minutes(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_minutes(uuid, integer, text) to service_role;
