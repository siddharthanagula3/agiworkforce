import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { AuditRetentionClass } from '@agiworkforce/types';
import { invoke } from '../lib/tauri-mock';

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
  // The shared envelope. Absent on rows written before it existed, which is why
  // every field is optional and a reader must not drop a row that lacks them.
  schema_version?: number;
  correlation_id?: string;
  causation_id?: string;
  operation_ref?: string;
  retention_class?: AuditRetentionClass;
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
  auditEvents: AuditEvent[];
  auditIntegrityReport: AuditIntegrityReport | null;
  isLoadingAudit: boolean;
  auditError: string | null;

  approvalRequests: ApprovalRequest[];
  approvalStatistics: ApprovalStatistics | null;
  isLoadingApprovals: boolean;
  approvalError: string | null;

  fetchAuditEvents: (filters?: AuditFilters) => Promise<void>;
  verifyAuditIntegrity: () => Promise<void>;
  fetchPendingApprovals: (teamId?: string) => Promise<void>;
  approveRequest: (requestId: string, reviewerId: string, reason?: string) => Promise<void>;
  rejectRequest: (requestId: string, reviewerId: string, reason: string) => Promise<void>;
  fetchApprovalStatistics: (teamId?: string) => Promise<void>;
  expireTimedOutRequests: () => Promise<number>;
}

export const useGovernanceStore = create<GovernanceState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      auditEvents: [],
      auditIntegrityReport: null,
      isLoadingAudit: false,
      auditError: null,

      approvalRequests: [],
      approvalStatistics: null,
      isLoadingApprovals: false,
      approvalError: null,

      fetchAuditEvents: async (filters?: AuditFilters) => {
        set({ isLoadingAudit: true, auditError: null });
        try {
          const events = await invoke<AuditEvent[]>('get_audit_events', {
            filters: filters ?? {},
          });
          set({ auditEvents: events, isLoadingAudit: false });
        } catch (error) {
          set({
            auditError: error instanceof Error ? error.message : 'Failed to fetch audit events',
            isLoadingAudit: false,
          });
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

      fetchPendingApprovals: async (teamId?: string) => {
        set({ isLoadingApprovals: true, approvalError: null });
        try {
          const requests = await invoke<ApprovalRequest[]>('get_pending_approvals', {
            teamId: teamId || null,
          });
          set({ approvalRequests: requests, isLoadingApprovals: false });
        } catch (error) {
          set({
            approvalError:
              error instanceof Error ? error.message : 'Failed to fetch pending approvals',
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

          await get().fetchPendingApprovals();
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : 'Failed to reject request');
        }
      },

      fetchApprovalStatistics: async (teamId?: string) => {
        try {
          const stats = await invoke<ApprovalStatistics>('get_approval_statistics', {
            teamId: teamId || null,
          });
          set({ approvalStatistics: stats });
        } catch (error) {
          set({
            approvalError:
              error instanceof Error ? error.message : 'Failed to fetch approval statistics',
          });
        }
      },

      expireTimedOutRequests: () => invoke<number>('expire_timed_out_requests'),
    })),
    { name: 'GovernanceStore', enabled: import.meta.env.DEV },
  ),
);
