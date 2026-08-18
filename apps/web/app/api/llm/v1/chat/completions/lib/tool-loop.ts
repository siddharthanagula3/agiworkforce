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
import type { InteractiveCard, ThinkingBlock } from '@agiworkforce/types';
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
import {
  type AgiWorkPlanStep,
  advanceAgiWorkPlan,
  agiWorkGoalProgressEvent,
  agiWorkPlanEvent,
  agiWorkPlanProgressEvents,
  agiWorkPlanningDirective,
  buildAgiWorkPlan,
  parseAgiWorkPlanSteps,
} from './agiwork-plan';
import {
  collectGeneratedFileRefs,
  persistGeneratedFiles,
  type GeneratedFileRef,
} from '@/lib/server/container-files';
import {
  executeUrlFetch,
  isUrlFetchTool,
  URL_FETCH_MAX_CALLS_PER_AGI_WORK_TURN,
  URL_FETCH_MAX_CALLS_PER_TURN,
  urlFetchBudgetExhaustedMessage,
} from '@/lib/url-fetch/url-fetch-tool';
import {
  isWebSearchTool,
  executeWebSearch,
  formatWebSearchResultForModel,
  webSearchBudgetExhaustedMessage,
  WEB_SEARCH_FREE_MAX_RESULTS,
  WEB_SEARCH_MAX_CALLS_PER_AGI_WORK_TURN,
  WEB_SEARCH_MAX_CALLS_PER_TURN,
  WEB_SEARCH_MAX_RESULTS,
  webSearchResultsToFetchedSources,
} from '@/lib/web-search/web-search-tool';
import type { ProcessedRequest } from './request-processor';
import {
  calculateObservedProviderUsageCostDollars,
  createObservedProviderUsage,
  mergeObservedProviderUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import {
  createAgentEventStreamEmitter,
  createPublicTextDeltaProjector,
  toAgentEventJson,
} from './agent-event-stream';
import { SKILL_TOOL_NAME } from '@agiworkforce/skills';
import {
  isParallelSafeTool,
  isSensitiveSourceTool,
  toolAcceptsUntrustedContent,
  toolCreatesEgressPath,
} from './tool-metadata';
import {
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  type ConnectorToolPermissions,
} from './connector-tool-permissions';
import { policyAutoApprovesTool } from './tool-approval-policy';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
import {
  executeManagedSkillTool,
  executeManagedSkillToolForPlugins,
} from '@/lib/services/skill-catalog-service';
import { listEnabledPluginIdsForUser } from '@/lib/services/plugin-installation-service';
import { functionToolName } from './tool-loop-routing';
import {
  generateManagedOfficeFile,
  isManagedOfficeFileTool,
  MANAGED_OFFICE_FILE_TOOL_NAME,
} from '@/lib/services/managed-office-file-service';
import { executeMapSearchTool, isMapSearchTool } from '@/lib/services/map-search-tool-service';
import { applyFreeTrialProviderBudget } from '@/lib/services/free-trial-service';
import {
  reserveManagedUsageProviderStep,
  ManagedUsageRequestError,
} from '@/lib/services/managed-usage-request-service';
import {
  CHAT_TOOL_LOOP_BUDGET_MS,
  PROVIDER_STREAM_DEADLINE_MS,
  TOOL_CALL_DEADLINE_MS,
  nestedDeadlineMs,
} from '@/lib/deadline-policy';

const DEFAULT_CHAT_MAX_STEPS = 10;
const DEFAULT_AGI_WORK_MAX_STEPS = 100;
// teardown; it is a safety boundary, not restart-safe background execution.

const MAX_TOOL_ARGS_JSON_CHARS = 256 * 1024;
const MAX_TOOL_CALLS_PER_STEP = 32;

const MAX_PARALLEL_TOOL_CALLS = 4;

const MAX_TOOL_RESULT_HISTORY_CHARS = 200_000;
const KEEP_RECENT_TOOL_RESULTS = 6;
const TRUNCATED_TOOL_RESULT_MARKER =
  '[earlier tool result omitted to keep the conversation within the model context window]';

/**
 * AUDIT-FIX SYS-25: read-only classification now comes from the declared tool
 * metadata model (tool-metadata.ts), not from a name-prefix list.
 *
 * The old list matched names NO REAL TOOL ON THIS ROUTE HAS. Platform tools are
 * `web_search` / `url_fetch` / `execute_code` / `write_file` / `create_folder` /
 * `create_office_file` / `skill`; every MCP and connector tool is qualified as
 * `mcp__<server>__<tool>`. Neither shape starts with `read_file`, `get`,
 * `list`, `search`, … so `isReadOnlyTool` returned false for EVERYTHING:
 * `MAX_PARALLEL_TOOL_CALLS` and `mapWithConcurrency` were dead code and every
 * tool call serialised behind the 120 s per-call cap.
 *
 * Driving it from metadata makes the parallel branch live for the tools that
 * are genuinely observation-only (search, page fetch, skill lookup, PR-diff
 * read) while keeping the "mutating tools serialize" guarantee intact: an
 * UNDECLARED tool is classified as an irreversible write and therefore runs
 * serially — strictly more conservative than the old prefix guess, which
 * happily parallelised any remote MCP tool named `get_and_archive`.
 *
 * Exported for unit tests (parallel-safety-critical).
 */
export function isReadOnlyTool(toolName: string): boolean {
  return isParallelSafeTool(toolName);
}

export type ApprovalMode = 'auto' | 'manual';

export type ConnectorToolExecutor = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<{ handled: boolean; content: string; isError: boolean }>;

export interface ToolApprovalDecision {
  toolCallId: string;
  decision: 'approved' | 'rejected';
}

export interface ResumeApproval {
  approvals: ToolApprovalDecision[];
  guidance?: string;
}

export interface ToolLoopApprovalCheckpoint {
  sessionId: string;
  turnId: string;
  nextEventSequence: number;
  completedSteps: number;
  events: AgentEventEnvelope[];
  messages: ProcessedRequest['llmRequest']['messages'];
  pendingToolCalls: Array<{
    id: string;
    qualifiedName: string;
    args: Record<string, unknown>;
  }>;
}

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
  generatedFileRefs: GeneratedFileRef[];
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
  interactiveCard?: InteractiveCard;
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
  maxSteps?: number;
  /** Optional wall-clock safety budget for this invocation. Defaults by work mode. */
  maxDurationMs?: number;
  now?: () => number;
  approvalMode?: ApprovalMode;
  mcpTools?: WebMcpToolDef[];
  resume?: ResumeApproval;
  eventSessionId?: string;
  eventTurnId?: string;
  initialEventSequence?: number;
  onApprovalCheckpoint?: (checkpoint: ToolLoopApprovalCheckpoint) => Promise<void>;
  onInvocationCheckpoint?: (checkpoint: ToolLoopInvocationCheckpoint) => Promise<void>;
  initialCompletedSteps?: number;
  invocationContinuation?: boolean;
  providerExecutor?: ToolLoopProviderExecutor;
  toolExecutor?: ToolLoopToolExecutor;
  shouldPropagateExecutionError?: (error: unknown) => boolean;
  userId?: string;
  connectorExecutor?: ConnectorToolExecutor;
  usage?: ObservedProviderUsage;
  isCancellationRequested?: () => Promise<boolean>;
  signal?: AbortSignal;
  connectorPermissions?: ConnectorToolPermissions;
  toolApprovalPolicy?: ToolApprovalPolicy;
  failover?: ToolLoopFailoverPlan;
}

