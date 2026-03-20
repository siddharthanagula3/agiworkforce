/**
 * Governance & Privacy API — typed wrappers for audit, approval, and privacy commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface AuditFilters {
  userId?: string;
  teamId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
export interface AuditEvent {
  id: string;
  userId: string;
  action: string;
  details: unknown;
  timestamp: string;
  hash: string;
}
export interface AuditIntegrityReport {
  totalEvents: number;
  verifiedEvents: number;
  corruptedEvents: number;
}
export interface ApprovalAction {
  type: string;
  resourceId?: string;
  details?: unknown;
}
export interface ApprovalRequest {
  id: string;
  requesterId: string;
  action: ApprovalAction;
  riskLevel: string;
  status: string;
  justification?: string;
  createdAt: string;
}
export interface ApprovalStatistics {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  avgResponseTime: number;
}
export interface PrivacyPreferences {
  telemetryEnabled: boolean;
  crashReportingEnabled: boolean;
  aiModelSharingEnabled: boolean;
  analyticsEnabled: boolean;
  usageDataCollection: boolean;
}

// ---- Audit ----

export async function getAuditEvents(filters: AuditFilters): Promise<AuditEvent[]> {
  return command<AuditEvent[]>('get_audit_events', { filters });
}
export async function verifyAuditEvent(eventId: string): Promise<boolean> {
  return command<boolean>('verify_audit_event', { eventId });
}
export async function verifyAuditIntegrity(): Promise<AuditIntegrityReport> {
  return command<AuditIntegrityReport>('verify_audit_integrity');
}
export async function logToolExecution(
  toolName: string,
  success: boolean,
  userId?: string,
  teamId?: string,
  metadata?: unknown,
): Promise<void> {
  return command<void>('log_tool_execution', { userId, teamId, toolName, success, metadata });
}
export async function logWorkflowExecution(
  workflowId: string,
  status: string,
  userId?: string,
  teamId?: string,
  metadata?: unknown,
): Promise<void> {
  return command<void>('log_workflow_execution', { userId, teamId, workflowId, status, metadata });
}

// ---- Approvals ----

export async function createApprovalRequest(
  requesterId: string,
  action: ApprovalAction,
  riskLevel: string,
  timeoutMinutes: number,
  teamId?: string,
  justification?: string,
): Promise<string> {
  return command<string>('create_approval_request', {
    requesterId,
    teamId,
    action,
    riskLevel,
    justification,
    timeoutMinutes,
  });
}
export async function getPendingApprovals(teamId?: string): Promise<ApprovalRequest[]> {
  return command<ApprovalRequest[]>('get_pending_approvals', { teamId });
}
export async function getApprovalRequest(requestId: string): Promise<ApprovalRequest> {
  return command<ApprovalRequest>('get_approval_request', { requestId });
}
export async function approveRequest(
  requestId: string,
  reviewerId: string,
  reason?: string,
): Promise<void> {
  return command<void>('approve_request', { requestId, reviewerId, reason });
}
export async function rejectRequest(
  requestId: string,
  reviewerId: string,
  reason: string,
): Promise<void> {
  return command<void>('reject_request', { requestId, reviewerId, reason });
}
export async function requiresApproval(action: ApprovalAction): Promise<boolean> {
  return command<boolean>('requires_approval', { action });
}
export async function calculateRiskLevel(action: ApprovalAction): Promise<string> {
  return command<string>('calculate_risk_level', { action });
}
export async function getApprovalStatistics(teamId?: string): Promise<ApprovalStatistics> {
  return command<ApprovalStatistics>('get_approval_statistics', { teamId });
}
export async function expireTimedOutRequests(): Promise<number> {
  return command<number>('expire_timed_out_requests');
}

// ---- Privacy ----

export async function settingsUpdatePrivacy(preferences: PrivacyPreferences): Promise<void> {
  return command<void>('settings_update_privacy', { preferences });
}
export async function privacyExportData(): Promise<string> {
  return command<string>('privacy_export_data');
}
export async function privacyDeleteAccount(userId: string): Promise<string> {
  return command<string>('privacy_delete_account', { userId });
}
