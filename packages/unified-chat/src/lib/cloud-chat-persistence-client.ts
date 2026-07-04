/**
 * Cloud Chat Persistence Client
 *
 * Framework-agnostic HTTP client for the managed-cloud chat persistence API
 * (`/api/chat/conversations*`). The conversation CRUD methods (create/get/
 * update/delete/list) were extracted from the web-only hook
 * `apps/web/features/chat/hooks/use-chat-persistence.ts` so that every surface
 * that talks to the shared cloud backend (web today; desktop next) reuses one
 * client with one normalization path.
 *
 * CORRECTION (2026-07-03): `use-chat-persistence.ts` is itself dead/unrouted
 * code (mounted only behind an orphaned `?unified=1` page nothing routes to;
 * see `docs/strategy/PUBLIC-ALPHA-CUTOVER.md`'s DCL-1 correction note). Its
 * `saveMessages()` is a hardcoded no-op, so message persistence was never
 * actually extracted here — this file originally had NO way to save a
 * message at all. `saveMessage()` below closes that gap by mirroring the
 * REAL, live, shipping reference instead: `apps/web/lib/hooks/useChatStream.ts`'s
 * `saveMessageToDb()` (`POST /api/chat/conversations/:id/messages`, retry with
 * backoff on network errors and 5xx, no retry on 429/other 4xx). The
 * conversation CRUD methods are left as originally extracted.
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
 *
 * `model` and `projectId` mirror the real `/api/chat/conversations` route's
 * `model`/`project_id` response columns (see `handleCreateConversation` /
 * `handleGetConversations` in `apps/web/app/api/chat/conversations/route.ts`).
 * `userId` is NOT actually returned by any of the route's `RETURNING`/`select`
 * clauses today — it stays on the type for forward-compat but is always
 * `undefined` in practice; do not rely on it without also fixing the route.
 */
export interface CloudConversation {
  id: string;
  userId: string;
  title: string;
  mode: CloudConversationMode;
  model?: string;
  projectId?: string | null;
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

/**
 * Body for creating a conversation. Fields mirror the real
 * `/api/chat/conversations` route's `CreateConversationSchema`
 * (`apps/web/lib/validations/chat.ts`) exactly:
 *
 *   - `id` — optional client-supplied UUID. Offline-first clients (mobile,
 *     desktop) MUST generate this locally (`@agiworkforce/utils/uuidv7`) so the
 *     conversation has a stable cloud identity before the round-trip completes
 *     — required for the desktop↔web cross-surface continuity proof (DCL-4):
 *     without it, desktop cannot know a conversation's cloud id until the
 *     response arrives. Web omits it and the DB default (`gen_random_uuid()`)
 *     applies. The route is idempotent on `id` (`ON CONFLICT ... DO UPDATE`),
 *     so a retried create cannot duplicate the row.
 *   - `model` / `projectId` — optional, passed straight through to the route.
 *
 * `mode` is NOT part of the real schema (a legacy field from the dead
 * `use-chat-persistence.ts` extraction source) — zod silently strips it, so
 * it was inert, not wired to anything server-side. Removed here; see the
 * 2026-07-03 DCL-1 realignment note above.
 */
export interface CreateConversationInput {
  id?: string;
  title: string;
  model?: string;
  projectId?: string | null;
}

/**
 * Message payload for {@link CloudChatPersistenceClient.saveMessage}. `id` is
 * an optional client-supplied UUID — the route is idempotent on it (`ON
 * CONFLICT`), so a retried save of an already-committed message cannot create
 * a duplicate. `metadata` is passed through un-normalized (surface-specific).
 */
export interface SaveMessageInput {
  id?: string;
  role: string;
  content: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

/** Options for {@link CloudChatPersistenceClient.saveMessage}'s retry policy. */
export interface SaveMessageRetryOptions {
  /** Total attempts including the first try. Default 3 (1 + 2 retries). */
  maxAttempts?: number;
  /** Base backoff between attempts; multiplied by the attempt number. Default 350ms. */
  retryDelayMs?: number;
}

/** Result of a successful {@link CloudChatPersistenceClient.saveMessage} call. */
export interface SaveMessageResult {
  id: string;
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
  /**
   * POST /api/chat/conversations/:id/messages — persist a single message.
   *
   * Durability contract, mirroring `useChatStream.ts`'s `saveMessageToDb()`
   * exactly (same retry policy, same request/response contract, same error
   * handling — see that function's doc comment for the full rationale):
   *   - retries transient failures (5xx / network) with backoff, since most
   *     persistence blips self-heal on a second attempt;
   *   - THROWS on a hard, non-recoverable failure (any non-retryable 4xx
   *     INCLUDING 429, or 5xx / network after exhausting retries) so the
   *     caller surfaces it instead of silently dropping the turn. A 429 is
   *     NOT retried in-request (the rate-limit window outlasts the request).
   *   - the POST route is idempotent on the client-supplied `id`, so a retry
   *     of an already-committed message cannot create a duplicate.
   *
   * UI concerns (toasts, offline queueing) stay in the surface adapter, same
   * as every other method here.
   */
  saveMessage(
    conversationId: string,
    message: SaveMessageInput,
    options?: SaveMessageRetryOptions,
  ): Promise<SaveMessageResult>;
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
    model: typeof raw['model'] === 'string' ? (raw['model'] as string) : undefined,
    projectId: (raw['project_id'] as string | null | undefined) ?? undefined,
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

/** Default retry policy for {@link CloudChatPersistenceClient.saveMessage}. */
const DEFAULT_SAVE_MESSAGE_MAX_ATTEMPTS = 3;
const DEFAULT_SAVE_MESSAGE_RETRY_DELAY_MS = 350;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
        body: JSON.stringify({
          id: input.id,
          title: input.title,
          model: input.model,
          projectId: input.projectId,
        }),
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

