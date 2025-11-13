/**
 * Team collaboration types for AGI Workforce
 */

export interface Team {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  settings: TeamSettings;
  createdAt: number;
  updatedAt: number;
}

export interface TeamSettings {
  defaultMemberRole: TeamRole;
  allowResourceSharing: boolean;
  requireApprovalForAutomations: boolean;
  enableActivityNotifications: boolean;
  maxMembers: number | null;
}

export enum TeamRole {
  Viewer = 'viewer',
  Editor = 'editor',
  Admin = 'admin',
  Owner = 'owner',
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: number;
  invitedBy: string | null;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
  token: string;
  expiresAt: number;
  accepted: boolean;
  createdAt: number;
}

export enum ResourceType {
  Workflow = 'workflow',
  Template = 'template',
  Knowledge = 'knowledge',
  Automation = 'automation',
  Document = 'document',
  Dataset = 'dataset',
}

export interface TeamResource {
  teamId: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  resourceDescription: string | null;
  sharedBy: string;
  sharedAt: number;
  accessCount: number;
  lastAccessed: number | null;
}

export enum ActivityType {
  // Member activities
  MemberJoined = 'member_joined',
  MemberLeft = 'member_left',
  MemberRoleChanged = 'member_role_changed',
  MemberInvited = 'member_invited',

  // Resource activities
  ResourceShared = 'resource_shared',
  ResourceUnshared = 'resource_unshared',
  ResourceAccessed = 'resource_accessed',
  ResourceModified = 'resource_modified',
  ResourceDeleted = 'resource_deleted',

  // Workflow activities
  WorkflowCreated = 'workflow_created',
  WorkflowExecuted = 'workflow_executed',
  WorkflowModified = 'workflow_modified',
  WorkflowDeleted = 'workflow_deleted',

  // Automation activities
  AutomationCreated = 'automation_created',
  AutomationExecuted = 'automation_executed',
  AutomationModified = 'automation_modified',
  AutomationDeleted = 'automation_deleted',

  // Team settings
  SettingsChanged = 'settings_changed',
  TeamCreated = 'team_created',
  TeamDeleted = 'team_deleted',

  // Billing
  BillingPlanChanged = 'billing_plan_changed',
  BillingSeatsAdded = 'billing_seats_added',
  BillingSeatsRemoved = 'billing_seats_removed',
}

export interface TeamActivity {
  id: string;
  teamId: string;
  userId: string | null;
  action: ActivityType;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, any> | null;
  timestamp: number;
}

export enum BillingPlan {
  Team = 'team',
  Enterprise = 'enterprise',
}

export enum BillingCycle {
  Monthly = 'monthly',
  Annual = 'annual',
}

export interface UsageMetrics {
  workflowExecutions: number;
  automationRuns: number;
  apiCalls: number;
  storageUsedGb: number;
  computeHours: number;
  llmTokensUsed: number;
}

export interface TeamBilling {
  teamId: string;
  planTier: BillingPlan;
  billingCycle: BillingCycle;
  seatCount: number;
  stripeSubscriptionId: string | null;
  usageMetrics: UsageMetrics;
  nextBillingDate: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
}

export interface TeamUpdates {
  name?: string;
  description?: string | null;
  settings?: Partial<TeamSettings>;
}

// Permission types
export enum Permission {
  // Resource permissions
  ViewResources = 'view_resources',
  CreateResources = 'create_resources',
  ModifyResources = 'modify_resources',
  DeleteResources = 'delete_resources',
  ShareResources = 'share_resources',

  // Member permissions
  ViewMembers = 'view_members',
  InviteMembers = 'invite_members',
  RemoveMembers = 'remove_members',
  ModifyMemberRoles = 'modify_member_roles',

  // Team management
  ViewTeamSettings = 'view_team_settings',
  ModifyTeamSettings = 'modify_team_settings',
  DeleteTeam = 'delete_team',

