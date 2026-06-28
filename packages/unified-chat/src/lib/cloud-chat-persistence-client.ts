/**
 * Cloud Chat Persistence Client
 *
 * Framework-agnostic HTTP client for the managed-cloud chat persistence API
 * (`/api/chat/conversations*`). Extracted from the web-only hook
 * `apps/web/features/chat/hooks/use-chat-persistence.ts` so that every surface
 * that talks to the shared cloud backend (web today; desktop next) reuses one
 * client with one normalization path.
 *
 * Design notes:
 * - NO React, Next, sonner, or `@/` web-alias imports. This module is pure
 *   transport + DTO normalization. UI concerns (toasts, React state, the
 *   mission-store message restore, auto-save) stay in the surface adapter.
 * - `baseUrl` defaults to `''` (relative paths) so the web call sites are
 *   byte-identical to the pre-extraction relative `/api/chat/conversations`
 *   requests. Desktop passes an absolute origin (e.g. `https://agiworkforce.com`).
 * - `fetchImpl` is the egress seam: web passes the global `fetch`; desktop will
 *   later pass its `guardedFetch` so Cloud-mode requests go through the egress
 *   guard (DCL-3).
 * - `getAuthToken` injects the `Authorization: Bearer <token>` header.
 * - `decorateHeaders` lets the surface add transport headers it owns (web passes
 *   its CSRF `addCsrfHeaders`; desktop won't need CSRF). It is applied only to
 *   mutating requests (POST/PUT/DELETE), matching the original web hook, where
 *   read requests (GET) carried no CSRF header.
 *
 * @module cloud-chat-persistence-client
 */

/** Conversation mode as stored by the cloud backend. */
export type CloudConversationMode = 'mission' | 'chat';

/** Normalized conversation metadata. */
export interface CloudConversationMetadata {
  messageCount: number;
  agentsInvolved: string[];
  lastActivity: Date;
}

/**
 * Normalized conversation DTO returned by the client. Raw snake_case API fields
 * (`user_id`, `created_at`, ...) are mapped here once so each surface consumes a
 * stable shape. This is structurally identical to the web hook's `ChatSession`,
 * so the adapter can assign it directly.
 */
export interface CloudConversation {
  id: string;
  userId: string;
  title: string;
  mode: CloudConversationMode;
  createdAt: Date;
  updatedAt: Date;
  metadata: CloudConversationMetadata;
}

/** Raw, un-normalized message record as returned by the API (passthrough). */
export type CloudConversationMessageRaw = Record<string, unknown>;

/** Result of fetching a single conversation: the conversation plus raw messages. */
export interface CloudConversationWithMessages {
  conversation: CloudConversation;
  /**
   * Raw message records, passed through un-normalized. Message normalization is
   * surface-specific (the web hook maps these into mission-store messages), so
   * the client does not touch them.
   */
  messages: CloudConversationMessageRaw[];
}

/** Headers map used by the client when building requests. */
export type CloudChatHeaders = Record<string, string>;

/**
 * Minimal `fetch` shape the client depends on: it only ever calls with a string
 * URL. Typing the seam this narrowly lets surfaces pass their own fetch
 * (the global `fetch`, or desktop's `guardedFetch`) without env-specific
 * `RequestInfo`/`URL` type clashes between lib.dom and host typings.
 */
export type CloudChatFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Configuration for {@link createCloudChatPersistenceClient}. */
export interface CloudChatPersistenceClientConfig {
  /**
   * Base URL prefix for endpoints. Defaults to `''` (relative paths, web).
   * Desktop passes an absolute origin such as `https://agiworkforce.com`.
   * A trailing slash is tolerated and stripped.
   */
  baseUrl?: string;
  /** Returns the current auth token, or `null` when unauthenticated. */
  getAuthToken?: () => Promise<string | null>;
  /**
   * Decorates the headers of mutating requests (POST/PUT/DELETE). Web passes its
   * CSRF `addCsrfHeaders` (which accepts/returns the broader `HeadersInit`).
   * Read requests (GET) are not decorated.
   */
  decorateHeaders?: (headers: CloudChatHeaders) => HeadersInit | Promise<HeadersInit>;
  /**
   * The `fetch` implementation to use. Defaults to `globalThis.fetch`. Desktop
   * passes `guardedFetch` so requests route through the egress guard.
   */
  fetchImpl?: CloudChatFetch;
}

/** Body for creating a conversation. */
export interface CreateConversationInput {
  title: string;
  mode: CloudConversationMode;
}

