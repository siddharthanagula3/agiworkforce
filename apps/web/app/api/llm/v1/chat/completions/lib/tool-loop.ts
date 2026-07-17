/**
 * @file Server-side tool-execution loop for agentic chat completions.
 *
 * Wraps the existing provider call with a bounded agentic loop:
 *   1. Inject tool definitions from the web MCP catalog.
 *   2. Stream the provider response.
 *   3. On `tool_calls` finish_reason, pause the stream, execute the tools,
 *      append `tool` result messages, and re-invoke the model.
 *   4. Repeat up to `maxSteps` times.
 *
 * REUSE:
 *   - `buildToolLoopStream` (tool-loop-anthropic.ts) -- table-driven per-provider
 *     dispatch through packages/ai/providers/* adapters, sharing route.ts's
 *     `ADAPTER_PROVIDERS` table (restructure Wave 2, task #34's tool-loop slice;
 *     generalized from an Anthropic-only bridge once every provider needed it).
 *     Converges back onto `collectProviderStream` below, unchanged either way.
 *   - `getWebMcpCatalog` / `executeWebMcpTool` -- MCP dispatcher from lib/mcp-tool-executor.ts.
 *   - `ProcessedRequest.llmRequest.tools` seam in request-processor.ts (line 1041) --
 *     we push our tool defs there before the first provider call.
 *
 * Safety model:
 *   - DEFAULT FAIL-CLOSED: every tool call is queued as 'awaiting_approval'.
 *   - When `approvalMode` is 'auto', tools execute immediately without a user prompt.
 *   - When 'manual' (default), the loop returns a special SSE event `x_tool_approval_request`
 *     and suspends execution. The suspend is STATELESS: no server-side loop state is
 *     persisted — the assistant tool_call turn is streamed to the client and the loop
 *     returns. The client resumes by calling POST /api/llm/v1/chat/completions/approve
 *     (approve/route.ts) with the full thread INCLUDING the suspended assistant tool_call
 *     turn plus a per-tool_call_id approval decision. On resume, runToolLoop is invoked
 *     again with `options.resume`, which executes ONLY the approved+pending tool calls
 *     (re-running every guard) and appends a denial tool result for rejected/undecided
 *     ones, then continues the normal loop. See the `resume` preamble in runToolLoop.
 *   - Parallel-safe tools (read-only) are executed concurrently; mutating tools are
 *     serialized (mirrors Codex parallel.rs).
 *
 * Stream contract:
 *   - Emits standard OpenAI-compatible SSE events.
 *   - Emits `x_tool_status` events (reused from Anthropic server-tool path) to drive
 *     `ToolTimeline` in the client.
 *   - Emits `x_tool_approval_request` events when a tool needs user approval.
 *   - Emits `x_tool_result` events when a tool completes.
 */

import 'server-only';

import { logger } from '@/lib/logger';
import { classifyError } from '@agiworkforce/provider-runtime';
import { buildToolLoopStream, type ToolLoopStepSink } from './tool-loop-anthropic';
import {
  getWebMcpCatalog,
  executeWebMcpTool,
  catalogToToolDefs,
  parseQualifiedToolName,
  toOpenAiToolDef,
  type WebMcpToolDef,
} from '@/lib/mcp-tool-executor';
import { isExecutionTool, routeExecutionTool, capOutput } from '@/lib/e2b/execution-tools';
import { getE2BExecutor, pauseE2BSession } from '@/lib/e2b/runtime';
import { managedCloudE2BSessionScope } from '@/lib/e2b/session-store';
import type { E2BExecutor } from '@/lib/e2b/types';
import {
  snapshotSandboxFiles,
  harvestGeneratedFiles,
  type SandboxSnapshot,
  type GeneratedFileWire,
} from '@/lib/e2b/generated-files';
import { persistGeneratedFileBytes } from '@/lib/server/generated-file-persist';
import { isUrlFetchTool, executeUrlFetch } from '@/lib/url-fetch/url-fetch-tool';
import {
  isWebSearchTool,
  executeWebSearch,
  formatWebSearchResultForModel,
  webSearchResultsToFetchedSources,
} from '@/lib/web-search/web-search-tool';
import type { ProcessedRequest } from './request-processor';
import type { ObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum agentic steps (model calls) in a single request. */
const DEFAULT_MAX_STEPS = 10;

/** Tools whose names suggest read-only operations: safe to parallelize. */
const READ_ONLY_TOOL_PREFIXES = [
  'read_file',
  'list_directory',
  'search_files',
  'get_file_info',
  'list_allowed_directories',
  'fetch',
  'get',
  'search',
  'query',
  'list',
  'describe',
];

function isReadOnlyTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return READ_ONLY_TOOL_PREFIXES.some((p) => lower.startsWith(p) || lower.includes(p));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalMode = 'auto' | 'manual';

/**
 * Per-user connector tool executor (see lib/user-connector-tools.ts). Called
 * before the operator MCP dispatch for every tool: returns `handled: true` for
 * connector-owned tools (first-party github built-in / operator-mapped remote
 * connectors) and `handled: false` otherwise so the loop falls through to the
 * operator MCP executor. Bound to the authenticated userId by the caller;
 * authorization is re-validated inside.
 */
export type ConnectorToolExecutor = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ handled: boolean; content: string; isError: boolean }>;

/** One per-tool_call approval decision carried on a resume request. */
export interface ToolApprovalDecision {
  /** The exact tool_call_id the user is deciding on. */
  toolCallId: string;
  decision: 'approved' | 'rejected';
}

/**
 * Resume payload for the manual-approval flow (see approve/route.ts). The
 * suspended assistant tool_call turn is carried back in the message thread
 * (`processed.llmRequest.messages`, last assistant message with tool_calls);
 * `approvals` says, per tool_call_id, whether the authenticated user approved
 * or rejected it. runToolLoop executes ONLY approved calls that match a pending
 * tool_call id (re-running every guard) and appends a denial tool result for
 * rejected/undecided ones — fail-closed.
 */
