/**
 * @file Server-side Deep Research loop for agentic chat completions.
 *
 * Upgrades the Research toggle from a one-shot prompt injection into a bounded
 * multi-turn research run (plan -> search rounds -> cited synthesis), mirroring
 * the OpenAI deep-research pattern (multi-step web_search calls followed by a
 * final message with citations) on top of OUR provider tool loop -- we never
 * call a provider "deep research" model; we orchestrate the run ourselves.
 *
 * REUSE:
 *   - `buildToolLoopStream` (tool-loop-anthropic.ts) -- the same table-driven
 *     per-provider adapter dispatch the agentic tool loop uses (restructure
 *     Wave 2, task #34): packages/ai/providers adapters via ADAPTER_PROVIDERS +
 *     startProviderStream, reshaped onto OpenAI-compatible SSE bytes by
 *     OpenAIWireAssembler. Every provider therefore reaches this loop on the
 *     same normalized wire, Anthropic included (route.ts's old
 *     `provider !== 'anthropic'` exclusion is gone -- see the dispatch comment
 *     there; it silently downgraded the DEFAULT provider to the single-turn
 *     fallback while showing the same Deep Research badge).
 *   - Provider-native web search tools injected by request-processor.ts
 *     (google_search / web_search_preview) run inside each turn; the loop
 *     never fabricates search results.
 *   - `x_tool_status` / `x_search_results` SSE shapes -- identical to the
 *     shapes the client (`useChatStream.ts`) already understands.
 *
 * Stream contract (additive-only; existing event shapes unchanged):
 *   - `x_research_status` delta (NEW): { phase, label, iteration,
 *     max_iterations, searches, sources, elapsed_ms } -- drives the client
 *     research activity header.
 *   - `x_tool_status` deltas: one `web_search` running/completed pair per
 *     gathering round (the round really did run web searches server-side).
 *   - `x_search_results` delta: the CUMULATIVE deduped source list (stable
 *     `position` numbering across the whole run) is re-emitted after each
 *     round; the client's last-write-wins handler therefore always holds the
 *     complete, stably-numbered list.
 *   - Gathering-round text (the model's research notes) is NOT forwarded as
 *     message content; only the final synthesis turn streams `delta.content`.
 *
 * Bounds (all enforced): max iterations, max total searches, wall-clock
 * budget. Whatever stops the gathering phase, a synthesis turn always runs so
 * the user gets a cited report from the material collected so far.
 */

import 'server-only';

