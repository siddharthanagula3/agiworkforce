import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { z } from 'zod';

export const AGENT_EVENT_SCHEMA_VERSION = 4 as const;

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonNegativeIntegerSchema = z.number().int().nonnegative().optional();
const JsonValueSchema = z.json();

export const AgentEventToolCategorySchema = z.enum([
  'web-search',
  'web-fetch',
  'code-execution',
  'filesystem',
  'shell',
  'skill',
  'memory',
  'connector',
  'mcp',
  'computer-use',
  'artifact',
  'other',
]);

const TextDeltaSchema = z.object({
  type: z.literal('text-delta'),
  delta: z.string(),
});

const ReasoningDeltaSchema = z.object({
  type: z.literal('reasoning-delta'),
  delta: z.string(),
  signature: z.string().optional(),
});

const ToolUseStartSchema = z.object({
  type: z.literal('tool-use-start'),
  toolUseId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
});

const ToolUseDeltaSchema = z.object({
  type: z.literal('tool-use-delta'),
  toolUseId: NonEmptyStringSchema,
  deltaJson: z.string(),
});

const ToolUseEndSchema = z.object({
  type: z.literal('tool-use-end'),
  toolUseId: NonEmptyStringSchema,
});

const ServerToolUseSchema = z.object({
  type: z.literal('server-tool-use'),
  toolUseId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
});

const ServerToolResultSchema = z.object({
  type: z.literal('server-tool-result'),
  toolUseId: NonEmptyStringSchema,
  payload: JsonValueSchema,
  isError: z.boolean().optional(),
});

const UsageSchema = z.object({
  type: z.literal('usage'),
  inputTokens: OptionalNonNegativeIntegerSchema,
  outputTokens: OptionalNonNegativeIntegerSchema,
  cacheReadTokens: OptionalNonNegativeIntegerSchema,
  cacheWriteTokens: OptionalNonNegativeIntegerSchema,
  cacheWrite1hTokens: OptionalNonNegativeIntegerSchema,
  reasoningTokens: OptionalNonNegativeIntegerSchema,
});

const ErrorSchema = z.object({
  type: z.literal('error'),
  message: NonEmptyStringSchema,
  code: z.string().optional(),
  retryable: z.boolean().optional(),
  retryAfterSeconds: OptionalNonNegativeIntegerSchema,
});

const StopSchema = z.object({
  type: z.literal('stop'),
  reason: z.enum([
    'end-turn',
    'max-tokens',
    'tool-use',
    'stop-sequence',
    'refusal',
    'cancelled',
    'error',
  ]),
});

const LifecycleSchema = z.object({
  type: z.literal('lifecycle'),
  phase: z.enum(['started', 'heartbeat', 'paused', 'resumed']),
});

const ProgressUpdateSchema = z.object({
  type: z.literal('progress-update'),
  progressId: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  detail: z.string().optional(),
  status: z.enum(['running', 'completed', 'failed']),
});

const ToolExecutionStartSchema = z.object({
  type: z.literal('tool-execution-start'),
  toolCallId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  category: AgentEventToolCategorySchema,
  summary: NonEmptyStringSchema,
  input: JsonValueSchema,
});

const ToolExecutionEndSchema = z.object({
  type: z.literal('tool-execution-end'),
  toolCallId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  output: JsonValueSchema,
  isError: z.boolean(),
  elapsedMs: OptionalNonNegativeIntegerSchema,
});

const SourceSchema = z.object({
  url: z.url(),
  title: z.string(),
  snippet: z.string().optional(),
});

const SourceListSchema = z.object({
  type: z.literal('source-list'),
  toolCallId: z.string().optional(),
  query: z.string().optional(),
  sources: z.array(SourceSchema),
});

const ApprovalRequestedSchema = z.object({
  type: z.literal('approval-requested'),
  approvalId: NonEmptyStringSchema,
  toolCallId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  category: AgentEventToolCategorySchema,
  summary: NonEmptyStringSchema,
  input: JsonValueSchema,
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});

