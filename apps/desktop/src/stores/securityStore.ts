// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ApprovalRequestPayload {
  id: string;
  request_type: string;
  description: string;
  impact?: string;
  risk_level: string;
  status: string;
  created_at: string;
  approved_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  timeout_seconds?: number;
  details?: Record<string, unknown>;
}

interface SecurityState {
  isCheckingSecret: boolean;
  secretError: string | null;

  pendingApprovalId: string | null;

  authLogin: (email: string, password: string) => Promise<AuthToken>;

  hasSecret: (key: string) => Promise<boolean>;
  setSecret: (key: string, value: string) => Promise<void>;
  deleteSecret: (key: string) => Promise<void>;

  approveOperation: (approvalId: string) => Promise<void>;
  rejectOperation: (approvalId: string, reason?: string) => Promise<void>;

  clearError: () => void;
}

export const useSecurityStore = create<SecurityState>()(
  devtools(
    subscribeWithSelector((set) => ({
      isCheckingSecret: false,
      secretError: null,
      pendingApprovalId: null,

      authLogin: async (email: string, password: string) => {
        try {
          const token = await invoke<AuthToken>('auth_login', { email, password });
          return token;
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : 'Login failed');
        }
      },

      hasSecret: async (key: string) => {
        set({ isCheckingSecret: true, secretError: null });
        try {
          const exists = await invoke<boolean>('secret_manager_has', { key });
          set({ isCheckingSecret: false });
          return exists;
        } catch (error) {
          set({ isCheckingSecret: false, secretError: String(error) });
          throw error;
        }
      },

      setSecret: async (key: string, value: string) => {
        set({ secretError: null });
        try {
          await invoke('secret_manager_set', { key, value });
        } catch (error) {
          set({ secretError: String(error) });
          throw error;
        }
      },

      deleteSecret: async (key: string) => {
        set({ secretError: null });
        try {
          await invoke('secret_manager_delete', { key });
        } catch (error) {
          set({ secretError: String(error) });
          throw error;
        }
      },

      approveOperation: async (approvalId: string) => {
        set({ pendingApprovalId: approvalId });
        try {
          await invoke('approve_operation', { approvalId });
          set({ pendingApprovalId: null });
        } catch (error) {
          set({ pendingApprovalId: null });
          throw new Error(error instanceof Error ? error.message : 'Failed to approve operation');
        }
      },

      rejectOperation: async (approvalId: string, reason?: string) => {
        set({ pendingApprovalId: approvalId });
        try {
          await invoke('reject_operation', { approvalId, reason: reason ?? null });
          set({ pendingApprovalId: null });
        } catch (error) {
          set({ pendingApprovalId: null });
          throw new Error(error instanceof Error ? error.message : 'Failed to reject operation');
        }
      },

      clearError: () => {
        set({ secretError: null });
      },
    })),
    { name: 'SecurityStore', enabled: import.meta.env.DEV },
  ),
);
