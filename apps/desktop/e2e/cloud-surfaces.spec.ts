import { test, expect } from '@playwright/test';
import { injectMockCloudAuth, mockCloudAccountEndpoints } from './utils/mock-cloud-auth';

/**
 * Desktop Cloud surfaces (Library, Tasks) inside the real shell, behind the
 * repo's mock cloud session.
 *
 * Component-level tests and a rendering harness both passed while these two
 * surfaces were completely unreachable in the app. Only running the real shell
 * found it, twice:
 *
 *  1. Both panels were listed in the effect that evicts Local-only panels when
 *     the user is in Cloud mode. The nav click set the panel and the effect
 *     reset it to chat on the same tick, so the buttons rendered and did
 *     nothing.
 *  2. TasksPage's root is `h-full`, which collapses to zero height unless its
 *     parent has a resolved one. The panel mounted and drew nothing.
 *
 * Neither is visible to a unit test, so this spec exists to keep them fixed.
 * Assertions are scoped inside the panel by test id — the sidebar also contains
 * the words "Library" and "Tasks", and asserting page-wide passes while the
 * panel is empty.
 */
const LIBRARY_ITEMS = [
  {
    id: 'a1',
    file_name: 'Q3-forecast.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'file',
    byte_count: 48210,
    uri: '/api/files/a1',
    surface: 'file',
    previewable: false,
    origin: 'generated',
    source_surface: 'web',
    provider: null,
    model: null,
    prompt: null,
    created_at: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'a2',
    file_name: 'launch-diagram.png',
    mime_type: 'image/png',
    kind: 'image',
    byte_count: 91422,
    uri: '/api/files/a2',
    surface: 'image',
    previewable: false,
    origin: 'generated',
    source_surface: 'desktop',
    provider: null,
    model: null,
    prompt: null,
    created_at: '2026-07-22T09:30:00.000Z',
  },
  {
    id: 'a3',
    file_name: 'migration-plan.md',
    mime_type: 'text/markdown',
    kind: 'file',
    byte_count: 7310,
    uri: '/api/files/a3',
    surface: 'file',
    previewable: false,
    origin: 'generated',
    source_surface: 'cli',
    provider: null,
    model: null,
    prompt: null,
    created_at: '2026-07-25T14:05:00.000Z',
  },
];

test('renders Library and Tasks in the real cloud shell', async ({ page }) => {
  await injectMockCloudAuth(page);
  await mockCloudAccountEndpoints(page);

  // Playwright matches routes last-registered-first, so the catch-all is
  // registered BEFORE the specific ones below and they take precedence.
  // Without it an unrouted /api/ call hits the network and the shell reports
  // "Could not open Cloud Mode — Failed to fetch".
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // The generic mock answers every GET with an empty object, which violates the
  // conversation-list contract and makes the shell fail closed with
  // "Could not open Cloud Mode". Answer that endpoint properly.
  await page.route('**/api/chat/conversations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: [], hasMore: false, nextOffset: 0 }),
    }),
  );

  await page.route('**/api/projects**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [], hasMore: false, nextOffset: 0 }),
    }),
  );

  const now = new Date();
  const iso = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60000).toISOString();
  const RUNS = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'e2e-mock-user-id',
      requestId: 'req-1',
      conversationId: 'c1',
      originSurface: 'desktop',
      workMode: 'agiwork',
      state: 'running',
      provider: 'anthropic',
      model: 'claude',
      lastEventSequence: 12,
      cancellationRequestedAt: null,
      completedAt: null,
      createdAt: iso(10),
      updatedAt: iso(1),
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'e2e-mock-user-id',
      requestId: 'req-2',
      conversationId: 'c2',
      originSurface: 'web',
      workMode: 'research',
      state: 'completed',
      provider: 'openai',
      model: 'gpt',
      lastEventSequence: 40,
      cancellationRequestedAt: null,
      completedAt: iso(120),
      createdAt: iso(180),
      updatedAt: iso(120),
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      userId: 'e2e-mock-user-id',
      requestId: 'req-3',
      conversationId: 'c3',
      originSurface: 'mobile',
      workMode: 'chat',
      state: 'awaiting_input',
      provider: 'anthropic',
      model: 'claude',
      lastEventSequence: 7,
      cancellationRequestedAt: null,
      completedAt: null,
      createdAt: iso(300),
      updatedAt: iso(280),
    },
  ];

  await page.route('**/api/llm/v1/chat/completions/runs**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: RUNS, nextCursor: null }),
    }),
  );

  await page.route('**/api/library**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: LIBRARY_ITEMS, has_more: false, next_offset: null }),
    }),
  );

  await page.goto('/');
  await page.waitForTimeout(4000);

  // The shell must mount past the auth gate for any of this to be meaningful.
  await expect(page.getByRole('button', { name: /Library/i }).first()).toBeVisible({
    timeout: 20000,
  });

  await page
    .getByRole('button', { name: /Library/i })
    .first()
    .click();
  // Assert the panel actually switched rather than screenshotting whatever was
  // on screen — the click could no-op and a screenshot would still "pass".
  await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Q3-forecast.xlsx')).toBeVisible({ timeout: 10000 });

  await page
    .getByRole('button', { name: /^Tasks$/i })
    .first()
    .click();
  const tasksView = page.getByTestId('tasks-view');
  await expect(tasksView).toBeVisible({ timeout: 15000 });
  // Assert inside the panel, not the page: the sidebar also contains "Tasks".
  await expect(tasksView.getByText('Running')).toBeVisible({ timeout: 10000 });
  await expect(tasksView.getByText('Completed')).toBeVisible();
});