import type {
  Citation,
  ResearchReportStatus,
  ResearchStep,
  ThinkingBlock,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { classifyError } from '@agiworkforce/provider-runtime';
import { buildToolLoopStream, type ToolLoopStepSink } from './tool-loop-anthropic';
import type { ToolLoopFailoverPlan } from './tool-loop';
import {
  toolStatusEvent as loopToolStatusEvent,
  toolResultEvent,
  trimToolResultHistory,
} from './tool-loop';
import { mapClassifiedUpstreamError } from './upstream-error-copy';
import { isUrlFetchTool, executeUrlFetch } from '@/lib/url-fetch/url-fetch-tool';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import type { ProcessedRequest } from './request-processor';
import {
  createAgentEventStreamEmitter,
  createPublicTextDeltaProjector,
} from './agent-event-stream';

// ─── Bounds ───────────────────────────────────────────────────────────────────

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

/** Total model calls (gathering rounds + the final synthesis turn). */
export const DEFAULT_RESEARCH_MAX_ITERATIONS = 6;
/** Total observed web searches across the run. */
export const DEFAULT_RESEARCH_MAX_SEARCHES = 12;
/** Wall-clock budget for the gathering phase (synthesis always still runs). */
export const DEFAULT_RESEARCH_BUDGET_MS = 4 * 60_000;

/** Research notes appended back into the thread are capped per turn. */
const MAX_NOTE_CHARS = 6_000;

/**
 * url_fetch inside gathering rounds (parity with OpenAI/Anthropic deep
 * research, which read full pages during gathering): bounded so a fetch-happy
 * model cannot blow the token or wall-clock budget.
 */
/** Total url_fetch executions across the whole run. */
const MAX_RESEARCH_FETCHES = 8;
/** url_fetch executions within a single gathering round. */
const MAX_RESEARCH_FETCHES_PER_ROUND = 3;
/** Fetch-resolution continuation turns within a single gathering round. */
const MAX_FETCH_PASSES_PER_ROUND = 2;
/** Per-page extracted-text cap inside research turns (tighter than the chat
 *  loop's 20k: fetched text rides in up to several turns per round). */
const RESEARCH_FETCH_MAX_CONTENT_CHARS = 12_000;

/** Marker the model emits when it has gathered enough material. */
export const READY_MARKER = 'READY_TO_REPORT';
/** Marker the model emits when it wants another search round. */
const CONTINUE_MARKER = 'CONTINUE_RESEARCH';

export type ResearchPhase =
  | 'planning'
  | 'awaiting_approval'
  | 'searching'
  | 'synthesizing'
  | 'complete'
  | 'error';

/** Planned search queries the planning turn may commit to. */
const PLAN_MIN_STEPS = 3;
const PLAN_MAX_STEPS = 6;
/** One planned query description is capped so a runaway plan cannot bloat SSE. */
const MAX_PLAN_QUERY_CHARS = 300;
/**
 * A dedicated planning turn only runs when the iteration budget can afford it
 * (plan + at least one gathering round + synthesis). Below that the loop keeps
 * its pre-plan shape exactly, so the tightest budgets are unchanged.
 */
const MIN_ITERATIONS_FOR_PLANNING_TURN = 3;

/**
 * The report a finished (or abandoned) run hands to the durable sink.
 *
 * Shaped by the `ResearchReport` contract; the caller supplies the row's
 * identity (user, request, conversation) since the loop has no database handle.
 */
export interface ResearchRunReport {
  /** The research question the run was started from. */
  query: string;
  title: string;
  summary: string;
  content: string;
  citations: Citation[];
  steps: ResearchStep[];
  keyFindings: string[];
  status: ResearchReportStatus;
  sourcesConsulted: number;
  durationMs: number;
  error?: string;
}

/** Durable sink for {@link ResearchRunReport}; failures never break the stream. */
export type ResearchReportSink = (report: ResearchRunReport) => Promise<unknown>;

export interface ResearchLoopOptions {
  maxIterations?: number;
  maxSearches?: number;
  budgetMs?: number;
  /** Injectable clock for deterministic budget tests. */
  now?: () => number;
  /** Canonical usage accumulated across every provider call in this run. */
  usage?: ObservedProviderUsage;
  /** Durable cancellation check evaluated before provider and fetch side effects. */
  isCancellationRequested?: () => Promise<boolean>;
  /**
   * AUDIT-FIX BUG-1: the client's AbortSignal. The research loop never received
   * one, so a client cancel billed a full multi-round research run nobody saw.
   */
  signal?: AbortSignal;
  /**
   * AUDIT-FIX SYS-21: the caller's managed-failover rotation state (built by
   * `createFailoverPlan`). Passed in rather than constructed here for the same
   * import-graph reason as the tool loop. Absent means no rotation.
   */
  failover?: ToolLoopFailoverPlan;
  /**
   * CAP-045 slice 1: durable report persistence. Injected rather than imported
   * so the loop keeps no database handle of its own (the route owns the
   * RLS-scoped adapter and the run's identity). Called at most once per run, on
   * every terminal path — completed, failed, and interrupted — so a retry
   * always has gathered material to resume from.
   */
  persistReport?: ResearchReportSink;
  /**
   * CAP-045 slice 4: sources carried forward from a previous attempt at the
   * SAME question. Pre-seeded into the aggregator so a retry keeps their stable
   * citation numbers and the model is told not to re-run those searches.
   */
  priorSources?: ResearchSourceEntry[];
  /**
   * Plan steps a previous attempt already completed. Completed steps are
   * restored as-is (never re-run) and the remainder becomes this run's plan.
   */
  priorSteps?: ResearchStep[];
  /**
   * The plan the user pressed Start on. Present only on the request that
   * follows an approval pause: it replaces this run's planning turn, so the
   * searches executed are exactly the ones that were shown and accepted.
   */
  approvedPlan?: ResearchStep[];
  /**
   * Stop after planning and hand the plan to the user for a Start/Cancel
   * decision instead of searching straight away. The approved plan comes back
   * on the next request, which is what makes this stateless — the paused run
   * holds no server-side session.
   */
  requirePlanApproval?: boolean;
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseDone(): string {
  return `data: [DONE]\n\n`;
}

function safeUpstreamErrorMessage(err: unknown, provider: string): string {
  return mapClassifiedUpstreamError(classifyError(err), provider).message;
}

/**
 * Build the additive `x_research_status` SSE event. Exported for unit tests;
 * external callers must not depend on the wire format directly.
 */
export function researchStatusEvent(
  status: {
    phase: ResearchPhase;
    label: string;
    iteration: number;
    maxIterations: number;
    searches: number;
    /**
     * The search cap this run is actually bounded by (enforced below at the
     * `totalSearches >= maxSearches` break). Reported so the client can show
     * how much of the budget is left rather than an open-ended count that
     * stops for no visible reason.
     */
    maxSearches: number;
    sources: number;
    elapsedMs: number;
  },
  responseModel: string,
): string {
  return sseData({
    choices: [
      {
        delta: {
          x_research_status: {
            phase: status.phase,
            label: status.label,
            iteration: status.iteration,
            max_iterations: status.maxIterations,
            searches: status.searches,
            max_searches: status.maxSearches,
            sources: status.sources,
            elapsed_ms: status.elapsedMs,
          },
        },
        index: 0,
      },
    ],
    model: responseModel,
  });
}

/**
 * Build the additive `x_research_plan` SSE event (CAP-045 slice 2).
 *
 * Carries the WHOLE plan every time (last-write-wins, exactly like
 * `x_search_results`), so a client that joins late or drops an event still
 * renders the complete queue. Wire fields are snake_case to match the
 * `x_research_status` convention; the client maps them back onto `ResearchStep`.
 *
 * Additive by construction: a client that ignores unknown `x_` deltas sees the
 * run exactly as it did before this event existed.
 */
export function researchPlanEvent(steps: ResearchStep[], responseModel: string): string {
  return sseData({
    choices: [
      {
        delta: {
          x_research_plan: {
            steps: steps.map((step) => ({
              id: step.id,
              type: step.type,
              description: step.description,
              status: step.status,
              ...(step.startedAt ? { started_at: step.startedAt } : {}),
              ...(step.completedAt ? { completed_at: step.completedAt } : {}),
              ...(typeof step.durationMs === 'number' ? { duration_ms: step.durationMs } : {}),
              ...(typeof step.sourcesConsulted === 'number'
                ? { sources_consulted: step.sourcesConsulted }
                : {}),
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
 * Parse the planning turn's reply into concrete search queries.
 *
 * Preferred shape is a JSON array of strings; a plain markdown/numbered list is
 * accepted as a fallback because models drift. Anything else yields an empty
 * plan — the loop then shows the round it really runs instead of inventing
 * queries the model never committed to.
 */
export function parsePlanQueries(text: string): string[] {
  const queries: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const query = value.trim().replace(/\s+/g, ' ');
    if (!query || queries.length >= PLAN_MAX_STEPS) return;
    if (queries.some((existing) => existing.toLowerCase() === query.toLowerCase())) return;
    queries.push(query.slice(0, MAX_PLAN_QUERY_CHARS));
  };

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) push(entry);
        if (queries.length > 0) return queries;
      }
    } catch {
      // Fall through to the list parser below.
    }
  }

  for (const line of text.split('\n')) {
    const match = /^\s*(?:[-*]|\d+[.)])\s+(.*\S)\s*$/.exec(line);
    if (match) push(match[1]?.replace(/^["'`]|["'`,]+$/g, ''));
    if (queries.length >= PLAN_MAX_STEPS) break;
  }
  return queries;
}

/**
 * Split a synthesized report into the outline fields the contract stores
 * separately. Purely derived from real report text — nothing is invented; every
 * field degrades to an empty value when the report does not contain it.
 */
export function extractReportOutline(content: string): {
  title: string;
  summary: string;
  keyFindings: string[];
} {
  const lines = content.split('\n');
  let title = '';
  const summaryParts: string[] = [];
  const keyFindings: string[] = [];
  let sawTitle = false;
  let inFindingsSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (summaryParts.length > 0) break;
      continue;
    }
    const heading = /^#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      if (!sawTitle) {
        title = heading[1] ?? '';
        sawTitle = true;
        continue;
      }
      if (summaryParts.length > 0) break;
      inFindingsSection = /key\s+findings?|takeaways?|highlights?/i.test(heading[1] ?? '');
      continue;
    }
    const bullet = /^(?:[-*]|\d+[.)])\s+(.*\S)\s*$/.exec(line);
    if (bullet) {
      if (inFindingsSection && keyFindings.length < 10) keyFindings.push(bullet[1] ?? '');
      continue;
    }
    if (!sawTitle && summaryParts.length === 0) {
      // No heading at all: the first line is the best honest title we have.
      title = line.replace(/^\*+|\*+$/g, '');
      sawTitle = true;
      continue;
    }
    summaryParts.push(line);
  }

  // Second pass for key findings: a report may list them before any heading.
  if (keyFindings.length === 0) {
    for (const raw of lines) {
      const bullet = /^\s*(?:[-*]|\d+[.)])\s+(.*\S)\s*$/.exec(raw);
      if (!bullet) continue;
      keyFindings.push(bullet[1] ?? '');
      if (keyFindings.length >= 5) break;
    }
  }

  return {
    title: title.slice(0, 300),
    summary: summaryParts.join(' ').slice(0, 4_000),
    keyFindings,
  };
}

/**
 * The research question, taken from the LAST user message in the thread (the
 * turn that started this run). Multimodal content blocks contribute only their
 * text parts, so an image-bearing turn still yields a readable query.
 */
export function extractUserQuery(messages: ProcessedRequest['llmRequest']['messages']): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: string; content?: unknown } | undefined;
    if (message?.role !== 'user') continue;
    const content = message.content;
    if (typeof content === 'string') return content.trim().slice(0, 4_000);
    if (Array.isArray(content)) {
      const text = content
        .map((part) =>
          part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '',
        )
        .filter(Boolean)
        .join('\n')
        .trim();
      if (text) return text.slice(0, 4_000);
    }
  }
  return '';
}

