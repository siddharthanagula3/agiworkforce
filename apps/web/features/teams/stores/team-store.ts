/**
 * @deprecated Barrel re-export — file moved to src/features/teams/stores/team-store.ts
 * This file exists to preserve the public import path during Phase 5 migration.
 * Do not add new code here. Import from src/features/teams/ directly for new code.
 */
export {
  useTeamStore,
  getActiveTeam,
  canUserEdit,
} from '../../../src/features/teams/stores/team-store';
export type { TeamRole, TeamMember, Team } from '../../../src/features/teams/stores/team-store';