export interface ResumeApproval {
  approvals: ToolApprovalDecision[];
}

export interface ToolLoopOptions {
  /** Maximum number of model re-invocations. Default: 10. */
  maxSteps?: number;
  /** 'auto' = execute without prompting; 'manual' = gate on user approval. */
  approvalMode?: ApprovalMode;
  /** Resolved MCP tool defs to inject (fetched once by the caller). */
  mcpTools?: WebMcpToolDef[];
  /**
   * Manual-approval resume payload. When present, the loop runs the resume
   * preamble (execute approved+pending tool calls, deny the rest) BEFORE the
   * first provider call, then continues the normal loop. Only meaningful with
   * `approvalMode: 'manual'`.
   */
  resume?: ResumeApproval;
  /**
   * Authenticated user id — required for the generated-file harvest (files the
   * model writes in the E2B sandbox are persisted to the user's media library
   * and emitted as an `x_generated_files` delta). Without it, harvest is skipped.
   */
  userId?: string;
  /**
   * Optional per-user connector executor. When provided, connector-namespaced
   * tool calls (from the user's connected connectors) execute through it before
   * falling back to the operator MCP dispatcher. See ConnectorToolExecutor.
   */
  connectorExecutor?: ConnectorToolExecutor;
  /** Canonical usage accumulated across every provider call in this loop. */
  usage?: ObservedProviderUsage;
}

/** Shape of a parsed tool_call from the provider stream. */
interface PendingToolCall {
  id: string;
  qualifiedName: string;
  args: Record<string, unknown>;
}

