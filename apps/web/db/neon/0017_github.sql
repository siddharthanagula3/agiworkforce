create table if not exists public.github_installations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  installation_id bigint not null unique,
  account_login text not null,
  account_type text not null default 'User'
    check (account_type = any (array['User', 'Organization'])),
  access_token_enc text,
  access_token_expires_at timestamptz,
  pr_review_enabled boolean not null default false,
  review_model text,
  created_at timestamptz not null default now()
);

create index if not exists idx_github_installations_user_id
  on public.github_installations(user_id);

create table if not exists public.github_pr_review_attempts (
  id uuid primary key default gen_random_uuid(),
  installation_id bigint not null,
  pr_number integer not null,
  repo_owner text not null,
  repo_name text not null,
  status text not null default 'pending'
    check (status = any (array['pending', 'completed', 'failed', 'skipped_debounce', 'skipped_quota'])),
  tokens_used integer default 0,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_github_pr_review_installation
  on public.github_pr_review_attempts(installation_id);
