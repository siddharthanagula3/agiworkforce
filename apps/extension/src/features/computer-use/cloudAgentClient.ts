import { getBrowserToolDefinitions } from './browserToolDefinitions';
import type { ToolDefinition } from './browserToolDefinitions';
import { readCompleteToolCalls, readToolHandoff, type ToolCall } from './toolHandoff';
export type { ToolCall } from './toolHandoff';
export { BROWSER_TOOL_DEFINITIONS, type ToolDefinition } from './browserToolDefinitions';
import { ServerSentEventDecoder } from '@agiworkforce/client-runtime';
import { validateGatewayUrl } from '../../background/policy';
import {
  getAuthToken,
  readBoundedErrorBody,
  type ManagedModelAccess,
  MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS,
  MANAGED_CHAT_DEFAULT_TIMEOUT_MS,
} from '../cloud-bridge/freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';
import { ThinkingTagSplitter } from '@agiworkforce/provider-protocol/thinking-tag-splitter';
import { configuredAgiWebOrigin } from '../../lib/webOrigin';
import {
  AgentEventSchema,
  parseAgentEventDelta,
  ToolApprovalResumeErrorResponseSchema,
  type ToolApprovalResumeErrorResponse,
} from '@agiworkforce/cloud-contracts';
import { scanSecrets } from '@agiworkforce/utils/logger';
import { resolveAutoRoute } from '@agiworkforce/routing';

export { getAuthToken };

import {
  canAccessModelForSubscriptionTier,
  classifyManagedQuotaErrorCode,
  getModelMetadataById,
  getRoutingSlotModel,
  isAutoModeModelId,
  isManagedTrafficPermitted,
  isModelLive,
} from '@agiworkforce/types';

export const COMPUTER_USE_MODEL: string = getRoutingSlotModel('browser_dom');

export function resolveManagedComputerUseModel(
  access: Pick<ManagedModelAccess, 'subscriptionTier' | 'modelIds' | 'allowedAutoModes'>,
  selection: string = 'auto',
): string {
  const requestedSelection = selection.trim();
  if (
    isAutoModeModelId(requestedSelection) &&
    requestedSelection !== 'auto' &&
    !access.allowedAutoModes.includes(requestedSelection)
  ) {
    throw new Error('The selected Auto profile is not available for this account.');
  }
  let modelId = requestedSelection;
  if (isAutoModeModelId(requestedSelection)) {
    if (access.modelIds.length === 0)
      throw new Error('No models are available for browser actions on this account.');
    const route = resolveAutoRoute({
      selection: requestedSelection,
      taskType: 'computer-use',
      subscriptionTier: access.subscriptionTier,
      trustMode: 'managed_cloud',
      runtimeProfileId: 'chrome/managed-browser-task',
      requiredCapabilities: ['imageInput', 'functionCalling', 'streaming'],
      organizationPolicy: {
        allowedProviders: [],
        blockedProviders: [],
        allowedModels: [...access.modelIds],
        blockedModels: [],
      },
    });
    if (route.status !== 'selected')
      throw new Error('The selected Auto profile has no admitted browser model for this account.');
    modelId = route.modelKey;
  }
  const metadata = getModelMetadataById(modelId);
  if (
    !metadata ||
    !isModelLive(metadata) ||
    metadata.status === 'deprecated' ||
    !isManagedTrafficPermitted(metadata.id)
  ) {
    throw new Error('The selected model is unavailable for Managed Cloud browser actions.');
  }
  if (
    !access.modelIds.includes(metadata.id) ||
    !canAccessModelForSubscriptionTier(metadata.id, access.subscriptionTier)
  ) {
    throw new Error('The selected model is not available for browser actions on this account.');
  }
  if (
    !metadata.capabilities.tools ||
    !metadata.capabilities.vision ||
    !metadata.capabilities.streaming
  ) {
    throw new Error(`${metadata.name} does not support browser tools, screenshots, and streaming.`);
  }
  return metadata.id;
}

export const DEFAULT_GATEWAY_BASE = configuredAgiWebOrigin() ?? '';

const GATEWAY_URL_OVERRIDE_KEY = 'agi_gateway_url';
const COMPUTER_USE_MAX_SSE_FRAME_CHARS = 1_048_576;

export interface TextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
      >;
  tool_call_id?: string;
  name?: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

export type AgentMessage = TextMessage | AssistantMessage;

export interface CloudAgentResponse {
  message: AssistantMessage;
  isDone: boolean;
  tokensUsed: number;
}

