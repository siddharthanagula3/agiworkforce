import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// Types based on Rust structures
export interface AuditEvent {
  id: string;
  timestamp: number;
  user_id?: string;
  team_id?: string;
  event_type: string;
  resource_type?: string;
  resource_id?: string;
  action: string;
  status: 'success' | 'failure' | 'blocked' | 'pending';
  metadata?: Record<string, unknown>;
}

export interface AuditFilters {
  user_id?: string;
  team_id?: string;
  event_type?: string;
  status?: string;
  start_time?: number;
  end_time?: number;
  limit?: number;
}

export interface AuditIntegrityReport {
  total_events: number;
  verified_events: number;
  tampered_events: string[];
}

export interface ApprovalAction {
  action_type: string;
  resource_type?: string;
  resource_id?: string;
  parameters: Record<string, unknown>;
}

export interface ApprovalRequest {
  id: string;
  requester_id: string;
  team_id?: string;
  action: ApprovalAction;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  justification?: string;
  status: 'pending' | 'approved' | 'rejected' | 'timed_out';
  created_at: number;
  reviewed_by?: string;
  reviewed_at?: number;
  decision_reason?: string;
  expires_at: number;
}

export interface ApprovalStatistics {
  total_requests: number;
  approved: number;
  rejected: number;
  pending: number;
  timed_out: number;
}

interface GovernanceState {
  // Audit events
  auditEvents: AuditEvent[];
  auditFilters: AuditFilters;
  auditIntegrityReport: AuditIntegrityReport | null;
  isLoadingAudit: boolean;
  auditError: string | null;

  // Approval requests
  approvalRequests: ApprovalRequest[];
  approvalStatistics: ApprovalStatistics | null;
  isLoadingApprovals: boolean;
  approvalError: string | null;

