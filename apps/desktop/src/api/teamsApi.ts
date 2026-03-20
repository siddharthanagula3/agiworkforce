/**
 * Teams API
 *
 * TypeScript wrappers for all 26 team-related Tauri commands.
 * Covers team CRUD, members, invitations, resources, activity,
 * billing, settings, and ownership transfer.
 *
 * invoke() params: camelCase (TS) -> snake_case (Rust) automatic conversion.
 */

import { invoke } from '../lib/tauri-mock';
import type {
  Team,
  TeamMember,
  TeamInvitation,
  TeamResource,
  TeamActivity,
  TeamBilling,
  UsageMetrics,
} from '../types/teams';

// ============================================================================
// Interfaces for settings update (mirrors Rust update_team_settings params)
// ============================================================================

export interface UpdateTeamSettingsParams {
  teamId: string;
  defaultMemberRole?: string | null;
  allowResourceSharing?: boolean | null;
  requireApprovalForAutomations?: boolean | null;
  enableActivityNotifications?: boolean | null;
  maxMembers?: number | null;
}

// ============================================================================
// Team CRUD
// ============================================================================

export async function createTeam(
  name: string,
  description: string | null,
  ownerId: string,
): Promise<Team> {
  try {
    return await invoke<Team>('create_team', { name, description, ownerId });
  } catch (error) {
    throw new Error(`Failed to create team: ${String(error)}`);
  }
}

export async function getTeam(teamId: string): Promise<Team | null> {
  try {
    return await invoke<Team | null>('get_team', { teamId });
  } catch (error) {
    throw new Error(`Failed to get team: ${String(error)}`);
  }
}

export async function updateTeam(
  teamId: string,
  name: string | null,
  description: string | null,
): Promise<void> {
  try {
    await invoke('update_team', { teamId, name, description });
  } catch (error) {
    throw new Error(`Failed to update team: ${String(error)}`);
  }
}