/** One SSE line ready to be flushed to the client. */
type SseLine = string;

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseData(payload: unknown): SseLine {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseDone(): SseLine {
  return `data: [DONE]\n\n`;
}

/**
 * Short action phrases shown in the timeline running-state header while a tool
 * is executing. Matched by tool name prefix (lowercase). Falls back to undefined
 * (the timeline renders its default "Running tools..." label).
 */
const TOOL_STATUS_PHRASES: [pattern: RegExp, phrase: string][] = [
  [/\bweb_search|search_web|browser_search|perplexity/i, 'Searching the web'],
  [/\bweb_fetch|url_fetch|fetch_url|http_request/i, 'Fetching page'],
  [/\bcode_execut|execute_code|run_code|jupyter/i, 'Running code'],
  [/\bfile_read|view|read_file/i, 'Reading file'],
  [/\bfile_write|write_file|create_file/i, 'Writing file'],
  [/\bfile_edit|edit_file|patch/i, 'Editing file'],
  [/\bbash|shell|terminal|command/i, 'Running command'],
  [/\bgrep|ripgrep|search_codebase/i, 'Searching codebase'],
  [/\bgit_/i, 'Running git'],
  [/\bdb_query|sql_query|database/i, 'Querying database'],
  [/\bskill/i, 'Loading skill'],
];

/** Derive a playful status phrase for a tool name, or return undefined. */
export function toolStatusPhrase(toolName: string): string | undefined {
  for (const [pattern, phrase] of TOOL_STATUS_PHRASES) {
    if (pattern.test(toolName)) return phrase;
  }
  return undefined;
}

/**
 * For url_fetch running events, upgrade the generic "Fetching page" phrase to
 * "Fetching <domain>" (ChatGPT/Claude-style) when the args carry a parseable URL.
 */
function urlFetchDomainPhrase(args: Record<string, unknown> | undefined): string | undefined {
  const raw = args?.['url'];
  if (typeof raw !== 'string') return undefined;
  try {
    return `Fetching ${new URL(raw).hostname}`;
  } catch {
    return undefined;
  }
}

/**
 * Emit an `x_tool_status` SSE event -- reuses the same shape that
 * stream-transform.ts emits for Anthropic server_tool_use blocks so the
 * client's `useChatStream.ts` handles both paths uniformly.
 *
 * On `running` events, `args` (the parsed tool arguments object) is included
 * so the client can store them as `MessageToolEntry.parameters` and render
 * a syntax-highlighted code block in the Request section of ToolCallCard.
 *
 * Exported for unit testing only -- external callers should not depend on the
 * SSE wire format directly.
 */
export function toolStatusEvent(
  toolName: string,
  status: 'running' | 'completed' | 'failed',
  responseModel: string,
  args?: Record<string, unknown>,
): SseLine {
  const statusPayload: Record<string, unknown> = {
    type: 'mcp_tool_use',
    name: toolName,
    status,
  };
  // Only attach status_phrase and args on the running event to keep payloads small.
  if (status === 'running') {
    const phrase =
      (isUrlFetchTool(toolName) ? urlFetchDomainPhrase(args) : undefined) ??
      toolStatusPhrase(toolName);
    if (phrase) statusPayload['status_phrase'] = phrase;
    if (args && Object.keys(args).length > 0) statusPayload['args'] = args;
  }
  return sseData({
    choices: [
      {
        delta: {
          x_tool_status: statusPayload,
        },
        index: 0,
      },
    ],
    model: responseModel,
  });
}

/**
 * Emit an `x_tool_approval_request` SSE event when a tool is pending user
 * approval (manual mode, default).
 */
function toolApprovalRequestEvent(
  toolId: string,
  toolName: string,
  args: Record<string, unknown>,
  responseModel: string,
): SseLine {
  return sseData({
    choices: [
      {
        delta: {
          x_tool_approval_request: {
            tool_call_id: toolId,
            name: toolName,
            args,
          },
        },
        index: 0,
      },
    ],
    model: responseModel,
  });
}

/**
 * Emit an `x_generated_files` SSE event carrying durable descriptors for files
 * the model created in the E2B sandbox this turn. Clients render these as
 * downloadable file cards (mobile GeneratedFileCard / web equivalent).
 */
function generatedFilesEvent(files: GeneratedFileWire[], responseModel: string): SseLine {
  return sseData({
    choices: [
      {
        delta: {
          x_generated_files: { files },
        },
        index: 0,
      },
    ],
    model: responseModel,
  });
}

/**
 * Emit an `x_tool_result` SSE event once a tool has executed.
 * Exported for reuse by the research loop's url_fetch execution (same wire
 * shape either way) and for unit tests.
 */
export function toolResultEvent(
  toolId: string,
  toolName: string,
  result: string,
  isError: boolean,
  responseModel: string,
): SseLine {
  return sseData({
    choices: [
      {
        delta: {
          x_tool_result: {
            tool_call_id: toolId,
            name: toolName,
            content: result,
            is_error: isError,
          },
        },
        index: 0,
      },
    ],
    model: responseModel,
  });
}

/** A citation source captured from a successful url_fetch or web_search call.
 * `snippet` is url_fetch's permanent absence (a fetched page has no separate
 * snippet, it IS the content) vs web_search's populated field (mapped to
 * `encrypted_content` on the wire — see `searchResultsEvent`). */
export interface FetchedSource {
  url: string;
  title: string;
  snippet?: string;
}

/**
 * Emit an `x_search_results` SSE event carrying the CUMULATIVE list of fetched
 * (url_fetch) sources — the same content shape the Anthropic web_search path
 * and the research loop's SourceAggregator emit, so the client's sources panel
 * and [n] citations work unchanged. Emitting the full list each time keeps
 * positions stable on the client, which replaces its source list per event.
 *
 * The additive `tool: 'url_fetch'` field lets clients distinguish fetch
 * sources from web_search sources (e.g. to avoid synthesizing a web_search
 * timeline entry). Existing fields are unchanged.
 *
 * url_fetch ONLY — web_search sources use `searchResultsEvent` below (no
 * `tool` field, snippet included), matching research-loop.ts's
 * SourceAggregator shape so both native and generic-tool web search render
 * identically on the client. Do not repoint url_fetch at that shape or vice
 * versa: the `tool` field's presence/absence is the client's disambiguator.
 *
 * Exported for unit testing only.
 */
export function fetchSourcesEvent(sources: FetchedSource[], responseModel: string): SseLine {
  return sseData({
    choices: [
      {
        delta: {
          x_search_results: {
            tool: 'url_fetch',
            content: sources.map((source, index) => ({
              type: 'web_search_result',
              url: source.url,
              title: source.title,
              position: index + 1,
            })),
          },
        },
        index: 0,
      },
    ],
    model: responseModel,
  });
}

/**
 * Emit an `x_search_results` SSE event carrying the CUMULATIVE list of
 * web_search (generic-tool, WP4) sources. Deliberately matches
 * research-loop.ts's `SourceAggregator.toSearchResultsEvent` shape exactly —
 * NO `tool` field (absent, not `undefined` — the client's contract treats
 * "web_search sources" as the field-omitted case; see
 * packages/contracts/cloud-contracts/src/tool-events.ts's
 * `SearchResultsDeltaEnvelopeSchema` doc comment) and `snippet` mapped to
 * `encrypted_content` (the client's established field for the source-card
 * snippet, per research-loop.ts:222-223). This keeps the source-card UI
 * uniform whether search came from Anthropic/Google's native tool, the
 * research loop, or this generic tool — the client cannot tell them apart,
 * by design.
 *
 * Exported for unit testing only.
 */
export function searchResultsEvent(sources: FetchedSource[], responseModel: string): SseLine {
  return sseData({
    choices: [
      {
        delta: {
          x_search_results: {
            content: sources.map((source, index) => ({
              type: 'web_search_result',
              url: source.url,
              title: source.title,
              encrypted_content: source.snippet ?? '',
              position: index + 1,
            })),
          },
        },
        index: 0,
      },
    ],
    model: responseModel,
  });
}

// ─── Stream collector ─────────────────────────────────────────────────────────

/**
 * Consume a ReadableStream of SSE bytes, collecting:
 *   - The raw SSE lines (to pass through to the client).
 *   - Any tool_calls accumulation (streamed argument JSON fragments).
 *   - The finish_reason.
 *
 * Returns everything needed to decide what to do next.
 */
async function collectProviderStream(stream: ReadableStream): Promise<{
  lines: SseLine[];
  finishReason: string | null;
  pendingToolCalls: PendingToolCall[];
  textContent: string;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const lines: SseLine[] = [];
  let buffer = '';
  let finishReason: string | null = null;
  let textContent = '';

  // Accumulate streamed tool call fragments by index.
  // OpenAI streaming: tool_calls[i].function.name comes first, then
  // tool_calls[i].function.arguments arrives as partial_json fragments.
  const toolCallAccum: Map<number, { id: string; name: string; argsJson: string }> = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';

    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;

      if (!line.startsWith('data: ')) {
        lines.push(raw + '\n');
        continue;
      }

      const jsonStr = line.slice(6);
      if (jsonStr === '[DONE]') {
        // Don't forward [DONE] yet -- we may need to continue the loop.
        continue;
      }

      // Pass through raw line to client.
      lines.push(raw + '\n');

      try {
        const event = JSON.parse(jsonStr);

        // Accumulate text content.
        const textDelta = event?.choices?.[0]?.delta?.content;
        if (typeof textDelta === 'string') {
          textContent += textDelta;
        }

        // Accumulate tool_call fragments.
        const toolCallDeltas: unknown[] | undefined = event?.choices?.[0]?.delta?.tool_calls;
        if (Array.isArray(toolCallDeltas)) {
          for (const tc of toolCallDeltas) {
            if (typeof tc !== 'object' || tc === null) continue;
            const tcObj = tc as Record<string, unknown>;
            const idx = typeof tcObj['index'] === 'number' ? tcObj['index'] : 0;
            let entry = toolCallAccum.get(idx);
            if (!entry) {
              entry = { id: '', name: '', argsJson: '' };
              toolCallAccum.set(idx, entry);
            }
            if (typeof tcObj['id'] === 'string' && tcObj['id']) {
              entry.id = tcObj['id'];
            }
            const fn = tcObj['function'];
            if (fn && typeof fn === 'object') {
              const fnObj = fn as Record<string, unknown>;
              if (typeof fnObj['name'] === 'string' && fnObj['name']) {
                entry.name = fnObj['name'];
              }
              if (typeof fnObj['arguments'] === 'string') {
                entry.argsJson += fnObj['arguments'];
              }
            }
          }
        }

        // Capture finish_reason.
        const fr = event?.choices?.[0]?.finish_reason;
        if (typeof fr === 'string' && fr) {
          finishReason = fr;
        }
      } catch {
        // Ignore parse errors for incomplete chunks.
      }
    }
  }

  // Flush any remaining buffer.
  if (buffer.trim()) {
    lines.push(buffer);
  }

  // Build pending tool call list.
  const pendingToolCalls: PendingToolCall[] = [];
  for (const [, tc] of toolCallAccum) {
    if (!tc.name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.argsJson || '{}') as Record<string, unknown>;
    } catch {
      args = { _raw: tc.argsJson };
    }
    pendingToolCalls.push({
      id: tc.id || crypto.randomUUID(),
      qualifiedName: tc.name,
      args,
    });
  }

  return { lines, finishReason, pendingToolCalls, textContent };
}

