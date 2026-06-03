create table if not exists public.website_auto_economy_trial_usage (
  user_id text primary key references public.profiles(id) on delete cascade,
  prompt_count integer not null default 0
    check (prompt_count >= 0 and prompt_count <= 3),
  first_prompt_at timestamptz not null default now(),
  last_prompt_at timestamptz not null default now()
);

create index if not exists idx_website_auto_economy_trial_usage_last_prompt_at
  on public.website_auto_economy_trial_usage(last_prompt_at desc);

comment on table public.website_auto_economy_trial_usage is
  'Logged-in website/extension free Auto Economy trial prompt counter.';
