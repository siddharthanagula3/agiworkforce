/**
 * cloudStreamDeltas — shared SSE-delta sink for the desktop cloud wire
 * (`POST /api/llm/v1/chat/completions`, the same OpenAI-compatible stream
 * `apps/web/lib/hooks/useChatStream.ts` consumes).
 *
 * `WebRuntime` (the embedded/browser build's cloud runtime) and `CloudRuntime`
 * (the DCL-4 managed-cloud runtime, not yet wired into `App.tsx`) both drive
 * `sendCloudMessage` against this endpoint and must render an IDENTICAL
 * execution timeline. Before this module, `WebRuntime` implemented delta
 * parsing inline and `CloudRuntime` implemented none of it (see the module
 * doc comments on both files) — every tool_call/tool_result/search/generated-
 * file/thinking-marker event silently vanished on the CloudRuntime path.
 *
 * One sink instance is created per `sendMessage` call (it owns per-turn
 * mutable state: the streaming tool_call arg buffer, the thinking-marker
 * toggle, and the last-seen `finish_reason`) and is fed BOTH of
 * `sendCloudMessage`'s two callbacks:
 *   - `onChunk`  → plain-text SSE chunks, including the `<thinking>` /
 *     `</thinking>` sentinel markers `sendCloudMessage`'s line-parser passes
 *     through verbatim.
 *   - `onEvent`  → the raw parsed `data: {...}` JSON payload for every SSE
 *     line, so the sink can read `choices[0].delta.<key>` extension fields
 *     the plain-text path never sees.
 *
 * Wire-shape parsing goes through the shared `@agiworkforce/cloud-contracts`
 * cloud-contracts parsers (`tool-events.ts`, `generated-files.ts`) instead of
 * hand-declaring the delta shapes a second time here.
 */
import type {
  Artifact,
  GeneratedFileEntry,
  StreamEvent,
  WebSearchResult,
} from '@agiworkforce/unified-chat';
import {
  parseAgentEventDelta,
  parseGeneratedFilesDelta,
  parseSearchResultsDelta,
  parseToolApprovalRequestDelta,
  parseToolResultDelta,
  parseToolStatusDelta,
  resolveGeneratedFileUri,
} from '@agiworkforce/cloud-contracts';
import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';

interface ToolCallBufferEntry {
  id: string;
  name: string;
  argsJson: string;
}

export interface CloudStreamDeltaSink {
  /** Feed one plain-text chunk from `sendCloudMessage`'s `onChunk` callback. */
  onChunk: (text: string) => void;
  /** Feed one raw parsed SSE payload from `sendCloudMessage`'s `onEvent` callback. */
  onEvent: (payload: Record<string, unknown>) => void;
  /**
   * The OpenAI-wire `finish_reason` last seen on this turn (server tool loops
   * emit intermediate 'tool_calls' before the final 'stop'/'length'), read by
   * the caller's own `onDone` once the stream ends.
   */
  getFinishReason: () => string | undefined;
  /**
   * Classified payload from an additive `x_stream_error` delta (first seen
   * wins, though in practice the server sends it once): the provider failed
   * mid-stream after the response had already committed a 200, so this
   * turn's [DONE] still arrives normally with no other visible signal —
   * `finish_reason` alone cannot reliably carry it (see
   * packages/ai/provider-protocol's openai-wire-compat.ts and this package's
   * `hasStreamError` doc comments for why). `code`/`retryable` are present
   * when the provider adapter supplied them. Read by the caller's own
   * `onDone`, mirroring `getFinishReason`.
   */
  getStreamError: () => { message: string; code?: string; retryable?: boolean } | undefined;
  /**
   * True once an `x_tool_approval_request` delta suspended this turn. The
   * server ends the HTTP stream at suspension (no final answer yet) — the
   * caller's `onDone` still fires, so it must read this flag to decide
   * whether the turn is actually complete (persist + clear streaming state)
   * or merely paused pending a user decision (keep the assistant message
   * open for the eventual resume continuation).
   */
  isSuspended: () => boolean;
  /**
   * Assistant text streamed so far (content chunks only, thinking excluded).
   * Read at suspension to reconstruct the assistant `tool_calls` turn the
   * resume request replays (see `ToolApprovalResumeRequestSchema`).
   */
  getAccumulatedContent: () => string;
  /**
   * Every `x_tool_approval_request` seen this turn, in arrival order. A turn
   * can suspend on more than one simultaneous call — the resume request must
   * wait for and carry a decision for each.
   */
  getPendingApprovalCalls: () => {
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
  }[];
  /**
   * The real result of a completed tool call, keyed by tool_call_id, as
   * reported by an `x_tool_result` delta this turn. Read when a turn
   * suspends again on a further approval request, to replay the PRIOR
   * round's actual tool output (not a hardcoded placeholder) as the `role:
   * 'tool'` message the resume request's thread needs.
   */
  getToolResult: (toolCallId: string) => { content: string; isError: boolean } | undefined;
  /** Latest portable projection of the validated canonical activity stream. */
  getAgentActivity: () => AgentActivityState | undefined;
}

