import { z } from 'zod';

import {
  readOrganizationContextPolicy,
  type ManagedMemoryContextDb,
} from './managed-memory-context-service';

export const CONTEXT_POLICY_SNAPSHOT_KEY = 'x_context_policy_snapshot';
export const CONTEXT_POLICY_RESTART_CODE = 'context_policy_restart_required';
export const CONTEXT_POLICY_RESTART_MESSAGE =
  'The saved turn cannot be continued under the current context privacy policy. Start a new turn.';

export const ContextPolicySnapshotSchema = z
  .object({
    version: z.literal(1),
    userId: z.string().min(1),
    organizationId: z.string().nullable(),
    policy: z
      .object({
        allowMemory: z.boolean(),
        allowPastChats: z.boolean(),
        allowConnectorResults: z.boolean(),
        allowWebResults: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type ContextPolicySnapshot = z.infer<typeof ContextPolicySnapshotSchema>;

export async function captureContextPolicySnapshot(
  db: ManagedMemoryContextDb,
  userId: string,
  organizationId: string | null,
): Promise<ContextPolicySnapshot | null> {
  const read = await readOrganizationContextPolicy(db, organizationId);
  return read.readable ? { version: 1, userId, organizationId, policy: read.policy } : null;
}

export function contextPolicySnapshotsMatch(saved: unknown, current: unknown): boolean {
  const previous = ContextPolicySnapshotSchema.safeParse(saved);
  const latest = ContextPolicySnapshotSchema.safeParse(current);
  return (
    previous.success &&
    latest.success &&
    JSON.stringify(previous.data) === JSON.stringify(latest.data)
  );
}

export async function contextPolicySnapshotIsCurrent(
  db: ManagedMemoryContextDb,
  userId: string,
  organizationId: string | null,
  snapshot: unknown,
): Promise<boolean> {
  if (!ContextPolicySnapshotSchema.safeParse(snapshot).success) return false;
  return contextPolicySnapshotsMatch(
    snapshot,
    await captureContextPolicySnapshot(db, userId, organizationId),
  );
}