export interface ToolLoopFailoverPlan {
  next: (error: unknown) => { provider: string; processed: ProcessedRequest } | null;
}

export interface ToolLoopPolicy {
  maxSteps: number;
  maxDurationMs: number | undefined;
}

export function resolveToolLoopPolicy(
  processed: ProcessedRequest,
  options: Pick<ToolLoopOptions, 'maxSteps' | 'maxDurationMs'>,
): ToolLoopPolicy {
  const isAgiWork = processed.chatRequest?.work_mode === 'agiwork';
  return {
    maxSteps: options.maxSteps ?? (isAgiWork ? DEFAULT_AGI_WORK_MAX_STEPS : DEFAULT_CHAT_MAX_STEPS),
    maxDurationMs: options.maxDurationMs ?? CHAT_TOOL_LOOP_BUDGET_MS,
  };
}

export interface PendingToolCall {
  id: string;
  qualifiedName: string;
  args: Record<string, unknown>;
}

export type CloudAgentToolRetrySafety = 'safe' | 'unsafe';

export function resolveToolRetrySafety(toolName: string): CloudAgentToolRetrySafety {
  return isUrlFetchTool(toolName) || isMapSearchTool(toolName) || toolName === SKILL_TOOL_NAME
    ? 'safe'
    : 'unsafe';
}

function isForcedSkillToolChoice(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const choice = value as Record<string, unknown>;
  const fn = choice['function'];
  return (
    choice['type'] === 'function' &&
    Boolean(fn) &&
    typeof fn === 'object' &&
    !Array.isArray(fn) &&
    (fn as Record<string, unknown>)['name'] === SKILL_TOOL_NAME
  );
}

type SseLine = string;

function sseData(payload: unknown): SseLine {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseDone(): SseLine {
  return `data: [DONE]\n\n`;
}

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
  [/\bsearch_maps\b/i, 'Preparing map'],
];

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
  if (isMapSearchTool(toolName)) return 'web-search';
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

/**
 * Exported for unit tests. Builds the user-facing activity-feed summary line.
 * `serverLabel` (the connector's display name) overrides the serverId-derived
 * label, so a custom connector reads "Using <name> connector" instead of the
 * generic phrasing its opaque `custom-<hex>` id would otherwise force.
 */
export function canonicalToolSummary(
  toolName: string,
  category: AgentEventToolCategory,
  args?: Record<string, unknown>,
  serverLabel?: string,
): string {
  const phrase =
    (isUrlFetchTool(toolName) ? urlFetchDomainPhrase(args) : undefined) ??
    toolStatusPhrase(toolName);
  if (phrase) return phrase;

  const server = serverLabel ?? mcpServerLabel(toolName);
  if (category === 'connector') return server ? `Using ${server} connector` : 'Using connector';
  if (category === 'mcp') return `Using ${server ?? 'MCP'} tool`;
  return `Running ${humanizeIdentifier(toolName)}`;
}

function canonicalApprovalSummary(
  toolName: string,
  category: AgentEventToolCategory,
  serverLabel?: string,
): string {
  const server = serverLabel ?? mcpServerLabel(toolName);
  if (category === 'connector') return `Review ${server ?? 'connector'} action`;
  if (category === 'mcp') return `Review ${server ?? 'MCP'} action`;
  return `Review ${humanizeIdentifier(toolName)} action`;
}

