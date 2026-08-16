import { test, expect } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

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

  await injectMockCloudAuth(page);
  await mockCloudApi(page, { libraryItems: LIBRARY_ITEMS, agentRuns: RUNS });

  await page.goto('/');
  await page.waitForTimeout(4000);

  await expectCloudShellReady(page);
  await expect(page.getByRole('button', { name: /Library/i }).first()).toBeVisible({
    timeout: 20000,
  });

  await page
    .getByRole('button', { name: /Library/i })
    .first()
    .click();
  await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Q3-forecast.xlsx')).toBeVisible({ timeout: 10000 });

  await page
    .getByRole('button', { name: /^Tasks$/i })
    .first()
    .click();
  const tasksView = page.getByTestId('tasks-view');
  await expect(tasksView).toBeVisible({ timeout: 15000 });
  await expect(tasksView.getByText('Running')).toBeVisible({ timeout: 10000 });
  await expect(tasksView.getByText('Completed')).toBeVisible();
});