/** The client surface returned by {@link createCloudChatPersistenceClient}. */
export interface CloudChatPersistenceClient {
  /** POST /api/chat/conversations */
  createConversation(input: CreateConversationInput): Promise<CloudConversation>;
  /** GET /api/chat/conversations/:id */
  getConversation(id: string): Promise<CloudConversationWithMessages>;
  /** PUT /api/chat/conversations/:id */
  updateConversationTitle(id: string, title: string): Promise<void>;
  /** DELETE /api/chat/conversations/:id */
  deleteConversation(id: string): Promise<void>;
  /** GET /api/chat/conversations */
  listConversations(): Promise<CloudConversation[]>;
}

/**
 * Map a raw API conversation record into the normalized {@link CloudConversation}.
 * This mirrors the original web-hook mapping exactly (same defaults), so behavior
 * is unchanged. Exported so other surfaces and tests can reuse it.
 */
export function mapRawConversation(raw: Record<string, unknown>): CloudConversation {
  return {
    id: raw['id'] as string,
    userId: raw['user_id'] as string,
    title: (raw['title'] as string) ?? 'Untitled',
    mode: (raw['mode'] as CloudConversationMode) || 'chat',
    createdAt: new Date((raw['created_at'] as string) ?? Date.now()),
    updatedAt: new Date((raw['updated_at'] as string) ?? Date.now()),
    metadata: (raw['metadata'] as CloudConversationMetadata) ?? {
      messageCount: 0,
      agentsInvolved: [],
      lastActivity: new Date(),
    },
  };
}

/** Normalize the configured base URL: strip a single trailing slash. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * Throw an Error carrying the server `error` field, or `HTTP <status>` when the
 * body has no `error`. Matches the original web-hook error handling.
 */
async function throwForResponse(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `HTTP ${res.status}`);
}

/**
 * Create a cloud chat persistence client.
 *
 * @example
 * ```ts
 * const client = createCloudChatPersistenceClient({
 *   baseUrl: '',
 *   getAuthToken,
 *   decorateHeaders: addCsrfHeaders,
 *   fetchImpl: fetch,
 * });
 * ```
 */
export function createCloudChatPersistenceClient(
  config: CloudChatPersistenceClientConfig = {},
): CloudChatPersistenceClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const getAuthToken = config.getAuthToken;
  const decorateHeaders = config.decorateHeaders;
  // Bind the default fetch to globalThis to avoid an Illegal invocation when the
  // global `fetch` relies on its receiver. A surface-provided fetchImpl is used
  // as-is (it controls its own binding).
  const fetchImpl: CloudChatFetch = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  const endpoint = (path = ''): string => `${baseUrl}/api/chat/conversations${path}`;

  async function authHeader(): Promise<CloudChatHeaders> {
    const token = getAuthToken ? await getAuthToken() : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /** Headers for read (GET) requests: auth only, no CSRF/decoration. */
  async function readHeaders(): Promise<CloudChatHeaders> {
    return authHeader();
  }

  /**
   * Headers for mutating requests. Includes `Content-Type: application/json`
   * when `json` is true, then auth, then surface decoration (CSRF).
   */
  async function writeHeaders(json: boolean): Promise<HeadersInit> {
    const base: CloudChatHeaders = {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeader()),
    };
    return decorateHeaders ? decorateHeaders(base) : base;
  }

  return {
    async createConversation(input: CreateConversationInput): Promise<CloudConversation> {
      const res = await fetchImpl(endpoint(), {
        method: 'POST',
        headers: await writeHeaders(true),
        body: JSON.stringify({ title: input.title, mode: input.mode }),
      });
      if (!res.ok) await throwForResponse(res);
      const result = (await res.json()) as { conversation: Record<string, unknown> };
      return mapRawConversation(result.conversation);
    },

    async getConversation(id: string): Promise<CloudConversationWithMessages> {
      const res = await fetchImpl(endpoint(`/${id}`), {
        headers: await readHeaders(),
      });
      if (!res.ok) await throwForResponse(res);
      const result = (await res.json()) as {
        conversation: Record<string, unknown>;
        messages: CloudConversationMessageRaw[];
      };
      return {
        conversation: mapRawConversation(result.conversation),
        messages: result.messages ?? [],
      };
    },

    async updateConversationTitle(id: string, title: string): Promise<void> {
      const res = await fetchImpl(endpoint(`/${id}`), {
        method: 'PUT',
        headers: await writeHeaders(true),
        body: JSON.stringify({ title }),
      });
      if (!res.ok) await throwForResponse(res);
    },

    async deleteConversation(id: string): Promise<void> {
      const res = await fetchImpl(endpoint(`/${id}`), {
        method: 'DELETE',
        headers: await writeHeaders(false),
      });
      if (!res.ok) await throwForResponse(res);
    },

    async listConversations(): Promise<CloudConversation[]> {
      const res = await fetchImpl(endpoint(), {
        headers: await readHeaders(),
      });
      if (!res.ok) await throwForResponse(res);
      const result = (await res.json()) as { conversations: Record<string, unknown>[] };
      return (result.conversations ?? []).map(mapRawConversation);
    },
  };
}
