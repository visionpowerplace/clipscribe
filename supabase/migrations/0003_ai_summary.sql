-- AI summaries: optional per job, stored as JSON {tldr, key_points[], chapters[{start,title}], quotes[{start,text}], lang}
alter table public.jobs
  add column if not exists want_summary boolean not null default false,
  add column if not exists summary jsonb;
