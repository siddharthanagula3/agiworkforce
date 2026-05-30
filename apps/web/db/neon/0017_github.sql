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

-- Hot-path index for the debounce query:
-- select ... from github_pr_review_attempts
--   where installation_id = $1 and pr_number = $2
--   order by attempted_at desc limit 1
create index if not exists idx_github_pr_review_attempts_installation_pr_attempted
  on public.github_pr_review_attempts(installation_id, pr_number, attempted_at desc);

-- Hot-path index for the monthly quota count query:
-- select count(*) from github_pr_review_attempts
--   where installation_id = $1 and attempted_at > (now() - interval '30 days')
--   and status = any ($2)
create index if not exists idx_github_pr_review_attempts_installation_attempted
  on public.github_pr_review_attempts(installation_id, attempted_at desc);

-- Cleanup job: drop rows older than 30 days to bound table growth.
-- Called periodically (e.g. from a cron or pg_cron job).
create or replace function public.cleanup_old_github_pr_review_attempts()
returns void
language plpgsql
as $$
begin
  delete from public.github_pr_review_attempts
  where attempted_at < now() - interval '30 days';
end;
$$;