// ─── MCP tool execution ───────────────────────────────────────────────────────

/**
 * Execute a single MCP tool call.
 * Returns the text content of the result and whether it was an error.
 *
 * `e2bExecutor` is resolved ONCE per tool loop (see `runToolLoop`'s `resolveE2BExecutor`)
 * and reused across every execution-tool call in the turn/conversation -- this function
 * does not create or dispose it, so state (variables/imports in a code context) persists
 * across calls instead of being torn down after each one.
 */
async function runMcpTool(
  toolCall: PendingToolCall,
  e2bExecutor: () => Promise<E2BExecutor | null>,
  connectorExecutor?: ConnectorToolExecutor,
): Promise<{
  content: string;
  isError: boolean;
  source?: FetchedSource;
  /** Plural sibling of `source` — web_search returns many results per call
   * (vs url_fetch's one page per call). Never both set on the same result. */
  sources?: FetchedSource[];
  /** Base64 PNG rich results from an E2B runCode (charts) — persisted by the loop. */
  pngResults?: string[];
}> {
  // Platform url_fetch: read-only page fetch, SSRF-guarded (see lib/url-fetch/).
  // Executes on the auto path like E2B tools — no manual approval gate needed
  // because it cannot mutate anything and every failure mode returns a
  // structured error the model can react to. Successful fetches also return a
  // `source` so the loop can emit it into the cumulative citations list.
  if (isUrlFetchTool(toolCall.qualifiedName)) {
    const outcome = await executeUrlFetch(toolCall.args);
    if (!outcome.ok) {
      return { content: `Fetch failed (${outcome.errorCode}): ${outcome.error}`, isError: true };
    }
    return {
      content: `Fetched ${outcome.url} — ${outcome.title}\n\n${outcome.content}`,
      isError: false,
      source: { url: outcome.url, title: outcome.title },
    };
  }

  // WP4 generic web_search: platform-executed search (Perplexity Search API today
  // — see lib/web-search/web-search-tool.ts) for every provider with no working
  // native search path on this route. Same treatment as url_fetch: read-only, no
  // approval gate, every failure mode is a structured tool-result error the model
  // can react to and recover from — NOT routed through the provider-call
  // x_stream_error path above (that path is turn-terminating; a single failed
  // search should not end the whole agentic turn, any more than a failed
  // url_fetch or E2B call does). Successful searches return `sources` (plural —
  // a search returns many results per call, unlike url_fetch's one page).
  if (isWebSearchTool(toolCall.qualifiedName)) {
    const outcome = await executeWebSearch(toolCall.args);
    return {
      content: formatWebSearchResultForModel(outcome),
      isError: !outcome.ok,
      sources: webSearchResultsToFetchedSources(outcome),
    };
  }

  // E2B execution interception: if a code/file/folder execution tool is ever invoked, it
  // runs in the E2B sandbox (gated, fail-closed), never as a generic MCP tool.
  //
  // ACTIVE when AGI_E2B_EXECUTION=1 AND the provider routes to E2B (not anthropic/google):
  //   - request-processor offers e2bExecutionToolDefs() on streaming non-free-trial requests.
  //   - route.ts enters the loop in 'auto' mode (no resume endpoint needed; isolated sandbox).
  //   - getE2BExecutor() returns null when E2B_API_KEY is absent → explicit "unavailable" error.
  //
  // DORMANT when AGI_E2B_EXECUTION=0 (default): resolveCodeExecutionTools() is native-always
  // and never emits these tool names, so this branch is never reached. Zero regression.
  //
  // FAIL-CLOSED: a null/erroring executor surfaces an explicit error to the model — never a
  // silent no-op, never a provider-native fallback.
  if (isExecutionTool(toolCall.qualifiedName)) {
    const executor = await e2bExecutor();
    const result = await routeExecutionTool(executor, toolCall.qualifiedName, toolCall.args);
    return {
      content: result.ok ? result.output || '(no output)' : (result.error ?? 'Execution error'),
      isError: !result.ok,
      pngResults: result.pngResults,
    };
  }

  const parsed = parseQualifiedToolName(toolCall.qualifiedName);
  if (!parsed) {
    return {
      content: `Unknown tool: ${toolCall.qualifiedName}`,
      isError: true,
    };
  }

  // Per-user connector tools (github built-in / operator-mapped remote MCP
  // connectors) execute through the bound connector executor first. It returns
  // `handled: false` for anything it does not own, so operator MCP tools keep
  // their existing dispatch path unchanged.
  if (connectorExecutor) {
    try {
      const connectorResult = await connectorExecutor(
        parsed.serverId,
        parsed.toolName,
        toolCall.args,
      );
      if (connectorResult.handled) {
        return { content: capOutput(connectorResult.content), isError: connectorResult.isError };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: capOutput(`Tool error: ${msg}`), isError: true };
    }
  }

  try {
    const result = await executeWebMcpTool(parsed.serverId, parsed.toolName, toolCall.args);
    const text = result.content
      .map((block) => {
        if (block.type === 'text') return block.text;
        if (block.type === 'resource')
          return block.resource.text ?? `[resource: ${block.resource.uri}]`;
        if (block.type === 'image') return '[image result]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
    // Cap MCP tool output too (design doc §4.3: unbounded MCP output is a memory-exhaustion
    // risk) — reuses the same byte cap as the E2B execution-tool path.
    return { content: capOutput(text || '(no output)'), isError: result.isError === true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: capOutput(`Tool error: ${msg}`), isError: true };
  }
}

/**
 * Parse the `tool_calls` array from a client-supplied assistant message (the
 * suspended turn replayed on a resume request) into PendingToolCall[]. Mirrors
 * the accumulation in `collectProviderStream` but reads the already-complete
 * OpenAI tool_call shape: `{ id, type:'function', function:{ name, arguments } }`
 * where `arguments` is a JSON-encoded string.
 */
function parseAssistantToolCalls(toolCalls: unknown[]): PendingToolCall[] {
  const out: PendingToolCall[] = [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== 'object') continue;
    const o = tc as Record<string, unknown>;
    const id = typeof o['id'] === 'string' ? o['id'] : '';
    const fn = o['function'];
    if (!id || !fn || typeof fn !== 'object') continue;
    const fnObj = fn as Record<string, unknown>;
    const name = typeof fnObj['name'] === 'string' ? fnObj['name'] : '';
    if (!name) continue;
    let args: Record<string, unknown> = {};
    const rawArgs = fnObj['arguments'];
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
      } catch {
        args = { _raw: rawArgs };
      }
    } else if (rawArgs && typeof rawArgs === 'object') {
      args = rawArgs as Record<string, unknown>;
    }
    out.push({ id, qualifiedName: name, args });
  }
  return out;
}

