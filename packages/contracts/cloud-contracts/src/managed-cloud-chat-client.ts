import { z } from 'zod';
import { stripTrailingSlashes } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_CHAT_BASE_PATH,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  ManagedCloudConversationListQuerySchema,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudCreateConversationRequestSchema,
  ManagedCloudCreateConversationResponseSchema,
  ManagedCloudCreateMessageRequestSchema,
  ManagedCloudCreateMessageResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudDeleteMessageResponseSchema,
  ManagedCloudUpdateConversationRequestSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationMessagesPath,
  managedCloudConversationPath,
  managedCloudMessagePath,
  normalizeManagedCloudConversation,
  normalizeManagedCloudMessage,
  type ManagedCloudConversation,
  type ManagedCloudConversationHistoryStats,
  type ManagedCloudConversationListQuery,
  type ManagedCloudCreateConversationRequest,
  type ManagedCloudCreateMessageRequest,
  type ManagedCloudMessage,
  type ManagedCloudUpdateConversationRequest,
} from './conversations';

export type ManagedCloudChatHeaders = Record<string, string>;
export type ManagedCloudChatFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ManagedCloudChatClientConfig {
  baseUrl?: string;
  getAuthToken?: () => Promise<string | null>;
  decorateMutationHeaders?: (
    headers: ManagedCloudChatHeaders,
  ) => HeadersInit | Promise<HeadersInit>;
  fetchImpl?: ManagedCloudChatFetch;
}

export interface ManagedCloudConversationPage {
  conversations: ManagedCloudConversation[];
  hasMore: boolean;
  nextOffset: number;
  historyStats?: ManagedCloudConversationHistoryStats;
}

export interface ManagedCloudConversationDetail {
  conversation: ManagedCloudConversation;
  messages: ManagedCloudMessage[];
  total: number;
  hasMore: boolean;
}

export interface ManagedCloudChatRequestOptions {
  signal?: AbortSignal;
  organizationId?: string | null;
}

export interface ManagedCloudSaveMessageOptions extends ManagedCloudChatRequestOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface ManagedCloudSaveMessageResult {
  id: string;
}

export interface ManagedCloudChatClient {
  listConversations(
    query?: ManagedCloudConversationListQuery,
    options?: ManagedCloudChatRequestOptions,
  ): Promise<ManagedCloudConversationPage>;
  createConversation(
    input: ManagedCloudCreateConversationRequest,
    options?: ManagedCloudChatRequestOptions,
  ): Promise<ManagedCloudConversation>;
  getConversation(
    conversationId: string,
    query?: { limit?: number; offset?: number },
    options?: ManagedCloudChatRequestOptions,
  ): Promise<ManagedCloudConversationDetail>;
  updateConversation(
    conversationId: string,
    input: ManagedCloudUpdateConversationRequest,
    options?: ManagedCloudChatRequestOptions,
  ): Promise<ManagedCloudConversation>;
  deleteConversation(
    conversationId: string,
    options?: ManagedCloudChatRequestOptions,
  ): Promise<void>;
  saveMessage(
    conversationId: string,
    input: ManagedCloudCreateMessageRequest,
    options?: ManagedCloudSaveMessageOptions,
  ): Promise<ManagedCloudSaveMessageResult>;
  deleteMessage(
    conversationId: string,
    messageId: string,
    options?: ManagedCloudChatRequestOptions,
  ): Promise<void>;
}

const DEFAULT_SAVE_ATTEMPTS = 3;
const DEFAULT_SAVE_RETRY_DELAY_MS = 350;
const RATE_LIMITED_STATUS = 429;
const SERVER_ERROR_STATUS_FLOOR = 500;

export class ManagedCloudChatHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ManagedCloudChatHttpError';
  }
}

export class ManagedCloudChatContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedCloudChatContractError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return stripTrailingSlashes(baseUrl);
}

function withBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

async function responseError(response: Response): Promise<ManagedCloudChatHttpError> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body['error'];
  const message =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          typeof (raw as Record<string, unknown>)['message'] === 'string'
        ? ((raw as Record<string, unknown>)['message'] as string)
        : `HTTP ${response.status}`;
  return new ManagedCloudChatHttpError(`HTTP ${response.status}: ${message}`, response.status);
}

