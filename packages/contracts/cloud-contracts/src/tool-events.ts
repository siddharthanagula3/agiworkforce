import { z } from 'zod';

export const ToolStatusPayloadSchema = z.object({
  type: z.string(),
  name: z.string(),
  status: z.string(),
  status_phrase: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
});
export type ToolStatusPayload = z.infer<typeof ToolStatusPayloadSchema>;

export function parseToolStatusDelta(payload: unknown): ToolStatusPayload | null {
  const parsed = ToolStatusPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export const ToolApprovalRequestPayloadSchema = z.object({
  tool_call_id: z.string().min(1),
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});
export type ToolApprovalRequestPayload = z.infer<typeof ToolApprovalRequestPayloadSchema>;

export function parseToolApprovalRequestDelta(payload: unknown): ToolApprovalRequestPayload | null {
  const parsed = ToolApprovalRequestPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export const ToolInputRequestPayloadSchema = z.object({
  tool_call_id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  connector_id: z.string().max(256).optional(),
  input_requests: z.record(z.string(), z.unknown()),
  round: z.number().int().nonnegative().optional(),
});
export type ToolInputRequestPayload = z.infer<typeof ToolInputRequestPayloadSchema>;

export function parseToolInputRequestDelta(payload: unknown): ToolInputRequestPayload | null {
  const parsed = ToolInputRequestPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export const ToolResultPayloadSchema = z.object({
  tool_call_id: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  is_error: z.boolean(),
});
export type ToolResultPayload = z.infer<typeof ToolResultPayloadSchema>;

export function parseToolResultDelta(payload: unknown): ToolResultPayload | null {
  const parsed = ToolResultPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export const SearchResultSourceSchema = z.object({
  type: z.string(),
  url: z.string().min(1),
  title: z.string(),
  encrypted_content: z.string().optional(),
  position: z.number(),
});
export type SearchResultSource = z.infer<typeof SearchResultSourceSchema>;

const SearchResultsDeltaEnvelopeSchema = z.object({
  tool: z.string().optional(),
  content: z.array(z.unknown()).optional(),
});

export interface SearchResultsDelta {
  tool?: string;
  sources: SearchResultSource[];
}

export function parseSearchResultsDelta(payload: unknown): SearchResultsDelta | null {
  const envelope = SearchResultsDeltaEnvelopeSchema.safeParse(payload);
  if (!envelope.success) return null;
  const sources: SearchResultSource[] = [];
  for (const entry of envelope.data.content ?? []) {
    const parsed = SearchResultSourceSchema.safeParse(entry);
    if (parsed.success) sources.push(parsed.data);
  }
  return { tool: envelope.data.tool, sources };
}
