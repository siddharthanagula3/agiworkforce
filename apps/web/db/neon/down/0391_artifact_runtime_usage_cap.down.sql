-- Reversal of 0391: stop attributing and capping AI calls per app.
--
-- WHAT THIS COSTS: every managed usage row forgets which app made it, and the
-- per-app ceilings go with the functions, so an app's calls are bounded by the
-- plan's own ceilings only. Code that reserves or extends
-- through either artifact function fails until the functions return, so
-- turn AGI_ARTIFACT_AI_ENABLED off before running this.

begin;

drop function if exists public.app_published_artifact_uses_connectors(uuid);

drop function if exists public.extend_artifact_runtime_usage_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean, text, integer, bigint
);

drop function if exists public.reserve_artifact_runtime_usage_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean,
  text, integer, integer, bigint
);

drop index if exists public.idx_managed_usage_requests_artifact_subject;

alter table public.managed_usage_requests
  drop constraint if exists managed_usage_requests_artifact_subject_shape,
  drop column if exists artifact_subject;

delete from public.schema_migrations
 where filename = '0391_artifact_runtime_usage_cap.sql';

commit;
