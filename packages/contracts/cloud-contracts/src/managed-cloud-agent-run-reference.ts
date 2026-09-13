import { z } from 'zod';
import { AgentTaskStateSchema } from './agent-events';
import { managedCloudAgentRunPath, type CloudAgentRun } from './cloud-agent-runs';

export interface ManagedCloudAgentRunHandle {
  runId: string;
  runPath: string;
  /**
   * Whether this turn survives the connection that started it. True only on the
   * durable Workflow transport. The run row looks identical either way, so
   * without this the client cannot tell a task that keeps going from one that
   * dies with the tab, and told the user the wrong one.
   */
  detachable: boolean;
}

/**
 * `detachable` is optional here and required on the handle: the handle is read
 * from the response that started the turn, where the transport is always known,
 * while a reference can be one persisted before the field existed. Absent means
 * unknown, which is not the same as durable.
 */
export interface ManagedCloudAgentRunReference extends Omit<
  ManagedCloudAgentRunHandle,
  'detachable'
> {
  detachable?: boolean;
  lastSequence: number;
  state?: CloudAgentRun['state'];
  cancellationRequestedAt?: string | null;
}

export const ManagedCloudAgentRunReferenceSchema: z.ZodType<ManagedCloudAgentRunReference> = z
  .object({
    runId: z.string().uuid(),
    runPath: z.string().min(1),
    detachable: z.boolean().optional(),
    lastSequence: z.number().int().min(-1),
    state: AgentTaskStateSchema.optional(),
    cancellationRequestedAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((reference, context) => {
    if (reference.runPath !== managedCloudAgentRunPath(reference.runId)) {
      context.addIssue({
        code: 'custom',
        path: ['runPath'],
        message: 'Managed Cloud agent-run path does not match its run ID',
      });
    }
  });
