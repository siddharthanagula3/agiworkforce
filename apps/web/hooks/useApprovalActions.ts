// Stub for desktop-only approval actions hook
export function useApprovalActions() {
  return {
    approveAction: async () => {},
    rejectAction: async () => {},
    pendingApprovals: [] as any[],
  };
}
