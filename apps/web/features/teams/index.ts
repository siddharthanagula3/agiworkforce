/**
 * apps/web/features/teams - public API barrel
 *
 * Team management with RBAC: team switching, member management,
 * role permissions (admin/editor/viewer), API-backed mutations.
 *
 * Canonical Web teams feature.
 */

export { TeamSettingsPanel } from './components/TeamSettingsPanel';
export { TeamSwitcher } from './components/TeamSwitcher';
export { useTeamStore, getActiveTeam, canUserEdit } from './stores/team-store';
export type { TeamRole, TeamMember, Team } from './stores/team-store';