function toolStatusEvent(
  status: 'running' | 'completed' | 'failed',
  responseModel: string,
  round: number,
): string {
  const payload: Record<string, unknown> = {
    type: 'mcp_tool_use',
    name: 'web_search',
    status,
  };
  if (status === 'running') {
    payload['status_phrase'] = 'Searching the web';
    payload['args'] = { round };
  }
  return sseData({
    choices: [{ delta: { x_tool_status: payload }, index: 0 }],
    model: responseModel,
  });
}

// ─── Source aggregation ───────────────────────────────────────────────────────

export interface ResearchSourceEntry {
  url: string;
  title: string;
  snippet?: string;
}

/**
 * Cumulative, URL-deduped source list with stable 1-based positions
 * (insertion order). Re-emitted in full after every round so the client's
 * last-write-wins `x_search_results` handler always holds the complete list.
 */
export class SourceAggregator {
  private readonly byUrl = new Map<string, ResearchSourceEntry>();

  add(entry: { url?: unknown; title?: unknown; snippet?: unknown }): boolean {
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (!url) return false;
    const existing = this.byUrl.get(url);
    if (existing) {
      // Backfill a better title/snippet if a later result has one.
      if (!existing.title && typeof entry.title === 'string') existing.title = entry.title;
      if (!existing.snippet && typeof entry.snippet === 'string') existing.snippet = entry.snippet;
      return false;
    }
    this.byUrl.set(url, {
      url,
      title: typeof entry.title === 'string' && entry.title ? entry.title : url,
      snippet: typeof entry.snippet === 'string' && entry.snippet ? entry.snippet : undefined,
    });
    return true;
  }

  get size(): number {
    return this.byUrl.size;
  }

  list(): Array<ResearchSourceEntry & { position: number }> {
    return [...this.byUrl.values()].map((s, i) => ({ ...s, position: i + 1 }));
  }

