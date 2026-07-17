/**
 * Cloud contracts — four of the five custom SSE deltas the web tool loop
 * emits during `POST /api/llm/v1/chat/completions`
 * (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`), so a
 * tool-calling turn can render live on desktop/mobile without each surface
 * hand-declaring the wire shape. The fifth, `x_generated_files`, already has
 * its own contract in `./generated-files.ts`.
 *
 * Wire conventions (server contract):
 *   - Every event is
 *     `{ choices: [{ delta: { <key>: <payload> }, index: 0 }], model }`
 *     inside a standard OpenAI-compatible `data: {...}` SSE line — the
 *     schemas below describe the `<payload>` object under `delta.<key>`
 *     only, matching the client parsing in
 *     `apps/web/lib/hooks/useChatStream.ts`.
 *   - snake_case field names (OpenAI-compatible extension keys).
 *   - Parsers here never throw. Single-object deltas (`x_tool_status`,
 *     `x_tool_approval_request`, `x_tool_result`) return `null` on a
 *     structural mismatch. `x_search_results` carries a list and salvages
 *     per-source — invalid entries are dropped rather than failing the whole
 *     delta — mirroring `parseGeneratedFilesDelta` in `./generated-files.ts`.
 *
 * `x_tool_status` is ALSO emitted, with a different `type` discriminant and a
 * disjoint `status` vocabulary, by:
 *   - the Anthropic native-tool passthrough
 *     (`.../lib/stream-transform.ts:159-173`): `type: 'server_tool_use'`,
 *     `status: 'searching' | 'fetching' | 'executing' | 'running'`.
 *   - the research loop's web_search status
 *     (`.../lib/research-loop.ts:148-166`): `type: 'mcp_tool_use'`, same
 *     `running`/`completed`/`failed` vocabulary as tool-loop.ts.
 * `ToolStatusPayloadSchema` models `type`/`status` as open strings (not
 * literal unions) so it validates every current emitter without dropping a
 * variant the client already handles generically
 * (see `useChatStream.ts:866-889`).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// x_tool_status — tool-loop.ts:233-263 (toolStatusEvent)
// ---------------------------------------------------------------------------

export const ToolStatusPayloadSchema = z.object({
  /** 'mcp_tool_use' (tool-loop.ts, research-loop.ts) | 'server_tool_use' (stream-transform.ts). */
  type: z.string(),
  name: z.string(),
  /** 'running'|'completed'|'failed' (mcp_tool_use) | 'searching'|'fetching'|'executing'|'running' (server_tool_use). */
  status: z.string(),
  /** Only present on 'running' events (tool-loop.ts:249). */
  status_phrase: z.string().optional(),
  /** Only present on 'running' events with non-empty args (tool-loop.ts:250). */
  args: z.record(z.string(), z.unknown()).optional(),
});
export type ToolStatusPayload = z.infer<typeof ToolStatusPayloadSchema>;

/**
 * Parse a `delta.x_tool_status` payload. Returns `null` for anything that
 * does not match the shape every known emitter produces — never throws.
 */
export function parseToolStatusDelta(payload: unknown): ToolStatusPayload | null {
  const parsed = ToolStatusPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// x_tool_approval_request — tool-loop.ts:269-290 (toolApprovalRequestEvent)
// ---------------------------------------------------------------------------

export const ToolApprovalRequestPayloadSchema = z.object({
  tool_call_id: z.string().min(1),
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});
export type ToolApprovalRequestPayload = z.infer<typeof ToolApprovalRequestPayloadSchema>;

/**
 * Parse a `delta.x_tool_approval_request` payload. Returns `null` on a
 * structural mismatch — never throws.
 */
export function parseToolApprovalRequestDelta(payload: unknown): ToolApprovalRequestPayload | null {
  const parsed = ToolApprovalRequestPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// x_tool_result — tool-loop.ts:316-339 (toolResultEvent)
// ---------------------------------------------------------------------------

export const ToolResultPayloadSchema = z.object({
  tool_call_id: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  is_error: z.boolean(),
});
export type ToolResultPayload = z.infer<typeof ToolResultPayloadSchema>;

/**
 * Parse a `delta.x_tool_result` payload. Returns `null` on a structural
 * mismatch — never throws.
 */
export function parseToolResultDelta(payload: unknown): ToolResultPayload | null {
  const parsed = ToolResultPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// x_search_results — tool-loop.ts:360-380 (fetchSourcesEvent) and
// research-loop.ts:210-233 (SourceAggregator.toSearchResultsEvent)
// ---------------------------------------------------------------------------

export const SearchResultSourceSchema = z.object({
  /** Always 'web_search_result' from both emitters. */
  type: z.string(),
  url: z.string().min(1),
  title: z.string(),
  /** research-loop.ts only (~line 223) — client maps this to the source snippet (useChatStream.ts:961). */
  encrypted_content: z.string().optional(),
  position: z.number(),
});
export type SearchResultSource = z.infer<typeof SearchResultSourceSchema>;

const SearchResultsDeltaEnvelopeSchema = z.object({
  /** 'url_fetch' when sources came from the url_fetch tool (tool-loop.ts:366); absent for web_search (research-loop.ts). */
  tool: z.string().optional(),
  content: z.array(z.unknown()).optional(),
});

export interface SearchResultsDelta {
  tool?: string;
  sources: SearchResultSource[];
}

/**
 * Parse a `delta.x_search_results` payload. Salvages per-source like
 * `parseGeneratedFilesDelta`: invalid entries are dropped, never thrown.
 *
 * Returns `null` for a structurally invalid payload — including the raw
 * Anthropic `web_search_tool_result_error` passthrough
 * (`stream-transform.ts:200`, `useChatStream.ts:973-984`), where `content` is
 * a single error object rather than an array. That shape is out of scope for
 * this parser (it is not emitted by tool-loop.ts / research-loop.ts, the two
 * emitters this contract mirrors).
 */
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
