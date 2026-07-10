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
 *     Wave 2, task #34): packages/providers adapters via ADAPTER_PROVIDERS +
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
import { buildToolLoopStream } from './tool-loop-anthropic';
import { CreditService } from '@/lib/services/credit-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { reconcileUsage } from '@/lib/assert-quota';
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

interface TurnResult {
  text: string;
  finishReason: string | null;
  searchEvents: number;
  hadToolCalls: boolean;
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

        // Function tool_calls: research turns do not execute client/MCP tools.
        if (Array.isArray(delta?.['tool_calls']) && (delta['tool_calls'] as unknown[]).length > 0) {
          hadToolCalls = true;
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

  return { text, finishReason, searchEvents, hadToolCalls, promptTokens, completionTokens };
}

// ─── Directives ───────────────────────────────────────────────────────────────

function gatheringDirective(round: number, maxRounds: number, sources: SourceAggregator): string {
  const base =
    round === 1
      ? 'Research phase, round 1: break the request into 3-5 distinct, targeted web search queries covering different angles, then run those searches now.'
      : `Research phase, round ${round} of up to ${maxRounds}: review your notes so far, identify the biggest remaining gaps or unverified claims, and run more targeted web searches to close them.`;
  const sourceNote =
    sources.size > 0
      ? ` You have collected ${sources.size} source${sources.size === 1 ? '' : 's'} so far.`
      : '';
  return (
    base +
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
 * Billing: usage is accumulated across ALL turns and reconciled against the
 * single-turn reservation in a finally block, so cancellation mid-run still
 * settles the credits actually consumed.
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
  let iteration = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  // Strip client-custom function tools: research turns only use provider-native
  // web search (nothing in this loop executes function tool calls).
  const nativeTools = (processed.llmRequest.tools ?? []).filter(
    (t) => !(t && typeof t === 'object' && 'function' in (t as Record<string, unknown>)),
  );
  const baseRequest = {
    ...processed.llmRequest,
    tools: nativeTools.length > 0 ? nativeTools : undefined,
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
    const stream = await buildToolLoopStream(
      processed.provider.toLowerCase(),
      processed,
      stepRequest,
      responseModel,
    );
    const gen = collectTurn(stream, sources, forwardContent);
    try {
      while (true) {
        const next = await gen.next();
        if (next.done) {
          totalPromptTokens += next.value.promptTokens;
          totalCompletionTokens += next.value.completionTokens;
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
      try {
        // Directives ride as 'user' turns: several providers (e.g. Google)
        // only honor the FIRST system message and silently drop the rest, so
        // a trailing system directive would never reach the model.
        turn = yield* runTurn(
          [
            ...messages,
            { role: 'user', content: gatheringDirective(round, maxGatherRounds, sources) },
          ],
          false,
        );
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

      totalSearches += Math.max(1, turn.searchEvents);
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
      yield* runTurn(
        [...messages, { role: 'user', content: synthesisDirective(sources, cutShortReason) }],
        true,
      );
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
    // Billing reconciliation runs whether the run completed, errored, or was
    // cancelled (generator.return on client abort) -- multi-turn usage must be
    // settled against the single-turn reservation. Usage is read from the
    // trailing usage-only wire event, which OpenAIWireAssembler emits only in
    // 'openai-passthrough' wireMode; 'legacy-web' providers (google/anthropic)
    // surface no usage on this wire, so their runs keep the upfront
    // reservation un-reconciled -- same disclosed gap as the agentic tool
    // loop (tool-loop.ts bills reservation-only), logged below for visibility.
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    if (totalTokens === 0) {
      logger.warn(
        { provider: processed.provider, requestId: processed.requestId },
        '[research-loop] no usage observed on wire; skipping reconciliation (reservation stands)',
      );
    }
    if (totalTokens > 0) {
      try {
        const actualCostCents = LLMCostCalculator.calculateCost(
          processed.provider,
          processed.chatRequest.model,
          {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens,
          },
        );
        const costDifference = actualCostCents - processed.estimatedCostCents;
        if (costDifference !== 0) {
          const reconciliationKey = CreditService.generateIdempotencyKey(
            billing.userId,
            'reconciliation',
            processed.requestId,
          );
          await CreditService.deductCredits(
            billing.userId,
            costDifference,
            `Credit adjustment (research): ${processed.provider}/${processed.chatRequest.model}`,
            {
              provider: processed.provider,
              model: processed.chatRequest.model,
              type: 'research_reconciliation',
              estimatedCostCents: processed.estimatedCostCents,
              actualCostCents,
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens,
              requestId: processed.requestId,
            },
            reconciliationKey,
          );
        }
      } catch (reconciliationError) {
        logger.error(
          {
            error: reconciliationError,
            userId: billing.userId,
            requestId: processed.requestId,
            totalPromptTokens,
            totalCompletionTokens,
          },
          'CRITICAL: research credit reconciliation failed - may require manual adjustment',
        );
      }
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