    async saveMessage(
      conversationId: string,
      message: SaveMessageInput,
      options: SaveMessageRetryOptions = {},
    ): Promise<SaveMessageResult> {
      const maxAttempts = options.maxAttempts ?? DEFAULT_SAVE_MESSAGE_MAX_ATTEMPTS;
      const retryDelayMs = options.retryDelayMs ?? DEFAULT_SAVE_MESSAGE_RETRY_DELAY_MS;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let res: Response;
        try {
          res = await fetchImpl(endpoint(`/${conversationId}/messages`), {
            method: 'POST',
            headers: await writeHeaders(true),
            body: JSON.stringify({
              id: message.id,
              role: message.role,
              content: message.content,
              model: message.model,
              metadata: message.metadata,
              // Web callers always pass skipLlm: true (streaming happens over
              // a separate route); mirrored here for byte-identical parity.
              skipLlm: true,
            }),
          });
        } catch (networkError) {
          // Network-level failure (offline, DNS, connection reset) — transient.
          lastError = networkError;
          if (attempt < maxAttempts) {
            await delay(retryDelayMs * attempt);
            continue;
          }
          throw networkError instanceof Error
            ? networkError
            : new Error('Network error while saving message');
        }

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            message?: SaveMessageResult;
            userMessage?: SaveMessageResult;
          };
          // A 200 with no body still means the row was saved; fall back to the
          // id we sent (the route uses it via COALESCE) so the caller's id
          // stays in sync — never invent a random id that won't match the DB.
          return data.message ?? data.userMessage ?? { id: message.id ?? crypto.randomUUID() };
        }

        // A 429 means the persist write was rate-limited, so the turn was NOT
        // saved. It is not retried (the rate-limit window outlasts the
        // request) — falls through to the throw below so the caller surfaces
        // it instead of silently dropping the turn.

        // 5xx is transient — retry before giving up.
        if (res.status >= 500 && attempt < maxAttempts) {
          lastError = new Error(`Save failed: ${res.status}`);
          await delay(retryDelayMs * attempt);
          continue;
        }

        // Non-retryable 4xx (including 429), or a 5xx after exhausting
        // retries: a real failure the caller must surface.
        throw new Error(`Failed to save message to DB: ${res.status}`);
      }

      throw lastError instanceof Error ? lastError : new Error('Failed to save message to DB');
    },
  };
}
