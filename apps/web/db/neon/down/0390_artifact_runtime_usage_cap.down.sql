-- Reversal of 0390: stop attributing and capping AI calls per app.
--
-- WHAT THIS COSTS: every managed usage row forgets which app made it, and the
-- per-app ceilings go with the function, so an app's calls are bounded by the
-- plan's own ceilings only. Code that reserves through
-- reserve_artifact_runtime_usage_microusd fails until the function returns, so
-- turn AGI_ARTIFACT_AI_ENABLED off before running this.

begin;

drop function if exists public.reserve_artifact_runtime_usage_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean,
  text, integer, integer, bigint
);

drop index if exists public.idx_managed_usage_requests_artifact_subject;

alter table public.managed_usage_requests
  drop constraint if exists managed_usage_requests_artifact_subject_shape,
  drop column if exists artifact_subject;

delete from public.schema_migrations
 where filename = '0390_artifact_runtime_usage_cap.sql';

commit;