async function parseContract<T>(
  response: Response,
  schema: z.ZodType<T>,
  name: string,
): Promise<T> {
  const body = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ManagedCloudChatContractError(
      `Managed Cloud chat ${name} contract violation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('Managed Cloud chat request was aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw abortError(signal);
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return promise;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      return true;
    };
    const onAbort = () => {
      if (finish()) reject(abortError(signal));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        if (finish()) resolve(value);
      },
      (error: unknown) => {
        if (finish()) reject(error);
      },
    );
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createManagedCloudChatClient(
  config: ManagedCloudChatClientConfig = {},
): ManagedCloudChatClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function readHeaders(
    signal?: AbortSignal,
    organizationId?: string | null,
  ): Promise<ManagedCloudChatHeaders> {
    throwIfAborted(signal);
    const token = await awaitWithAbort(Promise.resolve(config.getAuthToken?.()), signal);
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(organizationId !== undefined
        ? {
            [MANAGED_CLOUD_ORGANIZATION_HEADER]:
              organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
          }
        : {}),
    };
  }

  async function mutationHeaders(
    json: boolean,
    signal?: AbortSignal,
    organizationId?: string | null,
  ): Promise<HeadersInit> {
    const headers: ManagedCloudChatHeaders = {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(await readHeaders(signal, organizationId)),
    };
    return config.decorateMutationHeaders
      ? await awaitWithAbort(Promise.resolve(config.decorateMutationHeaders(headers)), signal)
      : headers;
  }

  async function request(path: string, init: RequestInit): Promise<Response> {
    throwIfAborted(init.signal);
    const response = await fetchImpl(withBaseUrl(baseUrl, path), init);
    throwIfAborted(init.signal);
    if (!response.ok) throw await responseError(response);
    return response;
  }

  return {
    async listConversations(query = {}, options = {}) {
      const parsedQuery = ManagedCloudConversationListQuerySchema.parse(query);
      const params = new URLSearchParams();
      if (parsedQuery.q) params.set('q', parsedQuery.q);
      if (parsedQuery.limit !== undefined) params.set('limit', String(parsedQuery.limit));
      if (parsedQuery.offset !== undefined) params.set('offset', String(parsedQuery.offset));
      if (parsedQuery.includeHistoryStats) params.set('includeHistoryStats', '1');
      if (parsedQuery.archived) params.set('archived', parsedQuery.archived);
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const response = await request(`${MANAGED_CLOUD_CHAT_BASE_PATH}${suffix}`, {
        headers: await readHeaders(options.signal, options.organizationId),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const body = await parseContract(
        response,
        ManagedCloudConversationListResponseSchema,
        'list response',
      );
      return {
        conversations: body.conversations.map(normalizeManagedCloudConversation),
        hasMore: body.hasMore,
        nextOffset: body.nextOffset,
        ...(body.historyStats ? { historyStats: body.historyStats } : {}),
      };
    },

    async createConversation(input, options = {}) {
      const body = ManagedCloudCreateConversationRequestSchema.parse(input);
      const response = await request(MANAGED_CLOUD_CHAT_BASE_PATH, {
        method: 'POST',
        headers: await mutationHeaders(true, options.signal, options.organizationId),
        body: JSON.stringify(body),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const result = await parseContract(
        response,
        ManagedCloudCreateConversationResponseSchema,
        'create response',
      );
      return normalizeManagedCloudConversation(result.conversation);
    },

    async getConversation(conversationId, query = {}, options = {}) {
      const params = new URLSearchParams();
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.offset !== undefined) params.set('offset', String(query.offset));
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const response = await request(`${managedCloudConversationPath(conversationId)}${suffix}`, {
        headers: await readHeaders(options.signal, options.organizationId),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const body = await parseContract(
        response,
        ManagedCloudConversationResponseSchema,
        'read response',
      );
      return {
        conversation: normalizeManagedCloudConversation(body.conversation),
        messages: body.messages.map((message) =>
          normalizeManagedCloudMessage(message, conversationId),
        ),
        total: body.total,
        hasMore: body.hasMore,
      };
    },

    async updateConversation(conversationId, input, options = {}) {
      const body = ManagedCloudUpdateConversationRequestSchema.parse(input);
      const response = await request(managedCloudConversationPath(conversationId), {
        method: 'PUT',
        headers: await mutationHeaders(true, options.signal, options.organizationId),
        body: JSON.stringify(body),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const result = await parseContract(
        response,
        ManagedCloudUpdateConversationResponseSchema,
        'update response',
      );
      return normalizeManagedCloudConversation(result.conversation);
    },

    async deleteConversation(conversationId, options = {}) {
      const response = await request(managedCloudConversationPath(conversationId), {
        method: 'DELETE',
        headers: await mutationHeaders(false, options.signal, options.organizationId),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      await parseContract(
        response,
        ManagedCloudDeleteConversationResponseSchema,
        'delete response',
      );
    },

    async saveMessage(conversationId, input, options = {}) {
      const body = ManagedCloudCreateMessageRequestSchema.parse({ ...input, skipLlm: true });
      const attempts = options.maxAttempts ?? DEFAULT_SAVE_ATTEMPTS;
      const retryDelayMs = options.retryDelayMs ?? DEFAULT_SAVE_RETRY_DELAY_MS;
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const response = await request(managedCloudConversationMessagesPath(conversationId), {
            method: 'POST',
            headers: await mutationHeaders(true, options.signal, options.organizationId),
            body: JSON.stringify(body),
            ...(options.signal ? { signal: options.signal } : {}),
          });
          const result = await parseContract(
            response,
            ManagedCloudCreateMessageResponseSchema,
            'message create response',
          );
          const saved = result.message ?? result.userMessage;
          if (saved) return saved;
          if (body.id) return { id: body.id };
          throw new ManagedCloudChatContractError(
            'Managed Cloud chat message create response contract violation: missing message id',
          );
        } catch (error) {
          lastError = error;
          const status = error instanceof ManagedCloudChatHttpError ? error.status : null;
          // A shared per-minute limiter is the common reason a turn fails to
          // save, and it clears on its own, so it retries like a 5xx rather
          // than losing the turn on the first refusal.
          const retryable =
            !(error instanceof ManagedCloudChatContractError) &&
            (status === null ||
              status >= SERVER_ERROR_STATUS_FLOOR ||
              status === RATE_LIMITED_STATUS);
          if (!retryable || attempt >= attempts) throw error;
          await delay(retryDelayMs * attempt, options.signal);
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Failed to save cloud message');
    },

    async deleteMessage(conversationId, messageId, options = {}) {
      const response = await request(managedCloudMessagePath(conversationId, messageId), {
        method: 'DELETE',
        headers: await mutationHeaders(false, options.signal, options.organizationId),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      await parseContract(
        response,
        ManagedCloudDeleteMessageResponseSchema,
        'message delete response',
      );
    },
  };
}
