/**
 * Canonical managed-cloud agent-run activity stream.
 *
 * Every Web, Desktop Cloud, and Mobile Cloud turn carries these envelopes in
 * `delta.x_agent_event`. The Rust source of truth is
 * `crates/agiworkforce-protocol/src/agent_events.rs`; generated TypeScript
 * types provide compile-time parity while this module provides the mandatory
 * runtime validation for untrusted SSE payloads.
 *
 * `progress-update` is deliberately a safe, user-displayable work summary.
 * It must never contain private chain-of-thought or a raw provider scratchpad.
 */

import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { z } from 'zod';

export const AGENT_EVENT_SCHEMA_VERSION = 2 as const;

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
  ArtifactProducedSchema,
  ContextCompactedSchema,
]);

export const AgentEventEnvelopeSchema: z.ZodType<AgentEventEnvelope> = z.object({
  schemaVersion: z.literal(AGENT_EVENT_SCHEMA_VERSION),
  sessionId: NonEmptyStringSchema,
  turnId: NonEmptyStringSchema,
  sequence: z.number().int().nonnegative(),
  emittedAtMs: z.number().int().nonnegative(),
  event: AgentEventSchema,
});

/** Parse `delta.x_agent_event` without ever throwing on an untrusted stream. */
export function parseAgentEventDelta(payload: unknown): AgentEventEnvelope | null {
  const parsed = AgentEventEnvelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
