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

  // Decode-only compatibility for activity rows written by the removed local
  // billing ledger. No production command emits these events now.
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