const ApprovalResolvedSchema = z.object({
  type: z.literal('approval-resolved'),
  approvalId: NonEmptyStringSchema,
  decision: z.enum(['approved', 'approved-for-session', 'denied', 'cancelled']),
});

// Remote input-request definitions are UNTRUSTED. The host caps their count
// and serialized size before persisting or streaming them so a malicious
// connector cannot inflate a checkpoint, an SSE frame, or the durable event log.
const MAX_INPUT_REQUEST_ENTRIES = 32;
const MAX_INPUT_REQUESTS_SERIALIZED_BYTES = 16_000;

const BoundedInputRequestsSchema = JsonValueSchema.superRefine((value, ctx) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    ctx.addIssue({ code: 'custom', message: 'inputRequests must be a JSON object' });
    return;
  }
  const entryCount = Object.keys(value as Record<string, unknown>).length;
  if (entryCount < 1 || entryCount > MAX_INPUT_REQUEST_ENTRIES) {
    ctx.addIssue({
      code: 'custom',
      message: `inputRequests must define between 1 and ${MAX_INPUT_REQUEST_ENTRIES} fields`,
    });
  }
  if (JSON.stringify(value).length > MAX_INPUT_REQUESTS_SERIALIZED_BYTES) {
    ctx.addIssue({ code: 'custom', message: 'inputRequests exceed the size limit' });
  }
});

const InputRequestedSchema = z.object({
  type: z.literal('input-requested'),
  toolCallId: NonEmptyStringSchema,
  connectorId: NonEmptyStringSchema,
  toolName: NonEmptyStringSchema,
  inputRequests: BoundedInputRequestsSchema,
  requestState: z.string().optional(),
  round: z.number().int().nonnegative(),
});

const InputResolvedSchema = z.object({
  type: z.literal('input-resolved'),
  toolCallId: NonEmptyStringSchema,
  outcome: z.enum(['resolved', 'cancelled']),
});

const ArtifactProducedSchema = z.object({
  type: z.literal('artifact-produced'),
  artifactId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  mimeType: NonEmptyStringSchema,
  uri: NonEmptyStringSchema,
  sizeBytes: OptionalNonNegativeIntegerSchema,
});

const ContextCompactedSchema = z.object({
  type: z.literal('context-compacted'),
  beforeTokens: OptionalNonNegativeIntegerSchema,
  afterTokens: OptionalNonNegativeIntegerSchema,
  summary: z.string().optional(),
});

export const AgentTaskStateSchema = z.enum([
  'queued',
  'running',
  'awaiting_input',
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'paused',
  'archived',
]);

const TaskStateChangedSchema = z.object({
  type: z.literal('task-state-changed'),
  taskId: NonEmptyStringSchema,
  state: AgentTaskStateSchema,
  previousState: AgentTaskStateSchema.optional(),
  summary: z.string().optional(),
});

export const AgentEventSchema: z.ZodType<AgentEvent> = z.discriminatedUnion('type', [
  TextDeltaSchema,
  ReasoningDeltaSchema,
  ToolUseStartSchema,
  ToolUseDeltaSchema,
  ToolUseEndSchema,
  ServerToolUseSchema,
  ServerToolResultSchema,
  UsageSchema,
  ErrorSchema,
  StopSchema,
  LifecycleSchema,
  ProgressUpdateSchema,
  ToolExecutionStartSchema,
  ToolExecutionEndSchema,
  SourceListSchema,
  ApprovalRequestedSchema,
  ApprovalResolvedSchema,
  InputRequestedSchema,
  InputResolvedSchema,
  ArtifactProducedSchema,
  ContextCompactedSchema,
  TaskStateChangedSchema,
]);

export const AgentEventEnvelopeSchema: z.ZodType<AgentEventEnvelope> = z.object({
  schemaVersion: z.literal(AGENT_EVENT_SCHEMA_VERSION),
  sessionId: NonEmptyStringSchema,
  turnId: NonEmptyStringSchema,
  sequence: z.number().int().nonnegative(),
  emittedAtMs: z.number().int().nonnegative(),
  event: AgentEventSchema,
});

export function parseAgentEventDelta(payload: unknown): AgentEventEnvelope | null {
  const parsed = AgentEventEnvelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