function offeredServerLabel(toolName: string, offeredTools: WebMcpToolDef[]): string | undefined {
  return offeredTools.find((t) => t.qualifiedName === toolName)?.serverLabel;
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

function interactiveCardEvent(card: InteractiveCard, responseModel: string): SseLine {
  return sseData({
    choices: [{ delta: { x_interactive_card: { card } }, index: 0 }],
    model: responseModel,
  });
}

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

export const TOOL_LOOP_STREAM_LIMITS = {
  maxToolArgsJsonChars: MAX_TOOL_ARGS_JSON_CHARS,
  maxToolCallsPerStep: MAX_TOOL_CALLS_PER_STEP,
  toolCallTimeoutMs: TOOL_CALL_DEADLINE_MS,
  maxParallelToolCalls: MAX_PARALLEL_TOOL_CALLS,
  maxToolResultHistoryChars: MAX_TOOL_RESULT_HISTORY_CHARS,
  keepRecentToolResults: KEEP_RECENT_TOOL_RESULTS,
} as const;

/**
 * Bound a tool-call promise: resolve to an error result if it exceeds
 * `timeoutMs` (a hung tool can't wedge the turn) or if it rejects (one tool
 * can't crash the whole batch). Never rejects. Exported for unit tests.
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

export class ProviderStreamDeadlineError extends Error {
  readonly deadlineMs: number;

  constructor(deadlineMs: number) {
    super(
      `The model stream ran past this turn's remaining time budget ` +
        `(${Math.round(deadlineMs / 1000)}s) and was stopped.`,
    );
    this.name = 'ProviderStreamDeadlineError';
    this.deadlineMs = deadlineMs;
  }
}

/**
 * Bound one provider stream to `deadlineMs` of wall clock, and abort the
 * upstream request when it expires.
 *
 * Two things happen on expiry and BOTH are load-bearing. The returned promise
 * rejects, so the loop stops waiting and reaches its teardown; and the signal
 * handed to the adapter is aborted, so the upstream HTTP request is torn down
 * instead of streaming (and billing) into a reader nobody is draining.
 *
 * `parentSignal` (the client's, when there is one) is forwarded onto the same
 * derived controller, so a client disconnect still aborts the adapter exactly
 * as it did when `options.signal` was passed straight through.
 *
 * Exported for `tool-loop.deadline.test.ts`, which drives the three paths a
 * full-loop test cannot observe from the SSE bytes: the derived signal is
 * aborted on expiry, a client cancel is forwarded onto it (including one that
 * arrived before dispatch), and the deadline timer is cleared when the stream
 * finishes in time rather than left pending for the rest of the budget.
 */
export function withProviderStreamDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const forwardParentAbort = (): void => controller.abort(parentSignal?.reason);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    parentSignal?.removeEventListener('abort', forwardParentAbort);
  };
  if (parentSignal?.aborted) forwardParentAbort();
  else parentSignal?.addEventListener('abort', forwardParentAbort, { once: true });

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      const expired = new ProviderStreamDeadlineError(deadlineMs);
      controller.abort(expired);
      cleanup();
      reject(expired);
    }, deadlineMs);
    run(controller.signal).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (err: unknown) => {
        cleanup();
        reject(err);
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
  generatedFileRefs: GeneratedFileRef[];
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const lines: Array<{ line: SseLine; publicTextDelta?: string }> = [];
  const publicTextProjector = createPublicTextDeltaProjector();
  let buffer = '';
  let finishReason: string | null = null;
  let textContent = '';
  const generatedFileRefs = new Map<string, GeneratedFileRef>();

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
        continue;
      }

      try {
        const event = JSON.parse(jsonStr);
        collectGeneratedFileRefs(event, generatedFileRefs);
        let publicTextDelta: string | undefined;

        const textDelta = event?.choices?.[0]?.delta?.content;
        if (typeof textDelta === 'string') {
          textContent += textDelta;
          publicTextDelta = publicTextProjector.push(textDelta) || undefined;
        }

        lines.push({ line: raw + '\n', publicTextDelta });

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

        const fr = event?.choices?.[0]?.finish_reason;
        if (typeof fr === 'string' && fr) {
          finishReason = fr;
        }
      } catch {
        lines.push({ line: raw + '\n' });
      }
    }
  }

  if (buffer.trim()) {
    lines.push({ line: buffer });
  }

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
    generatedFileRefs: [...generatedFileRefs.values()],
  };
}

