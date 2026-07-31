import { useCallback } from 'react';
import type { ApprovalRequest } from '../stores/chat/toolStore';
import {
  resolveApprovalRequest,
  type ApprovalResolutionOptions,
} from '../services/approvalResolution';

export function useApprovalActions() {
  const resolveApproval = useCallback(
    (
      approval: ApprovalRequest,
      decision: 'approve' | 'reject',
      options?: ApprovalResolutionOptions,
    ) => {
      return resolveApprovalRequest(approval, decision, options);
    },
    [],
  );

  return { resolveApproval };
}
