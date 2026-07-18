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
  'api',
]);
export const CloudAgentWorkModeSchema = z.enum(['chat', 'agiwork', 'research']);

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
