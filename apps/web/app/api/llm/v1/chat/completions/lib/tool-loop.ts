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
 *     dispatch through packages/providers/* adapters, sharing route.ts's
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
 *     and suspends execution. The client must call POST /api/llm/v1/chat/completions/approve
 *     to resume.
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
import type { E2BExecutor } from '@/lib/e2b/types';
import {
  snapshotSandboxFiles,
  harvestGeneratedFiles,
  type SandboxSnapshot,
  type GeneratedFileWire,
} from '@/lib/e2b/generated-files';
import type { ProcessedRequest } from './request-processor';

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

export interface ToolLoopOptions {
  /** Maximum number of model re-invocations. Default: 10. */
  maxSteps?: number;
  /** 'auto' = execute without prompting; 'manual' = gate on user approval. */
  approvalMode?: ApprovalMode;
  /** Resolved MCP tool defs to inject (fetched once by the caller). */
  mcpTools?: WebMcpToolDef[];
  /**
   * Authenticated user id — required for the generated-file harvest (files the
   * model writes in the E2B sandbox are persisted to the user's media library
   * and emitted as an `x_generated_files` delta). Without it, harvest is skipped.
   */
  userId?: string;
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
  [/\bweb_fetch|fetch_url|http_request/i, 'Fetching page'],
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
    const phrase = toolStatusPhrase(toolName);
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
 */
function toolResultEvent(
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
): Promise<{ content: string; isError: boolean }> {
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
    };
  }

  const parsed = parseQualifiedToolName(toolCall.qualifiedName);
  if (!parsed) {
    return {
      content: `Unknown tool: ${toolCall.qualifiedName}`,
      isError: true,
    };
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

  // Conversation-scoped E2B executor: resolved (created, or resumed from a paused
  // session) at most ONCE per loop invocation and reused across every execution-tool
  // call in every step of this turn, so a code context's variables/imports persist
  // instead of being torn down after each call. Cleaned up in the `finally` below --
  // paused (not killed) when `conversationId` is known so the NEXT turn's loop can
  // resume it; killed immediately otherwise (no conversation to resume into).
  const conversationId = processed.conversationId;
  let e2bExecutor: E2BExecutor | null = null;
  let e2bExecutorResolved = false;
  // Generated-file harvest state: the workspace is snapshotted once, when the
  // executor first resolves (BEFORE any execution tool runs), so the turn-end
  // diff only surfaces files created/changed THIS turn — a resumed sandbox may
  // still hold files from previous turns.
  let e2bBaseline: SandboxSnapshot | null = null;
  let executionToolRan = false;
  async function resolveE2BExecutor(): Promise<E2BExecutor | null> {
    if (!e2bExecutorResolved) {
      e2bExecutor = await getE2BExecutor(conversationId);
      e2bExecutorResolved = true;
      if (e2bExecutor) e2bBaseline = await snapshotSandboxFiles(e2bExecutor);
    }
    executionToolRan = true;
    return e2bExecutor;
  }

  /**
   * Harvest files the model created in the sandbox this turn and return the
   * SSE line announcing them, or null when there is nothing to announce.
   * Called at the terminal points of the loop, before the final [DONE].
   */
  async function harvestGeneratedFilesEvent(): Promise<SseLine | null> {
    if (!executionToolRan || !e2bExecutor || !e2bBaseline || !options.userId) return null;
    try {
      const files = await harvestGeneratedFiles({
        executor: e2bExecutor,
        baseline: e2bBaseline,
        userId: options.userId,
        model: responseModel,
      });
      return files.length > 0 ? generatedFilesEvent(files, responseModel) : null;
    } catch (err) {
      logger.warn({ err }, '[tool-loop] generated-file harvest failed; no file card emitted');
      return null;
    }
  }

  try {
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
      const stepSink: ToolLoopStepSink = { thinkingBlocks: [], text: '' };

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
        break;
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
        const filesLine = await harvestGeneratedFilesEvent();
        if (filesLine) yield encoder.encode(filesLine);
        yield encoder.encode(sseDone());
        break;
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

      // Auto mode: execute tools.
      // Partition into parallel (read-only) and serial (mutating) groups.
      const readOnly = pendingToolCalls.filter((tc) => isReadOnlyTool(tc.qualifiedName));
      const mutating = pendingToolCalls.filter((tc) => !isReadOnlyTool(tc.qualifiedName));

      // Emit "running" status for all tools. Include tc.args so the client can
      // render a syntax-highlighted Request block in ToolCallCard (detectCodeBlock).
      for (const tc of pendingToolCalls) {
        yield encoder.encode(toolStatusEvent(tc.qualifiedName, 'running', responseModel, tc.args));
      }

      // Execute read-only tools concurrently.
      const results: { tc: PendingToolCall; content: string; isError: boolean }[] = [];

      const parallelResults = await Promise.all(
        readOnly.map(async (tc) => {
          const result = await runMcpTool(tc, resolveE2BExecutor);
          return { tc, ...result };
        }),
      );
      results.push(...parallelResults);

      // Execute mutating tools serially.
      for (const tc of mutating) {
        const result = await runMcpTool(tc, resolveE2BExecutor);
        results.push({ tc, ...result });
      }

      // Emit status + result events, and append tool result messages.
      for (const { tc, content, isError } of results) {
        yield encoder.encode(
          toolStatusEvent(tc.qualifiedName, isError ? 'failed' : 'completed', responseModel),
        );
        yield encoder.encode(
          toolResultEvent(tc.id, tc.qualifiedName, content, isError, responseModel),
        );

        messages.push({
          role: 'tool',
          content,
          tool_call_id: tc.id,
        });
      }

      // Continue to next step.
    }

    if (step >= maxSteps) {
      logger.warn(
        { maxSteps, provider: processed.provider },
        '[tool-loop] max steps reached without terminal stop',
      );
      const filesLine = await harvestGeneratedFilesEvent();
      if (filesLine) yield encoder.encode(filesLine);
      yield encoder.encode(sseDone());
    }
  } finally {
    // Lifecycle cleanup: only relevant if an E2B execution tool actually ran during this
    // loop invocation. Runs on normal completion, on `return` (manual-approval suspend),
    // on `break` (provider error / terminal stop), AND on early `.return()` from the
    // caller's `cancel()` (client disconnect / abort) -- generator `finally` blocks fire
    // in all of these cases, closing the billing-leak gap of a mid-turn abort.
    if (e2bExecutor) {
      if (conversationId) {
        // Pause (not kill): stops billing while preserving sandbox + context state so
        // the NEXT turn's runToolLoop can resume it via getE2BExecutor(conversationId).
        await pauseE2BSession(conversationId);
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
