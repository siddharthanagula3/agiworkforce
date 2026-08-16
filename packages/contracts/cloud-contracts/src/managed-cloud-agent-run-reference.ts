
import { z } from 'zod';
import { AgentTaskStateSchema } from './agent-events';
import { managedCloudAgentRunPath, type CloudAgentRun } from './cloud-agent-runs';

export interface ManagedCloudAgentRunHandle {
  runId: string;
  runPath: string;
}

export interface ManagedCloudAgentRunReference extends ManagedCloudAgentRunHandle {
  lastSequence: number;
  state?: CloudAgentRun['state'];
  cancellationRequestedAt?: string | null;
}

export const ManagedCloudAgentRunReferenceSchema: z.ZodType<ManagedCloudAgentRunReference> = z
  .object({
    runId: z.string().uuid(),
    runPath: z.string().min(1),
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
