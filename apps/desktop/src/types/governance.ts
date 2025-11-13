/**
 * Governance and audit types for AGI Workforce
 */

export enum AuditEventType {
  // Authentication
  UserLogin = 'user_login',
  UserLogout = 'user_logout',
  UserLoginFailed = 'user_login_failed',

  // Workflow execution
  WorkflowExecuted = 'workflow_executed',
  WorkflowFailed = 'workflow_failed',
  WorkflowCancelled = 'workflow_cancelled',

  // Automation
  AutomationTriggered = 'automation_triggered',
  AutomationCompleted = 'automation_completed',
  AutomationFailed = 'automation_failed',

  // Resource access
  ResourceAccessed = 'resource_accessed',
  ResourceModified = 'resource_modified',
  ResourceDeleted = 'resource_deleted',
  ResourceShared = 'resource_shared',

  // Settings changes
  SettingsChanged = 'settings_changed',
  PermissionsChanged = 'permissions_changed',

  // Security
  SecurityPolicyViolation = 'security_policy_violation',
  SuspiciousActivity = 'suspicious_activity',
  ApprovalRequired = 'approval_required',
  ApprovalGranted = 'approval_granted',
  ApprovalDenied = 'approval_denied',
}

export enum AuditSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical',
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId: string;
  teamId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  action: string;
  details: string | null;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export enum ApprovalStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
}

export enum ApprovalRequestType {
  WorkflowExecution = 'workflow_execution',
  AutomationRun = 'automation_run',
  ResourceAccess = 'resource_access',
  SettingsChange = 'settings_change',
  PermissionGrant = 'permission_grant',
}

export interface ApprovalRequest {
  id: string;
  teamId: string;
  requestType: ApprovalRequestType;
  requestedBy: string;
  status: ApprovalStatus;
  resourceType: string | null;
  resourceId: string | null;
  description: string;
  metadata: Record<string, any> | null;
  createdAt: number;
  expiresAt: number | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  reviewNotes: string | null;
}

export interface SecurityAlert {
  id: string;
  timestamp: number;
  severity: AuditSeverity;
  type: string;
  description: string;
  userId: string | null;
  teamId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: number | null;
  metadata: Record<string, any> | null;
}

export interface ComplianceReport {
  id: string;
  teamId: string;
  reportType: string;
  generatedAt: number;
  generatedBy: string;
  periodStart: number;
  periodEnd: number;
  summary: {
    totalEvents: number;
    criticalEvents: number;
    warningEvents: number;
    securityViolations: number;
    approvalRequests: number;
  };
  data: Record<string, any>;
}

export interface AuditFilter {
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  userId?: string;
  teamId?: string;
  startDate?: number;
  endDate?: number;
  searchQuery?: string;
}
