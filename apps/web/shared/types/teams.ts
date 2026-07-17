/**
 * Team types for the web app
 * Mirrors the desktop app's team types for type safety
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
  MemberJoined = 'member_joined',
  MemberLeft = 'member_left',
  MemberRoleChanged = 'member_role_changed',
  MemberInvited = 'member_invited',
  ResourceShared = 'resource_shared',
  ResourceUnshared = 'resource_unshared',
  ResourceAccessed = 'resource_accessed',
  ResourceModified = 'resource_modified',
  ResourceDeleted = 'resource_deleted',
  WorkflowCreated = 'workflow_created',
  WorkflowExecuted = 'workflow_executed',
  WorkflowModified = 'workflow_modified',
  WorkflowDeleted = 'workflow_deleted',
  AutomationCreated = 'automation_created',
  AutomationExecuted = 'automation_executed',
  AutomationModified = 'automation_modified',
  AutomationDeleted = 'automation_deleted',
  SettingsChanged = 'settings_changed',
  TeamCreated = 'team_created',
  TeamDeleted = 'team_deleted',
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
  metadata: Record<string, unknown> | null;
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

export enum Permission {
  ViewResources = 'view_resources',
  CreateResources = 'create_resources',
  ModifyResources = 'modify_resources',
  DeleteResources = 'delete_resources',
  ShareResources = 'share_resources',
  ViewMembers = 'view_members',
  InviteMembers = 'invite_members',
  RemoveMembers = 'remove_members',
  ModifyMemberRoles = 'modify_member_roles',
  ViewTeamSettings = 'view_team_settings',
  ModifyTeamSettings = 'modify_team_settings',
  DeleteTeam = 'delete_team',
  ViewAutomations = 'view_automations',
  RunAutomations = 'run_automations',
  CreateAutomations = 'create_automations',
  ModifyAutomations = 'modify_automations',
  DeleteAutomations = 'delete_automations',
  ViewWorkflows = 'view_workflows',
  CreateWorkflows = 'create_workflows',
  ModifyWorkflows = 'modify_workflows',
  DeleteWorkflows = 'delete_workflows',
  ExecuteWorkflows = 'execute_workflows',
  ViewBilling = 'view_billing',
  ManageBilling = 'manage_billing',
  ViewActivity = 'view_activity',
  ExportActivity = 'export_activity',
}

export interface ResourcePermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
}
