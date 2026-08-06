import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import { z } from 'zod';
import { AgentEventEnvelopeSchema, AgentTaskStateSchema } from './agent-events';

export const MANAGED_CLOUD_AGENT_RUNS_BASE_PATH = '/api/llm/v1/chat/completions/runs';
export const MANAGED_CLOUD_AGENT_RUN_ID_HEADER = 'X-AGI-Agent-Run-Id';
export const MANAGED_CLOUD_AGENT_RUN_URL_HEADER = 'X-AGI-Agent-Run-URL';

export const CloudAgentOriginSurfaceSchema = z.enum([
  'web',
  'desktop',
  'mobile',
  'chrome',
  'vscode',
  'cli',
  'api',
]);
export const CloudAgentWorkModeSchema = z.enum(['chat', 'agiwork', 'research']);

/**
 * Server-side cap on the serialized tool arguments carried in a run listing.
 * Enough to tell "write to /etc/hosts" from "write to ./notes.md", far short of
 * shipping a whole tool payload to a list view.
 */
export const MAX_CLOUD_AGENT_PENDING_APPROVAL_ARGS_PREVIEW_LENGTH = 300;

/**
 * Summary of the approval a run is currently blocked on, attached so any
 * surface can render an actionable card for a turn it never streamed — the
 * point of durable sessions is that the device that started the run does not
 * have to be the device that answers it.
 */
export const CloudAgentPendingApprovalSchema = z.object({
  requestedAt: z.string().datetime(),
  toolCalls: z
    .array(
      z.object({
        toolCallId: z.string().min(1).max(256),
        name: z.string().min(1).max(512),
        argsPreview: z.string().max(MAX_CLOUD_AGENT_PENDING_APPROVAL_ARGS_PREVIEW_LENGTH),
      }),
    )
    .min(1)
    .max(32),
});

export const CloudAgentRunSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  requestId: z.string().min(1),
  conversationId: z.string().min(1).nullable(),
  originSurface: CloudAgentOriginSurfaceSchema,
  workMode: CloudAgentWorkModeSchema,
  state: AgentTaskStateSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  lastEventSequence: z.number().int().min(-1),
  cancellationRequestedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Optional, and the surrounding schema is non-strict, so a client built
  // against an older contract keeps parsing runs from a newer server and a
  // newer client keeps parsing runs from a server that has not shipped yet.
  pendingApproval: CloudAgentPendingApprovalSchema.optional(),
});

export const CloudAgentRunSnapshotPageSchema = z.object({
  run: CloudAgentRunSchema,
  events: z.array(AgentEventEnvelopeSchema),
  nextAfterSequence: z.number().int().min(-1),
});

export const CloudAgentRunListPageSchema = z.object({
  runs: z.array(CloudAgentRunSchema),
  nextCursor: z.string().min(1).max(512).nullable(),
});

export const CloudAgentRunCancellationResponseSchema = z.object({
  run: CloudAgentRunSchema,
});

export type CloudAgentOriginSurface = z.infer<typeof CloudAgentOriginSurfaceSchema>;
export type CloudAgentWorkMode = z.infer<typeof CloudAgentWorkModeSchema>;
export type CloudAgentRun = z.infer<typeof CloudAgentRunSchema>;
export type CloudAgentPendingApproval = z.infer<typeof CloudAgentPendingApprovalSchema>;

export interface CloudAgentRunSnapshotPage {
  run: CloudAgentRun;
  events: AgentEventEnvelope[];
  nextAfterSequence: number;
}

export interface CloudAgentRunListPage {
  runs: CloudAgentRun[];
  nextCursor: string | null;
}

export function managedCloudAgentRunPath(runId: string): string {
  const parsed = z.string().uuid().parse(runId);
  return `${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${encodeURIComponent(parsed)}`;
}

/**
 * A follow operation stops at any state where autonomous execution is no
 * longer advancing. `awaiting_input` and `paused` are intentional boundaries:
 * the UI must render the approval/input request instead of polling forever.
 */
export function isCloudAgentRunFollowBoundary(state: AgentTaskState): boolean {
  return state !== 'queued' && state !== 'running';
}
