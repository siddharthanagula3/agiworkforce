import type { ContextPolicySnapshot } from '../../context-policy-snapshot';

export function contextPolicySnapshotFixture(
  userId = 'user-1',
  organizationId: string | null = null,
): ContextPolicySnapshot {
  return {
    version: 1,
    userId,
    organizationId,
    policy: {
      allowMemory: true,
      allowPastChats: true,
      allowConnectorResults: true,
      allowWebResults: true,
    },
  };
}
