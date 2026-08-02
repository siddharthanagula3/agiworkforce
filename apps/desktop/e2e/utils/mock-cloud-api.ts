import { expect, type Page, type Route } from '@playwright/test';
import {
  injectMockCloudAuth,
  mockCloudAccountEndpoints,
  type MockCloudAuthOptions,
} from './mock-cloud-auth';

/**
 * The Managed Cloud API surface every Desktop Cloud spec has to answer before
 * the v3 shell can mount.
 *
 * WHY THIS EXISTS (DES-C14). `App.tsx` hydrates the cloud conversation boundary
 * with `loadConversations` + `loadProjects` the moment a Cloud session appears.
 * Specs that mocked only `/api/me` and `/api/settings/sync` left both of those
 * calls unrouted: they hit the network, rejected, and the shell reported a
 * conversation-boundary failure instead of rendering — so every assertion after
 * `injectMockCloudAuth` was either red or, when it only counted optional
 * elements, vacuously green. `cloud-surfaces.spec.ts` had already worked this
 * out in-repo; this module is that route set, corrected and shared.
 *
 * ORDERING. Playwright matches routes last-registered-first. The `**\/api/**`
 * catch-all is therefore registered FIRST here so that every specific route
 * below it — including the account endpoints — takes precedence, and so that no
 * unrouted `/api/` call can reach the network. A spec that needs a different
 * answer for one endpoint registers its own route AFTER calling
 * `mockCloudApi()`; being registered later, it wins.
 */

/** Wire shape of `ManagedCloudConversationWireSchema` (cloud-contracts). */
export interface CloudConversationWire {
  id: string;
  title: string | null;
  model: string | null;
  project_id: string | null;
  pinned: boolean;
  starred: boolean;
  archived: boolean;
  is_temporary: boolean;
  created_at: string;
  updated_at: string;
}