/** Extracts `{url,title,snippet,domain}` from one contract `SearchResultSource`. */
function toSearchResultItem(source: {
  url: string;
  title: string;
  encrypted_content?: string;
}): WebSearchResult['results'][number] {
  const url = source.url;
  const title = source.title || url;
  const snippet = source.encrypted_content;
  let domain: string | undefined;
  if (url) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = undefined;
    }
  }
  return { url, title, snippet, domain };
}

/**
 * Parse a `delta.x_search_results` payload into a `WebSearchResult` for the
 * `search_results` StreamEvent. Primary parsing goes through the shared
 * `parseSearchResultsDelta` contract; the raw Anthropic
 * `web_search_tool_result_error` passthrough shape is explicitly out of scope
 * for that parser (see its doc comment), so it is detected here with a
 * minimal, separate check so a failed search still surfaces as a 'failed'
 * card instead of silently disappearing.
 */
function mapSearchResultsPayload(payload: unknown): WebSearchResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  const errorShape =
    raw['content'] &&
    typeof raw['content'] === 'object' &&
    !Array.isArray(raw['content']) &&
    (raw['content'] as Record<string, unknown>)['type'] === 'web_search_tool_result_error';

  const parsed = parseSearchResultsDelta(payload);
  if (!parsed && !errorShape) return null;

  const results = (parsed?.sources ?? []).map(toSearchResultItem);
  return {
    id:
      (typeof raw['tool_use_id'] === 'string' && raw['tool_use_id']) ||
      `search-${Date.now().toString(36)}`,
    query: typeof raw['query'] === 'string' ? raw['query'] : 'Web search',
    results,
    resultCount: results.length,
    status: errorShape ? 'failed' : 'completed',
  };
}

/**
 * Parse a `delta.x_code_result` payload (whole Anthropic
 * `code_execution_tool_result` content_block) into the `code_execution_result`
 * StreamEvent's `result` shape. Mirrors `apps/web/lib/hooks/useChatStream.ts`'s
 * `currentCodeExecutionResult` extraction exactly — same `<stdout>`/`<stderr>`/
 * `<return_code>` tag parsing out of the block's text item — so cloud-mode
 * desktop renders the identical result web does, not a re-derived guess.
 */
function mapCodeExecutionResultPayload(payload: unknown): {
  stdout: string;
  stderr: string;
  returnCode: number;
  images?: Array<{ mediaType: string; data: string }>;
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const content = Array.isArray(raw['content'])
    ? (raw['content'] as Record<string, unknown>[])
    : [];

  const textItem = content.find((c) => c['type'] === 'text');
  const rawText = (textItem?.['text'] as string) || '';
  const images = content
    .filter((c) => c['type'] === 'image')
    .map((c) => {
      const src = c['source'] as Record<string, unknown> | undefined;
      return {
        mediaType: (src?.['media_type'] as string) || 'image/png',
        data: (src?.['data'] as string) || '',
      };
    })
    .filter((img) => img.data);

  const stdout = rawText.match(/<stdout>([\s\S]*?)<\/stdout>/)?.[1] ?? rawText;
  const stderr = rawText.match(/<stderr>([\s\S]*?)<\/stderr>/)?.[1] ?? '';
  const returnCode = parseInt(rawText.match(/<return_code>(\d+)<\/return_code>/)?.[1] ?? '0', 10);

  return { stdout, stderr, returnCode, images: images.length > 0 ? images : undefined };
}

