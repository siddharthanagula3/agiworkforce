import type { RoutingTaskType } from '@agiworkforce/routing';
import {
  createMultimodalUserContent,
  getAuthToken,
  getManagedModelAccess,
  streamFreeChat,
  type FreeTrialChunk,
  type FreeTrialMessage,
  type ManagedChatStreamOptions,
  type ManagedModelAccess,
} from './freeTrialClient';
import { resolveChromeManagedChatRoute } from './managedChatRouting';
import { isFreeManagedTier } from './managedModelPicker';

const MAX_MESSAGE_CHARS = 32_000;
const MAX_PAGE_CONTEXT_CHARS = 64_000;
const MAX_SYSTEM_PROMPT_CHARS = 16_000;
const MAX_HISTORY_MESSAGES = 100;
const MAX_IDENTIFIER_CHARS = 200;
const STREAM_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const ROUTING_TASKS = new Set<RoutingTaskType>([
  'coding',
  'reasoning',
  'general',
  'agentic',
  'multimodal',
  'research',
  'computer-use',
  'image_generation',
  'creative_writing',
  'long_context',
  'simple_chat',
]);

export function createChromeManagedStreamKey(clientInstanceId: string, streamId: string): string {
  if (!STREAM_ID_PATTERN.test(clientInstanceId)) {
    throw new Error('Invalid Chrome client instance identifier.');
  }
  if (!STREAM_ID_PATTERN.test(streamId)) {
    throw new Error('Invalid Chrome stream identifier.');
  }
  return JSON.stringify([clientInstanceId, streamId]);
}

export interface ChromeManagedChatRequest {
  id: string;
  text: string;
  modelSelection?: string;
  /** Route this turn through the lowest-cost, low-latency Auto profile. */
  quickMode?: boolean;
  pageContext?: string;
  systemPrompt?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: string[];
  extendedThinking?: boolean;
  currentModelKey?: string | null;
  previousTaskType?: RoutingTaskType | null;
  signal?: AbortSignal;
}

export interface ChromeManagedRoutingResult {
  modelKey: string;
  taskType: RoutingTaskType;
  reason: string;
}

export type ChromeManagedChatResult =
  | { status: 'success'; routing: ChromeManagedRoutingResult }
  | {
      status: 'error';
      code:
        | 'invalid_request'
        | 'auth_required'
        | 'account_unavailable'
        | 'model_not_admitted'
        | 'routing_unavailable'
        | Extract<FreeTrialChunk, { type: 'error' }>['code'];
      message: string;
      routing?: ChromeManagedRoutingResult;
    };

export interface ChromeManagedChatDependencies {
  getAuthToken: typeof getAuthToken;
  getModelAccess: typeof getManagedModelAccess;
  streamChat: typeof streamFreeChat;
  onText: (text: string) => void | Promise<void>;
  onAgentEvent?: (chunk: Extract<FreeTrialChunk, { type: 'agent-event' }>) => void | Promise<void>;
  onRunReference?: (run: Extract<FreeTrialChunk, { type: 'run' }>['run']) => void | Promise<void>;
}

const DEFAULT_DEPENDENCIES: Omit<ChromeManagedChatDependencies, 'onText'> = {
  getAuthToken,
  getModelAccess: getManagedModelAccess,
  streamChat: streamFreeChat,
};

function validateRequest(request: ChromeManagedChatRequest): string | null {
  if (!STREAM_ID_PATTERN.test(request.id)) return 'Invalid stream identifier.';
  if (!request.text.trim() || request.text.length > MAX_MESSAGE_CHARS) {
    return 'Message text must be between 1 and 32,000 characters.';
  }
  if (
    request.modelSelection !== undefined &&
    (!request.modelSelection.trim() || request.modelSelection.length > MAX_IDENTIFIER_CHARS)
  ) {
    return 'Invalid model selection.';
  }
  if (request.quickMode !== undefined && typeof request.quickMode !== 'boolean') {
    return 'Invalid Quick mode value.';
  }
  if (
    request.pageContext !== undefined &&
    (typeof request.pageContext !== 'string' || request.pageContext.length > MAX_PAGE_CONTEXT_CHARS)
  ) {
    return 'Page context exceeds the allowed size.';
  }
  if (
    request.systemPrompt !== undefined &&
    (typeof request.systemPrompt !== 'string' ||
      request.systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS)
  ) {
    return 'Platform context exceeds the allowed size.';
  }
  if (
    !Array.isArray(request.conversationHistory ?? []) ||
    (request.conversationHistory?.length ?? 0) > MAX_HISTORY_MESSAGES
  ) {
    return 'Conversation history exceeds the allowed size.';
  }
  for (const message of request.conversationHistory ?? []) {
    if (
      !message ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.length > MAX_MESSAGE_CHARS
    ) {
      return 'Conversation history is malformed.';
    }
  }
  if (!Array.isArray(request.attachments ?? [])) return 'Attachments are malformed.';
  if (
    request.currentModelKey !== undefined &&
    request.currentModelKey !== null &&
    (typeof request.currentModelKey !== 'string' ||
      !request.currentModelKey.trim() ||
      request.currentModelKey.length > MAX_IDENTIFIER_CHARS)
  ) {
    return 'Current routing model is invalid.';
  }
  if (
    request.previousTaskType !== undefined &&
    request.previousTaskType !== null &&
    !ROUTING_TASKS.has(request.previousTaskType)
  ) {
    return 'Previous routing task is invalid.';
  }
  return null;
}

function createFenceNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildUserContent(text: string, pageContext?: string): string {
  if (!pageContext) return text;
  const nonce = createFenceNonce();
  return `${text}\n\n<page_context_${nonce}>\n${pageContext}\n</page_context_${nonce}>`;
}

function attachmentMime(dataUrl: string): string {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,/i.exec(dataUrl);
  return match?.[1]?.toLowerCase() ?? 'application/octet-stream';
}

function isAutoSelection(selection: string): boolean {
  return selection === 'auto' || selection.startsWith('auto-');
}

export async function executeChromeManagedChat(
  request: ChromeManagedChatRequest,
  dependencies: ChromeManagedChatDependencies,
): Promise<ChromeManagedChatResult> {
  const validationError = validateRequest(request);
  if (validationError) {
    return { status: 'error', code: 'invalid_request', message: validationError };
  }

  const userContent = buildUserContent(request.text.trim(), request.pageContext);
  let finalUserContent: FreeTrialMessage['content'] = userContent;
  try {
    if (request.attachments?.length) {
      finalUserContent = createMultimodalUserContent(userContent, request.attachments);
    }
  } catch (error) {
    return {
      status: 'error',
      code: 'invalid_request',
      message: error instanceof Error ? error.message : 'Attachments are invalid.',
    };
  }

  const token = await dependencies.getAuthToken();
  if (!token) {
    return {
      status: 'error',
      code: 'auth_required',
      message: 'Sign in to use AGI Cloud chat.',
    };
  }

  let access: ManagedModelAccess;
  try {
    access = await dependencies.getModelAccess(token, request.signal);
  } catch (error) {
    if (request.signal?.aborted) {
      return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
    }
    return {
      status: 'error',
      code:
        error instanceof Error && error.message.includes('Authentication')
          ? 'auth_required'
          : 'account_unavailable',
      message: error instanceof Error ? error.message : 'Unable to verify model access.',
    };
  }

  if (isFreeManagedTier(access.subscriptionTier)) {
    return {
      status: 'error',
      code: 'plan_required',
      message:
        'Chrome access requires a paid plan. Free chat is available on Web, Mobile, and Desktop.',
    };
  }

  // Quick is a per-turn routing override. It must not mutate the user's saved
  // picker selection, and it still passes through authenticated server
  // admission before the canonical router chooses a concrete model.
  const requestedSelection = request.modelSelection?.trim() || 'auto';
  const selection = request.quickMode === true ? 'auto-economy' : requestedSelection;
  if (
    selection !== 'auto' &&
    selection.startsWith('auto-') &&
    !access.allowedAutoModes.includes(selection)
  ) {
    return {
      status: 'error',
      code: 'model_not_admitted',
      message: 'The selected Auto profile is not available for this account.',
    };
  }
  if (!isAutoSelection(selection) && !access.modelIds.includes(selection)) {
    return {
      status: 'error',
      code: 'model_not_admitted',
      message: 'The selected model is not available for this account.',
    };
  }

  const routing = resolveChromeManagedChatRoute({
    selection,
    text: request.text,
    subscriptionTier: access.subscriptionTier,
    history: (request.conversationHistory ?? []).map((message) => ({ ...message })),
    attachments: request.attachments?.map((attachment) => ({
      mime: attachmentMime(attachment),
      type: 'image',
    })),
    currentModelKey: request.currentModelKey,
    previousTaskType: request.previousTaskType,
  });
  if (routing.status === 'unavailable') {
    return {
      status: 'error',
      code: 'routing_unavailable',
      message: routing.reasons[0] ?? 'No Managed Cloud route is available.',
    };
  }
  if (!access.modelIds.includes(routing.modelKey)) {
    return {
      status: 'error',
      code: 'model_not_admitted',
      message: 'The routed model is not available for this account.',
    };
  }

  const routingResult: ChromeManagedRoutingResult = {
    modelKey: routing.modelKey,
    taskType: routing.taskType,
    reason: routing.reason,
  };
  const messages: FreeTrialMessage[] = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
  messages.push(...(request.conversationHistory ?? []).map((message) => ({ ...message })));
  messages.push({ role: 'user', content: finalUserContent });

  const streamOptions: ManagedChatStreamOptions = {
    model: routing.modelKey,
    extendedThinking: request.extendedThinking,
    workMode: 'agiwork',
    signal: request.signal,
  };
  for await (const chunk of dependencies.streamChat(messages, token, streamOptions)) {
    if (chunk.type === 'text') {
      await dependencies.onText(chunk.text);
      continue;
    }
    if (chunk.type === 'agent-event') {
      await dependencies.onAgentEvent?.(chunk);
      continue;
    }
    if (chunk.type === 'run') {
      await dependencies.onRunReference?.(chunk.run);
      continue;
    }
    if (chunk.type === 'error') {
      return {
        status: 'error',
        code: chunk.code,
        message: chunk.message,
        routing: routingResult,
      };
    }
    return { status: 'success', routing: routingResult };
  }

  return {
    status: 'error',
    code: 'protocol_error',
    message: 'AGI Cloud closed the stream without a terminal event.',
    routing: routingResult,
  };
}

export function createChromeManagedChatDependencies(
  onText: ChromeManagedChatDependencies['onText'],
  callbacks: Pick<ChromeManagedChatDependencies, 'onAgentEvent' | 'onRunReference'> = {},
): ChromeManagedChatDependencies {
  return { ...DEFAULT_DEPENDENCIES, onText, ...callbacks };
}
