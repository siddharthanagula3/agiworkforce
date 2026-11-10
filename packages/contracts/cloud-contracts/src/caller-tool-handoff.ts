import { z } from 'zod';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import type { AgentCallerToolCall } from '@agiworkforce/types/protocol';
import { MAX_CHAT_ATTACHMENT_MESSAGE_BYTES } from './chat-attachments';
import { DeviceStepImageSchema, MAX_DEVICE_STEPS_PER_PAUSE } from './device-steps';
import {
  MAX_HOSTED_TOOL_CALLS_PER_STEP,
  TOOL_CALL_ID_MAX_LENGTH,
  MAX_CALLER_TOOL_STEPS,
  MAX_CHAT_COMPLETION_REQUEST_BYTES,
} from './tool-call-limits';

export type CallerToolCall = AgentCallerToolCall;
export const CALLER_TOOL_BOUNDARY_EVENT_COUNT = 3;
export const CALLER_TOOL_RESUME_PATH = '/api/llm/v1/chat/completions/resume-caller';
export const CallerToolStepBudgetSchema = z.number().int().positive().max(MAX_CALLER_TOOL_STEPS);

export { MAX_HOSTED_TOOL_CALLS_PER_STEP } from './tool-call-limits';

const NonBlankStringSchema = z.string().refine((value) => value.trim().length > 0);
const ObjectArgumentsSchema = z
  .string()
  .transform((value) => (value.trim() === '' ? '{}' : value))
  .refine((value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch {
      return false;
    }
  });

export const CallerToolCallSchema: z.ZodType<CallerToolCall> = z.object({
  id: NonBlankStringSchema,
  type: z.literal('function'),
  function: z.object({ name: NonBlankStringSchema, arguments: ObjectArgumentsSchema }),
});

export const HostedCallerToolBatchSchema = z
  .array(CallerToolCallSchema)
  .min(1)
  .max(MAX_HOSTED_TOOL_CALLS_PER_STEP)
  .refine((calls) => new Set(calls.map((call) => call.id)).size === calls.length)
  .refine((calls) => calls.every((call) => call.id.length <= TOOL_CALL_ID_MAX_LENGTH));

export const CallerToolResultSchema = z
  .object({
    tool_call_id: NonBlankStringSchema.max(TOOL_CALL_ID_MAX_LENGTH),
    content: z.string(),
  })
  .strict();
export type CallerToolResultWire = z.infer<typeof CallerToolResultSchema>;

export const CallerToolObservationSchema = z
  .object({
    text: z.string(),
    images: z.array(DeviceStepImageSchema.strict()).max(MAX_DEVICE_STEPS_PER_PAUSE).optional(),
  })
  .strict();
export type CallerToolObservation = z.infer<typeof CallerToolObservationSchema>;
export const CallerToolObservationsSchema = z
  .array(CallerToolObservationSchema)
  .max(MAX_HOSTED_TOOL_CALLS_PER_STEP)
  .refine(
    (observations) =>
      new TextEncoder().encode(JSON.stringify(observations)).byteLength <=
      MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  );

export const CallerToolResultsSchema = z
  .array(CallerToolResultSchema)
  .min(1)
  .max(MAX_HOSTED_TOOL_CALLS_PER_STEP)
  .refine(
    (results) => new Set(results.map((result) => result.tool_call_id)).size === results.length,
  )
  .refine(
    (results) =>
      new TextEncoder().encode(JSON.stringify(results)).byteLength <=
      MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  );

export const CallerToolResumeRequestSchema = z
  .object({
    schema_version: z.literal(AGENT_EVENT_SCHEMA_VERSION),
    run_id: z.string().uuid(),
    turn_id: NonBlankStringSchema,
    next_event_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    tool_results: CallerToolResultsSchema,
    observations: CallerToolObservationsSchema.optional(),
  })
  .strict()
  .refine(
    (receipt) =>
      new TextEncoder().encode(JSON.stringify(receipt)).byteLength <=
      MAX_CHAT_COMPLETION_REQUEST_BYTES,
  );
export type CallerToolResumeRequest = z.infer<typeof CallerToolResumeRequestSchema>;

export interface CallerToolHandoffDelta {
  tool_calls: Array<CallerToolCall & { index: number }>;
  x_tool_handoff: { tool_call_ids: string[] };
}

// Wire validity does not authorize execution; receivers must still check their offered tools.
export function readCompleteCallerToolCalls(calls: unknown, ids: unknown): CallerToolCall[] | null {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    Array.from(ids).some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(ids).size !== ids.length ||
    !Array.isArray(calls) ||
    calls.length !== ids.length
  )
    return null;
  const parsed: CallerToolCall[] = [];
  for (const [index, raw] of calls.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const call = raw as Record<string, unknown>;
    if (call['index'] !== index || call['id'] !== ids[index]) return null;
    const validated = CallerToolCallSchema.safeParse(call);
    if (!validated.success) return null;
    parsed.push(validated.data);
  }
  return parsed;
}

export function readCallerToolHandoff(
  marker: unknown,
  calls: unknown,
  finishReason: unknown,
): CallerToolCall[] | null {
  if (
    !marker ||
    typeof marker !== 'object' ||
    Array.isArray(marker) ||
    finishReason !== 'tool_calls'
  )
    return null;
  return readCompleteCallerToolCalls(calls, (marker as Record<string, unknown>)['tool_call_ids']);
}

export function createCallerToolHandoffDelta(
  calls: readonly CallerToolCall[],
): CallerToolHandoffDelta {
  const ids = calls.map((call) => call.id);
  const indexed = calls.map((call, index) => ({
    index,
    id: call.id,
    type: call.type,
    function: call.function,
  }));
  const parsed = readCompleteCallerToolCalls(indexed, ids);
  if (!parsed) throw new TypeError('Cannot create an invalid caller tool handoff');
  return {
    tool_calls: parsed.map((call, index) => ({ index, ...call })),
    x_tool_handoff: { tool_call_ids: ids },
  };
}
