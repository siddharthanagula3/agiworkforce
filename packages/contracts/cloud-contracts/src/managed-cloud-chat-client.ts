import { z } from 'zod';
import {
  MANAGED_CLOUD_CHAT_BASE_PATH,
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
}

export interface ManagedCloudConversationDetail {
  conversation: ManagedCloudConversation;
  messages: ManagedCloudMessage[];
  total: number;
  hasMore: boolean;
}

export interface ManagedCloudSaveMessageOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface ManagedCloudSaveMessageResult {
  id: string;
}

export interface ManagedCloudChatClient {
  listConversations(
    query?: ManagedCloudConversationListQuery,
  ): Promise<ManagedCloudConversationPage>;
  createConversation(
    input: ManagedCloudCreateConversationRequest,
  ): Promise<ManagedCloudConversation>;
  getConversation(
    conversationId: string,
    query?: { limit?: number; offset?: number },
  ): Promise<ManagedCloudConversationDetail>;
  updateConversation(
    conversationId: string,
    input: ManagedCloudUpdateConversationRequest,
  ): Promise<ManagedCloudConversation>;
  deleteConversation(conversationId: string): Promise<void>;
  saveMessage(
    conversationId: string,
    input: ManagedCloudCreateMessageRequest,
    options?: ManagedCloudSaveMessageOptions,
  ): Promise<ManagedCloudSaveMessageResult>;
  deleteMessage(conversationId: string, messageId: string): Promise<void>;
}

const DEFAULT_SAVE_ATTEMPTS = 3;
const DEFAULT_SAVE_RETRY_DELAY_MS = 350;

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
  return baseUrl.replace(/\/+$/, '');
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createManagedCloudChatClient(
  config: ManagedCloudChatClientConfig = {},
): ManagedCloudChatClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function readHeaders(): Promise<ManagedCloudChatHeaders> {
    const token = await config.getAuthToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function mutationHeaders(json: boolean): Promise<HeadersInit> {
    const headers: ManagedCloudChatHeaders = {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(await readHeaders()),
    };
    return config.decorateMutationHeaders ? config.decorateMutationHeaders(headers) : headers;
  }

  async function request(path: string, init: RequestInit): Promise<Response> {
    const response = await fetchImpl(withBaseUrl(baseUrl, path), init);
    if (!response.ok) throw await responseError(response);
    return response;
  }

  return {
    async listConversations(query = {}) {
      const parsedQuery = ManagedCloudConversationListQuerySchema.parse(query);
      const params = new URLSearchParams();
      if (parsedQuery.q) params.set('q', parsedQuery.q);
      if (parsedQuery.limit !== undefined) params.set('limit', String(parsedQuery.limit));
      if (parsedQuery.offset !== undefined) params.set('offset', String(parsedQuery.offset));
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const response = await request(`${MANAGED_CLOUD_CHAT_BASE_PATH}${suffix}`, {
        headers: await readHeaders(),
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
      };
    },

    async createConversation(input) {
      const body = ManagedCloudCreateConversationRequestSchema.parse(input);
      const response = await request(MANAGED_CLOUD_CHAT_BASE_PATH, {
        method: 'POST',
        headers: await mutationHeaders(true),
        body: JSON.stringify(body),
      });
      const result = await parseContract(
        response,
        ManagedCloudCreateConversationResponseSchema,
        'create response',
      );
      return normalizeManagedCloudConversation(result.conversation);
    },

    async getConversation(conversationId, query = {}) {
      const params = new URLSearchParams();
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.offset !== undefined) params.set('offset', String(query.offset));
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const response = await request(`${managedCloudConversationPath(conversationId)}${suffix}`, {
        headers: await readHeaders(),
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

    async updateConversation(conversationId, input) {
      const body = ManagedCloudUpdateConversationRequestSchema.parse(input);
      const response = await request(managedCloudConversationPath(conversationId), {
        method: 'PUT',
        headers: await mutationHeaders(true),
        body: JSON.stringify(body),
      });
      const result = await parseContract(
        response,
        ManagedCloudUpdateConversationResponseSchema,
        'update response',
      );
      return normalizeManagedCloudConversation(result.conversation);
    },

    async deleteConversation(conversationId) {
      const response = await request(managedCloudConversationPath(conversationId), {
        method: 'DELETE',
        headers: await mutationHeaders(false),
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
            headers: await mutationHeaders(true),
            body: JSON.stringify(body),
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
          const retryable =
            !(error instanceof ManagedCloudChatContractError) && (status === null || status >= 500);
          if (!retryable || attempt >= attempts) throw error;
          await delay(retryDelayMs * attempt);
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Failed to save cloud message');
    },

    async deleteMessage(conversationId, messageId) {
      const response = await request(managedCloudMessagePath(conversationId, messageId), {
        method: 'DELETE',
        headers: await mutationHeaders(false),
      });
      await parseContract(
        response,
        ManagedCloudDeleteMessageResponseSchema,
        'message delete response',
      );
    },
  };
}
