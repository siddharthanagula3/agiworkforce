import { expect, test, type Page } from '@playwright/test';
import { injectMockCloudAuth, mockCloudAccountEndpoints } from './utils/mock-cloud-auth';

const conversation = {
  id: 'conv-agent-activity',
  user_id: 'e2e-mock-user-id',
  title: 'Agent activity check',
  model: 'auto-balanced',
  created_at: '2026-07-17T20:00:00.000Z',
  updated_at: '2026-07-17T20:00:00.000Z',
};

function agentEvent(sequence: number, event: Record<string, unknown>) {
  return {
    choices: [
      {
        delta: {
          x_agent_event: {
            schemaVersion: 3,
            sessionId: 'session-agent-activity',
            turnId: 'turn-agent-activity',
            sequence,
            emittedAtMs: 1_000 + sequence * 1_000,
            event,
          },
        },
      },
    ],
  };
}

async function mockCloudChat(page: Page): Promise<void> {
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"token":"e2e-csrf"}' }),
  );

  await page.route('**/api/cloud-chat', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversation }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: [] }),
    });
  });

  await page.route('**/api/llm/v1/chat/completions', (route) => {
    const lines = [
      agentEvent(0, { type: 'lifecycle', phase: 'started' }),
      agentEvent(1, {
        type: 'progress-update',
        progressId: 'plan',
        summary: 'Planning the research pass',
        detail: 'Using current official sources only',
        status: 'completed',
      }),
      agentEvent(2, {
        type: 'tool-execution-start',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'AGI official documentation' },
      }),
      agentEvent(3, {
        type: 'source-list',
        toolCallId: 'search-1',
        query: 'AGI official documentation',
        sources: [
          {
            url: 'https://example.com/agi-docs',
            title: 'Official AGI documentation',
            snippet: 'Primary source',
          },
        ],
      }),
      agentEvent(4, {
        type: 'tool-execution-end',
        toolCallId: 'search-1',
        name: 'web_search',
        output: { matches: 1 },
        isError: false,
        elapsedMs: 1_250,
      }),
      {
        choices: [{ delta: { content: 'The verified research pass is complete.' } }],
      },
      agentEvent(5, { type: 'stop', reason: 'end-turn' }),
    ];
    const body = `${lines.map((line) => `data: ${JSON.stringify(line)}\n\n`).join('')}data: [DONE]\n\n`;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });
}

test('Desktop Cloud renders one collapsed, progressively expandable canonical activity spine', async ({
  page,
}) => {
  const unexpectedDiagnostics: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (
      /analytics_set_privacy_mode|managedCloudSettingsSync|Failed to refresh Clerk\/Neon/i.test(
        text,
      )
    ) {
      unexpectedDiagnostics.push(`${message.type()}: ${text}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (/settings\/sync/i.test(request.url())) {
      unexpectedDiagnostics.push(
        `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`,
      );
    }
  });

  await injectMockCloudAuth(page, { planTier: 'max' });
  await mockCloudAccountEndpoints(page, { planTier: 'max' });
  await mockCloudChat(page);
  await page.addInitScript(() => {
    localStorage.setItem('feature_flags_overrides', JSON.stringify([['desktop_chat_v3', true]]));
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  const composer = page.getByRole('textbox', { name: /chat message input/i });
  await composer.fill('Research the current official documentation');
  await page.getByRole('button', { name: /send message/i }).click();

  const assistant = page.locator('[data-role="assistant"]').last();
  await expect(assistant).toContainText('The verified research pass is complete.');
  await expect(assistant.getByRole('region', { name: 'Agent activity' })).toHaveCount(1);

  const activityToggle = assistant.getByRole('button', { name: /show agent activity/i });
  await expect(activityToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(activityToggle).toContainText(/Done in 5s.*1 tool/);
  await expect(assistant.getByText('Official AGI documentation')).toHaveCount(0);

  await activityToggle.click();

  const expandedActivityToggle = assistant.getByRole('button', { name: /hide agent activity/i });
  await expect(expandedActivityToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(assistant.getByText('Planning the research pass')).toBeVisible();
  await expect(assistant.getByText('Searching official sources')).toBeVisible();
  await expect(assistant.getByText('Official AGI documentation')).toBeVisible();
  await expect(assistant.getByText('example.com')).toBeVisible();
  await expect(assistant.getByText('Done', { exact: true })).toBeVisible();
  expect(unexpectedDiagnostics).toEqual([]);
});
