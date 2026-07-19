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
 *   - When 'manual' (default), the loop persists a server-owned checkpoint BEFORE it
 *     exposes `x_tool_approval_request`, then suspends execution. The client resumes by
 *     sending only the durable run id and per-tool_call_id decisions. On resume,
 *     runToolLoop is invoked with the checkpoint's trusted messages and `options.resume`;
 *     it executes ONLY approved+pending tool calls (re-running every guard) and appends a
 *     denial result for rejected ones, then continues the normal loop.
 *   - Parallel-safe tools (read-only) are executed concurrently; mutating tools are
 *     serialized (mirrors Codex parallel.rs).
 *
 * Stream contract:
 *   - Emits standard OpenAI-compatible SSE events.
 *   - Emits `x_tool_status` events (reused from Anthropic server-tool path) to drive
 *     `ToolTimeline` in the client.
 *   - Emits `x_tool_approval_request` events when a tool needs user approval.
 *   - Emits `x_tool_result` events when a tool completes.
 *   - Emits the canonical `x_agent_event` envelope alongside those legacy
 *     fields while Web, Desktop Cloud, and Mobile Cloud migrate to one inline
 *     activity timeline.
 */

import 'server-only';

import { logger } from '@/lib/logger';
import { classifyError } from '@agiworkforce/provider-runtime';
import type {
  AgentEventEnvelope,
  AgentEventStopReason,
  AgentEventToolCategory,
  AgentTaskState,
} from '@agiworkforce/types/protocol';
import type { ThinkingBlock } from '@agiworkforce/types';
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
import { e2bCutoverEnabled } from '@/lib/e2b/gate';
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
import {
  createObservedProviderUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import {
  createAgentEventStreamEmitter,
  createPublicTextDeltaProjector,
  toAgentEventJson,
} from './agent-event-stream';
import { SKILL_TOOL_NAME } from '@agiworkforce/skills';
import { executeManagedSkillTool } from '@/lib/services/skill-catalog-service';
import { functionToolName } from './tool-loop-routing';
import {
  generateManagedOfficeFile,
  isManagedOfficeFileTool,
  MANAGED_OFFICE_FILE_TOOL_NAME,
} from '@/lib/services/managed-office-file-service';
import { applyFreeTrialProviderBudget } from '@/lib/services/free-trial-service';
import {
  reserveManagedUsageProviderStep,
  ManagedUsageRequestError,
} from '@/lib/services/managed-usage-request-service';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Ordinary chat stays deliberately conservative: it is still a chat turn. */
const DEFAULT_CHAT_MAX_STEPS = 10;
/** Paid AGI Work is the deep agent surface and must not inherit chat's cap. */
const DEFAULT_AGI_WORK_MAX_STEPS = 100;
/**
 * Leave one minute of the Hobby plan's five-minute function window for file
 * harvest, durable usage settlement, and response teardown. This remains a
 * safety boundary after durable workflow execution lands; it is not presented
 * as restart-safe background execution.
 */
const DEFAULT_AGI_WORK_MAX_DURATION_MS = 4 * 60_000;

/**
 * Bound accumulation from the (untrusted) provider stream within one step:
 * total argument JSON per tool call, and the number of tool calls accepted.
 * A buggy/compromised provider emitting unbounded `arguments` fragments or a
 * flood of tool_calls would otherwise grow server memory without limit.
 */
const MAX_TOOL_ARGS_JSON_CHARS = 256 * 1024;
const MAX_TOOL_CALLS_PER_STEP = 32;

/**
 * Per-tool-call wall-clock cap. A hung tool (stuck MCP/connector call, wedged
 * sandbox exec) would otherwise block the turn until the platform SIGKILLs the
 * function — which skips the generator `finally`, leaking the E2B sandbox
 * (still billing). Bounding each call lets the loop settle and the finally run.
 */
const TOOL_CALL_TIMEOUT_MS = 120_000;

/** Max read-only tool calls run concurrently in one step (bounds outbound fan-out). */
const MAX_PARALLEL_TOOL_CALLS = 4;

/**
 * Total budget for accumulated tool-RESULT content across the whole loop. Tool results
 * (search dumps, file reads, sandbox stdout) can each be large and there can be up to
 * `maxSteps` of them, so without a bound a long agentic run overflows the model context
 * window mid-loop. Old results beyond this budget are shrunk to a marker before each
 * provider call — never removed, which would desync an assistant tool_call from its
 * result. ~200K chars ≈ 50K tokens, leaving room for the system prompt, transcript, and
 * the next completion on every current managed/BYOK model.
 */
const MAX_TOOL_RESULT_HISTORY_CHARS = 200_000;
/** The N most-recent tool results are always kept verbatim (recent context matters most). */
const KEEP_RECENT_TOOL_RESULTS = 6;
/** Replaces an old tool result's content once it's trimmed for context budget. */
const TRUNCATED_TOOL_RESULT_MARKER =
  '[earlier tool result omitted to keep the conversation within the model context window]';

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

/** Exported for unit tests (read-only classification is parallel-safety-critical). */
export function isReadOnlyTool(toolName: string): boolean {
  if (toolName === SKILL_TOOL_NAME) return true;
  const lower = toolName.toLowerCase();
  // Prefix match ONLY. A substring match misclassified mutating tools as
  // parallel-safe — `budget_transfer` contains "get", `create_playlist`
  // contains "list", `delete_query` contains "query" — which broke the
  // "mutating tools serialize" guarantee and raced shared connector/server
  // state. Prefix match keeps genuine read verbs (get_/list_/search_/query_)
  // parallel while defaulting unknown/mutating names to serial execution.
  return READ_ONLY_TOOL_PREFIXES.some((p) => lower.startsWith(p));
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
 * Resume decisions for the manual-approval flow. The suspended assistant
 * tool_call turn is loaded from the server-owned checkpoint into
 * `processed.llmRequest.messages`; this object contains decisions only.
 */
export interface ResumeApproval {
  approvals: ToolApprovalDecision[];
}

/** Trusted loop state persisted before an approval prompt reaches a client. */
export interface ToolLoopApprovalCheckpoint {
  sessionId: string;
  turnId: string;
  nextEventSequence: number;
  /** Provider steps completed across every bounded invocation of this run. */
  completedSteps: number;
  /** Canonical approval events committed atomically with the checkpoint. */
  events: AgentEventEnvelope[];
  messages: ProcessedRequest['llmRequest']['messages'];
  pendingToolCalls: Array<{
    id: string;
    qualifiedName: string;
    args: Record<string, unknown>;
  }>;
}

/** State carried from one bounded Workflow invocation into the next. */
export interface ToolLoopInvocationCheckpoint {
  sessionId: string;
  turnId: string;
  nextEventSequence: number;
  completedSteps: number;
  messages: ProcessedRequest['llmRequest']['messages'];
}

export interface ToolLoopProviderStepResult {
  lines: Array<{ line: string; publicTextDelta?: string }>;
  finishReason: string | null;
  pendingToolCalls: PendingToolCall[];
  textContent: string;
  publicTextTail: string;
  thinkingBlocks: ThinkingBlock[];
  canonicalText: string;
  usage: ObservedProviderUsage;
}

export interface ToolLoopProviderExecution {
  operationKey: string;
  step: number;
  request: ProcessedRequest['llmRequest'];
  execute: () => Promise<ToolLoopProviderStepResult>;
}

export type ToolLoopProviderExecutor = (
  input: ToolLoopProviderExecution,
) => Promise<ToolLoopProviderStepResult>;

export interface ToolLoopToolResult {
  content: string;
  isError: boolean;
  source?: FetchedSource;
  sources?: FetchedSource[];
  pngResults?: string[];
  generatedFiles?: GeneratedFileWire[];
}

export interface ToolLoopToolExecution {
  operationKey: string;
  retrySafety: CloudAgentToolRetrySafety;
  toolCall: PendingToolCall;
  execute: () => Promise<ToolLoopToolResult>;
}

export type ToolLoopToolExecutor = (input: ToolLoopToolExecution) => Promise<ToolLoopToolResult>;

export interface ToolLoopOptions {
  /** Maximum number of model re-invocations. Defaults by product work mode. */
  maxSteps?: number;
  /** Optional wall-clock safety budget for this invocation. Defaults by work mode. */
  maxDurationMs?: number;
  /** Injectable monotonic-enough clock for deterministic policy tests. */
  now?: () => number;
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
  /** Durable event identity restored when a suspended run continues. */
  eventSessionId?: string;
  /** Durable turn identity restored when a suspended run continues. */
  eventTurnId?: string;
  /** Next canonical event sequence restored from the approval checkpoint. */
  initialEventSequence?: number;
  /**
   * Persists trusted execution state before approval events are yielded. If
   * persistence fails, no actionable approval UI is sent to the client.
   */
  onApprovalCheckpoint?: (checkpoint: ToolLoopApprovalCheckpoint) => Promise<void>;
  /** Persist state and return without `[DONE]` when this function invocation expires. */
  onInvocationCheckpoint?: (checkpoint: ToolLoopInvocationCheckpoint) => Promise<void>;
  /** Number of provider steps completed by preceding durable invocations. */
  initialCompletedSteps?: number;
  /** Suppress duplicate lifecycle events on an invocation continuation. */
  invocationContinuation?: boolean;
  /** Wrap provider calls with a durable replay receipt. */
  providerExecutor?: ToolLoopProviderExecutor;
  /** Wrap tool calls with a durable replay receipt. */
  toolExecutor?: ToolLoopToolExecutor;
  /** Let durable-runtime lease/fatal errors escape instead of becoming chat output. */
  shouldPropagateExecutionError?: (error: unknown) => boolean;
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
  /** Durable cancellation check evaluated before provider and tool side effects. */
  isCancellationRequested?: () => Promise<boolean>;
}

export interface ToolLoopPolicy {
  maxSteps: number;
  maxDurationMs: number | undefined;
}

/**
 * Resolve execution depth from the product mode, never from a provider or
 * client-controlled model hint. Explicit options are reserved for internal
 * callers and deterministic tests.
 */
export function resolveToolLoopPolicy(
  processed: ProcessedRequest,
  options: Pick<ToolLoopOptions, 'maxSteps' | 'maxDurationMs'>,
): ToolLoopPolicy {
  const isAgiWork = processed.chatRequest?.work_mode === 'agiwork';
  return {
    maxSteps: options.maxSteps ?? (isAgiWork ? DEFAULT_AGI_WORK_MAX_STEPS : DEFAULT_CHAT_MAX_STEPS),
    maxDurationMs:
      options.maxDurationMs ?? (isAgiWork ? DEFAULT_AGI_WORK_MAX_DURATION_MS : undefined),
  };
}

/** Shape of a parsed tool_call from the provider stream. */
export interface PendingToolCall {
  id: string;
  qualifiedName: string;
  args: Record<string, unknown>;
}

export type CloudAgentToolRetrySafety = 'safe' | 'unsafe';

/**
 * Only local, read-only platform operations are replay-safe. Search is paid,
 * and MCP, connector, and sandbox tools can mutate despite a read-looking name.
 */
export function resolveToolRetrySafety(toolName: string): CloudAgentToolRetrySafety {
  return isUrlFetchTool(toolName) || toolName === SKILL_TOOL_NAME ? 'safe' : 'unsafe';
}

function mergeObservedUsage(
  target: ObservedProviderUsage | undefined,
  source: ObservedProviderUsage,
): void {
  if (!target) return;
  target.providerCalls += source.providerCalls;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.cacheWrite1hTokens += source.cacheWrite1hTokens;
  target.reasoningTokens += source.reasoningTokens;
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
  [/\bskill/i, 'Reading skill'],
  [/\bcreate_office_file\b/i, 'Creating Office file'],
];

/** Derive a playful status phrase for a tool name, or return undefined. */
export function toolStatusPhrase(toolName: string): string | undefined {
  for (const [pattern, phrase] of TOOL_STATUS_PHRASES) {
    if (pattern.test(toolName)) return phrase;
  }
  return undefined;
}

function humanizeIdentifier(value: string): string {
  const humanized = value
    .replace(/^mcp__[^_]+__/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return humanized.toLowerCase() === 'github' ? 'GitHub' : humanized;
}

function mcpServerLabel(toolName: string): string | null {
  const parsed = parseQualifiedToolName(toolName);
  if (!parsed) return null;
  // A user's custom remote connector has an opaque `custom-<hex>` serverId that
  // carries no human name; humanizing it leaks an internal id ("Custom A1b2c3")
  // into the activity feed. Return null so the summary uses generic connector
  // phrasing. Surfacing the real name needs the connector display name threaded
  // onto the tool def / event — tracked as CONNECTOR-BADGE-CUSTOM-NAME.
  if (/^custom-/i.test(parsed.serverId)) return null;
  return humanizeIdentifier(parsed.serverId);
}

function canonicalToolCategory(
  toolName: string,
  offeredTools: WebMcpToolDef[],
): AgentEventToolCategory {
  if (isWebSearchTool(toolName)) return 'web-search';
  if (isUrlFetchTool(toolName)) return 'web-fetch';
  if (isManagedOfficeFileTool(toolName)) return 'artifact';
  if (toolName === 'execute_code') return 'code-execution';
  if (toolName === 'write_file' || toolName === 'create_folder') return 'filesystem';

  const offered = offeredTools.find((tool) => tool.qualifiedName === toolName);
  if (offered?.origin === 'connector') return 'connector';
  if (parseQualifiedToolName(toolName)) return 'mcp';

  if (/skill/i.test(toolName)) return 'skill';
  if (/memory|relevant_chat/i.test(toolName)) return 'memory';
  if (/computer|browser|screenshot|click|navigate/i.test(toolName)) return 'computer-use';
  if (/shell|terminal|bash|command/i.test(toolName)) return 'shell';
  if (/file|folder|directory|grep|ripgrep|search_codebase/i.test(toolName)) return 'filesystem';
  if (/artifact|document|spreadsheet|presentation|pdf/i.test(toolName)) return 'artifact';
  return 'other';
}

/** Exported for unit tests. Builds the user-facing activity-feed summary line. */
export function canonicalToolSummary(
  toolName: string,
  category: AgentEventToolCategory,
  args?: Record<string, unknown>,
): string {
  const phrase =
    (isUrlFetchTool(toolName) ? urlFetchDomainPhrase(args) : undefined) ??
    toolStatusPhrase(toolName);
  if (phrase) return phrase;

  const server = mcpServerLabel(toolName);
  if (category === 'connector') return server ? `Using ${server} connector` : 'Using connector';
  if (category === 'mcp') return `Using ${server ?? 'MCP'} tool`;
  return `Running ${humanizeIdentifier(toolName)}`;
}

function canonicalApprovalSummary(toolName: string, category: AgentEventToolCategory): string {
  const server = mcpServerLabel(toolName);
  if (category === 'connector') return `Review ${server ?? 'connector'} action`;
  if (category === 'mcp') return `Review ${server ?? 'MCP'} action`;
  return `Review ${humanizeIdentifier(toolName)} action`;
}

function canonicalStopReason(finishReason: string | null): AgentEventStopReason {
  if (finishReason === 'length') return 'max-tokens';
  if (finishReason === 'content_filter' || finishReason === 'refusal') return 'refusal';
  if (finishReason === 'cancelled' || finishReason === 'cancel') return 'cancelled';
  if (finishReason === 'error') return 'error';
  return 'end-turn';
}

function validCanonicalSources(sources: FetchedSource[]): FetchedSource[] {
  return sources.filter((source) => {
    try {
      new URL(source.url);
      return true;
    } catch {
      return false;
    }
  });
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
export const TOOL_LOOP_STREAM_LIMITS = {
  maxToolArgsJsonChars: MAX_TOOL_ARGS_JSON_CHARS,
  maxToolCallsPerStep: MAX_TOOL_CALLS_PER_STEP,
  toolCallTimeoutMs: TOOL_CALL_TIMEOUT_MS,
  maxParallelToolCalls: MAX_PARALLEL_TOOL_CALLS,
  maxToolResultHistoryChars: MAX_TOOL_RESULT_HISTORY_CHARS,
  keepRecentToolResults: KEEP_RECENT_TOOL_RESULTS,
} as const;

/**
 * Bound a tool-call promise: resolve to an error result if it exceeds
 * `timeoutMs` (a hung tool can't wedge the turn) or if it rejects (one tool
 * can't crash the whole batch). Never rejects. Exported for unit tests.
 */
/**
 * Run `fn` over `items` with at most `limit` in flight at once, preserving input
 * order in the results. Bounds parallel tool fan-out so a model emitting many
 * read-only calls can't flood outbound requests / provider rate limits. Exported
 * for unit tests.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  };
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Bound the total size of accumulated tool-RESULT content in-place so a long agentic loop
 * can't overflow the model context window mid-run. Preserves EVERY message — dropping a
 * tool message would desync an assistant `tool_call` from its result and make the provider
 * request invalid — and keeps the `keepRecent` most-recent tool results verbatim; older
 * ones are shrunk to a short marker, oldest first, until the retained tool content is under
 * `maxChars`. Only string tool contents are touched (multimodal parts are left alone).
 * Returns the number of results truncated. Exported for unit tests.
 */
export function trimToolResultHistory(
  messages: Array<{ role: string; content?: unknown }>,
  maxChars: number = MAX_TOOL_RESULT_HISTORY_CHARS,
  keepRecent: number = KEEP_RECENT_TOOL_RESULTS,
): number {
  const toolIdx: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'tool') toolIdx.push(i);
  }
  const len = (i: number): number =>
    typeof messages[i]?.content === 'string' ? (messages[i]!.content as string).length : 0;
  let total = 0;
  for (const i of toolIdx) total += len(i);
  if (total <= maxChars) return 0;

  // Never truncate the most-recent results — that's the context the model is actively
  // reasoning over. Trim older ones oldest-first until back under budget.
  const truncatable = toolIdx.slice(0, Math.max(0, toolIdx.length - keepRecent));
  let truncated = 0;
  for (const i of truncatable) {
    if (total <= maxChars) break;
    const before = len(i);
    if (before <= TRUNCATED_TOOL_RESULT_MARKER.length) continue;
    messages[i]!.content = TRUNCATED_TOOL_RESULT_MARKER;
    total -= before - TRUNCATED_TOOL_RESULT_MARKER.length;
    truncated++;
  }
  return truncated;
}

export function withToolTimeout(
  run: Promise<ToolLoopToolResult>,
  toolName: string,
  timeoutMs: number,
): Promise<ToolLoopToolResult> {
  return new Promise<ToolLoopToolResult>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        content: `Tool ${toolName} timed out after ${timeoutMs / 1000}s and was abandoned.`,
        isError: true,
      });
    }, timeoutMs);
    run.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err: unknown) => {
        clearTimeout(timer);
        resolve({
          content: `Tool ${toolName} failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        });
      },
    );
  });
}

/** Exported for unit tests (untrusted-provider-stream accumulation bounds). */
export async function collectProviderStream(stream: ReadableStream): Promise<{
  lines: Array<{ line: SseLine; publicTextDelta?: string }>;
  finishReason: string | null;
  pendingToolCalls: PendingToolCall[];
  textContent: string;
  publicTextTail: string;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const lines: Array<{ line: SseLine; publicTextDelta?: string }> = [];
  const publicTextProjector = createPublicTextDeltaProjector();
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
        lines.push({ line: raw + '\n' });
        continue;
      }

      const jsonStr = line.slice(6);
      if (jsonStr === '[DONE]') {
        // Don't forward [DONE] yet -- we may need to continue the loop.
        continue;
      }

      try {
        const event = JSON.parse(jsonStr);
        let publicTextDelta: string | undefined;

        // Accumulate text content.
        const textDelta = event?.choices?.[0]?.delta?.content;
        if (typeof textDelta === 'string') {
          textContent += textDelta;
          publicTextDelta = publicTextProjector.push(textDelta) || undefined;
        }

        // Pass through the provider line first. Its matching canonical public
        // text event follows immediately, so clients can render the legacy
        // content wire while the durable journal records the same chunk.
        lines.push({ line: raw + '\n', publicTextDelta });

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
              if (
                typeof fnObj['arguments'] === 'string' &&
                entry.argsJson.length < MAX_TOOL_ARGS_JSON_CHARS
              ) {
                entry.argsJson = (entry.argsJson + fnObj['arguments']).slice(
                  0,
                  MAX_TOOL_ARGS_JSON_CHARS,
                );
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
        lines.push({ line: raw + '\n' });
      }
    }
  }

  // Flush any remaining buffer.
  if (buffer.trim()) {
    lines.push({ line: buffer });
  }

  // Build pending tool call list. Cap the number accepted from one step and
  // de-dupe provider tool_call ids: a provider that repeats an id would produce
  // two role:'tool' messages sharing one id (the next turn's request may be
  // rejected 400) and, in manual mode, two approval cards with an ambiguous
  // tool_call_id. A repeated id is re-minted so every accepted call is unique.
  const pendingToolCalls: PendingToolCall[] = [];
  const seenToolCallIds = new Set<string>();
  for (const [, tc] of toolCallAccum) {
    if (!tc.name) continue;
    if (pendingToolCalls.length >= MAX_TOOL_CALLS_PER_STEP) break;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.argsJson || '{}') as Record<string, unknown>;
    } catch {
      args = { _raw: tc.argsJson };
    }
    let id = tc.id || crypto.randomUUID();
    if (seenToolCallIds.has(id)) id = crypto.randomUUID();
    seenToolCallIds.add(id);
    pendingToolCalls.push({ id, qualifiedName: tc.name, args });
  }

  return {
    lines,
    finishReason,
    pendingToolCalls,
    textContent,
    publicTextTail: publicTextProjector.flush(),
  };
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
  availableTools: ReadonlySet<string>,
  connectorExecutor?: ConnectorToolExecutor,
  officeContext?: { userId?: string; model: string },
): Promise<ToolLoopToolResult> {
  if (toolCall.qualifiedName === SKILL_TOOL_NAME) {
    if (!availableTools.has(SKILL_TOOL_NAME)) {
      return { content: `Unknown tool: ${SKILL_TOOL_NAME}`, isError: true };
    }
    const result = await executeManagedSkillTool(toolCall.args, { availableTools });
    return { content: result.content, isError: result.isError };
  }

  if (isManagedOfficeFileTool(toolCall.qualifiedName)) {
    if (!availableTools.has(MANAGED_OFFICE_FILE_TOOL_NAME)) {
      return { content: `Unknown tool: ${MANAGED_OFFICE_FILE_TOOL_NAME}`, isError: true };
    }
    if (!officeContext?.userId) {
      return { content: 'An authenticated file owner is required.', isError: true };
    }
    const generated = await generateManagedOfficeFile(toolCall.args);
    if (!generated.ok) {
      return { content: generated.message, isError: true };
    }
    const persisted = await persistGeneratedFileBytes({
      userId: officeContext.userId,
      data: generated.data,
      mimeType: generated.mimeType,
      filename: generated.filename,
      provider: 'agi-managed-office',
      origin: 'managed-office-tool',
      model: officeContext.model,
      extraMetadata: { format: toolCall.args['format'] },
    });
    if (!persisted.ok) {
      return { content: 'The Office file could not be attached.', isError: true };
    }
    return {
      content: JSON.stringify({
        ok: true,
        file: {
          name: persisted.file.file_name,
          uri: persisted.file.uri,
          mime_type: persisted.file.mime_type,
          byte_count: persisted.file.byte_count,
        },
      }),
      isError: false,
      generatedFiles: [persisted.file],
    };
  }

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
    // Reachability gate: execution tools may run ONLY when the explicit cut-over
    // flag is on. getE2BExecutor() is (by design) constructable on key presence
    // alone for operator verification, so without this check a loop entered for
    // OTHER reasons (connectors / AGI-Work) plus a model-emitted execute_code
    // would silently run managed compute whenever E2B_API_KEY is set but the
    // cut-over flag is off. Fail closed as unavailable in that case.
    if (!e2bCutoverEnabled()) {
      return {
        content: `Tool ${toolCall.qualifiedName} is not available.`,
        isError: true,
      };
    }
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
function isToolOffered(
  qualifiedName: string,
  mcpTools: WebMcpToolDef[],
  availableTools: ReadonlySet<string>,
): boolean {
  if (qualifiedName === SKILL_TOOL_NAME) return availableTools.has(SKILL_TOOL_NAME);
  if (isManagedOfficeFileTool(qualifiedName)) {
    return availableTools.has(MANAGED_OFFICE_FILE_TOOL_NAME);
  }
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
  const { maxSteps, maxDurationMs } = resolveToolLoopPolicy(processed, options);
  const now = options.now ?? Date.now;
  const startedAt = now();
  const approvalMode = options.approvalMode ?? 'manual';
  const encoder = new TextEncoder();
  const responseModel = processed.requestedModel;
  const turnId = options.eventTurnId ?? (processed.requestId || crypto.randomUUID());
  const sessionId = options.eventSessionId ?? processed.conversationId ?? turnId;
  const eventStream = createAgentEventStreamEmitter({
    sessionId,
    turnId,
    responseModel,
    initialSequence: options.initialEventSequence,
  });
  const showWorkPhases = processed.chatRequest?.work_mode === 'agiwork';
  const taskId = turnId;
  let taskState: AgentTaskState | undefined = options.resume
    ? 'awaiting_input'
    : options.invocationContinuation
      ? 'running'
      : undefined;

  function taskStateEvent(state: AgentTaskState, summary: string): SseLine {
    const previousState = taskState;
    taskState = state;
    return eventStream.emit({
      type: 'task-state-changed',
      taskId,
      state,
      ...(previousState !== undefined ? { previousState } : {}),
      summary,
    });
  }

  // Inject MCP tool defs into the llmRequest.
  const mcpTools = options.mcpTools ?? [];
  const openAiTools: unknown[] = mcpTools.map(toOpenAiToolDef);
  const availableTools = new Set([
    ...mcpTools.map((tool) => tool.qualifiedName),
    ...(processed.llmRequest.tools ?? []).map(functionToolName).filter(Boolean),
  ]);
  const llmRequest = {
    ...processed.llmRequest,
    tools:
      openAiTools.length > 0
        ? [...(processed.llmRequest.tools ?? []), ...openAiTools]
        : processed.llmRequest.tools,
    // Ensure streaming for the loop.
    stream: true,
  };
  const observedUsage = options.usage ?? createObservedProviderUsage();

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

    if (files.length > 0) {
      lines.push(generatedFilesEvent(files, responseModel));
      for (const file of files) {
        lines.push(
          eventStream.emit({
            type: 'artifact-produced',
            artifactId: file.id,
            name: file.file_name,
            mimeType: file.mime_type,
            uri: file.uri,
            sizeBytes: file.byte_count,
          }),
        );
      }
    }
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
  async function* flushTerminal(
    reason: AgentEventStopReason = 'end-turn',
  ): AsyncGenerator<Uint8Array> {
    for (const line of await harvestGeneratedFilesEvents()) {
      yield encoder.encode(line);
    }
    if (reason === 'cancelled') {
      yield encoder.encode(taskStateEvent('cancelled', 'Agent work was cancelled.'));
    } else if (reason === 'error' || reason === 'refusal') {
      yield encoder.encode(taskStateEvent('failed', 'Agent work ended with an error.'));
    } else if (reason !== 'tool-use') {
      yield encoder.encode(
        taskStateEvent('ready_for_review', 'Agent work finished and is ready for review.'),
      );
    }
    yield encoder.encode(eventStream.emit({ type: 'stop', reason }));
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
    const startedAt = new Map<string, number>();
    for (const tc of calls) {
      yield encoder.encode(toolStatusEvent(tc.qualifiedName, 'running', responseModel, tc.args));
      const category = canonicalToolCategory(tc.qualifiedName, mcpTools);
      startedAt.set(tc.id, Date.now());
      yield encoder.encode(
        eventStream.emit({
          type: 'tool-execution-start',
          toolCallId: tc.id,
          name: tc.qualifiedName,
          category,
          summary: canonicalToolSummary(tc.qualifiedName, category, tc.args),
          input: toAgentEventJson(tc.args),
        }),
      );
    }

    const results: {
      tc: PendingToolCall;
      content: string;
      isError: boolean;
      source?: FetchedSource;
      sources?: FetchedSource[];
      pngResults?: string[];
      generatedFiles?: GeneratedFileWire[];
    }[] = [];

    const executeTool = (tc: PendingToolCall): Promise<ToolLoopToolResult> => {
      const execute = () =>
        runMcpTool(tc, resolveE2BExecutor, availableTools, options.connectorExecutor, {
          userId: options.userId,
          model: responseModel,
        });
      const run = options.toolExecutor
        ? options.toolExecutor({
            operationKey: `tool:${tc.id}`,
            retrySafety: resolveToolRetrySafety(tc.qualifiedName),
            toolCall: tc,
            execute,
          })
        : execute();
      // Bound the call: a hung tool resolves to an error result instead of
      // wedging the turn (which would SIGKILL the fn and skip sandbox cleanup).
      return withToolTimeout(run, tc.qualifiedName, TOOL_CALL_TIMEOUT_MS);
    };

    // Execute read-only tools concurrently, but bounded — a model emitting many
    // read-only calls must not flood outbound requests / provider rate limits.
    const parallelResults = await mapWithConcurrency(
      readOnly,
      MAX_PARALLEL_TOOL_CALLS,
      async (tc) => {
        const result = await executeTool(tc);
        return { tc, ...result };
      },
    );
    results.push(...parallelResults);

    // Execute mutating tools serially.
    for (const tc of mutating) {
      const result = await executeTool(tc);
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
    for (const { tc, content, isError, source, sources, generatedFiles } of results) {
      yield encoder.encode(
        toolStatusEvent(tc.qualifiedName, isError ? 'failed' : 'completed', responseModel),
      );

      if (generatedFiles && generatedFiles.length > 0) {
        yield encoder.encode(generatedFilesEvent(generatedFiles, responseModel));
        for (const file of generatedFiles) {
          yield encoder.encode(
            eventStream.emit({
              type: 'artifact-produced',
              artifactId: file.id,
              name: file.file_name,
              mimeType: file.mime_type,
              uri: file.uri,
              sizeBytes: file.byte_count,
            }),
          );
        }
      }
      yield encoder.encode(
        toolResultEvent(tc.id, tc.qualifiedName, content, isError, responseModel),
      );
      yield encoder.encode(
        eventStream.emit({
          type: 'tool-execution-end',
          toolCallId: tc.id,
          name: tc.qualifiedName,
          output: toAgentEventJson(content),
          isError,
          elapsedMs: Math.max(0, Date.now() - (startedAt.get(tc.id) ?? Date.now())),
        }),
      );

      const canonicalSources = validCanonicalSources([
        ...(source ? [source] : []),
        ...(sources ?? []),
      ]);
      if (canonicalSources.length > 0) {
        const queryValue = isWebSearchTool(tc.qualifiedName)
          ? tc.args['query']
          : isUrlFetchTool(tc.qualifiedName)
            ? tc.args['url']
            : undefined;
        yield encoder.encode(
          eventStream.emit({
            type: 'source-list',
            toolCallId: tc.id,
            ...(typeof queryValue === 'string' ? { query: queryValue } : {}),
            sources: canonicalSources,
          }),
        );
      }

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

  if (!options.invocationContinuation) {
    if (!options.resume) {
      yield encoder.encode(taskStateEvent('queued', 'Task accepted by the agent engine.'));
    }
    yield encoder.encode(
      taskStateEvent(
        'running',
        options.resume ? 'Agent resumed after user input.' : 'Agent started working.',
      ),
    );
    yield encoder.encode(
      eventStream.emit({
        type: 'lifecycle',
        phase: options.resume ? 'resumed' : 'started',
      }),
    );
  }

  try {
    if (await options.isCancellationRequested?.()) {
      yield* flushTerminal('cancelled');
      return;
    }

    // ── Manual-approval resume preamble ──────────────────────────────────────
    // When resuming, the server-owned checkpoint supplies the suspended
    // assistant tool_call turn as the last assistant message in `messages`.
    // Execute only the exact approved calls and append a denial result for the
    // rest, then re-invoke the model with the completed thread. No provider call
    // precedes this — the model already produced the checkpointed tool calls.
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
          eventStream.emit({
            type: 'error',
            message: 'No pending tool call was available to resume.',
            code: 'approval_resume_missing_tool_call',
            retryable: false,
          }),
        );
        yield encoder.encode(
          sseData({
            choices: [
              { delta: { content: '\n\nError: no pending tool call to resume.' }, index: 0 },
            ],
            model: responseModel,
          }),
        );
        yield* flushTerminal('error');
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
            eventStream.emit({
              type: 'error',
              message: 'Approval referenced an unknown tool call.',
              code: 'approval_resume_unknown_tool_call',
              retryable: false,
            }),
          );
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
          yield* flushTerminal('error');
          return;
        }
      }

      // NOTE: the resume endpoint (approve/route.ts) forces extended thinking OFF
      // on the continuation, so a suspended Anthropic thinking turn resumes with
      // thinking disabled — no signed-thinking-block requirement, no provider
      // rejection (see known-flaw MCP-APPROVAL-RESUME for the stateless-resume
      // rationale). The loop therefore needs no Anthropic-specific special case.

      // Defense in depth: skip any pending call that already has a tool result
      // in the server-owned checkpoint.
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
        if (decision) {
          yield encoder.encode(
            eventStream.emit({
              type: 'approval-resolved',
              approvalId: p.id,
              decision: decision === 'approved' ? 'approved' : 'denied',
            }),
          );
        }
        if (decision === 'approved' && isToolOffered(p.qualifiedName, mcpTools, availableTools)) {
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
        if (await options.isCancellationRequested?.()) {
          yield* flushTerminal('cancelled');
          return;
        }
        yield* runAndStreamToolCalls(toRun);
      }
      // Fall through into the loop: the next provider call sees the completed
      // thread (assistant tool_calls + every tool result) and continues.
    }

    let step = Math.max(0, Math.trunc(options.initialCompletedSteps ?? 0));
    while (step < maxSteps) {
      if (await options.isCancellationRequested?.()) {
        yield* flushTerminal('cancelled');
        return;
      }
      if (maxDurationMs !== undefined && now() - startedAt >= maxDurationMs) {
        logger.warn(
          { maxDurationMs, maxSteps, completedSteps: step, provider: processed.provider },
          '[tool-loop] invocation time budget reached without terminal stop',
        );
        if (options.onInvocationCheckpoint) {
          for (const line of await harvestGeneratedFilesEvents()) {
            yield encoder.encode(line);
          }
          await options.onInvocationCheckpoint({
            sessionId,
            turnId,
            nextEventSequence: eventStream.nextSequence(),
            completedSteps: step,
            messages: messages.map((message) => ({ ...message })),
          });
          return;
        }
        yield encoder.encode(
          eventStream.emit({
            type: 'error',
            message:
              "AGI Work reached this invocation's time limit. Continue in the conversation to resume from the visible results.",
            code: 'agent_time_budget_reached',
            retryable: true,
          }),
        );
        yield* flushTerminal('error');
        return;
      }
      step++;

      // Bound accumulated tool-result history before every provider call so a long
      // agentic loop (many large search/file/sandbox results) can't overflow the model
      // context window mid-run. Truncates only old tool-result CONTENT in place — no
      // message is dropped, so every assistant tool_call keeps its matching result.
      const trimmedResults = trimToolResultHistory(messages);
      if (trimmedResults > 0) {
        logger.info(
          { trimmedResults, step, provider: processed.provider },
          '[tool-loop] trimmed old tool-result history to fit the context window',
        );
      }

      // Build the request for this step. Free turns re-fit at every provider
      // boundary so earlier model/tool work cannot spend the same allowance
      // again on a later step.
      const stepRequest = { ...llmRequest, messages };
      if (processed.freeTrial) {
        const fitted = applyFreeTrialProviderBudget({
          reservation: processed.freeTrial,
          provider: processed.provider,
          request: stepRequest,
          observedUsage: {
            promptTokens: observedUsage.inputTokens,
            completionTokens: observedUsage.outputTokens + observedUsage.reasoningTokens,
            totalTokens:
              observedUsage.inputTokens +
              observedUsage.outputTokens +
              observedUsage.reasoningTokens,
            cacheReadInputTokens: observedUsage.cacheReadTokens,
            cacheCreationInputTokens: observedUsage.cacheWriteTokens,
            cacheCreation1hInputTokens: observedUsage.cacheWrite1hTokens,
          },
        });
        if (!fitted.ok) {
          yield encoder.encode(
            eventStream.emit({
              type: 'error',
              message:
                'You have reached the current free usage limit. Upgrade your plan, or switch to Local or BYOK to keep going.',
              code: 'free_trial_token_budget_reached',
              retryable: false,
            }),
          );
          yield* flushTerminal('error');
          return;
        }
      }

      // Paid Managed Cloud admission control: atomically extend the durable
      // reservation before every provider turn. The first operation is covered
      // by the initial request reservation; each later turn re-checks the
      // rolling 5-hour, rolling weekly, flagship-week, and billing-period
      // balance limits and FAILS CLOSED before any provider egress. The stable
      // global `provider:<step>` operation key keeps a workflow replay
      // idempotent, so a restart or reconnect never reserves or charges twice.
      if (processed.managedUsage) {
        try {
          await reserveManagedUsageProviderStep({
            reservation: processed.managedUsage,
            operationKey: `provider:${step}`,
            estimatedCostCents: processed.estimatedCostCents,
            planTier: processed.subscriptionTier ?? '',
            isFlagship: processed.isFlagshipRequest,
          });
        } catch (err) {
          if (err instanceof ManagedUsageRequestError) {
            yield encoder.encode(
              eventStream.emit({
                type: 'error',
                message: err.message,
                code: err.code,
                retryable: err.status === 429 || err.status === 503,
              }),
            );
            yield* flushTerminal('error');
            return;
          }
          throw err;
        }
      }

      // Per-step continuity side-channel: captures the signed thinking blocks
      // (text + Anthropic signature) and the tag-free assistant text from the
      // underlying StreamChunks, which the OpenAI-shaped wire bytes
      // collectProviderStream reads have already stripped/flattened. Fresh per
      // step (like the assembler that fills it). Fixes known-flaw
      // TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01.
      const progressId = `provider-step:${step}`;
      if (showWorkPhases) {
        yield encoder.encode(
          eventStream.emit({
            type: 'progress-update',
            progressId,
            summary: step === 1 ? 'Planning the work' : 'Reviewing results and choosing next steps',
            status: 'running',
          }),
        );
      }
      let providerStep: ToolLoopProviderStepResult;
      try {
        const executeProviderStep = async (): Promise<ToolLoopProviderStepResult> => {
          const stepUsage = createObservedProviderUsage();
          const stepSink: ToolLoopStepSink = {
            thinkingBlocks: [],
            text: '',
            usage: stepUsage,
          };
          const providerStream = await buildToolLoopStream(
            processed.provider,
            processed,
            stepRequest,
            responseModel,
            stepSink,
          );
          const collected = await collectProviderStream(providerStream);
          return {
            ...collected,
            thinkingBlocks: stepSink.thinkingBlocks,
            canonicalText: stepSink.text,
            usage: stepUsage,
          };
        };
        providerStep = options.providerExecutor
          ? await options.providerExecutor({
              operationKey: `provider:${step}`,
              step,
              request: stepRequest,
              execute: executeProviderStep,
            })
          : await executeProviderStep();
        mergeObservedUsage(observedUsage, providerStep.usage);
      } catch (err) {
        if (options.shouldPropagateExecutionError?.(err)) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        const classified = classifyError(err);
        logger.error(
          { provider: processed.provider, step, error: msg },
          '[tool-loop] provider call failed',
        );
        if (showWorkPhases) {
          yield encoder.encode(
            eventStream.emit({
              type: 'progress-update',
              progressId,
              summary: 'Could not complete this step',
              status: 'failed',
            }),
          );
        }
        yield encoder.encode(
          sseData({
            choices: [{ delta: { content: `\n\nError: ${msg}` }, index: 0 }],
            model: responseModel,
          }),
        );
        yield encoder.encode(
          eventStream.emit({
            type: 'error',
            message: classified.message,
            ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
            retryable: classified.retryable,
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
        yield* flushTerminal('error');
        return;
      }

      const { lines, finishReason, pendingToolCalls, textContent, publicTextTail } = providerStep;
      if (showWorkPhases) {
        const hasNextActions = finishReason === 'tool_calls' && pendingToolCalls.length > 0;
        yield encoder.encode(
          eventStream.emit({
            type: 'progress-update',
            progressId,
            summary: hasNextActions
              ? `Selected ${pendingToolCalls.length} next action${pendingToolCalls.length === 1 ? '' : 's'}`
              : 'Prepared the response',
            status: 'completed',
          }),
        );
      }

      // Forward all collected lines to the client.
      for (const entry of lines) {
        yield encoder.encode(entry.line);
        if (entry.publicTextDelta) {
          yield encoder.encode(
            eventStream.emit({ type: 'text-delta', delta: entry.publicTextDelta }),
          );
        }
      }
      if (publicTextTail) {
        yield encoder.encode(eventStream.emit({ type: 'text-delta', delta: publicTextTail }));
      }

      if (await options.isCancellationRequested?.()) {
        yield* flushTerminal('cancelled');
        return;
      }

      // If no tool calls, the model is done: harvest any sandbox-generated
      // files (file cards need durable URLs before the stream closes), then
      // emit [DONE] and exit.
      if (finishReason !== 'tool_calls' || pendingToolCalls.length === 0) {
        yield* flushTerminal(canonicalStopReason(finishReason));
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
      const signedThinking = providerStep.thinkingBlocks.filter((block) => block.signature);
      const assistantMessage: (typeof messages)[number] = {
        role: 'assistant',
        content: signedThinking.length > 0 ? providerStep.canonicalText : textContent,
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
        const approvalChunks: Uint8Array[] = [];
        const approvalEvents: AgentEventEnvelope[] = [];
        for (const tc of pendingToolCalls) {
          approvalChunks.push(
            encoder.encode(
              toolApprovalRequestEvent(tc.id, tc.qualifiedName, tc.args, responseModel),
            ),
          );
          const category = canonicalToolCategory(tc.qualifiedName, mcpTools);
          const emitted = eventStream.emitWithEnvelope({
            type: 'approval-requested',
            approvalId: tc.id,
            toolCallId: tc.id,
            name: tc.qualifiedName,
            category,
            summary: canonicalApprovalSummary(tc.qualifiedName, category),
            input: toAgentEventJson(tc.args),
          });
          approvalEvents.push(emitted.envelope);
          approvalChunks.push(encoder.encode(emitted.sse));
        }
        const previousState = taskState;
        taskState = 'awaiting_input';
        const stateEmitted = eventStream.emitWithEnvelope({
          type: 'task-state-changed',
          taskId,
          state: 'awaiting_input',
          ...(previousState !== undefined ? { previousState } : {}),
          summary: 'The agent needs approval before it can continue.',
        });
        approvalEvents.push(stateEmitted.envelope);
        approvalChunks.push(encoder.encode(stateEmitted.sse));
        const pausedEmitted = eventStream.emitWithEnvelope({ type: 'lifecycle', phase: 'paused' });
        approvalEvents.push(pausedEmitted.envelope);
        approvalChunks.push(encoder.encode(pausedEmitted.sse));

        await options.onApprovalCheckpoint?.({
          sessionId,
          turnId,
          nextEventSequence: eventStream.nextSequence(),
          completedSteps: step,
          events: approvalEvents,
          messages: messages.map((message) => ({ ...message })),
          pendingToolCalls: pendingToolCalls.map((call) => ({
            ...call,
            args: { ...call.args },
          })),
        });

        for (const chunk of approvalChunks) yield chunk;
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
    yield encoder.encode(
      eventStream.emit({
        type: 'error',
        message: `Agent stopped after reaching the ${maxSteps}-step execution limit.`,
        code: 'max_agent_steps_reached',
        retryable: false,
      }),
    );
    yield* flushTerminal('error');
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
        // Pause via the executor's OWN live sandbox handle — NOT pauseE2BSession's
        // Redis re-lookup, which fail-opens (a stale/absent mapping would leave this
        // sandbox billing until its timeout). Fall back to the lookup only if the
        // executor predates the pause() method.
        if (e2bExecutor.pause) {
          await e2bExecutor.pause();
        } else {
          await pauseE2BSession(e2bSessionScope);
        }
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