export async function updateTeamSettings(params: UpdateTeamSettingsParams): Promise<void> {
  try {
    await invoke('update_team_settings', {
      teamId: params.teamId,
      defaultMemberRole: params.defaultMemberRole ?? null,
      allowResourceSharing: params.allowResourceSharing ?? null,
      requireApprovalForAutomations: params.requireApprovalForAutomations ?? null,
      enableActivityNotifications: params.enableActivityNotifications ?? null,
      maxMembers: params.maxMembers ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to update team settings: ${String(error)}`);
  }
}

export async function deleteTeam(teamId: string): Promise<void> {
  try {
    await invoke('delete_team', { teamId });
  } catch (error) {
    throw new Error(`Failed to delete team: ${String(error)}`);
  }
}

export async function getUserTeams(userId: string): Promise<Team[]> {
  try {
    return await invoke<Team[]>('get_user_teams', { userId });
  } catch (error) {
    throw new Error(`Failed to get user teams: ${String(error)}`);
  }
}

// ============================================================================
// Members
// ============================================================================

export async function inviteMember(
  teamId: string,
  email: string,
  role: string,
  invitedBy: string,
): Promise<string> {
  try {
    return await invoke<string>('invite_member', { teamId, email, role, invitedBy });
  } catch (error) {
    throw new Error(`Failed to invite member: ${String(error)}`);
  }
}

export async function acceptInvitation(token: string, userId: string): Promise<Team> {
  try {
    return await invoke<Team>('accept_invitation', { token, userId });
  } catch (error) {
    throw new Error(`Failed to accept invitation: ${String(error)}`);
  }
}

export async function removeMember(
  teamId: string,
  userId: string,
  removedBy: string,
): Promise<void> {
  try {
    await invoke('remove_member', { teamId, userId, removedBy });
  } catch (error) {
    throw new Error(`Failed to remove member: ${String(error)}`);
  }
}

export async function updateMemberRole(
  teamId: string,
  userId: string,
  role: string,
  updatedBy: string,
): Promise<void> {
  try {
    await invoke('update_member_role', { teamId, userId, role, updatedBy });
  } catch (error) {
    throw new Error(`Failed to update member role: ${String(error)}`);
  }
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  try {
    return await invoke<TeamMember[]>('get_team_members', { teamId });
  } catch (error) {
    throw new Error(`Failed to get team members: ${String(error)}`);
  }
}

export async function getTeamInvitations(teamId: string): Promise<TeamInvitation[]> {
  try {
    return await invoke<TeamInvitation[]>('get_team_invitations', { teamId });
  } catch (error) {
    throw new Error(`Failed to get team invitations: ${String(error)}`);
  }
}

// ============================================================================
// Resources
// ============================================================================

export async function shareResource(
  teamId: string,
  resourceType: string,
  resourceId: string,
  resourceName: string,
  resourceDescription: string | null,
  sharedBy: string,
): Promise<void> {
  try {
    await invoke('share_resource', {
      teamId,
      resourceType,
      resourceId,
      resourceName,
      resourceDescription,
      sharedBy,
    });
  } catch (error) {
    throw new Error(`Failed to share resource: ${String(error)}`);
  }
}

export async function unshareResource(
  teamId: string,
  resourceType: string,
  resourceId: string,
  unsharedBy: string,
): Promise<void> {
  try {
    await invoke('unshare_resource', { teamId, resourceType, resourceId, unsharedBy });
  } catch (error) {
    throw new Error(`Failed to unshare resource: ${String(error)}`);
  }
}

export async function getTeamResources(teamId: string): Promise<TeamResource[]> {
  try {
    return await invoke<TeamResource[]>('get_team_resources', { teamId });
  } catch (error) {
    throw new Error(`Failed to get team resources: ${String(error)}`);
  }
}

export async function getTeamResourcesByType(
  teamId: string,
  resourceType: string,
): Promise<TeamResource[]> {
  try {
    return await invoke<TeamResource[]>('get_team_resources_by_type', { teamId, resourceType });
  } catch (error) {
    throw new Error(`Failed to get team resources by type: ${String(error)}`);
  }
}

// ============================================================================
// Activity
// ============================================================================

export async function getTeamActivity(
  teamId: string,
  limit: number,
  offset: number,
): Promise<TeamActivity[]> {
  try {
    return await invoke<TeamActivity[]>('get_team_activity', { teamId, limit, offset });
  } catch (error) {
    throw new Error(`Failed to get team activity: ${String(error)}`);
  }
}

export async function getUserTeamActivity(
  teamId: string,
  userId: string,
  limit: number,
): Promise<TeamActivity[]> {
  try {
    return await invoke<TeamActivity[]>('get_user_team_activity', { teamId, userId, limit });
  } catch (error) {
    throw new Error(`Failed to get user team activity: ${String(error)}`);
  }
}

// ============================================================================
// Billing
// ============================================================================

export async function getTeamBilling(teamId: string): Promise<TeamBilling | null> {
  try {
    return await invoke<TeamBilling | null>('get_team_billing', { teamId });
  } catch (error) {
    throw new Error(`Failed to get team billing: ${String(error)}`);
  }
}

export async function initializeTeamBilling(
  teamId: string,
  plan: string,
  cycle: string,
  seatCount: number,
): Promise<TeamBilling> {
  try {
    return await invoke<TeamBilling>('initialize_team_billing', {
      teamId,
      plan,
      cycle,
      seatCount,
    });
  } catch (error) {
    throw new Error(`Failed to initialize team billing: ${String(error)}`);
  }
}

export async function updateTeamPlan(
  teamId: string,
  plan: string,
  updatedBy: string,
): Promise<void> {
  try {
    await invoke('update_team_plan', { teamId, plan, updatedBy });
  } catch (error) {
    throw new Error(`Failed to update team plan: ${String(error)}`);
  }
}

export async function addTeamSeats(
  teamId: string,
  count: number,
  updatedBy: string,
): Promise<void> {
  try {
    await invoke('add_team_seats', { teamId, count, updatedBy });
  } catch (error) {
    throw new Error(`Failed to add team seats: ${String(error)}`);
  }
}

export async function removeTeamSeats(
  teamId: string,
  count: number,
  updatedBy: string,
): Promise<void> {
  try {
    await invoke('remove_team_seats', { teamId, count, updatedBy });
  } catch (error) {
    throw new Error(`Failed to remove team seats: ${String(error)}`);
  }
}

export async function calculateTeamCost(teamId: string): Promise<number> {
  try {
    return await invoke<number>('calculate_team_cost', { teamId });
  } catch (error) {
    throw new Error(`Failed to calculate team cost: ${String(error)}`);
  }
}

export async function updateTeamUsage(teamId: string, metrics: UsageMetrics): Promise<void> {
  try {
    await invoke('update_team_usage', { teamId, metrics });
  } catch (error) {
    throw new Error(`Failed to update team usage: ${String(error)}`);
  }
}

// ============================================================================
// Ownership
// ============================================================================

export async function transferTeamOwnership(
  teamId: string,
  newOwnerId: string,
  transferredBy: string,
): Promise<void> {
  try {
    await invoke('transfer_team_ownership', { teamId, newOwnerId, transferredBy });
  } catch (error) {
    throw new Error(`Failed to transfer team ownership: ${String(error)}`);
  }
}