/**
 * True when a tool name was actually OFFERED on this request — i.e. it is in the
 * freshly-loaded per-request `mcpTools` catalog (operator MCP + the user's
 * connected connectors), or it is an E2B execution tool. Used by the resume
 * preamble as a fail-closed gate: an approval for a tool the model was never
 * offered (a hallucinated/forged qualified name) is NOT executed. This is a
 * defense-in-depth layer ON TOP of the per-tool guards inside runMcpTool
 * (connector re-gate, SSRF, unknown-server rejection).
 */
function isToolOffered(qualifiedName: string, mcpTools: WebMcpToolDef[]): boolean {
  if (isExecutionTool(qualifiedName)) return true;
  if (isUrlFetchTool(qualifiedName)) return true;
  if (isWebSearchTool(qualifiedName)) return true;
  return mcpTools.some((t) => t.qualifiedName === qualifiedName);
}

/** Text appended as the tool result when a user rejects (or does not approve) a tool. */
const TOOL_DENIED_MESSAGE = 'The user denied permission to run this tool.';

// ─── Main loop ────────────────────────────────────────────────────────────────

/**
 * Run the agentic tool loop, yielding SSE chunks.
 *
 * Usage (from route.ts):
 * ```ts
 * const toolStream = runToolLoop(processed, { approvalMode: 'manual' });
 * return buildToolLoopStreamResponse(request, toolStream, processed, userId, token);
 * ```
 *
 * The generator yields Uint8Array chunks ready for a TransformStream or
 * ReadableStream constructor.
 */
