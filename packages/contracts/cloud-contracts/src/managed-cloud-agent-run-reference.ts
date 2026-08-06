/**
 * The durable handle a client keeps for a server-owned managed-cloud agent run.
 *
 * This lives in its own leaf module because both the typed run client
 * (`./managed-cloud-agent-runs-client`) and the tool-approval resume contract
 * (`./tool-approval-resume`) need the schema at runtime, and they already
 * depend on each other in the other direction — the client parses a resume
 * request body, the resume contract parses a persisted run reference. Holding
 * the shared value here keeps that a DAG instead of a require cycle, which
 * Metro reports on every Mobile boot and which resolves to `undefined` under
 * whichever bundler evaluates the modules in the unlucky order.
 *
 * The canonical public entry point for these symbols stays
 * `./managed-cloud-agent-runs-client`, which re-exports them.
 */

import { z } from 'zod';
import { AgentTaskStateSchema } from './agent-events';
import { managedCloudAgentRunPath, type CloudAgentRun } from './cloud-agent-runs';

export interface ManagedCloudAgentRunHandle {
  runId: string;
  runPath: string;
}

/**
 * Serializable client checkpoint stored with an assistant turn. The stable
 * handle identifies the server-owned run while `lastSequence` is the exact
 * replay cursor already projected into that message.
 */
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
