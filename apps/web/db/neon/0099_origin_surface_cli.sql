-- 0099 — Admit `cli` as a Managed Cloud agent run origin surface.
--
-- `cli` is a first-class developer surface: `CloudAgentOriginSurfaceSchema`
-- lists it, and `resolveCloudChatSurface` returns it both from an explicit
-- `x-agi-surface: cli` header and as the default member of the trusted
-- `developer` credential class. The 0061 CHECK predates that surface, so a Pro
-- caller who clears the `developer_surfaces` plan gate is then rejected by the
-- database: the run insert raises, the turn is refunded, and the caller sees a
-- 503 `agent_run_unavailable` for a request the product intends to serve.

alter table public.cloud_agent_runs
  drop constraint if exists cloud_agent_runs_origin_surface_check,
  add constraint cloud_agent_runs_origin_surface_check
  check (origin_surface = any (array[
    'web'::text,
    'desktop'::text,
    'mobile'::text,
    'chrome'::text,
    'vscode'::text,
    'cli'::text,
    'api'::text
  ]));
