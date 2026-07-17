-- Migration 0058: drop the legacy teams / team_members dual system
--
-- 0007_teams.sql created `teams` / `team_members` as an early workspace-
-- membership model (role vocab: admin/editor/viewer, no owner). 0015 later
-- introduced `organizations` / `organization_members` (role vocab:
-- owner/admin/member/viewer) as the canonical model, which is what the live
-- Settings UI reads and writes today (via /api/settings/team,
-- /api/settings/organization) and is the only one of the two RLS-hardened
-- in 0054_gateway_user_scope_rls.sql.
--
-- `teams` / `team_members` ended up dead: their only readers were
-- apps/web/app/api/teams/**, whose only caller was
-- apps/web/features/teams/stores/team-store.ts, whose only importers were
-- TeamSwitcher.tsx / TeamSettingsPanel.tsx — neither of which was ever
-- mounted anywhere (apps/web/app/teams/page.tsx is an unrelated marketing
-- page). Verified via repo-wide grep across apps/web, services, and crates
-- immediately before this migration was written: no other table-qualified
-- reference to `teams` or `team_members` exists. The route files and the
-- apps/web/features/teams/** directory were deleted in the same change that
-- adds this migration.
--
-- FOUNDER-GATED: this migration is NOT applied by this change. Creating it
-- is a code-review artifact only — no psql/Neon call was made. Applying it
-- to any database (including a disposable branch) is an explicitly-gated,
-- separate, founder-run step.

drop table if exists public.team_members;
drop table if exists public.teams;