  // Actions
  fetchAuditEvents: (filters?: AuditFilters) => Promise<void>;
  verifyAuditEvent: (eventId: string) => Promise<boolean>;
  verifyAuditIntegrity: () => Promise<void>;
  logToolExecution: (
    userId: string | null,
    teamId: string | null,
    toolName: string,
    success: boolean,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  logWorkflowExecution: (
    userId: string | null,
    teamId: string | null,
    workflowId: string,
    status: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;

  createApprovalRequest: (
    requesterId: string,
    teamId: string | null,
    action: ApprovalAction,
    riskLevel: string,
    justification: string | null,
    timeoutMinutes: number,
  ) => Promise<string>;
  fetchPendingApprovals: (teamId?: string) => Promise<void>;
  approveRequest: (requestId: string, reviewerId: string, reason?: string) => Promise<void>;
  rejectRequest: (requestId: string, reviewerId: string, reason: string) => Promise<void>;
  requiresApproval: (action: ApprovalAction) => Promise<boolean>;
  calculateRiskLevel: (action: ApprovalAction) => Promise<string>;
  fetchApprovalStatistics: (teamId?: string) => Promise<void>;
  expireTimedOutRequests: () => Promise<number>;

  // Filters
  setAuditFilters: (filters: AuditFilters) => void;
}

export const useGovernanceStore = create<GovernanceState>((set, get) => ({
  // Initial state
  auditEvents: [],
  auditFilters: {},
  auditIntegrityReport: null,
  isLoadingAudit: false,
  auditError: null,

  approvalRequests: [],
  approvalStatistics: null,
  isLoadingApprovals: false,
  approvalError: null,

  // Audit actions
  fetchAuditEvents: async (filters?: AuditFilters) => {
    set({ isLoadingAudit: true, auditError: null });
    try {
      const events = await invoke<AuditEvent[]>('get_audit_events', {
        filters: filters || get().auditFilters,
      });
      set({ auditEvents: events, isLoadingAudit: false });
    } catch (error) {
      set({
        auditError: error instanceof Error ? error.message : 'Failed to fetch audit events',
        isLoadingAudit: false,
      });
    }
  },

  verifyAuditEvent: async (eventId: string): Promise<boolean> => {
    try {
      const isValid = await invoke<boolean>('verify_audit_event', { eventId });
      return isValid;
    } catch (error) {
      console.error('Failed to verify audit event:', error);
      return false;
    }
  },

  verifyAuditIntegrity: async () => {
    set({ isLoadingAudit: true, auditError: null });
    try {
      const report = await invoke<AuditIntegrityReport>('verify_audit_integrity');
      set({ auditIntegrityReport: report, isLoadingAudit: false });
    } catch (error) {
      set({
        auditError: error instanceof Error ? error.message : 'Failed to verify audit integrity',
        isLoadingAudit: false,
      });
    }
  },

  logToolExecution: async (
    userId: string | null,
    teamId: string | null,
    toolName: string,
    success: boolean,
    metadata?: Record<string, unknown>,
  ) => {
    try {
      await invoke('log_tool_execution', {
        userId,
        teamId,
        toolName,
        success,
        metadata: metadata || null,
      });
    } catch (error) {
      console.error('Failed to log tool execution:', error);
    }
  },

  logWorkflowExecution: async (
    userId: string | null,
    teamId: string | null,
    workflowId: string,
    status: string,
    metadata?: Record<string, unknown>,
  ) => {
    try {
      await invoke('log_workflow_execution', {
        userId,
        teamId,
        workflowId,
        status,
        metadata: metadata || null,
      });
    } catch (error) {
      console.error('Failed to log workflow execution:', error);
    }
  },

  // Approval actions
  createApprovalRequest: async (
    requesterId: string,
    teamId: string | null,
    action: ApprovalAction,
    riskLevel: string,
    justification: string | null,
    timeoutMinutes: number,
  ): Promise<string> => {
    try {
      const requestId = await invoke<string>('create_approval_request', {
        requesterId,
        teamId,
        action,
        riskLevel,
        justification,
        timeoutMinutes,
      });
      return requestId;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to create approval request');
    }
  },

  fetchPendingApprovals: async (teamId?: string) => {
    set({ isLoadingApprovals: true, approvalError: null });
    try {
      const requests = await invoke<ApprovalRequest[]>('get_pending_approvals', {
        teamId: teamId || null,
      });
      set({ approvalRequests: requests, isLoadingApprovals: false });
    } catch (error) {
      set({
        approvalError: error instanceof Error ? error.message : 'Failed to fetch pending approvals',
        isLoadingApprovals: false,
      });
    }
  },

  approveRequest: async (requestId: string, reviewerId: string, reason?: string) => {
    try {
      await invoke('approve_request', {
        requestId,
        reviewerId,
        reason: reason || null,
      });

      // Refresh pending approvals
      await get().fetchPendingApprovals();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to approve request');
    }
  },

  rejectRequest: async (requestId: string, reviewerId: string, reason: string) => {
    try {
      await invoke('reject_request', {
        requestId,
        reviewerId,
        reason,
      });

      // Refresh pending approvals
      await get().fetchPendingApprovals();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to reject request');
    }
  },

  requiresApproval: async (action: ApprovalAction): Promise<boolean> => {
    try {
      const required = await invoke<boolean>('requires_approval', { action });
      return required;
    } catch (error) {
      console.error('Failed to check if approval is required:', error);
      return false;
    }
  },

  calculateRiskLevel: async (action: ApprovalAction): Promise<string> => {
    try {
      const riskLevel = await invoke<string>('calculate_risk_level', { action });
      return riskLevel;
    } catch (error) {
      console.error('Failed to calculate risk level:', error);
      return 'medium';
    }
  },

  fetchApprovalStatistics: async (teamId?: string) => {
    try {
      const stats = await invoke<ApprovalStatistics>('get_approval_statistics', {
        teamId: teamId || null,
      });
      set({ approvalStatistics: stats });
    } catch (error) {
      console.error('Failed to fetch approval statistics:', error);
    }
  },

  expireTimedOutRequests: async (): Promise<number> => {
    try {
      const count = await invoke<number>('expire_timed_out_requests');
      return count;
    } catch (error) {
      console.error('Failed to expire timed-out requests:', error);
      return 0;
    }
  },

  // Filters
  setAuditFilters: (filters: AuditFilters) => {
    set({ auditFilters: filters });
  },
}));