/** Wire shape of `ManagedCloudMessageWireSchema` (cloud-contracts). */
export interface CloudMessageWire {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface MockCloudApiOptions extends MockCloudAuthOptions {
  /** Conversation list returned by `GET /api/chat/conversations`. */
  conversations?: CloudConversationWire[];
  /** Messages returned by `GET /api/chat/conversations/:id`, keyed by id. */
  messagesByConversation?: Record<string, CloudMessageWire[]>;
  /** Conversation returned by `POST /api/chat/conversations`. */
  createdConversation?: CloudConversationWire;
  /** Projects returned by `GET /api/projects`. */
  projects?: unknown[];
  /** Items returned by `GET /api/library`. */
  libraryItems?: unknown[];
  /** Runs returned by `GET /api/llm/v1/chat/completions/runs`. */
  agentRuns?: unknown[];
}

/**
 * Desktop's browser-target bundle talks to `/api/*` same-origin, but a few
 * callers (notably the account snapshot) use the absolute cloud origin. Fulfil
 * every mocked response with permissive CORS headers so the cross-origin ones
 * are readable instead of silently failing the preflight.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
} as const;

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(body),
  });
}

function isPreflight(route: Route): boolean {
  return route.request().method() === 'OPTIONS';
}

/** Build a conversation in the exact wire shape the cloud chat client parses. */
export function cloudConversationFixture(
  overrides: Partial<CloudConversationWire> & Pick<CloudConversationWire, 'id'>,
): CloudConversationWire {
  const now = '2026-07-30T09:00:00.000Z';
  return {
    title: 'Cloud conversation',
    model: null,
    project_id: null,
    pinned: false,
    starred: false,
    archived: false,
    is_temporary: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/** Build a message in the exact wire shape the cloud chat client parses. */
export function cloudMessageFixture(
  overrides: Partial<CloudMessageWire> & Pick<CloudMessageWire, 'id' | 'role' | 'content'>,
): CloudMessageWire {
  return {
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: '2026-07-30T09:00:00.000Z',
    metadata: null,
    ...overrides,
  };
}

/**
 * Install the full Managed Cloud API mock, including the account endpoints.
 *
 * Call this INSTEAD of `mockCloudAccountEndpoints` (it calls it for you, in the
 * order that makes the account routes win over the catch-all), and always
 * before `page.goto`.
 */
export async function mockCloudApi(page: Page, options: MockCloudApiOptions = {}): Promise<void> {
  const conversations = options.conversations ?? [];
  const messagesByConversation = options.messagesByConversation ?? {};
  const projects = options.projects ?? [];
  const libraryItems = options.libraryItems ?? [];
  const agentRuns = options.agentRuns ?? [];

  // 1. Catch-all first => lowest precedence. Without it an unrouted `/api/`
  //    call reaches the network and the boundary reports "Failed to fetch".
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    if (isPreflight(route)) return route.fulfill({ status: 204, headers: { ...CORS_HEADERS } });
    return fulfillJson(route, {});
  });

  // 2. Account endpoints (`/api/me`, `/api/settings/sync`). Registered after the
  //    catch-all so the seeded plan/user is what the shell actually reads.
  await mockCloudAccountEndpoints(page, options);

  // 3. The endpoints the catch-all's empty `{}` would violate the contract for.
  //    Every shape below comes from `managed-cloud-chat-client.ts`, which parses
  //    each response with a zod schema and throws a contract error otherwise.
  await page.route('**/api/chat/conversations**', (route) => {
    if (isPreflight(route)) return route.fulfill({ status: 204, headers: { ...CORS_HEADERS } });
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const detailMatch = /\/api\/chat\/conversations\/([^/]+)$/.exec(pathname);
    const messagesMatch = /\/api\/chat\/conversations\/([^/]+)\/messages$/.exec(pathname);
    const messageMatch = /\/api\/chat\/conversations\/([^/]+)\/messages\/([^/]+)$/.exec(pathname);
    const resolveConversation = (conversationId: string) =>
      conversations.find((candidate) => candidate.id === conversationId) ??
      options.createdConversation ??
      cloudConversationFixture({ id: conversationId });

    // POST /messages — persist one turn. `{ message: { id } }`.
    if (messagesMatch && method === 'POST') {
      return fulfillJson(route, { message: { id: `msg-${Date.now()}` } });
    }
    // DELETE /messages/:id — `{ success: true }`.
    if (messageMatch && method === 'DELETE') {
      return fulfillJson(route, { success: true });
    }

    if (detailMatch) {
      const conversationId = decodeURIComponent(detailMatch[1] ?? '');
      // PUT — rename/repin. `{ conversation }`, NOT `{ success: true }`.
      if (method === 'PUT' || method === 'PATCH') {
        return fulfillJson(route, { conversation: resolveConversation(conversationId) });
      }
      if (method === 'DELETE') {
        return fulfillJson(route, { success: true });
      }
      // GET — conversation + one page of messages.
      const messages = messagesByConversation[conversationId] ?? [];
      return fulfillJson(route, {
        conversation: resolveConversation(conversationId),
        messages,
        total: messages.length,
        hasMore: false,
      });
    }

    // POST on the collection — create. `{ conversation }`.
    if (method === 'POST') {
      const conversation =
        options.createdConversation ??
        conversations[0] ??
        cloudConversationFixture({ id: '00000000-0000-4000-8000-000000000001' });
      return fulfillJson(route, { conversation });
    }

    return fulfillJson(route, { conversations, hasMore: false, nextOffset: 0 });
  });

  await page.route('**/api/projects**', (route) => {
    if (isPreflight(route)) return route.fulfill({ status: 204, headers: { ...CORS_HEADERS } });
    return fulfillJson(route, { projects });
  });

  await page.route('**/api/llm/v1/chat/completions/runs**', (route) => {
    if (isPreflight(route)) return route.fulfill({ status: 204, headers: { ...CORS_HEADERS } });
    return fulfillJson(route, { runs: agentRuns, nextCursor: null });
  });

  await page.route('**/api/library**', (route) => {
    if (isPreflight(route)) return route.fulfill({ status: 204, headers: { ...CORS_HEADERS } });
    return fulfillJson(route, { items: libraryItems, has_more: false, next_offset: null });
  });

  await page.route('**/api/csrf**', (route) => {
    if (isPreflight(route)) return route.fulfill({ status: 204, headers: { ...CORS_HEADERS } });
    return fulfillJson(route, { token: 'e2e-csrf' });
  });
}

/**
 * Assert the Cloud shell actually mounted, and name the failure if it did not.
 *
 * This is the assertion DES-C14 asks every cloud spec to carry: the conversation
 * boundary must not have failed. It checks both shapes the failure has taken —
 * the full-screen "Could not open Cloud Mode" takeover and the inline
 * `conversation-boundary-error` banner that replaced it — so the check survives
 * whichever one is in the tree, and a regression to unrouted cloud endpoints
 * fails HERE with an obvious message instead of leaving a downstream assertion
 * to time out on a missing element.
 */
export async function expectCloudShellReady(page: Page, timeout = 30000): Promise<void> {
  await expect
    .poll(async () => page.locator('[data-v3-shell]').count(), {
      timeout,
      message:
        'The v3 Cloud shell never mounted. The usual cause is an unmocked Managed Cloud endpoint ' +
        'failing the conversation boundary — call mockCloudApi(page) before page.goto().',
    })
    .toBeGreaterThan(0);

  await expect(
    page.getByText(/Could not open (Cloud|Local) Mode/i),
    'The Cloud conversation boundary failed and took over the shell.',
  ).toHaveCount(0);

  await expect(
    page.getByTestId('conversation-boundary-error'),
    'The Cloud conversation boundary reported a load failure.',
  ).toHaveCount(0);
}

/**
 * One call for the common case: seed the mock session, install the API mocks,
 * navigate, and prove the Cloud shell reached a usable state.
 */
export async function gotoCloudShell(
  page: Page,
  options: MockCloudApiOptions & {
    url?: string;
    /** Register spec-specific routes here; they win over `mockCloudApi`'s. */
    routes?: (page: Page) => Promise<void>;
  } = {},
): Promise<void> {
  await injectMockCloudAuth(page, options);
  await mockCloudApi(page, options);
  if (options.routes) await options.routes(page);
  await page.goto(options.url ?? '/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await expectCloudShellReady(page);
}
