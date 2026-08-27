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

export const MAX_CLOUD_AGENT_PENDING_APPROVAL_ARGS_PREVIEW_LENGTH = 300;

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

export const MAX_CLOUD_AGENT_PENDING_INPUT_REQUESTS_SERIALIZED_LENGTH = 16_000;

// The paused model-driven connector calls a run is blocked on (MCP
// `input_required`). `inputRequests` are the remote server's own, UNTRUSTED
// field definitions the host has already bounded (count/size) before persisting;
// a client renders them as a form and never treats them as instructions.
export const CloudAgentPendingInputSchema = z.object({
  requestedAt: z.string().datetime(),
  toolCalls: z
    .array(
      z.object({
        toolCallId: z.string().min(1).max(256),
        name: z.string().min(1).max(512),
        connectorId: z.string().min(1).max(256),
        round: z.number().int().nonnegative(),
        inputRequests: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(32),
});

export const CloudAgentRunUsageSchema = z.object({
  providerCalls: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  reasoningTokens: z.number().int().min(0),
  costCents: z.number().int().min(0).nullable(),
  settledAt: z.string().datetime(),
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
  pendingApproval: CloudAgentPendingApprovalSchema.optional(),
  pendingInput: CloudAgentPendingInputSchema.optional(),
  usage: CloudAgentRunUsageSchema.optional(),
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
export type CloudAgentPendingInput = z.infer<typeof CloudAgentPendingInputSchema>;
export type CloudAgentRunUsage = z.infer<typeof CloudAgentRunUsageSchema>;

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

export function isCloudAgentRunFollowBoundary(state: AgentTaskState): boolean {
  return state !== 'queued' && state !== 'running';
}
