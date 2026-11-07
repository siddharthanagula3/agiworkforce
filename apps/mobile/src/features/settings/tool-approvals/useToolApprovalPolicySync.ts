import { useSyncExternalStore } from 'react';
import {
  getToolApprovalPolicySnapshot,
  subscribeToolApprovalPolicy,
} from './toolApprovalPolicyOwner';

export type { ToolApprovalPolicySync, ToolApprovalSyncStatus } from './toolApprovalPolicyOwner';

export function useToolApprovalPolicySync() {
  return useSyncExternalStore(subscribeToolApprovalPolicy, getToolApprovalPolicySnapshot);
}
