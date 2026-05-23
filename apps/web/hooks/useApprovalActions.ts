// Stub for desktop-only approval actions hook
export function useApprovalActions() {
  return {
    approveAction: async () => {},
    rejectAction: async () => {},
    pendingApprovals: [] as unknown[],
    resolveApproval: async (_approval: unknown, _decision: string, _opts?: unknown) => {},
  };
}