  // Automation permissions
  ViewAutomations = 'view_automations',
  RunAutomations = 'run_automations',
  CreateAutomations = 'create_automations',
  ModifyAutomations = 'modify_automations',
  DeleteAutomations = 'delete_automations',

  // Workflow permissions
  ViewWorkflows = 'view_workflows',
  CreateWorkflows = 'create_workflows',
  ModifyWorkflows = 'modify_workflows',
  DeleteWorkflows = 'delete_workflows',
  ExecuteWorkflows = 'execute_workflows',

  // Billing permissions
  ViewBilling = 'view_billing',
  ManageBilling = 'manage_billing',

  // Activity permissions
  ViewActivity = 'view_activity',
  ExportActivity = 'export_activity',
}

export interface ResourcePermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
}

// Helper functions for role permissions
export const getRolePermissions = (role: TeamRole): Permission[] => {
  switch (role) {
    case TeamRole.Owner:
      return Object.values(Permission);

    case TeamRole.Admin:
      return Object.values(Permission).filter(
        (p) => p !== Permission.DeleteTeam && p !== Permission.ManageBilling,
      );

    case TeamRole.Editor:
      return [
        Permission.ViewResources,
        Permission.CreateResources,
        Permission.ModifyResources,
        Permission.ShareResources,
        Permission.ViewMembers,
        Permission.ViewTeamSettings,
        Permission.ViewAutomations,
        Permission.RunAutomations,
        Permission.CreateAutomations,
        Permission.ModifyAutomations,
        Permission.ViewWorkflows,
        Permission.CreateWorkflows,
        Permission.ModifyWorkflows,
        Permission.ExecuteWorkflows,
        Permission.ViewActivity,
      ];

    case TeamRole.Viewer:
      return [
        Permission.ViewResources,
        Permission.ViewMembers,
        Permission.ViewTeamSettings,
        Permission.ViewAutomations,
        Permission.ViewWorkflows,
        Permission.ViewActivity,
      ];

    default:
      return [];
  }
};

export const hasPermission = (role: TeamRole, permission: Permission): boolean => {
  return getRolePermissions(role).includes(permission);
};

export const canModifyRole = (actorRole: TeamRole, targetRole: TeamRole): boolean => {
  if (actorRole === TeamRole.Owner) return true;
  if (actorRole === TeamRole.Admin) return targetRole !== TeamRole.Owner;
  return false;
};

export const canRemoveRole = (actorRole: TeamRole, targetRole: TeamRole): boolean => {
  if (actorRole === TeamRole.Owner) return targetRole !== TeamRole.Owner;
  if (actorRole === TeamRole.Admin)
    return targetRole === TeamRole.Editor || targetRole === TeamRole.Viewer;
  return false;
};

// Plan information
export const getPlanInfo = (plan: BillingPlan) => {
  switch (plan) {
    case BillingPlan.Team:
      return {
        name: 'Team',
        pricePerSeat: 29,
        includedSeats: 5,
        maxSeats: 50,
        features: [
          'Up to 50 team members',
          'Shared workflows and automations',
          'Team activity logs',
          'Basic support',
          'API access',
        ],
      };

    case BillingPlan.Enterprise:
      return {
        name: 'Enterprise',
        pricePerSeat: 99,
        includedSeats: 10,
        maxSeats: null,
        features: [
          'Unlimited team members',
          'Advanced security features',
          'Priority support',
          'Custom integrations',
          'SSO and SAML',
          'Advanced analytics',
          'Dedicated account manager',
        ],
      };
  }
};

export const getCycleDiscount = (cycle: BillingCycle): number => {
  return cycle === BillingCycle.Annual ? 0.8 : 1.0; // 20% discount for annual
};

export const calculateTeamCost = (
  plan: BillingPlan,
  cycle: BillingCycle,
  seatCount: number,
): number => {
  const planInfo = getPlanInfo(plan);
  const discount = getCycleDiscount(cycle);
  const monthlyCost = planInfo.pricePerSeat * seatCount * discount;

  return cycle === BillingCycle.Annual ? monthlyCost * 12 : monthlyCost;
};