export function createCloudStreamDeltaSink(
  emit: (event: StreamEvent) => void,
  apiBaseUrl: string,
  initialAgentActivity?: AgentActivityState,
): CloudStreamDeltaSink {
  const toolCallBuffer = new Map<string, ToolCallBufferEntry>();
  let inThinkingBlock = false;
  let finishReason: string | undefined;
  let streamError: { message: string; code?: string; retryable?: boolean } | undefined;
  let suspended = false;
  let accumulatedContent = '';
  let agentActivity: AgentActivityState | undefined = initialAgentActivity;
  // Deep Research status carries forward across deltas (some fields, e.g.
  // `sources`/`iteration`, are only present on SOME status updates) — mirrors
  // apps/web/lib/hooks/useChatStream.ts's currentResearch merge exactly.
  let researchStatus:
    | {
        phase: 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error';
        label?: string;
        iteration?: number;
        maxIterations?: number;
        searches?: number;
        sources?: number;
        elapsedMs?: number;
        error?: string;
      }
    | undefined;
  const pendingApprovalCalls: {
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
  }[] = [];
  // Real per-call tool output, keyed by tool_call_id, as x_tool_result deltas
  // stream by. When a turn suspends AGAIN on a further approval request, the
  // resume request must replay the PRIOR round's actual results as `role:
  // 'tool'` messages -- without this, the model only ever sees a hardcoded
  // placeholder for tools it already ran, discarding real file contents /
  // command output / search results it needs to reason about the next call.
  const toolResults = new Map<string, { content: string; isError: boolean }>();

  const onChunk = (text: string): void => {
    if (text === '<thinking>') {
      inThinkingBlock = true;
      return;
    }
    if (text === '</thinking>') {
      inThinkingBlock = false;
      return;
    }
    if (!inThinkingBlock) {
      accumulatedContent += text;
    }
    emit({ type: inThinkingBlock ? 'thinking' : 'content', content: text });
  };

  const onEvent = (payload: Record<string, unknown>): void => {
    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    const delta =
      choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? ((choices[0] as Record<string, unknown>)['delta'] as Record<string, unknown> | undefined)
        : undefined;

    // Capture the turn's finish_reason as it streams (last seen wins). Sits
    // on the choice, not the delta.
    const rawFinishReason =
      choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)['finish_reason']
        : undefined;
    if (typeof rawFinishReason === 'string' && rawFinishReason) {
      finishReason = rawFinishReason;
    }

    // Canonical managed-cloud activity. Validate at the untrusted SSE boundary
    // before either the UI or persistence layer can observe it, then maintain
    // the same portable projection Web and Mobile consume.
    const agentEnvelope = parseAgentEventDelta(delta?.['x_agent_event']);
    if (agentEnvelope) {
      agentActivity = applyAgentActivityEvent(agentActivity, agentEnvelope);
      emit({ type: 'agent_event', envelope: agentEnvelope });
    }

    // Mid-stream provider failure (additive marker — see getStreamError's
    // doc comment). Sticky: keep the FIRST payload seen, it identifies the
    // actual failure (unlike finish_reason, which legitimately changes as
    // the turn progresses). Accepts a bare string defensively too, though
    // the wire only ever sends the object.
    if (!streamError) {
      const rawStreamError = delta?.['x_stream_error'];
      if (
        rawStreamError &&
        typeof rawStreamError === 'object' &&
        typeof (rawStreamError as { message?: unknown }).message === 'string' &&
        (rawStreamError as { message: string }).message
      ) {
        const r = rawStreamError as { message: string; code?: unknown; retryable?: unknown };
        streamError = {
          message: r.message,
          ...(typeof r.code === 'string' ? { code: r.code } : {}),
          ...(typeof r.retryable === 'boolean' ? { retryable: r.retryable } : {}),
        };
      } else if (typeof rawStreamError === 'string' && rawStreamError) {
        streamError = { message: rawStreamError };
      }
    }

    // Streamed tool_calls (standard OpenAI-wire function-call deltas).
    const toolCalls = Array.isArray(delta?.['tool_calls']) ? delta['tool_calls'] : [];
    for (const entry of toolCalls) {
      if (!entry || typeof entry !== 'object') continue;

      const toolCall = entry as Record<string, unknown>;
      const functionData =
        toolCall['function'] && typeof toolCall['function'] === 'object'
          ? (toolCall['function'] as Record<string, unknown>)
          : null;
      const callId =
        (typeof toolCall['id'] === 'string' && toolCall['id']) ||
        `tool-${toolCall['index'] ?? toolCallBuffer.size}`;
      const existing = toolCallBuffer.get(callId) ?? {
        id: callId,
        name: typeof functionData?.['name'] === 'string' ? functionData['name'] : 'tool',
        argsJson: '',
      };

      const nextName =
        typeof functionData?.['name'] === 'string' && functionData['name'].length > 0
          ? functionData['name']
          : existing.name;
      const nextArgsJson =
        existing.argsJson +
        (typeof functionData?.['arguments'] === 'string' ? functionData['arguments'] : '');

      toolCallBuffer.set(callId, { id: callId, name: nextName, argsJson: nextArgsJson });

      let parsedArgs: Record<string, unknown> = {};
      if (nextArgsJson.trim().length > 0) {
        try {
          const parsedJson: unknown = JSON.parse(nextArgsJson);
          if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
            parsedArgs = parsedJson as Record<string, unknown>;
          } else {
            parsedArgs = { value: parsedJson };
          }
        } catch {
          parsedArgs = { _partial: nextArgsJson };
        }
      }

      emit({ type: 'tool_call', toolCall: { id: callId, name: nextName, args: parsedArgs } });
    }

    // Artifacts.
    const artifactPayload =
      payload['artifact'] && typeof payload['artifact'] === 'object'
        ? (payload['artifact'] as Artifact)
        : null;
    if (
      artifactPayload?.id &&
      artifactPayload?.type &&
      typeof artifactPayload.content === 'string'
    ) {
      emit({ type: 'artifact', artifact: artifactPayload });
    }

    // Web search results.
    const search = mapSearchResultsPayload(delta?.['x_search_results']);
    if (search) {
      emit({ type: 'search_results', search });
    }

    // Server-managed code execution result (Anthropic/Google native tool —
    // NOT the MCP/E2B x_tool_result path above, which is a separate wire
    // shape). Previously silently dropped here: the sink never read this
    // key at all, so a code_execution tool card set to 'running' by the
    // x_tool_status branch above never received its completion signal and
    // spun forever, with the actual stdout/stderr/images never rendered.
    const codeResult = mapCodeExecutionResultPayload(delta?.['x_code_result']);
    if (codeResult) {
      emit({ type: 'code_execution_result', result: codeResult });
      // The server NEVER sends a `x_tool_status: {status: 'completed'}` for
      // code_execution — completion is signalled exclusively by this
      // x_code_result delta (mirrors apps/web/lib/hooks/useChatStream.ts's
      // explicit `finishTool('code_execution', 'completed')` call). Resolve
      // the SAME synthetic-id card the 'executing' x_tool_status branch
      // below opened, or it is left spinning forever.
      emit({
        type: 'tool_result',
        toolCallId: 'status:code_execution',
        ...(codeResult.returnCode !== 0
          ? { error: codeResult.stderr || 'Execution failed' }
          : { result: codeResult.stdout || '' }),
      });
    }

    // Deep Research run status from managed cloud after the active runtime
    // forwards `research: true`. Local/Tauri sessions do not use this sink or
    // advertise the Research capability.
    const rawResearchStatus = delta?.['x_research_status'];
    if (rawResearchStatus && typeof rawResearchStatus === 'object') {
      const r = rawResearchStatus as Record<string, unknown>;
      const phase = r['phase'];
      if (
        phase === 'planning' ||
        phase === 'searching' ||
        phase === 'synthesizing' ||
        phase === 'complete' ||
        phase === 'error'
      ) {
        researchStatus = {
          phase,
          label: typeof r['label'] === 'string' ? r['label'] : undefined,
          iteration:
            typeof r['iteration'] === 'number' ? r['iteration'] : researchStatus?.iteration,
          maxIterations:
            typeof r['max_iterations'] === 'number'
              ? r['max_iterations']
              : researchStatus?.maxIterations,
          searches: typeof r['searches'] === 'number' ? r['searches'] : researchStatus?.searches,
          sources: typeof r['sources'] === 'number' ? r['sources'] : researchStatus?.sources,
          elapsedMs:
            typeof r['elapsed_ms'] === 'number' ? r['elapsed_ms'] : researchStatus?.elapsedMs,
          error:
            phase === 'error'
              ? typeof r['label'] === 'string'
                ? r['label']
                : 'Research run failed'
              : undefined,
        };
        emit({ type: 'research_status', status: { ...researchStatus } });
      }
    }

    // Tool status indicators (interim "searching…" / "fetching…" /
    // "executing…" / mcp running-completed-failed events). These have no
    // stable tool_call_id on the wire — synthesize one from the tool name so
    // repeated running updates coalesce onto the same card and the
    // completed/failed event resolves it, reusing the existing
    // tool_call/tool_result StreamEvent shapes instead of adding a third one.
    const toolStatus = parseToolStatusDelta(delta?.['x_tool_status']);
    if (toolStatus) {
      const syntheticId = `status:${toolStatus.name}`;
      if (toolStatus.status === 'completed' || toolStatus.status === 'failed') {
        emit({
          type: 'tool_result',
          toolCallId: syntheticId,
          ...(toolStatus.status === 'failed'
            ? { error: toolStatus.status_phrase ?? 'Tool failed' }
            : { result: toolStatus.status_phrase ?? '' }),
        });
      } else {
        // 'running' | 'searching' | 'fetching' | 'executing'
        emit({
          type: 'tool_call',
          toolCall: { id: syntheticId, name: toolStatus.name, args: toolStatus.args ?? {} },
        });
      }
    }

    // Manual tool-approval request: the server suspends the turn until every
    // pending call is decided. Surfaced as its own event (not folded into
    // tool_call/tool_result) because it needs a distinct UI affordance
    // (approve/reject) and a resume round-trip, not just a status update.
    const approvalRequest = parseToolApprovalRequestDelta(delta?.['x_tool_approval_request']);
    if (approvalRequest) {
      suspended = true;
      pendingApprovalCalls.push({
        toolCallId: approvalRequest.tool_call_id,
        name: approvalRequest.name,
        args: approvalRequest.args,
      });
      emit({
        type: 'tool_approval_request',
        toolCallId: approvalRequest.tool_call_id,
        name: approvalRequest.name,
        args: approvalRequest.args,
      });
    }

    // Platform-executed tool results (`x_tool_result`): the web tool loop
    // runs MCP/E2B tools server-side and reports completion keyed by the
    // SAME tool_call_id it forwarded in the raw `tool_calls` deltas above.
    const toolResult = parseToolResultDelta(delta?.['x_tool_result']);
    if (toolResult) {
      toolResults.set(toolResult.tool_call_id, {
        content: toolResult.content,
        isError: toolResult.is_error,
      });
      emit({
        type: 'tool_result',
        toolCallId: toolResult.tool_call_id,
        ...(toolResult.is_error ? { error: toolResult.content } : { result: toolResult.content }),
      });
    }

    // Managed-cloud sandbox files (emitted once before [DONE]).
    const generatedFiles: GeneratedFileEntry[] = parseGeneratedFilesDelta(
      delta?.['x_generated_files'],
    ).map((f) => ({
      id: f.id,
      fileName: f.file_name,
      mimeType: f.mime_type,
      uri: resolveGeneratedFileUri(f.uri, apiBaseUrl),
      byteCount: f.byte_count,
      kind: f.kind,
      ...(f.checksum_sha256 ? { checksumSha256: f.checksum_sha256 } : {}),
      surface: f.surface,
      previewable: f.previewable,
    }));
    if (generatedFiles.length > 0) {
      emit({ type: 'generated_files', files: generatedFiles });
    }
  };

  return {
    onChunk,
    onEvent,
    getFinishReason: () => finishReason,
    getStreamError: () => streamError,
    isSuspended: () => suspended,
    getAccumulatedContent: () => accumulatedContent,
    getPendingApprovalCalls: () => [...pendingApprovalCalls],
    getToolResult: (toolCallId) => toolResults.get(toolCallId),
    getAgentActivity: () => agentActivity,
  };
}