export class CloudAgentGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CloudAgentGatewayError';
  }
}

function publicGatewayMessage(message: string | undefined): string | null {
  const text = message?.trim();
  if (
    !text ||
    text.length > 300 ||
    /[\r\n]|^[{[]|<[^>]+>|\/(?:Users|home|private|var|tmp)\/|\b(?:TypeError|ReferenceError|SyntaxError):|\bat\s+\S+:\d+:\d+/.test(
      text,
    ) ||
    scanSecrets(text).length > 0
  )
    return null;
  return text;
}

function streamingGatewayFailure(raw: unknown, status: number): CloudAgentGatewayError {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const parsed = AgentEventSchema.safeParse({ ...record, type: 'error' });
  const event = parsed.success && parsed.data.type === 'error' ? parsed.data : undefined;
  const code = publicGatewayMessage(event?.code) ?? undefined;
  return new CloudAgentGatewayError(
    classifyManagedQuotaErrorCode(code)?.reason ??
      publicGatewayMessage(event?.message) ??
      'AGI Cloud request failed while streaming. Try again.',
    status,
    code,
  );
}

function invalidBrowserAction(status: number): never {
  throw new CloudAgentGatewayError(
    'AGI Cloud returned an invalid browser action. Please try again.',
    status,
    'protocol_error',
  );
}

function mergeToolCallDelta(acc: Map<number, ToolCall>, delta: unknown[], status: number): void {
  for (const raw of delta) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalidBrowserAction(status);
    const part = raw as Record<string, unknown>;
    const idx = part['index'];
    const id = part['id'];
    const type = part['type'];
    const fn = part['function'];
    if (
      typeof idx !== 'number' ||
      !Number.isSafeInteger(idx) ||
      idx < 0 ||
      (id !== undefined && typeof id !== 'string') ||
      (type !== undefined && type !== 'function') ||
      (fn !== undefined && (!fn || typeof fn !== 'object' || Array.isArray(fn)))
    )
      invalidBrowserAction(status);
    const functionDelta = fn as Record<string, unknown> | undefined;
    const name = functionDelta?.['name'];
    const args = functionDelta?.['arguments'];
    if (
      (name !== undefined && typeof name !== 'string') ||
      (args !== undefined && typeof args !== 'string')
    )
      invalidBrowserAction(status);
    let entry = acc.get(idx);
    if (!entry) {
      entry = { id: '', type: 'function', function: { name: '', arguments: '' } };
      acc.set(idx, entry);
    }
    if (typeof id === 'string') entry.id += id;
    if (typeof name === 'string') entry.function.name += name;
    if (typeof args === 'string') entry.function.arguments += args;
  }
}

function completeToolCalls(
  calls: unknown,
  ids: unknown,
  status: number,
  tools: readonly ToolDefinition[],
): ToolCall[] {
  return readCompleteToolCalls(calls, ids, tools) ?? invalidBrowserAction(status);
}

/**
 * Call the AGI Cloud gateway with a message history and tool definitions.
 * Streams the response and returns the fully-assembled CloudAgentResponse.
 *
 * @param messages  Full conversation history including the new user turn.
 * @param token     Bearer token (from getAuthToken()).
 * @param gatewayBase  Gateway origin (default https://api.agiworkforce.com).
 */
export async function callCloud(
  messages: AgentMessage[],
  token: string,
  gatewayBase: string = DEFAULT_GATEWAY_BASE,
  signal?: AbortSignal,
  model: string = COMPUTER_USE_MODEL,
  tools: readonly ToolDefinition[] = getBrowserToolDefinitions(false),
): Promise<CloudAgentResponse> {
  const controller = new AbortController();
  const cancel = (): void => controller.abort(signal?.reason);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const resetTimeout = (): void => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      controller.abort(
        new CloudAgentGatewayError(
          'AGI Cloud browser response timed out. Try again.',
          0,
          'timeout',
        ),
      );
    }, MANAGED_CHAT_DEFAULT_TIMEOUT_MS);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  resetTimeout();
  try {
    return await callCloudRequest(
      messages,
      token,
      gatewayBase,
      controller.signal,
      model,
      tools,
      resetTimeout,
    );
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error)
      throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

