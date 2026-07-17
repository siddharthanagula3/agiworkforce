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
 *     same normalized wire (route.ts still keeps Anthropic on the existing
 *     single-turn research path for now -- scope, not a wire limitation).
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

import { logger } from '@/lib/logger';
import { buildToolLoopStream, type ToolLoopStepSink } from './tool-loop-anthropic';
import { toolStatusEvent as loopToolStatusEvent, toolResultEvent } from './tool-loop';
import { isUrlFetchTool, executeUrlFetch } from '@/lib/url-fetch/url-fetch-tool';
import { reconcileUsage } from '@/lib/assert-quota';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import type { ProcessedRequest } from './request-processor';

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

export type ResearchPhase = 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error';

export interface ResearchLoopOptions {
  maxIterations?: number;
  maxSearches?: number;
  budgetMs?: number;
  /** Injectable clock for deterministic budget tests. */
  now?: () => number;
  /** Canonical usage accumulated across every provider call in this run. */
  usage?: ObservedProviderUsage;
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseDone(): string {
  return `data: [DONE]\n\n`;
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
  text: string;
  finishReason: string | null;
  searchEvents: number;
  hadToolCalls: boolean;
  /** Accumulated function tool_calls (only url_fetch is ever offered here). */
  toolCalls: ResearchToolCall[];
  promptTokens: number;
  completionTokens: number;
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
          if (forwardContent) yield raw.trim() + '\n\n';
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

function gatheringDirective(
  round: number,
  maxRounds: number,
  sources: SourceAggregator,
  canFetch: boolean,
): string {
  const base =
    round === 1
      ? 'Research phase, round 1: break the request into 3-5 distinct, targeted web search queries covering different angles, then run those searches now.'
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
    ' Structure it with a brief executive summary, clearly labeled sections, and a numbered Sources list.' +
    ' Inline-cite every factual claim with a bracketed number, e.g. [1], matching the numbered source list below when present.' +
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
  billing: { userId: string; token: string },
  options: ResearchLoopOptions = {},
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const responseModel = processed.requestedModel;
  const now = options.now ?? Date.now;
  const startedAt = now();

  const maxIterations =
    options.maxIterations ??
    envInt('AGI_RESEARCH_MAX_ITERATIONS', DEFAULT_RESEARCH_MAX_ITERATIONS, 2, 8);
  const maxSearches =
    options.maxSearches ??
    envInt('AGI_RESEARCH_MAX_SEARCHES', DEFAULT_RESEARCH_MAX_SEARCHES, 3, 15);
  const budgetMs =
    options.budgetMs ??
    envInt('AGI_RESEARCH_BUDGET_MS', DEFAULT_RESEARCH_BUDGET_MS, 30_000, 10 * 60_000);
  const maxGatherRounds = maxIterations - 1; // the last iteration is always synthesis

  const sources = new SourceAggregator();
  let totalSearches = 0;
  let totalFetches = 0;
  let iteration = 0;
  const observedUsage = options.usage ?? createObservedProviderUsage();

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
  ): AsyncGenerator<Uint8Array, TurnResult> {
    const stepRequest = { ...baseRequest, messages: turnMessages };
    const callsBefore = observedUsage.providerCalls;
    const stepSink: ToolLoopStepSink = {
      thinkingBlocks: [],
      text: '',
      usage: observedUsage,
    };
    const stream = await buildToolLoopStream(
      processed.provider.toLowerCase(),
      processed,
      stepRequest,
      responseModel,
      stepSink,
    );
    const gen = collectTurn(stream, sources, forwardContent);
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
            accumulateObservedProviderUsage(observedUsage, {
              inputTokens: next.value.promptTokens,
              outputTokens: next.value.completionTokens,
            });
          }
          return next.value;
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
    assistantText: string,
    turnMessages: ProcessedRequest['llmRequest']['messages'],
    roundFetchCount: { count: number },
  ): AsyncGenerator<Uint8Array> {
    turnMessages.push({
      role: 'assistant',
      content: assistantText,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })) as unknown[],
    });

    for (const call of calls) {
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
  }

  try {
    yield status('planning', 'Planning research');

    let cutShortReason: string | null = null;

    // ── Gathering rounds ──
    for (let round = 1; round <= maxGatherRounds; round++) {
      iteration = round;
      yield status(
        'searching',
        round === 1 ? 'Searching the web' : `Searching the web (round ${round})`,
      );
      yield encoder.encode(toolStatusEvent('running', responseModel, round));

      let turn: TurnResult;
      let roundSearchEvents = 0;
      try {
        // Directives ride as 'user' turns: several providers (e.g. Google)
        // only honor the FIRST system message and silently drop the rest, so
        // a trailing system directive would never reach the model.
        const turnMessages: typeof messages = [
          ...messages,
          {
            role: 'user',
            content: gatheringDirective(round, maxGatherRounds, sources, fetchAvailable),
          },
        ];
        turn = yield* runTurn(turnMessages, false);
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
          yield* runFetchCalls(turn.toolCalls, turn.text, turnMessages, roundFetchCount);
          const cumulativeAfterFetch = sources.toSearchResultsEvent(responseModel);
          if (cumulativeAfterFetch) yield encoder.encode(cumulativeAfterFetch);
          turn = yield* runTurn(turnMessages, false);
          roundSearchEvents += turn.searchEvents;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(
          { provider: processed.provider, round, error: msg },
          '[research-loop] gathering turn failed',
        );
        yield encoder.encode(toolStatusEvent('failed', responseModel, round));
        if (round === 1) {
          // Nothing gathered: surface an honest error and stop.
          yield status('error', 'Research failed before any results were gathered');
          yield encoder.encode(
            sseData({
              choices: [
                {
                  delta: {
                    content: `Deep research failed before any results were gathered: ${msg}`,
                  },
                  index: 0,
                },
              ],
              model: responseModel,
            }),
          );
          yield encoder.encode(sseDone());
          return;
        }
        // Partial material exists: keep it and synthesize what we have.
        cutShortReason = 'a web search round failed mid-run';
        break;
      }

      totalSearches += Math.max(1, roundSearchEvents);
      yield encoder.encode(toolStatusEvent('completed', responseModel, round));

      // Append the model's notes (truncated) so later turns build on them.
      const notes = stripMarkers(turn.text).slice(0, MAX_NOTE_CHARS);
      messages.push({
        role: 'assistant',
        content: notes || '(no notes recorded this round)',
      });

      const cumulative = sources.toSearchResultsEvent(responseModel);
      if (cumulative) yield encoder.encode(cumulative);
      yield status('searching', `Found ${sources.size} source${sources.size === 1 ? '' : 's'}`);

      if (turn.text.includes(READY_MARKER)) break;
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
    yield status('synthesizing', 'Writing report');
    try {
      const synthesis = yield* runTurn(
        [...messages, { role: 'user', content: synthesisDirective(sources, cutShortReason) }],
        true,
      );
      // Empty-synthesis guarantee: a run must NEVER end as a silent empty
      // message (an empty body also skips client persistence, so the whole
      // run would vanish on reload). If the model produced no report text,
      // emit an honest failure as real content and an error status.
      if (!synthesis.text.trim()) {
        logger.error(
          { provider: processed.provider, requestId: processed.requestId, sources: sources.size },
          '[research-loop] synthesis turn produced no text',
        );
        yield status('error', 'Report generation returned no text');
        yield encoder.encode(
          sseData({
            choices: [
              {
                delta: {
                  content:
                    `Deep research gathered ${sources.size} source${sources.size === 1 ? '' : 's'} across ${totalSearches} search${totalSearches === 1 ? '' : 'es'}, but the model returned an empty report.` +
                    ' Try running the research again.',
                },
                index: 0,
              },
            ],
            model: responseModel,
          }),
        );
        const cumulativeOnEmpty = sources.toSearchResultsEvent(responseModel);
        if (cumulativeOnEmpty) yield encoder.encode(cumulativeOnEmpty);
        yield encoder.encode(sseDone());
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { provider: processed.provider, error: msg },
        '[research-loop] synthesis failed',
      );
      yield status('error', 'Report generation failed');
      yield encoder.encode(
        sseData({
          choices: [
            {
              delta: {
                content: `\n\nDeep research gathered ${sources.size} source${sources.size === 1 ? '' : 's'} but failed while writing the report: ${msg}`,
              },
              index: 0,
            },
          ],
          model: responseModel,
        }),
      );
      const cumulative = sources.toSearchResultsEvent(responseModel);
      if (cumulative) yield encoder.encode(cumulative);
      yield encoder.encode(sseDone());
      return;
    }

    // Final cumulative sources + completion status.
    const cumulative = sources.toSearchResultsEvent(responseModel);
    if (cumulative) yield encoder.encode(cumulative);
    yield status('complete', 'Research complete');
    yield encoder.encode(sseDone());
  } finally {
    // Financial settlement belongs to the route's managed usage lifecycle.
    // This finally block only updates quota counters and always runs on
    // completion, provider error, and generator.return() cancellation.
    const totalTokens = observedUsage.inputTokens + observedUsage.outputTokens;
    if (observedUsage.providerCalls === 0) {
      logger.warn(
        { provider: processed.provider, requestId: processed.requestId },
        '[research-loop] provider emitted no usage; managed settlement will use its reservation estimate',
      );
    }
    if (totalTokens > 0) {
      void reconcileUsage({
        userId: billing.userId,
        token: billing.token,
        actualTokens: totalTokens,
        feature: processed.quotaFeature,
        isFlagship: processed.isFlagshipRequest,
      }).catch((err) => {
        logger.warn(
          { userId: billing.userId, error: err instanceof Error ? err.message : err },
          '[research-loop] reconcileUsage counter update failed',
        );
      });
    }
  }
}