async function runMcpTool(
  toolCall: PendingToolCall,
  e2bExecutor: () => Promise<E2BExecutor | null>,
  availableTools: ReadonlySet<string>,
  connectorExecutor?: ConnectorToolExecutor,
  executionContext?: {
    userId?: string;
    organizationId: string | null;
    model: string;
    webSearchMaxResults?: number;
    signal?: AbortSignal;
  },
): Promise<ToolLoopToolResult> {
  if (toolCall.qualifiedName === SKILL_TOOL_NAME) {
    if (!availableTools.has(SKILL_TOOL_NAME)) {
      return { content: `Unknown tool: ${SKILL_TOOL_NAME}`, isError: true };
    }
    const result = executionContext?.userId
      ? await executeManagedSkillToolForPlugins(
          await listEnabledPluginIdsForUser(executionContext.userId),
          toolCall.args,
          { availableTools },
        )
      : await executeManagedSkillTool(toolCall.args, { availableTools });
    return { content: result.content, isError: result.isError };
  }

  if (isManagedOfficeFileTool(toolCall.qualifiedName)) {
    if (!availableTools.has(MANAGED_OFFICE_FILE_TOOL_NAME)) {
      return { content: `Unknown tool: ${MANAGED_OFFICE_FILE_TOOL_NAME}`, isError: true };
    }
    if (!executionContext?.userId) {
      return { content: 'An authenticated file owner is required.', isError: true };
    }
    const generated = await generateManagedOfficeFile(toolCall.args);
    if (!generated.ok) {
      return { content: generated.message, isError: true };
    }
    const persisted = await persistGeneratedFileBytes({
      userId: executionContext.userId,
      organizationId: executionContext.organizationId,
      data: generated.data,
      mimeType: generated.mimeType,
      filename: generated.filename,
      provider: 'agi-managed-office',
      origin: 'managed-office-tool',
      model: executionContext.model,
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

  if (isMapSearchTool(toolCall.qualifiedName)) {
    if (!availableTools.has(toolCall.qualifiedName)) {
      return { content: `Unknown tool: ${toolCall.qualifiedName}`, isError: true };
    }
    const outcome = await executeMapSearchTool(toolCall.args, { toolCallId: toolCall.id });
    return outcome.ok
      ? { content: outcome.content, isError: false, interactiveCard: outcome.card }
      : { content: outcome.content, isError: true };
  }

  if (isUrlFetchTool(toolCall.qualifiedName)) {
    const outcome = await executeUrlFetch(
      toolCall.args,
      executionContext?.signal ? { signal: executionContext.signal } : {},
    );
    if (!outcome.ok) {
      return { content: `Fetch failed (${outcome.errorCode}): ${outcome.error}`, isError: true };
    }
    return {
      content: `Fetched ${outcome.url} — ${outcome.title}\n\n${outcome.content}`,
      isError: false,
      source: { url: outcome.url, title: outcome.title },
    };
  }

  if (isWebSearchTool(toolCall.qualifiedName)) {
    const outcome = await executeWebSearch(toolCall.args, {
      maxResults: executionContext?.webSearchMaxResults,
      ...(executionContext?.signal ? { signal: executionContext.signal } : {}),
    });
    return {
      content: formatWebSearchResultForModel(outcome),
      isError: !outcome.ok,
      sources: webSearchResultsToFetchedSources(outcome),
    };
  }

  if (isExecutionTool(toolCall.qualifiedName)) {
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

  if (connectorExecutor) {
    try {
      const connectorResult = await connectorExecutor(
        parsed.serverId,
        parsed.toolName,
        toolCall.args,
        executionContext?.signal ? { signal: executionContext.signal } : undefined,
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
    const result = executionContext?.signal
      ? await executeWebMcpTool(parsed.serverId, parsed.toolName, toolCall.args, {
          signal: executionContext.signal,
        })
      : await executeWebMcpTool(parsed.serverId, parsed.toolName, toolCall.args);
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
    return { content: capOutput(text || '(no output)'), isError: result.isError === true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: capOutput(`Tool error: ${msg}`), isError: true };
  }
}

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

export function isToolOffered(
  qualifiedName: string,
  mcpTools: WebMcpToolDef[],
  availableTools: ReadonlySet<string>,
): boolean {
  if (qualifiedName === SKILL_TOOL_NAME) return availableTools.has(SKILL_TOOL_NAME);
  if (isManagedOfficeFileTool(qualifiedName)) {
    return availableTools.has(MANAGED_OFFICE_FILE_TOOL_NAME);
  }
  if (
    isExecutionTool(qualifiedName) ||
    isUrlFetchTool(qualifiedName) ||
    isWebSearchTool(qualifiedName) ||
    isMapSearchTool(qualifiedName)
  ) {
    return availableTools.has(qualifiedName);
  }
  return mcpTools.some((t) => t.qualifiedName === qualifiedName);
}

const TOOL_DENIED_MESSAGE = 'The user denied permission to run this tool.';

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
  const agiWorkGoal = showWorkPhases ? processed.chatRequest?.agi_work_goal : undefined;
  let agiWorkPlan: AgiWorkPlanStep[] = [];
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
    stream: true,
  };
  let mapSearchBatchCompleted = false;
  const observedUsage = options.usage ?? createObservedProviderUsage();

  const messages: ProcessedRequest['llmRequest']['messages'] = [...llmRequest.messages];

  const connectorPermissions = options.connectorPermissions ?? EMPTY_CONNECTOR_TOOL_PERMISSIONS;
  const toolApprovalPolicy = options.toolApprovalPolicy ?? DEFAULT_TOOL_APPROVAL_POLICY;

  const sensitiveSourceAvailable =
    mcpTools.some((def) => isSensitiveSourceTool(def)) ||
    [...availableTools].some((name) => isSensitiveSourceTool({ qualifiedName: name }));
  let untrustedContentInContext = messages.some(
    (message) =>
      Array.isArray(message.tool_calls) &&
      parseAssistantToolCalls(message.tool_calls).some((call) =>
        toolAcceptsUntrustedContent(call.qualifiedName),
      ),
  );

  type ToolCallGate = {
    verdict: 'allow' | 'ask' | 'deny';
    reason:
      | 'blocked_by_user_permission'
      | 'always_allow'
      | 'user_requires_approval'
      | 'manual_approval_mode'
      | 'auto_approval_mode'
      | 'account_default_read_only'
      | 'lethal_trifecta';
  };

  function resolveToolCallGate(toolCall: PendingToolCall): ToolCallGate {
    const saved = connectorPermissions.levelFor(toolCall.qualifiedName);
    if (saved === 'deny') return { verdict: 'deny', reason: 'blocked_by_user_permission' };

    const trifecta =
      untrustedContentInContext &&
      sensitiveSourceAvailable &&
      toolCreatesEgressPath(toolCall.qualifiedName);

    if (saved === 'allow') {
      return trifecta
        ? { verdict: 'ask', reason: 'lethal_trifecta' }
        : { verdict: 'allow', reason: 'always_allow' };
    }
    if (saved === 'ask') return { verdict: 'ask', reason: 'user_requires_approval' };
    if (approvalMode === 'manual') {
      return !trifecta && policyAutoApprovesTool(toolApprovalPolicy, toolCall.qualifiedName)
        ? { verdict: 'allow', reason: 'account_default_read_only' }
        : { verdict: 'ask', reason: 'manual_approval_mode' };
    }
    return trifecta
      ? { verdict: 'ask', reason: 'lethal_trifecta' }
      : { verdict: 'allow', reason: 'auto_approval_mode' };
  }

  function blockedToolResultMessage(qualifiedName: string): string {
    return (
      `Tool "${qualifiedName}" is blocked by this account's connector permissions and was not ` +
      'executed. Do not retry it; continue without it or tell the user it is blocked.'
    );
  }

  async function shouldStopForCancellation(): Promise<boolean> {
    if (options.signal?.aborted) return true;
    return (await options.isCancellationRequested?.()) === true;
  }

  let servingProcessed: ProcessedRequest = processed;

  async function runProviderStepWithFailover(
    step: number,
    stepRequest: ProcessedRequest['llmRequest'],
  ): Promise<ToolLoopProviderStepResult> {
    for (;;) {
      const attemptProcessed = servingProcessed;
      const attemptRequest: ProcessedRequest['llmRequest'] = {
        ...stepRequest,
        model: attemptProcessed.llmRequest.model,
        effort: attemptProcessed.llmRequest.effort,
        thinking: attemptProcessed.llmRequest.thinking,
      };
      const executeProviderStep = async (): Promise<ToolLoopProviderStepResult> => {
        const stepUsage = createObservedProviderUsage();
        const stepSink: ToolLoopStepSink = {
          thinkingBlocks: [],
          text: '',
          usage: stepUsage,
        };
        const collected = await withProviderStreamDeadline(
          async (signal) => {
            const providerStream = await buildToolLoopStream(
              attemptProcessed.provider,
              attemptProcessed,
              attemptRequest,
              responseModel,
              stepSink,
              signal,
            );
            return collectProviderStream(providerStream);
          },
          nestedDeadlineMs(PROVIDER_STREAM_DEADLINE_MS, maxDurationMs, now() - startedAt),
          options.signal,
        );
        return {
          ...collected,
          thinkingBlocks: stepSink.thinkingBlocks,
          canonicalText: stepSink.text,
          usage: stepUsage,
        };
      };
      try {
        return options.providerExecutor
          ? await options.providerExecutor({
              operationKey: `provider:${step}`,
              step,
              request: attemptRequest,
              execute: executeProviderStep,
            })
          : await executeProviderStep();
      } catch (err) {
        if (options.shouldPropagateExecutionError?.(err)) throw err;
        if (err instanceof ProviderStreamDeadlineError) throw err;
        const nextAttempt = options.failover?.next(err);
        if (!nextAttempt) throw err;
        servingProcessed = nextAttempt.processed;
      }
    }
  }

  const fetchedSources: FetchedSource[] = [];
  const searchedSources: FetchedSource[] = [];
  const agiWorkTurn = processed.chatRequest?.work_mode === 'agiwork';
  let webSearchCallsUsed = 0;
  const webSearchCallBudget = agiWorkTurn
    ? WEB_SEARCH_MAX_CALLS_PER_AGI_WORK_TURN
    : WEB_SEARCH_MAX_CALLS_PER_TURN;
  let urlFetchCallsUsed = 0;
  const urlFetchCallBudget = agiWorkTurn
    ? URL_FETCH_MAX_CALLS_PER_AGI_WORK_TURN
    : URL_FETCH_MAX_CALLS_PER_TURN;
  const turnSourceBudget = webSearchCallBudget * WEB_SEARCH_MAX_RESULTS + urlFetchCallBudget;
  const providerGeneratedFileRefs = new Map<string, GeneratedFileRef>();

  const conversationId = processed.conversationId;
  const e2bSessionScope =
    conversationId && options.userId
      ? managedCloudE2BSessionScope(options.userId, conversationId)
      : undefined;
  let e2bExecutor: E2BExecutor | null = null;
  let e2bExecutorResolved = false;
  let e2bBaseline: SandboxSnapshot | null = null;
  let executionToolRan = false;
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

  async function harvestGeneratedFilesEvents(): Promise<SseLine[]> {
    if (!options.userId) return [];
    const lines: SseLine[] = [];
    const files: GeneratedFileWire[] = [];
    let failedCount = 0;

    if (providerGeneratedFileRefs.size > 0) {
      try {
        const persisted = await persistGeneratedFiles({
          userId: options.userId,
          organizationId: processed.organizationId ?? null,
          refs: [...providerGeneratedFileRefs.values()],
          model: responseModel,
        });
        files.push(...persisted.files.map((file) => file.wire));
        failedCount += persisted.failedCount;
      } catch (err) {
        logger.warn({ err }, '[tool-loop] provider generated-file persist failed');
        failedCount += providerGeneratedFileRefs.size;
      }
    }

    if (executionToolRan && e2bExecutor && e2bBaseline) {
      try {
        const harvest = await harvestGeneratedFiles({
          executor: e2bExecutor,
          baseline: e2bBaseline,
          userId: options.userId,
          organizationId: processed.organizationId ?? null,
          model: responseModel,
          ...(conversationId ? { conversationId } : {}),
        });
        files.push(...harvest.files);
        failedCount += harvest.failedCount;
      } catch (err) {
        logger.warn({ err }, '[tool-loop] generated-file harvest failed; no file card emitted');
        failedCount += 1;
      }
    }

    for (const [index, png] of turnPngResults.entries()) {
      try {
        const outcome = await persistGeneratedFileBytes({
          userId: options.userId,
          organizationId: processed.organizationId ?? null,
          data: Buffer.from(png, 'base64'),
          mimeType: 'image/png',
          filename: turnPngResults.length === 1 ? 'chart.png' : `chart-${index + 1}.png`,
          provider: 'e2b',
          origin: 'e2b-execution-result',
          model: responseModel,
          ...(conversationId ? { conversationId } : {}),
        });
        if (outcome.ok) {
          files.push(outcome.file);
        } else {
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

  async function* flushTerminal(
    reason: AgentEventStopReason = 'end-turn',
  ): AsyncGenerator<Uint8Array> {
    for (const line of await harvestGeneratedFilesEvents()) {
      yield encoder.encode(line);
    }
    if (agiWorkPlan.length > 0 && reason !== 'tool-use') {
      const transition =
        reason === 'cancelled'
          ? 'cancel'
          : reason === 'error' || reason === 'refusal'
            ? 'fail'
            : 'complete';
      agiWorkPlan = advanceAgiWorkPlan(agiWorkPlan, transition);
      yield encoder.encode(agiWorkPlanEvent(agiWorkPlan, responseModel));
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

  async function* runAndStreamToolCalls(calls: PendingToolCall[]): AsyncGenerator<Uint8Array> {
    const readOnly = calls.filter((tc) => isReadOnlyTool(tc.qualifiedName));
    const mutating = calls.filter((tc) => !isReadOnlyTool(tc.qualifiedName));

    const toolStartedAt = new Map<string, number>();
    for (const tc of calls) {
      yield encoder.encode(toolStatusEvent(tc.qualifiedName, 'running', responseModel, tc.args));
      const category = canonicalToolCategory(tc.qualifiedName, mcpTools);
      toolStartedAt.set(tc.id, Date.now());
      yield encoder.encode(
        eventStream.emit({
          type: 'tool-execution-start',
          toolCallId: tc.id,
          name: tc.qualifiedName,
          category,
          summary: canonicalToolSummary(
            tc.qualifiedName,
            category,
            tc.args,
            offeredServerLabel(tc.qualifiedName, mcpTools),
          ),
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
      interactiveCard?: InteractiveCard;
    }[] = [];

    const executeTool = (tc: PendingToolCall): Promise<ToolLoopToolResult> => {
      if (isWebSearchTool(tc.qualifiedName)) {
        webSearchCallsUsed += 1;
        if (webSearchCallsUsed > webSearchCallBudget) {
          return Promise.resolve({
            content: webSearchBudgetExhaustedMessage(webSearchCallBudget),
            isError: false,
          });
        }
      }
      if (isUrlFetchTool(tc.qualifiedName)) {
        urlFetchCallsUsed += 1;
        if (urlFetchCallsUsed > urlFetchCallBudget) {
          return Promise.resolve({
            content: urlFetchBudgetExhaustedMessage(urlFetchCallBudget),
            isError: false,
          });
        }
      }
      const execute = () =>
        runMcpTool(tc, resolveE2BExecutor, availableTools, options.connectorExecutor, {
          userId: options.userId,
          organizationId: processed.organizationId ?? null,
          model: responseModel,
          webSearchMaxResults: processed.freeTrial ? WEB_SEARCH_FREE_MAX_RESULTS : undefined,
          ...(options.signal ? { signal: options.signal } : {}),
        });
      const run = options.toolExecutor
        ? options.toolExecutor({
            operationKey: `tool:${tc.id}`,
            retrySafety: resolveToolRetrySafety(tc.qualifiedName),
            toolCall: tc,
            execute,
          })
        : execute();
      return withToolTimeout(
        run,
        tc.qualifiedName,
        nestedDeadlineMs(TOOL_CALL_DEADLINE_MS, maxDurationMs, now() - startedAt),
      );
    };

    const parallelResults = await mapWithConcurrency(
      readOnly,
      MAX_PARALLEL_TOOL_CALLS,
      async (tc) => {
        const result = await executeTool(tc);
        return { tc, ...result };
      },
    );
    results.push(...parallelResults);

    for (const tc of mutating) {
      const result = await executeTool(tc);
      results.push({ tc, ...result });
    }

    for (const r of results) {
      if (r.pngResults && r.pngResults.length > 0) turnPngResults.push(...r.pngResults);
    }

    let sourcesAdded = false;
    let searchSourcesAdded = false;
    for (const {
      tc,
      content,
      isError,
      source,
      sources,
      generatedFiles,
      interactiveCard,
    } of results) {
      if (!isError && toolAcceptsUntrustedContent(tc.qualifiedName)) {
        untrustedContentInContext = true;
      }
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
      if (interactiveCard) {
        yield encoder.encode(interactiveCardEvent(interactiveCard, responseModel));
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
          elapsedMs: Math.max(0, Date.now() - (toolStartedAt.get(tc.id) ?? Date.now())),
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

      const turnSourceCount = () => fetchedSources.length + searchedSources.length;

      if (
        source &&
        turnSourceCount() < turnSourceBudget &&
        !fetchedSources.some((s) => s.url === source.url)
      ) {
        fetchedSources.push(source);
        sourcesAdded = true;
      }

      for (const s of sources ?? []) {
        if (turnSourceCount() >= turnSourceBudget) break;
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
      if (!isError && interactiveCard && isMapSearchTool(tc.qualifiedName)) {
        mapSearchBatchCompleted = true;
      }
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
    if (await shouldStopForCancellation()) {
      yield* flushTerminal('cancelled');
      return;
    }

    if (showWorkPhases && agiWorkGoal && !options.resume && !options.invocationContinuation) {
      yield encoder.encode(eventStream.emit(agiWorkGoalProgressEvent(agiWorkGoal)));

      try {
        const planTurn = await runProviderStepWithFailover(0, {
          ...llmRequest,
          messages: [...messages, { role: 'user', content: agiWorkPlanningDirective(agiWorkGoal) }],
          tools: undefined,
          tool_choice: undefined,
          stream: true,
        });
        mergeObservedProviderUsage(observedUsage, planTurn.usage);
        if (await shouldStopForCancellation()) {
          yield* flushTerminal('cancelled');
          return;
        }
        const planText = planTurn.canonicalText || planTurn.textContent || '';
        agiWorkPlan = buildAgiWorkPlan(parseAgiWorkPlanSteps(planText));
        if (agiWorkPlan.length > 0) {
          agiWorkPlan = advanceAgiWorkPlan(agiWorkPlan, 'start');
          yield encoder.encode(agiWorkPlanEvent(agiWorkPlan, responseModel));
          for (const planEvent of agiWorkPlanProgressEvents(agiWorkPlan)) {
            yield encoder.encode(eventStream.emit(planEvent));
          }
        } else {
          logger.warn(
            { provider: processed.provider, requestId: processed.requestId },
            '[tool-loop] AGI Work planning turn produced no parseable steps',
          );
        }
      } catch (err) {
        logger.error(
          {
            provider: processed.provider,
            error: err instanceof Error ? err.message : String(err),
          },
          '[tool-loop] AGI Work planning turn failed; continuing without a plan',
        );
      }
    }

    if (options.resume) {
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
        if (decision === 'approved' && connectorPermissions.isDenied(p.qualifiedName)) {
          logger.warn(
            { tool: p.qualifiedName, requestId: processed.requestId },
            '[tool-loop] approval rejected: tool is blocked by the user permission store',
          );
          const content = blockedToolResultMessage(p.qualifiedName);
          yield encoder.encode(
            toolResultEvent(p.id, p.qualifiedName, content, true, responseModel),
          );
          messages.push({ role: 'tool', content, tool_call_id: p.id });
        } else if (
          decision === 'approved' &&
          isToolOffered(p.qualifiedName, mcpTools, availableTools)
        ) {
          toRun.push(p);
        } else if (decision === 'approved') {
          const content = `Tool "${p.qualifiedName}" is not available and was not executed.`;
          yield encoder.encode(
            toolResultEvent(p.id, p.qualifiedName, content, true, responseModel),
          );
          messages.push({ role: 'tool', content, tool_call_id: p.id });
        } else {
          yield encoder.encode(
            toolResultEvent(p.id, p.qualifiedName, TOOL_DENIED_MESSAGE, false, responseModel),
          );
          messages.push({ role: 'tool', content: TOOL_DENIED_MESSAGE, tool_call_id: p.id });
        }
      }

      if (toRun.length > 0) {
        if (await shouldStopForCancellation()) {
          yield* flushTerminal('cancelled');
          return;
        }
        yield* runAndStreamToolCalls(toRun);
      }

      // The guidance turn must land after every tool result: providers reject a
      // thread where a user message separates assistant tool_calls from them.
      const resumeGuidance = options.resume.guidance?.trim();
      if (resumeGuidance) {
        messages.push({ role: 'user', content: resumeGuidance });
        yield encoder.encode(
          eventStream.emit({
            type: 'progress-update',
            progressId: `approval-guidance:${options.initialEventSequence ?? 0}`,
            summary: 'Applied your guidance',
            detail: resumeGuidance,
            status: 'completed',
          }),
        );
      }
      // Fall through into the loop: the next provider call sees the completed
      // thread (assistant tool_calls + every tool result) and continues.
    }

    let step = Math.max(0, Math.trunc(options.initialCompletedSteps ?? 0));
    while (step < maxSteps) {
      if (await shouldStopForCancellation()) {
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

      const trimmedResults = trimToolResultHistory(messages);
      if (trimmedResults > 0) {
        logger.info(
          { trimmedResults, step, provider: processed.provider },
          '[tool-loop] trimmed old tool-result history to fit the context window',
        );
      }

      const stepTools = mapSearchBatchCompleted
        ? llmRequest.tools?.filter((tool) => !isMapSearchTool(functionToolName(tool)))
        : llmRequest.tools;
      const stepRequest = {
        ...llmRequest,
        messages,
        ...(stepTools && stepTools.length > 0 ? { tools: stepTools } : { tools: undefined }),
        ...(step > 1 &&
        processed.chatRequest?.tool_choice === undefined &&
        llmRequest.tool_choice === 'required' &&
        (processed.chatRequest?.code_execution === true ||
          (processed.chatRequest?.web_search === true && processed.resolvedTaskType === 'research'))
          ? { tool_choice: 'auto' as const }
          : {}),
        ...(step > 1 &&
        processed.chatRequest?.skill_name &&
        isForcedSkillToolChoice(llmRequest.tool_choice)
          ? { tool_choice: 'auto' as const }
          : {}),
      };
      if (processed.freeTrial) {
        const fitted = applyFreeTrialProviderBudget({
          reservation: processed.freeTrial,
          provider: processed.provider,
          request: stepRequest,
          priorCostDollars: calculateObservedProviderUsageCostDollars(observedUsage, {
            provider: servingProcessed.provider,
            model: servingProcessed.chatRequest?.model ?? servingProcessed.llmRequest.model,
          }),
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
        providerStep = await runProviderStepWithFailover(step, stepRequest);
        mergeObservedProviderUsage(observedUsage, providerStep.usage);
        for (const ref of providerStep.generatedFileRefs ?? []) {
          if (ref.fileId) providerGeneratedFileRefs.set(`${ref.provider}:${ref.fileId}`, ref);
        }
      } catch (err) {
        if (options.shouldPropagateExecutionError?.(err)) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        const classified: { message: string; retryable: boolean; status?: number } =
          err instanceof ProviderStreamDeadlineError
            ? { message: err.message, retryable: true }
            : classifyError(err);
        logger.error(
          {
            provider: servingProcessed.provider,
            model: servingProcessed.chatRequest.model,
            step,
            error: msg,
          },
          err instanceof ProviderStreamDeadlineError
            ? '[tool-loop] provider stream exceeded the remaining invocation budget'
            : '[tool-loop] provider call failed',
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
          eventStream.emit({
            type: 'error',
            message: classified.message,
            ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
            retryable: classified.retryable,
          }),
        );
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

      if (await shouldStopForCancellation()) {
        yield* flushTerminal('cancelled');
        return;
      }

      if (finishReason !== 'tool_calls' || pendingToolCalls.length === 0) {
        yield* flushTerminal(canonicalStopReason(finishReason));
        return;
      }

      const assistantToolCalls = pendingToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.qualifiedName, arguments: JSON.stringify(tc.args) },
      }));
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

      const gatedCalls = pendingToolCalls.map((tc) => ({ tc, gate: resolveToolCallGate(tc) }));
      const blockedCalls = gatedCalls.filter((entry) => entry.gate.verdict === 'deny');
      const approvalCalls = gatedCalls.filter((entry) => entry.gate.verdict === 'ask');
      const autoRunCalls = gatedCalls
        .filter((entry) => entry.gate.verdict === 'allow')
        .map((entry) => entry.tc);

      for (const { tc } of blockedCalls) {
        logger.warn(
          { tool: tc.qualifiedName, requestId: processed.requestId },
          '[tool-loop] tool call blocked by the user permission store',
        );
        const content = blockedToolResultMessage(tc.qualifiedName);
        const blockedCategory = canonicalToolCategory(tc.qualifiedName, mcpTools);
        yield encoder.encode(
          eventStream.emit({
            type: 'tool-execution-start',
            toolCallId: tc.id,
            name: tc.qualifiedName,
            category: blockedCategory,
            summary: canonicalToolSummary(
              tc.qualifiedName,
              blockedCategory,
              tc.args,
              offeredServerLabel(tc.qualifiedName, mcpTools),
            ),
            input: toAgentEventJson(tc.args),
          }),
        );
        yield encoder.encode(
          toolResultEvent(tc.id, tc.qualifiedName, content, true, responseModel),
        );
        yield encoder.encode(
          eventStream.emit({
            type: 'tool-execution-end',
            toolCallId: tc.id,
            name: tc.qualifiedName,
            output: toAgentEventJson(content),
            isError: true,
            elapsedMs: 0,
          }),
        );
        messages.push({ role: 'tool', content, tool_call_id: tc.id });
      }

      if (autoRunCalls.length > 0) {
        yield* runAndStreamToolCalls(autoRunCalls);
        if (
          mapSearchBatchCompleted &&
          autoRunCalls.every((call) => isMapSearchTool(call.qualifiedName))
        ) {
          yield* flushTerminal('end-turn');
          return;
        }
      }

      if (approvalCalls.length > 0) {
        const escalated = approvalCalls.filter((entry) => entry.gate.reason === 'lethal_trifecta');
        if (escalated.length > 0) {
          logger.warn(
            {
              requestId: processed.requestId,
              tools: escalated.map((entry) => entry.tc.qualifiedName),
            },
            '[tool-loop] lethal-trifecta escalation: untrusted content + sensitive source + egress path; requiring approval',
          );
        }
        const approvalChunks: Uint8Array[] = [];
        const approvalEvents: AgentEventEnvelope[] = [];
        for (const { tc } of approvalCalls) {
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
            summary: canonicalApprovalSummary(
              tc.qualifiedName,
              category,
              offeredServerLabel(tc.qualifiedName, mcpTools),
            ),
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
          pendingToolCalls: approvalCalls.map(({ tc: call }) => ({
            ...call,
            args: { ...call.args },
          })),
        });

        for (const chunk of approvalChunks) yield chunk;
        yield encoder.encode(sseDone());
        return;
      }

      // Every call was resolved without suspending (allowed and/or blocked):
      // fall through to the next provider step with the completed thread.

      // Continue to next step.
    }

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
    if (e2bExecutor) {
      if (e2bSessionScope) {
        if (e2bExecutor.pause) {
          await e2bExecutor.pause();
        } else {
          await pauseE2BSession(e2bSessionScope);
        }
      } else {
        await e2bExecutor.dispose();
      }
    }
  }
}

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