export async function* runToolLoop(
  processed: ProcessedRequest,
  options: ToolLoopOptions = {},
): AsyncGenerator<Uint8Array> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const approvalMode = options.approvalMode ?? 'manual';
  const encoder = new TextEncoder();
  const responseModel = processed.requestedModel;

  // Inject MCP tool defs into the llmRequest.
  const mcpTools = options.mcpTools ?? [];
  const openAiTools: unknown[] = mcpTools.map(toOpenAiToolDef);
  const llmRequest = {
    ...processed.llmRequest,
    tools:
      openAiTools.length > 0
        ? [...(processed.llmRequest.tools ?? []), ...openAiTools]
        : processed.llmRequest.tools,
    // Ensure streaming for the loop.
    stream: true,
  };

  // Mutable message thread for re-invocations.
  const messages: ProcessedRequest['llmRequest']['messages'] = [...llmRequest.messages];

  // Cumulative citation sources from url_fetch calls across ALL steps.
  // Re-emitted in full whenever a new source lands so client positions stay stable.
  const fetchedSources: FetchedSource[] = [];
  // Cumulative citation sources from web_search calls across ALL steps. Kept
  // SEPARATE from fetchedSources (not merged into one list): the two emitters
  // produce different wire shapes (fetchSourcesEvent's `tool:'url_fetch'` tag
  // vs searchResultsEvent's tag-absent + snippet shape), so a turn using both
  // tools needs two independently-emitted cumulative lists, not one merged
  // list with an ambiguous tag.
  const searchedSources: FetchedSource[] = [];

  // Conversation-scoped E2B executor: resolved (created, or resumed from a paused
  // session) at most ONCE per loop invocation and reused across every execution-tool
  // call in every step of this turn, so a code context's variables/imports persist
  // instead of being torn down after each call. Cleaned up in the `finally` below --
  // paused (not killed) only when both an owned `conversationId` and authenticated
  // `userId` are known so the NEXT turn's loop can resume it; killed immediately
  // otherwise (a conversation id alone is never a sandbox authorization token).
  const conversationId = processed.conversationId;
  const e2bSessionScope =
    conversationId && options.userId
      ? managedCloudE2BSessionScope(options.userId, conversationId)
      : undefined;
  let e2bExecutor: E2BExecutor | null = null;
  let e2bExecutorResolved = false;
  // Generated-file harvest state: the workspace is snapshotted once, when the
  // executor first resolves (BEFORE any execution tool runs), so the turn-end
  // diff only surfaces files created/changed THIS turn — a resumed sandbox may
  // still hold files from previous turns.
  let e2bBaseline: SandboxSnapshot | null = null;
  let executionToolRan = false;
  /** Base64 chart PNGs surfaced by runCode this turn (E2B rich results). */
  const turnPngResults: string[] = [];
  async function resolveE2BExecutor(): Promise<E2BExecutor | null> {
    if (!e2bExecutorResolved) {
      e2bExecutor = await getE2BExecutor(e2bSessionScope);
      e2bExecutorResolved = true;
      if (e2bExecutor) e2bBaseline = await snapshotSandboxFiles(e2bExecutor);
    }
    executionToolRan = true;
    return e2bExecutor;
  }

  /**
   * Harvest files the model created in the sandbox this turn (disk files via
   * the workspace diff, plus runCode chart PNGs that never touch the disk) and
   * return the SSE lines announcing them. Called at the terminal points of the
   * loop, before the final [DONE].
   *
   * Honest states: when a generated file could not be retrieved/persisted, an
   * inline note is emitted alongside today's log warn — never silence.
   */
  async function harvestGeneratedFilesEvents(): Promise<SseLine[]> {
    if (!executionToolRan || !e2bExecutor || !options.userId) return [];
    const lines: SseLine[] = [];
    const files: GeneratedFileWire[] = [];
    let failedCount = 0;

    if (e2bBaseline) {
      try {
        const harvest = await harvestGeneratedFiles({
          executor: e2bExecutor,
          baseline: e2bBaseline,
          userId: options.userId,
          model: responseModel,
        });
        files.push(...harvest.files);
        failedCount += harvest.failedCount;
      } catch (err) {
        logger.warn({ err }, '[tool-loop] generated-file harvest failed; no file card emitted');
        failedCount += 1;
      }
    }

    // Chart PNGs from runCode rich results (execution.results[].png).
    for (const [index, png] of turnPngResults.entries()) {
      try {
        const outcome = await persistGeneratedFileBytes({
          userId: options.userId,
          data: Buffer.from(png, 'base64'),
          mimeType: 'image/png',
          filename: turnPngResults.length === 1 ? 'chart.png' : `chart-${index + 1}.png`,
          provider: 'e2b',
          origin: 'e2b-execution-result',
          model: responseModel,
        });
        if (outcome.ok) {
          files.push(outcome.file);
        } else {
          // Count `not_configured` the same as any other persist failure so the
          // honest "could not be retrieved" note below fires for it too --
          // matches the disk-file harvest's semantics in generated-files.ts,
          // where storage-not-configured is also a counted failure, not a
          // silent drop.
          failedCount += 1;
        }
      } catch (err) {
        logger.warn({ err }, '[tool-loop] chart png persist failed; skipping');
        failedCount += 1;
      }
    }

    if (files.length > 0) lines.push(generatedFilesEvent(files, responseModel));
    if (failedCount > 0) {
      const plural = failedCount === 1 ? 'file' : 'files';
      lines.push(
        sseData({
          choices: [
            {
              delta: {
                content: `\n\n*Note: ${failedCount} generated ${plural} could not be retrieved from the execution sandbox and ${failedCount === 1 ? 'is' : 'are'} not attached.*`,
              },
              index: 0,
            },
          ],
          model: responseModel,
        }),
      );
    }
    return lines;
  }

  /**
   * Terminal-flush: harvest generated files (if any execution ran) and close
   * the stream with `[DONE]`. Invoked from every loop exit EXCEPT the
   * manual-approval suspend (which must not flush/close -- the turn resumes
   * later, and files are harvested when it eventually reaches a real terminal
   * state). Callers must `return` immediately after exhausting this generator
   * so exactly one flush -- and one `[DONE]` -- happens per invocation.
   */
  async function* flushTerminal(): AsyncGenerator<Uint8Array> {
    for (const line of await harvestGeneratedFilesEvents()) {
      yield encoder.encode(line);
    }
    yield encoder.encode(sseDone());
  }

  /**
   * Execute a batch of tool calls and stream their status/result events, then
   * append each `role: 'tool'` result message to the thread. Shared by the
   * auto-mode loop body and the manual-approval resume preamble so both paths
   * run IDENTICAL execution + guard logic (runMcpTool re-runs the connector
   * gate, SSRF, and unknown-server rejection on every call). Read-only tools run
   * concurrently; mutating tools serialize (mirrors Codex parallel.rs).
   */
  async function* runAndStreamToolCalls(calls: PendingToolCall[]): AsyncGenerator<Uint8Array> {
    const readOnly = calls.filter((tc) => isReadOnlyTool(tc.qualifiedName));
    const mutating = calls.filter((tc) => !isReadOnlyTool(tc.qualifiedName));

    // Emit "running" status for all tools. Include tc.args so the client can
    // render a syntax-highlighted Request block in ToolCallCard (detectCodeBlock).
    for (const tc of calls) {
      yield encoder.encode(toolStatusEvent(tc.qualifiedName, 'running', responseModel, tc.args));
    }

    const results: {
      tc: PendingToolCall;
      content: string;
      isError: boolean;
      source?: FetchedSource;
      sources?: FetchedSource[];
      pngResults?: string[];
    }[] = [];

    // Execute read-only tools concurrently.
    const parallelResults = await Promise.all(
      readOnly.map(async (tc) => {
        const result = await runMcpTool(tc, resolveE2BExecutor, options.connectorExecutor);
        return { tc, ...result };
      }),
    );
    results.push(...parallelResults);

    // Execute mutating tools serially.
    for (const tc of mutating) {
      const result = await runMcpTool(tc, resolveE2BExecutor, options.connectorExecutor);
      results.push({ tc, ...result });
    }

    // Collect runCode chart PNGs (rich results that never touch the sandbox
    // disk) for the end-of-turn generated-file persistence.
    for (const r of results) {
      if (r.pngResults && r.pngResults.length > 0) turnPngResults.push(...r.pngResults);
    }

    // Emit status + result events, and append tool result messages.
    let sourcesAdded = false;
    let searchSourcesAdded = false;
    for (const { tc, content, isError, source, sources } of results) {
      yield encoder.encode(
        toolStatusEvent(tc.qualifiedName, isError ? 'failed' : 'completed', responseModel),
      );
      yield encoder.encode(
        toolResultEvent(tc.id, tc.qualifiedName, content, isError, responseModel),
      );

      // Fetched pages join the citations flow (dedupe by URL, stable positions).
      if (source && !fetchedSources.some((s) => s.url === source.url)) {
        fetchedSources.push(source);
        sourcesAdded = true;
      }

      // Search results join the SEPARATE web_search citations flow (same
      // dedupe-by-URL, stable-positions treatment, own cumulative list — see
      // searchedSources' declaration for why these don't merge with
      // fetchedSources).
      for (const s of sources ?? []) {
        if (!searchedSources.some((existing) => existing.url === s.url)) {
          searchedSources.push(s);
          searchSourcesAdded = true;
        }
      }

      messages.push({
        role: 'tool',
        content,
        tool_call_id: tc.id,
      });
    }

    if (sourcesAdded) {
      yield encoder.encode(fetchSourcesEvent(fetchedSources, responseModel));
    }
    if (searchSourcesAdded) {
      yield encoder.encode(searchResultsEvent(searchedSources, responseModel));
    }
  }

  try {
    // ── Manual-approval resume preamble (stateless) ─────────────────────────
    // When resuming, the suspended assistant tool_call turn is the last
    // assistant message in `messages` (replayed by the client). We execute ONLY
    // the approved+pending calls and append a denial result for the rest, then
    // fall into the normal loop which re-invokes the model with the completed
    // thread. No provider call precedes this — the model already produced the
    // tool_calls in the suspended turn.
    if (options.resume) {
      // Locate the suspended assistant tool_call turn.
      let pending: PendingToolCall[] = [];
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]!;
        const tcs = m.tool_calls;
        if (m.role === 'assistant' && Array.isArray(tcs) && tcs.length > 0) {
          pending = parseAssistantToolCalls(tcs);
          break;
        }
      }

      if (pending.length === 0) {
        yield encoder.encode(
          sseData({
            choices: [
              { delta: { content: '\n\nError: no pending tool call to resume.' }, index: 0 },
            ],
            model: responseModel,
          }),
        );
        yield encoder.encode(sseDone());
        return;
      }

      const pendingIds = new Set(pending.map((p) => p.id));

      // SECURITY (defense-in-depth; approve/route.ts also rejects this early):
      // every approval MUST reference a pending tool_call id. A decision for an
      // id that is not actually pending is a forged/mismatched request — reject
      // the whole resume and execute NOTHING.
      for (const a of options.resume.approvals) {
        if (!pendingIds.has(a.toolCallId)) {
          yield encoder.encode(
            sseData({
              choices: [
                {
                  delta: { content: '\n\nError: approval references an unknown tool call.' },
                  index: 0,
                },
              ],
              model: responseModel,
            }),
          );
          yield encoder.encode(sseDone());
          return;
        }
      }

      // NOTE: the resume endpoint (approve/route.ts) forces extended thinking OFF
      // on the continuation, so a suspended Anthropic thinking turn resumes with
      // thinking disabled — no signed-thinking-block requirement, no provider
      // rejection (see known-flaw MCP-APPROVAL-RESUME for the stateless-resume
      // rationale). The loop therefore needs no Anthropic-specific special case.

      // Idempotency: skip any pending call that already has a tool result in the
      // replayed thread (e.g. a client double-submit).
      const alreadyResolved = new Set(
        messages
          .filter((m) => m.role === 'tool' && typeof m.tool_call_id === 'string')
          .map((m) => m.tool_call_id),
      );
      const approvalById = new Map(
        options.resume.approvals.map((a) => [a.toolCallId, a.decision] as const),
      );

      const toRun: PendingToolCall[] = [];
      for (const p of pending) {
        if (alreadyResolved.has(p.id)) continue;
        const decision = approvalById.get(p.id);
        if (decision === 'approved' && isToolOffered(p.qualifiedName, mcpTools)) {
          toRun.push(p);
        } else if (decision === 'approved') {
          // Approved but the tool is not in the offered catalog (hallucinated /
          // forged qualified name): fail-closed — append an error result, do not
          // execute.
          const content = `Tool "${p.qualifiedName}" is not available and was not executed.`;
          yield encoder.encode(
            toolResultEvent(p.id, p.qualifiedName, content, true, responseModel),
          );
          messages.push({ role: 'tool', content, tool_call_id: p.id });
        } else {
          // Rejected OR undecided (fail-closed default): append a denial result
          // so the model can respond without the tool.
          yield encoder.encode(
            toolResultEvent(p.id, p.qualifiedName, TOOL_DENIED_MESSAGE, false, responseModel),
          );
          messages.push({ role: 'tool', content: TOOL_DENIED_MESSAGE, tool_call_id: p.id });
        }
      }

      if (toRun.length > 0) {
        yield* runAndStreamToolCalls(toRun);
      }
      // Fall through into the loop: the next provider call sees the completed
      // thread (assistant tool_calls + every tool result) and continues.
    }

    let step = 0;
    while (step < maxSteps) {
      step++;

      // Build the request for this step.
      const stepRequest = { ...llmRequest, messages };

      // Per-step continuity side-channel: captures the signed thinking blocks
      // (text + Anthropic signature) and the tag-free assistant text from the
      // underlying StreamChunks, which the OpenAI-shaped wire bytes
      // collectProviderStream reads have already stripped/flattened. Fresh per
      // step (like the assembler that fills it). Fixes known-flaw
      // TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01.
      const stepSink: ToolLoopStepSink = {
        thinkingBlocks: [],
        text: '',
        usage: options.usage,
      };

      // Call the provider through the shared, table-driven adapter dispatch
      // (restructure Wave 2, task #34's tool-loop slice, see
      // tool-loop-anthropic.ts's buildToolLoopStream / ADAPTER_PROVIDERS).
      let providerStream: ReadableStream;
      try {
        providerStream = await buildToolLoopStream(
          processed.provider,
          processed,
          stepRequest,
          responseModel,
          stepSink,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const classified = classifyError(err);
        logger.error(
          { provider: processed.provider, step, error: msg },
          '[tool-loop] provider call failed',
        );
        yield encoder.encode(
          sseData({
            choices: [{ delta: { content: `\n\nError: ${msg}` }, index: 0 }],
            model: responseModel,
          }),
        );
        // Additive x_stream_error marker (see openai-wire-compat.ts's
        // sseChunks() 'error' case for the base-path twin of this) -- the
        // tool-loop hand-rolls its own SSE emission (no OpenAIWireAssembler),
        // so without this, tool-calling-path failures were invisible to the
        // hasStreamError() check web/desktop/mobile use, even though the
        // base path's failures were already detectable. `code` mirrors the
        // provider adapters' own convention (String(status), not the
        // semantic classifier code) so the field means the same thing
        // regardless of which path produced it.
        yield encoder.encode(
          sseData({
            choices: [
              {
                delta: {
                  x_stream_error: {
                    message: classified.message,
                    ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
                    retryable: classified.retryable,
                  },
                },
                index: 0,
              },
            ],
            model: responseModel,
          }),
        );
        // Terminal exit: a mid-loop provider error still owes the client any
        // files generated by earlier steps' execution tools, plus a closing
        // [DONE] -- previously this `break`d straight to the loop's exit,
        // skipping both (harvest only ran on natural finish or maxSteps).
        yield* flushTerminal();
        return;
      }

      // Collect and pass through the provider stream.
      const { lines, finishReason, pendingToolCalls, textContent } =
        await collectProviderStream(providerStream);

      // Forward all collected lines to the client.
      for (const line of lines) {
        yield encoder.encode(line);
      }

      // If no tool calls, the model is done: harvest any sandbox-generated
      // files (file cards need durable URLs before the stream closes), then
      // emit [DONE] and exit.
      if (finishReason !== 'tool_calls' || pendingToolCalls.length === 0) {
        yield* flushTerminal();
        return;
      }

      // Append the assistant's tool-use turn to the thread.
      const assistantToolCalls = pendingToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.qualifiedName, arguments: JSON.stringify(tc.args) },
      }));
      // Anthropic extended-thinking continuity (known-flaw
      // TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01): when this step produced
      // signed thinking blocks, replay them on the assistant tool_use turn
      // (via the internal `__canonicalThinking` field, reconstructed into real
      // ThinkingBlocks before the tool_use blocks by openAIWireRequestToChat
      // Request) and use the TAG-FREE assistant text so the follow-up request
      // never double-represents reasoning as literal <thinking> tag text.
      // Strictly gated on signed blocks being present: every other case (non-
      // Anthropic providers, thinking-disabled Anthropic, or thinking without
      // tool_use) sees the identical `content: textContent` push as before.
      const signedThinking = stepSink.thinkingBlocks.filter((block) => block.signature);
      const assistantMessage: (typeof messages)[number] = {
        role: 'assistant',
        content: signedThinking.length > 0 ? stepSink.text : textContent,
        tool_calls: assistantToolCalls as unknown[],
      };
      if (signedThinking.length > 0) {
        assistantMessage.__canonicalThinking = signedThinking;
      }
      messages.push(assistantMessage);

      // In manual approval mode, emit an approval request for each tool and
      // stop the stream -- the client resumes via the approve endpoint.
      // In auto mode, execute immediately.
      if (approvalMode === 'manual') {
        for (const tc of pendingToolCalls) {
          yield encoder.encode(
            toolApprovalRequestEvent(tc.id, tc.qualifiedName, tc.args, responseModel),
          );
        }
        // Emit [DONE] so the client knows the current stream is complete
        // and the approval prompt is the terminal event for this turn.
        yield encoder.encode(sseDone());
        return;
      }

      // Auto mode: execute tools (shared with the resume preamble so both paths
      // run identical execution + guard logic).
      yield* runAndStreamToolCalls(pendingToolCalls);

      // Continue to next step.
    }

    // Falling out of the `while` (rather than hitting one of the `return`s
    // above) means every step re-invoked the provider and never reached a
    // terminal stop -- maxSteps exhausted. This is the only way execution
    // reaches here, so the flush below is unconditional (no redundant
    // `step >= maxSteps` re-check).
    logger.warn(
      { maxSteps, provider: processed.provider },
      '[tool-loop] max steps reached without terminal stop',
    );
    yield* flushTerminal();
  } finally {
    // Lifecycle cleanup: only relevant if an E2B execution tool actually ran during this
    // loop invocation. Runs on every `return` above (manual-approval suspend, provider
    // error, natural finish, maxSteps exhaustion) AND on early `.return()` from the
    // caller's `cancel()` (client disconnect / abort) -- generator `finally` blocks fire
    // in all of these cases, closing the billing-leak gap of a mid-turn abort.
    if (e2bExecutor) {
      if (e2bSessionScope) {
        // Pause (not kill): stops billing while preserving sandbox + context state so
        // the NEXT turn's runToolLoop can resume it via the same authenticated scope.
        await pauseE2BSession(e2bSessionScope);
      } else {
        // No conversation to resume into -- release the sandbox immediately.
        await e2bExecutor.dispose();
      }
    }
  }
}

// ─── Catalog warm-up helper ───────────────────────────────────────────────────

/**
 * Load the MCP tool catalog and return the tool defs.
 * Returns an empty list when no servers are configured (graceful degradation).
 */
export async function loadMcpToolDefs(): Promise<WebMcpToolDef[]> {
  try {
    const catalog = await getWebMcpCatalog();
    return catalogToToolDefs(catalog);
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : err },
      '[tool-loop] failed to load MCP catalog -- proceeding without tools',
    );
    return [];
  }
}
