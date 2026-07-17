-- 0060_free_tier_token_budget.sql
--
-- Founder decision 2026-07-17: the free chat tier is limited by a private,
-- server-owned cumulative token budget per rolling period, not a prompt count
-- or a per-message cap. The initial internal policy is 200K input+output tokens
-- per 30 days; neither value is part of the client/API contract.
--
-- Intended side effect: existing rows receive `period_started_at = now()` and
-- `period_tokens_used = 0`, so every current free user -- including anyone
-- already at `prompt_count = 3` -- starts the new period with a full budget.
-- That is the correct behavior for removing the prompt cap.
--
-- Deploy ordering (SVC-MANAGED-USAGE deploy-seq landmine): APPLY THIS MIGRATION
-- BEFORE deploying the code that reads `period_tokens_used`, or free requests
-- would reference a missing column and fail.

alter table public.website_auto_economy_trial_usage
  add column if not exists period_tokens_used bigint not null default 0
    check (period_tokens_used >= 0),
  add column if not exists period_started_at timestamptz not null default now();

-- The `prompt_count <= 3` ceiling no longer reflects policy. Drop the bounded
-- check; keep the column (non-negative) as historical telemetry only -- it no
-- longer gates access.
alter table public.website_auto_economy_trial_usage
  drop constraint if exists website_auto_economy_trial_usage_prompt_count_check;

-- recordFreeTrialTokens uses requestId as its idempotency key. This partial
-- expression index makes a replayed settlement a no-op while leaving unrelated
-- usage event types unchanged.
create unique index if not exists usage_events_free_tier_request_id_unique
  on public.usage_events (user_id, (metadata ->> 'requestId'))
  where event_type = 'website_auto_economy_trial_tokens_recorded';

comment on table public.website_auto_economy_trial_usage is
  'Logged-in free chat usage: private cumulative token budget per server-defined rolling period. prompt_count / first_prompt_at remain telemetry only and do not gate access.';

-- Serialize quota-bearing inserts per user/resource and validate the committed
-- row count from inside the same transaction. Routes call this only after their
-- INSERT/UPSERT CTE has materialized, so a failure rolls back the write. The
-- transaction-scoped advisory lock closes the concurrent "both saw one slot"
-- race that an application-side count-before-insert check cannot close.
create or replace function public.assert_user_resource_limit(
  p_resource text,
  p_user_id text,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  if p_limit is null then
    return true;
  end if;

  if p_limit < 0 then
    raise exception 'invalid_user_resource_limit' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('agi:user-resource:' || p_resource || ':' || p_user_id, 0)
  );

  case p_resource
    when 'projects' then
      select count(*) into v_count
        from public.user_projects
       where user_id = p_user_id
         and deleted_at is null;
    when 'custom_connectors' then
      select count(*) into v_count
        from public.user_custom_connectors
       where user_id = p_user_id;
    else
      raise exception 'unknown_user_resource' using errcode = '22023';
  end case;

  if v_count > p_limit then
    raise exception 'user_resource_limit_reached'
      using errcode = 'P0001', detail = p_resource;
  end if;

  return true;
end;
$$;

revoke execute on function public.assert_user_resource_limit(text, text, integer) from public;
grant execute on function public.assert_user_resource_limit(text, text, integer) to app_rls;
