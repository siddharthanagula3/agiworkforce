import { expect, type Page, type Route } from '@playwright/test';
import {
  injectMockCloudAuth,
  mockCloudCorsHeaders,
  mockCloudAccountEndpoints,
  type MockCloudAuthOptions,
} from './mock-cloud-auth';

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
  models?: Array<{ id: string; name: string; provider: string }>;
  assistantReply?: string;
  conversations?: CloudConversationWire[];
  messagesByConversation?: Record<string, CloudMessageWire[]>;
  createdConversation?: CloudConversationWire;
  projects?: unknown[];
  libraryItems?: unknown[];
  agentRuns?: unknown[];
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: mockCloudCorsHeaders(route),
    body: JSON.stringify(body),
  });
}

function isPreflight(route: Route): boolean {
  return route.request().method() === 'OPTIONS';
}

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

export async function mockCloudApi(page: Page, options: MockCloudApiOptions = {}): Promise<void> {
  const models = options.models ?? [];
  const assistantReply = options.assistantReply ?? 'Mocked managed cloud reply.';
  const conversations = options.conversations ?? [];
  const messagesByConversation = options.messagesByConversation ?? {};
  const projects = options.projects ?? [];
  const libraryItems = options.libraryItems ?? [];
  const agentRuns = options.agentRuns ?? [];

  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
    return fulfillJson(route, {});
  });

  await mockCloudAccountEndpoints(page, options);

  await page.route('**/api/models**', (route) => {
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
    return fulfillJson(route, { models });
  });

  await page.route('**/api/chat/conversations**', (route) => {
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
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

    if (messagesMatch && method === 'POST') {
      return fulfillJson(route, { message: { id: `msg-${Date.now()}` } });
    }
    if (messageMatch && method === 'DELETE') {
      return fulfillJson(route, { success: true });
    }

    if (detailMatch) {
      const conversationId = decodeURIComponent(detailMatch[1] ?? '');
      if (method === 'PUT' || method === 'PATCH') {
        return fulfillJson(route, { conversation: resolveConversation(conversationId) });
      }
      if (method === 'DELETE') {
        return fulfillJson(route, { success: true });
      }
      const messages = messagesByConversation[conversationId] ?? [];
      return fulfillJson(route, {
        conversation: resolveConversation(conversationId),
        messages,
        total: messages.length,
        hasMore: false,
      });
    }

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
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
    return fulfillJson(route, { projects });
  });

  await page.route('**/api/llm/v1/chat/completions', (route) => {
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
    const frames = assistantReply
      .split(' ')
      .map((word, index) => (index === 0 ? word : ` ${word}`))
      .map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
      .join('');
    const usageFrame = `data: ${JSON.stringify({
      choices: [],
      usage: {
        prompt_tokens: 128,
        completion_tokens: 64,
        prompt_tokens_details: { cached_tokens: 32 },
        completion_tokens_details: { reasoning_tokens: 16 },
      },
    })}\n\n`;
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: mockCloudCorsHeaders(route),
      body: `${frames}${usageFrame}data: [DONE]\n\n`,
    });
  });

  await page.route('**/api/llm/v1/chat/completions/runs**', (route) => {
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
    return fulfillJson(route, { runs: agentRuns, nextCursor: null });
  });

  await page.route('**/api/library**', (route) => {
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
    return fulfillJson(route, { items: libraryItems, has_more: false, next_offset: null });
  });

  await page.route('**/api/csrf**', (route) => {
    if (isPreflight(route)) {
      return route.fulfill({ status: 204, headers: mockCloudCorsHeaders(route) });
    }
    return fulfillJson(route, { token: 'e2e-csrf' });
  });
}

export async function expectCloudShellReady(page: Page, timeout = 30000): Promise<void> {
  await expect
    .poll(async () => page.locator('[data-v3-shell]').count(), {
      timeout,
      message:
        'The v3 Cloud shell never mounted. The usual cause is an unmocked Managed Cloud endpoint ' +
        'failing the conversation boundary, call mockCloudApi(page) before page.goto().',
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

export async function gotoCloudShell(
  page: Page,
  options: MockCloudApiOptions & {
    url?: string;
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
