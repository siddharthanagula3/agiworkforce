/**
 * Teams API — typed wrappers for team management, members, resources, billing, and subscription commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  memberCount: number;
}
export interface TeamMember {
  userId: string;
  role: string;
  joinedAt: string;
  email?: string;
}
export interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedBy: string;
  createdAt: string;
}
export interface TeamResource {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  resourceDescription?: string;
  sharedBy: string;
  sharedAt: string;
}
export interface TeamActivity {
  id: string;
  userId: string;
  action: string;
  details?: string;
  timestamp: string;
}
export interface TeamBilling {
  teamId: string;
  plan: string;
  cycle: string;
  seatCount: number;
  costPerSeat: number;
}
export interface UsageMetrics {
  [key: string]: number;
}
export interface SubscriptionInfo {
  id: string;
  planId: string;
  status: string;
  currentPeriodEnd: string;
}
export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
}

// ---- Team CRUD ----

export async function createTeam(
  name: string,
  ownerId: string,
  description?: string,
): Promise<Team> {
  return command<Team>('create_team', { name, description, ownerId });
}
export async function getTeam(teamId: string): Promise<Team | null> {
  return command<Team | null>('get_team', { teamId });
}
export async function updateTeam(
  teamId: string,
  name?: string,
  description?: string,
): Promise<void> {
  return command<void>('update_team', { teamId, name, description });
}
export async function updateTeamSettings(
  teamId: string,
  opts: {
    defaultMemberRole?: string;
    allowResourceSharing?: boolean;
    requireApprovalForAutomations?: boolean;
    enableActivityNotifications?: boolean;
    maxMembers?: number;
  },
): Promise<void> {
  return command<void>('update_team_settings', { teamId, ...opts });
}
export async function deleteTeam(teamId: string): Promise<void> {
  return command<void>('delete_team', { teamId });
}
export async function getUserTeams(userId: string): Promise<Team[]> {
  return command<Team[]>('get_user_teams', { userId });
}
export async function transferTeamOwnership(
  teamId: string,
  newOwnerId: string,
  transferredBy: string,
): Promise<void> {
  return command<void>('transfer_team_ownership', { teamId, newOwnerId, transferredBy });
}

// ---- Members ----

export async function inviteMember(
  teamId: string,
  email: string,
  role: string,
  invitedBy: string,
): Promise<string> {
  return command<string>('invite_member', { teamId, email, role, invitedBy });
}
export async function acceptInvitation(token: string, userId: string): Promise<Team> {
  return command<Team>('accept_invitation', { token, userId });
}
export async function removeMember(
  teamId: string,
  userId: string,
  removedBy: string,
): Promise<void> {
  return command<void>('remove_member', { teamId, userId, removedBy });
}
export async function updateMemberRole(
  teamId: string,
  userId: string,
  role: string,
  updatedBy: string,
): Promise<void> {
  return command<void>('update_member_role', { teamId, userId, role, updatedBy });
}
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  return command<TeamMember[]>('get_team_members', { teamId });
}
export async function getTeamInvitations(teamId: string): Promise<TeamInvitation[]> {
  return command<TeamInvitation[]>('get_team_invitations', { teamId });
}

// ---- Resources ----

export async function shareResource(
  teamId: string,
  resourceType: string,
  resourceId: string,
  resourceName: string,
  sharedBy: string,
  resourceDescription?: string,
): Promise<void> {
  return command<void>('share_resource', {
    teamId,
    resourceType,
    resourceId,
    resourceName,
    resourceDescription,
    sharedBy,
  });
}
export async function unshareResource(
  teamId: string,
  resourceType: string,
  resourceId: string,
  unsharedBy: string,
): Promise<void> {
  return command<void>('unshare_resource', { teamId, resourceType, resourceId, unsharedBy });
}
export async function getTeamResources(teamId: string): Promise<TeamResource[]> {
  return command<TeamResource[]>('get_team_resources', { teamId });
}
export async function getTeamResourcesByType(
  teamId: string,
  resourceType: string,
): Promise<TeamResource[]> {
  return command<TeamResource[]>('get_team_resources_by_type', { teamId, resourceType });
}

// ---- Activity ----

export async function getTeamActivity(
  teamId: string,
  limit: number,
  offset: number,
): Promise<TeamActivity[]> {
  return command<TeamActivity[]>('get_team_activity', { teamId, limit, offset });
}
export async function getUserTeamActivity(
  teamId: string,
  userId: string,
  limit: number,
): Promise<TeamActivity[]> {
  return command<TeamActivity[]>('get_user_team_activity', { teamId, userId, limit });
}

// ---- Team Billing ----

export async function getTeamBilling(teamId: string): Promise<TeamBilling | null> {
  return command<TeamBilling | null>('get_team_billing', { teamId });
}
export async function initializeTeamBilling(
  teamId: string,
  plan: string,
  cycle: string,
  seatCount: number,
): Promise<TeamBilling> {
  return command<TeamBilling>('initialize_team_billing', { teamId, plan, cycle, seatCount });
}
export async function updateTeamPlan(
  teamId: string,
  plan: string,
  updatedBy: string,
): Promise<void> {
  return command<void>('update_team_plan', { teamId, plan, updatedBy });
}
export async function addTeamSeats(
  teamId: string,
  count: number,
  updatedBy: string,
): Promise<void> {
  return command<void>('add_team_seats', { teamId, count, updatedBy });
}
export async function removeTeamSeats(
  teamId: string,
  count: number,
  updatedBy: string,
): Promise<void> {
  return command<void>('remove_team_seats', { teamId, count, updatedBy });
}
export async function calculateTeamCost(teamId: string): Promise<number> {
  return command<number>('calculate_team_cost', { teamId });
}
export async function updateTeamUsage(teamId: string, metrics: UsageMetrics): Promise<void> {
  return command<void>('update_team_usage', { teamId, metrics });
}

// ---- Subscriptions ----

export async function subscribeToPlan(
  userId: string,
  planId: string,
  billingInterval?: string,
): Promise<SubscriptionInfo> {
  return command<SubscriptionInfo>('subscribe_to_plan', { userId, planId, billingInterval });
}
export async function upgradePlan(userId: string, newPlanId: string): Promise<SubscriptionInfo> {
  return command<SubscriptionInfo>('upgrade_plan', { userId, newPlanId });
}
export async function cancelSubscription(userId: string, subscriptionId: string): Promise<void> {
  return command<void>('cancel_subscription', { userId, subscriptionId });
}
export async function getPricingPlans(): Promise<PricingPlan[]> {
  return command<PricingPlan[]>('get_pricing_plans');
}
export async function getCurrentPlan(userId: string): Promise<PricingPlan> {
  return command<PricingPlan>('get_current_plan', { userId });
}