async function callCloudRequest(
  messages: AgentMessage[],
  token: string,
  gatewayBase: string,
  signal: AbortSignal,
  model: string,
  tools: readonly ToolDefinition[],
  resetTimeout: () => void,
): Promise<CloudAgentResponse> {
  const validatedBase = validateGatewayUrl(gatewayBase);
  if (!validatedBase) {
    throw new Error(`callCloud: gateway URL not in allowlist: ${gatewayBase}`);
  }

  const endpoint = `${validatedBase}/api/llm/v1/chat/completions`;

  const body = JSON.stringify({
    model,
    messages,
    tools,
    tool_choice: 'auto',
    stream: true,
    max_tokens: 2048,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
      'Idempotency-Key': `cu:${crypto.randomUUID()}`,
      'x-agi-managed-compute-beta': '1',
    },
    body,
    signal,
  });

  if (!response.ok) {
    const errText = await readBoundedErrorBody(response);
    let gatewayError: ToolApprovalResumeErrorResponse['error'] | undefined;
    try {
      const parsed = ToolApprovalResumeErrorResponseSchema.safeParse(JSON.parse(errText));
      if (parsed.success) gatewayError = parsed.data.error;
    } catch {
      gatewayError = undefined;
    }
    if (
      response.status === 403 &&
      (errText.includes('public_launch_blocked') ||
        errText.includes('managed_compute_private_beta') ||
        errText.includes('not_private_beta'))
    ) {
      throw new CloudAgentGatewayError(
        'AGI Cloud browser actions are unavailable for this account right now.',
        response.status,
        gatewayError?.code,
      );
    }
    if (response.status === 401) {
      throw new CloudAgentGatewayError(
        'Sign in to AGI Cloud again from the extension drawer.',
        response.status,
        gatewayError?.code,
      );
    }
    const quota = classifyManagedQuotaErrorCode(gatewayError?.code);
    const fallback =
      response.status === 429
        ? 'AGI Cloud cannot accept this request right now. Check your usage or try again later.'
        : response.status === 403
          ? 'AGI Cloud browser actions are not available for this account.'
          : 'AGI Cloud is temporarily unavailable. Try again later.';
    throw new CloudAgentGatewayError(
      quota?.reason ?? publicGatewayMessage(gatewayError?.message) ?? fallback,
      response.status,
      gatewayError?.code,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('callCloud: response body is not readable');

  const cancelReader = (): void => {
    void reader.cancel(signal?.reason).catch(() => {
      // Fetch abort and stream cancellation can race; either one is sufficient.
    });
  };
  signal?.addEventListener('abort', cancelReader, { once: true });

  const decoder = new TextDecoder();
  const sseDecoder = new ServerSentEventDecoder(COMPUTER_USE_MAX_SSE_FRAME_CHARS);
  let textContent = '';
  const contentSplitter = new ThinkingTagSplitter();
  const toolCallsAcc = new Map<number, ToolCall>();
  let toolHandoff: ToolCall[] | null = null;
  let isDone = false;
  let tokensUsed = 0;
  let streamedCharacters = 0;

  const consumeSseData = (data: string): void => {
    streamedCharacters += data.length;
    if (streamedCharacters > MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS)
      throw new CloudAgentGatewayError(
        'AGI Cloud returned too much browser-action data.',
        response.status,
        'protocol_error',
      );
    if (data === '[DONE]') {
      isDone = true;
      return;
    }

    let parsed: {
      error?: unknown;
      choices?: Array<{
        finish_reason?: string | null;
        delta?: {
          content?: string | null;
          x_stream_error?: unknown;
          x_agent_event?: unknown;
          x_tool_handoff?: unknown;
          tool_calls?: Array<{
            index: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    try {
      parsed = JSON.parse(data) as typeof parsed;
    } catch {
      return;
    }

    if (parsed?.error !== undefined) {
      throw streamingGatewayFailure(parsed.error, response.status);
    }

    if (parsed.usage?.total_tokens) {
      tokensUsed = parsed.usage.total_tokens;
    } else if (
      parsed.usage?.prompt_tokens !== undefined &&
      parsed.usage?.completion_tokens !== undefined
    ) {
      tokensUsed = (parsed.usage.prompt_tokens ?? 0) + (parsed.usage.completion_tokens ?? 0);
    }

    const choice = parsed.choices?.[0];
    if (!choice) return;

    const delta = choice.delta;
    if (delta?.x_stream_error !== undefined && delta.x_stream_error !== null) {
      throw streamingGatewayFailure(delta.x_stream_error, response.status);
    }
    const agentEvent = parseAgentEventDelta(delta?.x_agent_event)?.event;
    if (agentEvent?.type === 'error') {
      throw streamingGatewayFailure(agentEvent, response.status);
    }
    if (
      choice.finish_reason === 'error' ||
      (agentEvent?.type === 'stop' && agentEvent.reason === 'error')
    ) {
      throw streamingGatewayFailure(undefined, response.status);
    }
    if (
      choice.finish_reason !== undefined &&
      choice.finish_reason !== null &&
      choice.finish_reason !== 'stop' &&
      choice.finish_reason !== 'tool_calls'
    )
      throw new CloudAgentGatewayError(
        'AGI Cloud could not complete the browser response. No partial action was executed.',
        response.status,
        'protocol_error',
      );

    if (choice.finish_reason === 'stop' && !toolHandoff) isDone = true;

    if (!delta) {
      if (choice.finish_reason === 'stop' && !toolHandoff) toolCallsAcc.clear();
      return;
    }

    if (typeof delta.content === 'string') {
      for (const part of contentSplitter.push(delta.content)) {
        if (part.type === 'text') textContent += part.text;
      }
    }
    if (delta.tool_calls !== undefined && !Array.isArray(delta.tool_calls)) {
      invalidBrowserAction(response.status);
    }
    if (delta.x_tool_handoff !== undefined) {
      const snapshot =
        readToolHandoff(delta.x_tool_handoff, delta.tool_calls, choice.finish_reason, tools) ??
        invalidBrowserAction(response.status);
      if (toolHandoff && JSON.stringify(toolHandoff) !== JSON.stringify(snapshot)) {
        throw new CloudAgentGatewayError(
          'AGI Cloud returned conflicting browser actions. Please try again.',
          response.status,
          'protocol_error',
        );
      }
      toolHandoff = snapshot;
      toolCallsAcc.clear();
      snapshot.forEach((call, index) => toolCallsAcc.set(index, call));
    } else if (Array.isArray(delta.tool_calls)) {
      if (toolHandoff) {
        throw new CloudAgentGatewayError(
          'AGI Cloud changed a browser action after it was complete. Please try again.',
          response.status,
          'protocol_error',
        );
      }
      mergeToolCallDelta(toolCallsAcc, delta.tool_calls, response.status);
    }
    if (choice.finish_reason === 'stop' && !toolHandoff) toolCallsAcc.clear();
  };

  try {
    while (true) {
      if (signal?.aborted) {
        if (signal.reason instanceof Error) throw signal.reason;
        throw new DOMException('Computer-use cloud request was cancelled', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (signal?.aborted) {
        if (signal.reason instanceof Error) throw signal.reason;
        throw new DOMException('Computer-use cloud request was cancelled', 'AbortError');
      }
      if (done) break;
      if (value.length > 0) resetTimeout();

      for (const event of sseDecoder.push(decoder.decode(value, { stream: true }))) {
        consumeSseData(event.data);
        if (isDone) break;
      }

      if (isDone) break;
    }

    if (!isDone) {
      const trailingText = decoder.decode();
      if (trailingText) {
        for (const event of sseDecoder.push(trailingText)) {
          consumeSseData(event.data);
          if (isDone) break;
        }
      }
    }

    if (!isDone) {
      const finished = sseDecoder.finish();
      for (const event of finished.events) {
        consumeSseData(event.data);
        if (isDone) break;
      }
      // An event without its terminating blank line is incomplete by SSE rules
      // and is deliberately discarded rather than interpreted as valid output.
    }
    if (!isDone)
      throw new CloudAgentGatewayError(
        'AGI Cloud disconnected before completing the browser response. No partial action was executed.',
        response.status,
        'protocol_error',
      );
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  for (const part of contentSplitter.flush(true)) {
    if (part.type === 'text') textContent += part.text;
  }
  contentSplitter.closeThinking();
  const message: AssistantMessage = {
    role: 'assistant',
    content: textContent || null,
  };
  if (toolCallsAcc.size > 0) {
    const calls = Array.from(toolCallsAcc.entries())
      .sort(([first], [second]) => first - second)
      .map(([, call], index) => ({ index, ...call }));
    message.tool_calls = completeToolCalls(
      calls,
      calls.map((call) => call.id),
      response.status,
      tools,
    );
  }

  return { message, isDone, tokensUsed };
}

export async function resolveGatewayBase(): Promise<string> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get([GATEWAY_URL_OVERRIDE_KEY]);
      const override = result[GATEWAY_URL_OVERRIDE_KEY];
      if (typeof override === 'string') {
        const validated = validateGatewayUrl(override);
        if (validated) return validated;
      }
    }
  } catch {
    /* noop */
  }
  return DEFAULT_GATEWAY_BASE;
}
