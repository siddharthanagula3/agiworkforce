/* eslint-disable @typescript-eslint/no-explicit-any -- stub hook with placeholder types */
// Stub for desktop-only approval actions hook
export function useApprovalActions() {
  return {
    approveAction: async () => {},
    rejectAction: async () => {},
    pendingApprovals: [] as any[],
    resolveApproval: async (_approval: any, _decision: string, _opts?: any) => {},
  };
}
