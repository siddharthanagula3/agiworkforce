import { invoke } from '@tauri-apps/api/core';
import {
  Team,
  TeamMember,
  TeamInvitation,
  TeamRole,
  TeamResource,
  ResourceType,
  TeamActivity,
  TeamBilling,
  BillingPlan,
  BillingCycle,
  UsageMetrics,
} from '../types/teams';

export const teamsApi = {
  // Team Management
  createTeam: async (name: string, description: string | null, ownerId: string): Promise<Team> => {
    return invoke('create_team', { name, description, ownerId });
  },

  getTeam: async (teamId: string): Promise<Team | null> => {
    return invoke('get_team', { teamId });
  },

  updateTeam: async (teamId: string, name?: string, description?: string): Promise<void> => {
    return invoke('update_team', { teamId, name, description });
  },

  deleteTeam: async (teamId: string): Promise<void> => {
    return invoke('delete_team', { teamId });
  },

  getUserTeams: async (userId: string): Promise<Team[]> => {
    return invoke('get_user_teams', { userId });
  },

  transferOwnership: async (
    teamId: string,
    newOwnerId: string,
    transferredBy: string,
  ): Promise<void> => {
    return invoke('transfer_team_ownership', { teamId, newOwnerId, transferredBy });
  },

  // Member Management
  inviteMember: async (
    teamId: string,
    email: string,
    role: TeamRole,
    invitedBy: string,
  ): Promise<string> => {
    return invoke('invite_member', { teamId, email, role, invitedBy });
  },

  acceptInvitation: async (token: string, userId: string): Promise<Team> => {
    return invoke('accept_invitation', { token, userId });
  },

  removeMember: async (teamId: string, userId: string, removedBy: string): Promise<void> => {
    return invoke('remove_member', { teamId, userId, removedBy });
  },

  updateMemberRole: async (
    teamId: string,
    userId: string,
    role: TeamRole,
    updatedBy: string,
  ): Promise<void> => {
    return invoke('update_member_role', { teamId, userId, role, updatedBy });
  },

  getTeamMembers: async (teamId: string): Promise<TeamMember[]> => {
    return invoke('get_team_members', { teamId });
  },

  getTeamInvitations: async (teamId: string): Promise<TeamInvitation[]> => {
    return invoke('get_team_invitations', { teamId });
  },

  // Resource Sharing
  shareResource: async (
    teamId: string,
    resourceType: ResourceType,
    resourceId: string,
    resourceName: string,
    resourceDescription: string | null,
    sharedBy: string,
  ): Promise<void> => {
    return invoke('share_resource', {
      teamId,
      resourceType,
      resourceId,
      resourceName,
      resourceDescription,
      sharedBy,
    });
  },

  unshareResource: async (
    teamId: string,
    resourceType: ResourceType,
    resourceId: string,
    unsharedBy: string,
  ): Promise<void> => {
    return invoke('unshare_resource', { teamId, resourceType, resourceId, unsharedBy });
  },

  getTeamResources: async (teamId: string): Promise<TeamResource[]> => {
    return invoke('get_team_resources', { teamId });
  },

  getTeamResourcesByType: async (
    teamId: string,
    resourceType: ResourceType,
  ): Promise<TeamResource[]> => {
    return invoke('get_team_resources_by_type', { teamId, resourceType });
  },

  // Activity Logs
  getTeamActivity: async (
    teamId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<TeamActivity[]> => {
    return invoke('get_team_activity', { teamId, limit, offset });
  },

  getUserTeamActivity: async (
    teamId: string,
    userId: string,
    limit: number = 20,
  ): Promise<TeamActivity[]> => {
    return invoke('get_user_team_activity', { teamId, userId, limit });
  },

  // Billing & Usage
  getTeamBilling: async (teamId: string): Promise<TeamBilling | null> => {
    return invoke('get_team_billing', { teamId });
  },

  initializeTeamBilling: async (
    teamId: string,
    plan: BillingPlan,
    cycle: BillingCycle,
    seatCount: number,
  ): Promise<TeamBilling> => {
    return invoke('initialize_team_billing', { teamId, plan, cycle, seatCount });
  },

  updateTeamPlan: async (teamId: string, plan: BillingPlan, updatedBy: string): Promise<void> => {
    return invoke('update_team_plan', { teamId, plan, updatedBy });
  },

  addTeamSeats: async (teamId: string, count: number, updatedBy: string): Promise<void> => {
    return invoke('add_team_seats', { teamId, count, updatedBy });
  },

  removeTeamSeats: async (teamId: string, count: number, updatedBy: string): Promise<void> => {
    return invoke('remove_team_seats', { teamId, count, updatedBy });
  },

  calculateTeamCost: async (teamId: string): Promise<number> => {
    return invoke('calculate_team_cost', { teamId });
  },

  updateTeamUsage: async (teamId: string, metrics: UsageMetrics): Promise<void> => {
    return invoke('update_team_usage', { teamId, metrics });
  },
};