  /** Full cumulative x_search_results event (client shape unchanged). */
  toSearchResultsEvent(responseModel: string): string | null {
    if (this.byUrl.size === 0) return null;
    return sseData({
      choices: [
        {
          delta: {
            x_search_results: {
              content: this.list().map((s) => ({
                type: 'web_search_result',
                url: s.url,
                title: s.title,
                // Client maps `encrypted_content` to the snippet field.
                encrypted_content: s.snippet ?? '',
                position: s.position,
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
   * The cumulative sources as contract `Citation`s, numbered by the SAME stable
   * positions the report's inline `[n]` markers use.
   */
  toCitations(accessedAt: string): Citation[] {
    return this.list().map((source) => ({
      id: String(source.position),
      title: source.title,
      url: source.url,
      ...(source.snippet ? { snippet: source.snippet } : {}),
      accessedAt,
    }));
  }

  /** Numbered source list for the synthesis directive. */
  toPromptList(): string {
    return this.list()
      .map((s) => `[${s.position}] ${s.title} — ${s.url}`)
      .join('\n');
  }
}

// ─── Turn collection ──────────────────────────────────────────────────────────

/** One complete function tool_call parsed from a turn's streamed fragments. */
export interface ResearchToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface TurnResult {
  /** The turn's client-facing wire text, `<thinking>` markers included. */
  text: string;
  finishReason: string | null;
  searchEvents: number;
  hadToolCalls: boolean;
  /** Accumulated function tool_calls (only url_fetch is ever offered here). */
  toolCalls: ResearchToolCall[];
  promptTokens: number;
  completionTokens: number;
}

/** A completed turn plus the continuity data only the step sink can supply. */
interface ResearchTurn extends TurnResult {
  /**
   * The turn's assistant text with NO inline `<thinking>`/`</thinking>`
   * markers. Both wire modes the loop rides (`legacy-web` for Anthropic and
   * Google, `openai-passthrough` for the other ten) render `thinking-delta`s
   * as literal tag text inside `delta.content`, so `text` is the right thing
   * to FORWARD to a client that strips them and the wrong thing to feed back
   * into the thread, hand to the plan parser, or persist as a report body.
   */
  canonicalText: string;
  /**
   * Signed thinking blocks this turn produced (Anthropic extended thinking).
   * Replayed on the assistant tool_use turn -- see `runFetchCalls`.
   */
  thinkingBlocks: ThinkingBlock[];
}

/**
 * Remove inline `<thinking>` sections from an already-accumulated turn text,
 * using the SAME parser the public agent-event text stream uses so the two can
 * never disagree. Only a fallback: `ToolLoopStepSink.text` is authoritative
 * whenever the provider stream really filled it (a test double or a future
 * bridge that cannot may still leave it empty).
 */
function stripThinkingTags(text: string): string {
  const projector = createPublicTextDeltaProjector();
  return projector.push(text) + projector.flush();
}

/**
 * Consume one OpenAI-compatible provider SSE stream.
 *
 * `forwardContent` controls whether text/citation deltas are passed to the
 * client (true only for the synthesis turn). Tool-status events pass through
 * in every mode; raw x_search_results events are always absorbed into the
 * aggregator (the loop re-emits the cumulative list itself).
 *
 * Yields SSE lines to forward; returns the collected turn result.
 */
async function* collectTurn(
  stream: ReadableStream,
  sources: SourceAggregator,
  forwardContent: boolean,
  emitPublicText?: (delta: string) => string,
): AsyncGenerator<string, TurnResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason: string | null = null;
  let searchEvents = 0;
  let hadToolCalls = false;
  let promptTokens = 0;
  let completionTokens = 0;
  const publicTextProjector = forwardContent ? createPublicTextDeltaProjector() : null;
  // Accumulate streamed tool_call fragments by index (OpenAI streaming shape:
  // name arrives first, arguments as partial-JSON fragments). Mirrors
  // tool-loop.ts's collectProviderStream.
  const toolCallAccum: Map<number, { id: string; name: string; argsJson: string }> = new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';

      for (const raw of parts) {
        const line = raw.trim();
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6);
        if (jsonStr === '[DONE]') continue; // the loop decides when the run ends

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          continue;
        }

        const choice = (event['choices'] as Array<Record<string, unknown>> | undefined)?.[0];
        const delta = choice?.['delta'] as Record<string, unknown> | undefined;

        // Text content: accumulate always; forward only on synthesis turns.
        const content = delta?.['content'];
        if (typeof content === 'string' && content.length > 0) {
          text += content;
          if (forwardContent) {
            yield raw.trim() + '\n\n';
            const publicTextDelta = publicTextProjector?.push(content) ?? '';
            if (publicTextDelta && emitPublicText) yield emitPublicText(publicTextDelta);
          }
        }

        // Tool status pass-through (e.g. provider server_tool_use searching events).
        const toolStatus = delta?.['x_tool_status'] as Record<string, unknown> | undefined;
        if (toolStatus) {
          if (toolStatus['status'] === 'searching') searchEvents += 1;
          yield raw.trim() + '\n\n';
        }

        // Search results: absorb into the aggregator; the loop re-emits the
        // cumulative deduped list itself (never forward the raw per-turn list,
        // which would clobber earlier rounds client-side).
        const searchResults = delta?.['x_search_results'] as Record<string, unknown> | undefined;
        const resultsContent = searchResults?.['content'];
        if (Array.isArray(resultsContent)) {
          searchEvents += 1;
          for (const r of resultsContent) {
            if (r && typeof r === 'object') {
              const rec = r as Record<string, unknown>;
              sources.add({
                url: rec['url'],
                title: rec['title'],
                snippet: rec['encrypted_content'] ?? rec['snippet'],
              });
            }
          }
        }

        // Function tool_calls: accumulate fragments so the loop can execute
        // url_fetch calls (the only function tool research turns keep — see
        // the tools filter in runResearchLoop).
        if (Array.isArray(delta?.['tool_calls']) && (delta['tool_calls'] as unknown[]).length > 0) {
          hadToolCalls = true;
          for (const tc of delta['tool_calls'] as unknown[]) {
            if (typeof tc !== 'object' || tc === null) continue;
            const tcObj = tc as Record<string, unknown>;
            const idx = typeof tcObj['index'] === 'number' ? tcObj['index'] : 0;
            let entry = toolCallAccum.get(idx);
            if (!entry) {
              entry = { id: '', name: '', argsJson: '' };
              toolCallAccum.set(idx, entry);
            }
            if (typeof tcObj['id'] === 'string' && tcObj['id']) entry.id = tcObj['id'];
            const fn = tcObj['function'];
            if (fn && typeof fn === 'object') {
              const fnObj = fn as Record<string, unknown>;
              if (typeof fnObj['name'] === 'string' && fnObj['name']) entry.name = fnObj['name'];
              if (typeof fnObj['arguments'] === 'string') entry.argsJson += fnObj['arguments'];
            }
          }
        }

        const fr = choice?.['finish_reason'];
        if (typeof fr === 'string' && fr) finishReason = fr;

        const usage = event['usage'] as Record<string, unknown> | undefined;
        if (usage) {
          const pt = usage['prompt_tokens'];
          const ct = usage['completion_tokens'];
          if (typeof pt === 'number') promptTokens = Math.max(promptTokens, pt);
          if (typeof ct === 'number') completionTokens = Math.max(completionTokens, ct);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const publicTextTail = publicTextProjector?.flush() ?? '';
  if (publicTextTail && emitPublicText) yield emitPublicText(publicTextTail);

  const toolCalls: ResearchToolCall[] = [];
  for (const [, tc] of toolCallAccum) {
    if (!tc.name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.argsJson || '{}') as Record<string, unknown>;
    } catch {
      args = { _raw: tc.argsJson };
    }
    toolCalls.push({ id: tc.id || crypto.randomUUID(), name: tc.name, args });
  }

  return {
    text,
    finishReason,
    searchEvents,
    hadToolCalls,
    toolCalls,
    promptTokens,
    completionTokens,
  };
}

// ─── Directives ───────────────────────────────────────────────────────────────

/**
 * The planning turn's directive. Deliberately tool-free and machine-readable:
 * the loop turns the reply into the `x_research_plan` queue the user sees, so a
 * free-form answer would leave the plan surface empty rather than guessed at.
 */
function planningDirective(carriedQueries: string[]): string {
  const carried =
    carriedQueries.length > 0
      ? `\n\nA previous attempt already completed these searches — do NOT repeat them:\n${carriedQueries
          .map((query) => `- ${query}`)
          .join('\n')}`
      : '';
  return (
    'Planning phase: before searching, list the web searches you will run to answer the request.' +
    ` Reply with ONLY a JSON array of ${PLAN_MIN_STEPS}-${PLAN_MAX_STEPS} short search query strings` +
    ' covering distinct angles of the question, e.g. ["query one", "query two", "query three"].' +
    ' No prose, no markdown fences, no explanation. Do not search yet.' +
    carried
  );
}

function gatheringDirective(
  round: number,
  maxRounds: number,
  sources: SourceAggregator,
  canFetch: boolean,
  plannedQueries: string[] = [],
): string {
  const planned =
    plannedQueries.length > 0
      ? `\n\nRun these planned searches now:\n${plannedQueries.map((query) => `- ${query}`).join('\n')}\n`
      : '';
  const base =
    round === 1
      ? plannedQueries.length > 0
        ? `Research phase, round 1: run the searches you planned.${planned}`
        : 'Research phase, round 1: break the request into 3-5 distinct, targeted web search queries covering different angles, then run those searches now.'
      : `Research phase, round ${round} of up to ${maxRounds}: review your notes so far, identify the biggest remaining gaps or unverified claims, and run more targeted web searches to close them.`;
  const fetchNote = canFetch
    ? ' When a specific page matters (the user provided a URL, or a search result looks central to the question), call the url_fetch tool to read that page in full before writing your notes.'
    : '';
  const sourceNote =
    sources.size > 0
      ? ` You have collected ${sources.size} source${sources.size === 1 ? '' : 's'} so far.`
      : '';
  return (
    base +
    fetchNote +
    sourceNote +
    ' Reply ONLY with concise research notes: key facts found, with the source they came from.' +
    ` Do not write the report yet. End your reply with the single line ${READY_MARKER} if you have enough material to write a thorough report, or ${CONTINUE_MARKER} if another round of searching is needed.`
  );
}

function synthesisDirective(sources: SourceAggregator, cutShortReason: string | null): string {
  const sourceList =
    sources.size > 0 ? `\n\nSources gathered (cite as [n]):\n${sources.toPromptList()}` : '';
  const cutShort = cutShortReason
    ? ` Note: the research phase ended early (${cutShortReason}); state clearly in the report if coverage is therefore incomplete.`
    : '';
  return (
    'Synthesis phase: write the final research report now, based on your research notes above.' +
    ' Structure it with a brief executive summary and clearly labeled sections.' +
    ' Inline-cite every factual claim with a bracketed number, e.g. [1], matching the numbered source list below when present.' +
    ' Do not end with a Sources or References list and never paste a raw URL into the report:' +
    ' the app renders the numbered sources beside the report from the numbers you cite.' +
    ' Do not include the markers or your raw notes in the report.' +
    cutShort +
    sourceList
  );
}

function stripMarkers(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t !== READY_MARKER && t !== CONTINUE_MARKER;
    })
    .join('\n')
    .trim();
}

// ─── Main loop ────────────────────────────────────────────────────────────────

/**
 * Run the deep-research loop, yielding SSE chunks (Uint8Array).
 *
 * Usage is accumulated across ALL turns from canonical provider chunks. The
 * route owns durable financial settlement; this loop only updates quota
 * counters in its finally block so cancellation cannot skip accounting.
 */
export async function* runResearchLoop(
  processed: ProcessedRequest,
  _billing: { userId: string; token: string },
  options: ResearchLoopOptions = {},
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const responseModel = processed.requestedModel;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const turnId = processed.requestId || crypto.randomUUID();
  const eventStream = createAgentEventStreamEmitter({
    sessionId: processed.conversationId ?? turnId,
    turnId,
    responseModel,
    now,
  });

  const maxIterations =
    options.maxIterations ??
    envInt('AGI_RESEARCH_MAX_ITERATIONS', DEFAULT_RESEARCH_MAX_ITERATIONS, 2, 8);
  const maxSearches =
    options.maxSearches ??
    envInt('AGI_RESEARCH_MAX_SEARCHES', DEFAULT_RESEARCH_MAX_SEARCHES, 3, 15);
  const budgetMs =
    options.budgetMs ??
    envInt('AGI_RESEARCH_BUDGET_MS', DEFAULT_RESEARCH_BUDGET_MS, 30_000, 10 * 60_000);
  /**
   * CAP-045 slice 2: a REAL planning turn now backs the `planning` phase, which
   * previously emitted a label while doing no work at all. It costs one model
   * call, so the gathering budget shrinks by one and the run's total provider
   * calls stay within `maxIterations` exactly as before. Budgets too small to
   * afford it (< 3 iterations) keep the original plan-free shape.
   */
  const planningTurnEnabled = maxIterations >= MIN_ITERATIONS_FOR_PLANNING_TURN;
  const maxGatherRounds = planningTurnEnabled
    ? Math.max(1, maxIterations - 2) // plan + gathering rounds + synthesis
    : maxIterations - 1; // the last iteration is always synthesis

  // Managed failover state for this run (AUDIT-FIX SYS-21). The caller's plan
  // returns null for anything that is not an availability-class failure, so
  // credential/safety/context errors still fail fast exactly as before.
  let servingProcessed: ProcessedRequest = processed;

  const sources = new SourceAggregator();
  let totalSearches = 0;
  let totalFetches = 0;
  let iteration = 0;
  const observedUsage = options.usage ?? createObservedProviderUsage();
  let cancellationEmitted = false;

  // CAP-045 slice 4: a retry carries the previous attempt's sources forward so
  // their citation numbers stay stable and the model is told not to redo the
  // searches that already succeeded. Seeded FIRST so prior sources keep the
  // lowest positions.
  for (const priorSource of options.priorSources ?? []) {
    sources.add(priorSource);
  }
  /** Queries a previous attempt already completed — never re-run. */
  const carriedQueries = (options.priorSteps ?? [])
    .filter((step) => step.type === 'search' && step.status === 'completed')
    .map((step) => step.description)
    .filter((description) => description.trim().length > 0)
    .slice(0, PLAN_MAX_STEPS);

  /**
   * The live research plan (CAP-045 slice 2). Completed steps carried in from a
   * retry are restored verbatim; new steps come from this run's planning turn.
   */
  const plan: ResearchStep[] = (options.priorSteps ?? [])
    .filter((step) => step.status === 'completed')
    .map((step) => ({ ...step }));
  const approvedPlan = (options.approvedPlan ?? [])
    .filter(
      (step) =>
        step.type === 'search' &&
        step.description.trim().length > 0 &&
        !carriedQueries.some(
          (carried) => carried.toLowerCase() === step.description.trim().toLowerCase(),
        ),
    )
    .slice(0, PLAN_MAX_STEPS)
    .map((step, index) => ({
      ...step,
      id: `plan-${plan.length + index + 1}`,
      status: 'pending' as const,
    }));
  plan.push(...approvedPlan);
  const planEvent = (): Uint8Array => encoder.encode(researchPlanEvent(plan, responseModel));

  /** Move every step in `ids` to `status`, stamping honest timing. */
  const markPlanSteps = (ids: string[], status: ResearchStep['status']): void => {
    const stamp = new Date(now()).toISOString();
    for (const step of plan) {
      if (!ids.includes(step.id)) continue;
      step.status = status;
      if (status === 'running') {
        step.startedAt = stamp;
      } else if (status === 'completed' || status === 'failed') {
        step.completedAt = stamp;
        if (step.startedAt) {
          const started = Date.parse(step.startedAt);
          if (Number.isFinite(started)) step.durationMs = Math.max(0, now() - started);
        }
        step.sourcesConsulted = sources.size;
      }
    }
  };

  const pendingPlanStepIds = (): string[] =>
    plan.filter((step) => step.status === 'pending').map((step) => step.id);

  // ── Durable report persistence (CAP-045 slice 1) ──
  let reportPersisted = false;
  /** A run paused for approval gathered nothing; a stored empty report would be noise. */
  let awaitingApproval = false;
  const userQuery = extractUserQuery(processed.llmRequest.messages);

  /**
   * Persist the run exactly once. Never throws into the stream: a storage
   * outage must not destroy a report the user is already reading, so the
   * failure is logged and the run continues.
   */
  async function persistRun(
    status: ResearchReportStatus,
    content: string,
    error?: string,
  ): Promise<void> {
    if (reportPersisted || !options.persistReport) return;
    reportPersisted = true;
    const outline = extractReportOutline(content);
    try {
      await options.persistReport({
        query: userQuery,
        title: outline.title,
        summary: outline.summary,
        content,
        citations: sources.toCitations(new Date(now()).toISOString()),
        steps: plan.map((step) => ({ ...step })),
        keyFindings: outline.keyFindings,
        status,
        sourcesConsulted: sources.size,
        durationMs: Math.max(0, now() - startedAt),
        ...(error ? { error } : {}),
      });
    } catch (persistError) {
      logger.error(
        {
          requestId: processed.requestId,
          status,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        },
        '[research-loop] research report could not be persisted',
      );
    }
  }

  /**
   * AUDIT-FIX BUG-1: a plain client abort now stops the run at the next
   * boundary, in addition to the durable cancellation poll.
   */
  async function isCancelled(): Promise<boolean> {
    if (options.signal?.aborted) return true;
    return (await options.isCancellationRequested?.()) === true;
  }

  async function* flushCancellationIfRequested(): AsyncGenerator<Uint8Array, boolean> {
    if (cancellationEmitted || !(await isCancelled())) return false;
    cancellationEmitted = true;
    // A cancelled run keeps whatever it really gathered so a retry can resume
    // from it instead of re-searching from zero.
    await persistRun('interrupted', '', 'Research was cancelled.');
    yield encoder.encode(
      eventStream.emit({
        type: 'task-state-changed',
        taskId: turnId,
        state: 'cancelled',
        summary: 'Research was cancelled.',
      }),
    );
    yield encoder.encode(eventStream.emit({ type: 'stop', reason: 'cancelled' }));
    yield encoder.encode(sseDone());
    return true;
  }

  // Strip client-custom function tools EXCEPT the platform url_fetch tool:
  // research turns use provider-native web search plus loop-executed url_fetch
  // (request-processor only offers url_fetch when the resolved model supports
  // function calling, so its presence here already implies support). No other
  // function tool is executed by this loop, so none other is offered.
  const researchTools = (processed.llmRequest.tools ?? []).filter((t) => {
    if (!(t && typeof t === 'object')) return false;
    const fn = (t as { function?: { name?: string } }).function;
    if (fn) return isUrlFetchTool(fn.name ?? '');
    return true;
  });
  const fetchAvailable = researchTools.some((t) =>
    isUrlFetchTool((t as { function?: { name?: string } }).function?.name ?? ''),
  );
  const baseRequest = {
    ...processed.llmRequest,
    tools: researchTools.length > 0 ? researchTools : undefined,
    tool_choice: undefined,
    stream: true,
  };
  const messages: ProcessedRequest['llmRequest']['messages'] = [...baseRequest.messages];

  const status = (phase: ResearchPhase, label: string): Uint8Array =>
    encoder.encode(
      researchStatusEvent(
        {
          phase,
          label,
          iteration,
          maxIterations,
          searches: totalSearches,
          maxSearches,
          sources: sources.size,
          elapsedMs: now() - startedAt,
        },
        responseModel,
      ),
    );

  /** Run one provider turn, forwarding per collectTurn rules. */
  async function* runTurn(
    turnMessages: typeof messages,
    forwardContent: boolean,
    turnOptions: { withoutTools?: boolean } = {},
  ): AsyncGenerator<Uint8Array, ResearchTurn> {
    // Bound accumulated tool-result history so a long multi-round research run can't
    // overflow the model context window (shared with the main tool loop). In place +
    // message-preserving, so tool_call/result pairing stays valid.
    trimToolResultHistory(turnMessages);
    // The planning turn must not search: it plans the searches the gathering
    // rounds then really run, so offering tools would burn search budget here.
    const stepRequest = turnOptions.withoutTools
      ? { ...baseRequest, tools: undefined, messages: turnMessages }
      : { ...baseRequest, messages: turnMessages };
    const callsBefore = observedUsage.providerCalls;
    const stepSink: ToolLoopStepSink = {
      thinkingBlocks: [],
      text: '',
      usage: observedUsage,
    };
    // AUDIT-FIX SYS-21 + BUG-1: rotate to the resolver's next managed-failover
    // candidate when the provider fails on an availability-class error, and
    // thread the client's AbortSignal into every attempt. The rotation point is
    // `startProviderStream`'s first-chunk peek inside `buildToolLoopStream`,
    // which throws before any byte of this turn reaches the client, so a failed
    // attempt can never leak partial text. Research turns carry the url_fetch
    // tool definition, so `createFailoverPlan` keeps rotation within the same
    // provider by construction.
    let stream: ReadableStream;
    for (;;) {
      const attempt = servingProcessed;
      try {
        stream = await buildToolLoopStream(
          attempt.provider.toLowerCase(),
          attempt,
          {
            ...stepRequest,
            model: attempt.llmRequest.model,
            effort: attempt.llmRequest.effort,
            thinking: attempt.llmRequest.thinking,
          },
          responseModel,
          stepSink,
          options.signal,
        );
        break;
      } catch (error) {
        const nextAttempt = options.failover?.next(error);
        if (!nextAttempt) throw error;
        servingProcessed = nextAttempt.processed;
      }
    }
    const gen = collectTurn(stream, sources, forwardContent, (delta) =>
      eventStream.emit({ type: 'text-delta', delta }),
    );
    try {
      while (true) {
        const next = await gen.next();
        if (next.done) {
          // Unit-test streams and any future bridge that cannot expose
          // canonical StreamChunk usage still get a wire-level fallback. Do
          // not add it when the canonical sink already recorded this call.
          if (
            observedUsage.providerCalls === callsBefore &&
            (next.value.promptTokens > 0 || next.value.completionTokens > 0)
          ) {
            accumulateObservedProviderUsage(
              observedUsage,
              {
                inputTokens: next.value.promptTokens,
                outputTokens: next.value.completionTokens,
              },
              {
                provider: servingProcessed.provider,
                model: servingProcessed.chatRequest.model,
              },
            );
          }
          return {
            ...next.value,
            // Same fallback shape as the usage reconciliation above: prefer the
            // assembler's canonical capture, fall back to parsing the wire text
            // for streams that cannot fill the sink.
            canonicalText: stepSink.text || stripThinkingTags(next.value.text),
            thinkingBlocks: stepSink.thinkingBlocks,
          };
        }
        yield encoder.encode(next.value);
      }
    } finally {
      // Best-effort cleanup when the run is cancelled mid-turn (client abort
      // finalizes this generator while suspended in the yield above).
      void gen.return(undefined as never).catch(() => {});
    }
  }

  /**
   * Execute one batch of url_fetch tool calls a gathering turn emitted:
   * append the assistant tool_call turn + a tool result for EVERY call
   * (providers reject dangling tool_calls) to `turnMessages`, stream
   * url_fetch timeline/result events, and dedupe successful pages INTO the
   * shared SourceAggregator so they join the same cumulative x_search_results
   * list (stable positions) as the provider search results.
   *
   * Every call gets an honest result: non-url_fetch names (never offered) and
   * over-budget calls get an explicit error result the model can react to.
   */
  async function* runFetchCalls(
    calls: ResearchToolCall[],
    turn: ResearchTurn,
    turnMessages: ProcessedRequest['llmRequest']['messages'],
    roundFetchCount: { count: number },
  ): AsyncGenerator<Uint8Array, boolean> {
    // Anthropic extended-thinking continuity (known-flaw
    // TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01), mirroring runToolLoop: when
    // this turn produced signed thinking blocks, replay them ahead of the
    // tool_use blocks and use the TAG-FREE text, so the follow-up request
    // neither drops the signature nor double-represents reasoning as literal
    // `<thinking>` text. Strictly gated on signed blocks: every other provider
    // and every thinking-disabled turn pushes exactly what it pushed before.
    const signedThinking = turn.thinkingBlocks.filter((block) => block.signature);
    const assistantMessage: ProcessedRequest['llmRequest']['messages'][number] = {
      role: 'assistant',
      content: signedThinking.length > 0 ? turn.canonicalText : turn.text,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })) as unknown[],
    };
    if (signedThinking.length > 0) {
      assistantMessage.__canonicalThinking = signedThinking;
    }
    turnMessages.push(assistantMessage);

    for (const call of calls) {
      if (yield* flushCancellationIfRequested()) return true;
      let content: string;
      let isError: boolean;

      if (!isUrlFetchTool(call.name)) {
        content = `Tool "${call.name}" is not available in research mode.`;
        isError = true;
        yield encoder.encode(toolResultEvent(call.id, call.name, content, isError, responseModel));
      } else if (
        totalFetches >= MAX_RESEARCH_FETCHES ||
        roundFetchCount.count >= MAX_RESEARCH_FETCHES_PER_ROUND
      ) {
        content =
          'Fetch budget for this research run is exhausted; continue with the material already gathered.';
        isError = true;
        yield encoder.encode(toolResultEvent(call.id, call.name, content, isError, responseModel));
      } else {
        totalFetches += 1;
        roundFetchCount.count += 1;
        yield encoder.encode(loopToolStatusEvent(call.name, 'running', responseModel, call.args));
        const outcome = await executeUrlFetch(call.args, {
          maxContentChars: RESEARCH_FETCH_MAX_CONTENT_CHARS,
        });
        if (outcome.ok) {
          sources.add({ url: outcome.url, title: outcome.title });
          content = `Fetched ${outcome.url} — ${outcome.title}\n\n${outcome.content}`;
          isError = false;
        } else {
          content = `Fetch failed (${outcome.errorCode}): ${outcome.error}`;
          isError = true;
        }
        yield encoder.encode(
          loopToolStatusEvent(call.name, isError ? 'failed' : 'completed', responseModel),
        );
        yield encoder.encode(toolResultEvent(call.id, call.name, content, isError, responseModel));
      }

      turnMessages.push({ role: 'tool', content, tool_call_id: call.id });
    }
    return false;
  }

  try {
    if (yield* flushCancellationIfRequested()) return;
    yield status('planning', 'Planning research');

    // ── Planning turn (CAP-045 slice 2) ──
    // One tool-free model call that commits to the searches this run will make.
    // Its output becomes the `x_research_plan` queue the user watches. A failed
    // or unparseable plan is NEVER fatal and is never guessed at: the run falls
    // back to showing the round it actually executes.
    if (planningTurnEnabled && approvedPlan.length === 0) {
      iteration = 1;
      try {
        if (yield* flushCancellationIfRequested()) return;
        const planTurn = yield* runTurn(
          [...messages, { role: 'user', content: planningDirective(carriedQueries) }],
          false,
          { withoutTools: true },
        );
        if (yield* flushCancellationIfRequested()) return;
        const queries = parsePlanQueries(planTurn.canonicalText).filter(
          (query) =>
            !carriedQueries.some((carried) => carried.toLowerCase() === query.toLowerCase()),
        );
        for (const [index, query] of queries.entries()) {
          plan.push({
            id: `plan-${plan.length + index + 1}`,
            type: 'search',
            description: query,
            status: 'pending',
          });
        }
        if (queries.length === 0) {
          logger.warn(
            { provider: processed.provider, requestId: processed.requestId },
            '[research-loop] planning turn produced no parseable queries',
          );
        }
      } catch (err) {
        logger.error(
          {
            provider: processed.provider,
            error: err instanceof Error ? err.message : String(err),
          },
          '[research-loop] planning turn failed; continuing without a query plan',
        );
      }
    }

    // ── Approval gate ──
    // The plan is the user's to accept: searching costs their budget, so the
    // run stops here and the client re-sends the approved steps as
    // `research_resume`.
    //
    // This gate must not fail open. It used to also require a parsed plan, so
    // two paths reached the network with approval still outstanding: a budget
    // too small to afford a planning turn at all, and a planning turn whose
    // output did not parse into steps. Both spent the user's budget on searches
    // they never saw, which is the decision the gate exists to protect.
    //
    // When there is nothing to show, the run still stops and says so. The user
    // decides whether to proceed blind; the loop does not decide for them.
    if (options.requirePlanApproval && approvedPlan.length === 0) {
      if (pendingPlanStepIds().length === 0) {
        plan.push({
          id: `plan-${plan.length + 1}`,
          type: 'search',
          description: 'Search for sources on this question',
          status: 'pending',
        });
      }
      awaitingApproval = true;
      yield planEvent();
      yield status('awaiting_approval', 'Review the plan to start searching');
      yield encoder.encode(eventStream.emit({ type: 'lifecycle', phase: 'paused' }));
      yield encoder.encode(eventStream.emit({ type: 'stop', reason: 'end-turn' }));
      yield encoder.encode(sseDone());
      return;
    }

    let cutShortReason: string | null = null;
    /**
     * The real provider error from the last gathering round that threw.
     *
     * A round-1 failure reports the upstream message verbatim and stops, but a
     * failure in round 2+ used to be logged and then dropped: the loop kept the
     * partial material, ran synthesis anyway, and — when synthesis also came
     * back empty — blamed "the model returned an empty report" and told the user
     * to retry. Observed locally with an Anthropic key at $0: every upstream
     * call was rejected with "Your credit balance is too low to access the
     * Anthropic API", the user was told the model had gone quiet, and the
     * suggested retry could never have succeeded. Keep the cause so the failure
     * branch can name it instead of guessing.
     */
    let lastTurnError: string | null = null;

    // ── Gathering rounds ──
    for (let round = 1; round <= maxGatherRounds; round++) {
      iteration = planningTurnEnabled ? round + 1 : round;

      // Plan bookkeeping. Round 1 executes the planned queries as one batch:
      // provider-native search does not attribute results back to an individual
      // query, so per-query completion cannot be observed and is not claimed —
      // the batch moves together. Later rounds are gap-filling work the plan did
      // not contain, so each appends its own honest step.
      let roundStepIds: string[];
      if (round === 1) {
        if (plan.every((step) => step.status !== 'pending')) {
          plan.push({
            id: `round-${round}`,
            type: 'search',
            description: 'Initial web searches',
            status: 'pending',
          });
        }
        roundStepIds = pendingPlanStepIds();
      } else {
        plan.push({
          id: `round-${round}`,
          type: 'search',
          description: `Follow-up searches to close remaining gaps (round ${round})`,
          status: 'pending',
        });
        roundStepIds = [`round-${round}`];
      }
      markPlanSteps(roundStepIds, 'running');
      yield planEvent();

      yield status(
        'searching',
        round === 1 ? 'Searching the web' : `Searching the web (round ${round})`,
      );
      yield encoder.encode(toolStatusEvent('running', responseModel, round));

      let turn: ResearchTurn;
      let roundSearchEvents = 0;
      try {
        if (yield* flushCancellationIfRequested()) return;
        // Directives ride as 'user' turns: several providers (e.g. Google)
        // only honor the FIRST system message and silently drop the rest, so
        // a trailing system directive would never reach the model.
        const turnMessages: typeof messages = [
          ...messages,
          {
            role: 'user',
            content: gatheringDirective(
              round,
              maxGatherRounds,
              sources,
              fetchAvailable,
              round === 1
                ? plan
                    .filter((step) => roundStepIds.includes(step.id) && step.id.startsWith('plan-'))
                    .map((step) => step.description)
                : [],
            ),
          },
        ];
        turn = yield* runTurn(turnMessages, false);
        if (yield* flushCancellationIfRequested()) return;
        roundSearchEvents += turn.searchEvents;

        // url_fetch resolution passes: when the turn ended on tool_calls,
        // execute the fetches (bounded), feed the results back, and let the
        // model finish its notes for this round. Fetched text lives only in
        // this round's turnMessages — the persistent thread gets the capped
        // notes below, so the token budget stays under control.
        let fetchPasses = 0;
        const roundFetchCount = { count: 0 }; // per-round cap spans all passes
        while (
          turn.finishReason === 'tool_calls' &&
          turn.toolCalls.length > 0 &&
          fetchPasses < MAX_FETCH_PASSES_PER_ROUND
        ) {
          fetchPasses += 1;
          if (yield* runFetchCalls(turn.toolCalls, turn, turnMessages, roundFetchCount)) return;
          const cumulativeAfterFetch = sources.toSearchResultsEvent(responseModel);
          if (cumulativeAfterFetch) yield encoder.encode(cumulativeAfterFetch);
          if (yield* flushCancellationIfRequested()) return;
          turn = yield* runTurn(turnMessages, false);
          if (yield* flushCancellationIfRequested()) return;
          roundSearchEvents += turn.searchEvents;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const safeMessage = safeUpstreamErrorMessage(err, servingProcessed.provider);
        logger.error(
          { provider: processed.provider, round, error: msg },
          '[research-loop] gathering turn failed',
        );
        yield encoder.encode(toolStatusEvent('failed', responseModel, round));
        markPlanSteps(roundStepIds, 'failed');
        yield planEvent();
        if (round === 1) {
          // Nothing gathered: surface an honest error and stop.
          yield status('error', 'Research failed before any results were gathered');
          yield encoder.encode(
            sseData({
              choices: [
                {
                  delta: {
                    content: `Deep research failed before any results were gathered: ${safeMessage}`,
                  },
                  index: 0,
                },
              ],
              model: responseModel,
            }),
          );
          await persistRun('failed', '', safeMessage);
          yield encoder.encode(eventStream.emit({ type: 'stop', reason: 'error' }));
          yield encoder.encode(sseDone());
          return;
        }
        // Partial material exists: keep it and synthesize what we have.
        lastTurnError = safeMessage;
        cutShortReason = 'a web search round failed mid-run';
        break;
      }

      totalSearches += Math.max(1, roundSearchEvents);
      yield encoder.encode(toolStatusEvent('completed', responseModel, round));
      markPlanSteps(roundStepIds, 'completed');
      yield planEvent();

      // Append the model's notes (truncated) so later turns build on them.
      const notes = stripMarkers(turn.canonicalText).slice(0, MAX_NOTE_CHARS);
      messages.push({
        role: 'assistant',
        content: notes || '(no notes recorded this round)',
      });

      const cumulative = sources.toSearchResultsEvent(responseModel);
      if (cumulative) yield encoder.encode(cumulative);
      yield status('searching', `Found ${sources.size} source${sources.size === 1 ? '' : 's'}`);

      if (turn.canonicalText.includes(READY_MARKER)) break;
      if (totalSearches >= maxSearches) {
        cutShortReason = 'the search budget was reached';
        break;
      }
      if (now() - startedAt >= budgetMs) {
        cutShortReason = 'the time budget was reached';
        break;
      }
    }

    // ── Synthesis turn (always runs when any gathering succeeded) ──
    iteration = Math.min(iteration + 1, maxIterations);
    // Any plan step still pending never ran (the gathering phase was cut short
    // by a budget or the READY marker); leaving it pending is the honest state.
    const synthesisStepId = 'synthesize';
    plan.push({
      id: synthesisStepId,
      type: 'synthesize',
      description: 'Write the cited report',
      status: 'pending',
    });
    markPlanSteps([synthesisStepId], 'running');
    yield planEvent();
    yield status('synthesizing', 'Writing report');
    try {
      if (yield* flushCancellationIfRequested()) return;
      const synthesis = yield* runTurn(
        [...messages, { role: 'user', content: synthesisDirective(sources, cutShortReason) }],
        true,
      );
      if (yield* flushCancellationIfRequested()) return;
      // Empty-synthesis guarantee: a run must NEVER end as a silent empty
      // message (an empty body also skips client persistence, so the whole
      // run would vanish on reload). If the model produced no report text,
      // emit an honest failure as real content and an error status.
      if (!synthesis.canonicalText.trim()) {
        logger.error(
          {
            provider: processed.provider,
            requestId: processed.requestId,
            sources: sources.size,
            lastTurnError,
          },
          '[research-loop] synthesis turn produced no text',
        );
        markPlanSteps([synthesisStepId], 'failed');
        yield planEvent();
        // Attribute the failure to what actually caused it. "The model returned
        // an empty report" is only credible when the gathering rounds really did
        // gather something; with zero sources AND a captured upstream error the
        // far likelier story is that every provider call was rejected, and
        // telling the user to retry is then actively wrong — the retry cannot
        // succeed until whatever rejected the call is fixed.
        const upstreamFailed = lastTurnError !== null && sources.size === 0;
        const statusLabel = upstreamFailed
          ? 'Report generation failed upstream'
          : 'Report generation returned no text';
        const body = upstreamFailed
          ? `Deep research could not complete: every provider call failed. Last error: ${lastTurnError}.` +
            ' Retrying will not help until that is resolved.'
          : `Deep research gathered ${sources.size} source${sources.size === 1 ? '' : 's'} across ${totalSearches} search${totalSearches === 1 ? '' : 'es'}, but the model returned an empty report.` +
            ' Try running the research again.';
        yield status('error', statusLabel);
        yield encoder.encode(
          sseData({
            choices: [{ delta: { content: body }, index: 0 }],
            model: responseModel,
          }),
        );
        const cumulativeOnEmpty = sources.toSearchResultsEvent(responseModel);
        if (cumulativeOnEmpty) yield encoder.encode(cumulativeOnEmpty);
        // Gathered sources are real and worth resuming from, so the row is
        // persisted even though the report body is empty.
        await persistRun(
          'failed',
          '',
          upstreamFailed
            ? `Every provider call failed: ${lastTurnError}`
            : 'The model returned an empty report.',
        );
        yield encoder.encode(eventStream.emit({ type: 'stop', reason: 'error' }));
        yield encoder.encode(sseDone());
        return;
      }
      markPlanSteps([synthesisStepId], 'completed');
      yield planEvent();
      await persistRun('completed', synthesis.canonicalText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const safeMessage = safeUpstreamErrorMessage(err, servingProcessed.provider);
      logger.error(
        { provider: processed.provider, error: msg },
        '[research-loop] synthesis failed',
      );
      markPlanSteps([synthesisStepId], 'failed');
      yield planEvent();
      yield status('error', 'Report generation failed');
      yield encoder.encode(
        sseData({
          choices: [
            {
              delta: {
                content: `\n\nDeep research gathered ${sources.size} source${sources.size === 1 ? '' : 's'} but failed while writing the report: ${safeMessage}`,
              },
              index: 0,
            },
          ],
          model: responseModel,
        }),
      );
      const cumulative = sources.toSearchResultsEvent(responseModel);
      if (cumulative) yield encoder.encode(cumulative);
      await persistRun('failed', '', safeMessage);
      yield encoder.encode(eventStream.emit({ type: 'stop', reason: 'error' }));
      yield encoder.encode(sseDone());
      return;
    }

    // Final cumulative sources + completion status.
    const cumulative = sources.toSearchResultsEvent(responseModel);
    if (cumulative) yield encoder.encode(cumulative);
    yield status('complete', 'Research complete');
    yield encoder.encode(eventStream.emit({ type: 'stop', reason: 'end-turn' }));
    yield encoder.encode(sseDone());
  } finally {
    // Abrupt teardown (client abort finalizes the generator mid-yield) skips
    // every terminal path above. Whatever the run really gathered is still
    // persisted as `interrupted` so a retry can resume from it. `persistRun`
    // is a no-op once a terminal path already wrote the row.
    if (!reportPersisted && !awaitingApproval && options.persistReport) {
      await persistRun('interrupted', '', 'Research stopped before the report was written.');
    }
    // Financial settlement and every enforced usage window belong to the
    // route's single managed-usage lifecycle. This block only preserves the
    // observed provider usage that lifecycle settles on normal completion,
    // provider error, and generator.return() cancellation.
    if (observedUsage.providerCalls === 0) {
      logger.warn(
        { provider: processed.provider, requestId: processed.requestId },
        '[research-loop] provider emitted no usage; managed settlement will use its reservation estimate',
      );
    }
  }
}
