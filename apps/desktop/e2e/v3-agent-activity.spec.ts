import { expect, test, type Page } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import {
  cloudConversationFixture,
  expectCloudShellReady,
  mockCloudApi,
} from './utils/mock-cloud-api';

/**
 * DES-C14: this spec used to mock `**\/api/cloud-chat`, a path that exists
 * nowhere under `apps/web/app/api`, while leaving the real managed-cloud chat
 * route (`/api/chat/conversations`, see `MANAGED_CLOUD_CHAT_BASE_PATH`) and
 * `/api/projects` unrouted. Cloud admission hydrates the conversation boundary
 * from exactly those two, so the v3 shell never mounted and the composer this
 * test types into did not exist. `mockCloudApi` owns the shipping route set;
 * the conversation below is in the real `ManagedCloudConversationWireSchema`
 * shape rather than the invented snake_case one.
 */
const conversation = cloudConversationFixture({
  id: '9c3a1b52-6d2f-4c8e-9a44-1f0b5c7d2e31',
  title: 'Agent activity check',
  model: 'auto-balanced',
  created_at: '2026-07-17T20:00:00.000Z',
  updated_at: '2026-07-17T20:00:00.000Z',
});

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
}, testInfo) => {
  const appOrigin = new URL(testInfo.project.use.baseURL ?? 'http://127.0.0.1:5175').origin;
  const unexpectedDiagnostics: string[] = [];
  // `cloudAccountAuth.fetchAccountSnapshot` and `managedCloudSettingsSync` are
  // the only two callers that use the ABSOLUTE `WEB_APP_URL` instead of the
  // browser build's same-origin `CLOUD_API_BASE_URL` (''). When the configured
  // origin is not in the dev server's CSP `connect-src` (vite.config.ts:129 —
  // e.g. a local `.env.local` pointing VITE_WEB_APP_URL at localhost:3000) the
  // browser refuses the request before it reaches the network stack, so
  // `page.route` never sees it and NO Playwright mock can answer it. That is an
  // environment fact, not a product regression, so a bare
  // "TypeError: Failed to fetch" from those two is not counted. Everything else
  // still fails this test: a contract violation, a non-2xx, or any
  // `analytics_set_privacy_mode` call (which is never a network error).
  const isUnmockableEgress = (text: string) =>
    /TypeError: Failed to fetch/.test(text) &&
    /managedCloudSettingsSync|Failed to refresh Clerk\/Neon/i.test(text);

  page.on('console', (message) => {
    const text = message.text();
    if (
      /analytics_set_privacy_mode|managedCloudSettingsSync|Failed to refresh Clerk\/Neon/i.test(
        text,
      ) &&
      !isUnmockableEgress(text)
    ) {
      unexpectedDiagnostics.push(`${message.type()}: ${text}`);
    }
  });
  page.on('requestfailed', (request) => {
    // Same-origin settings/sync IS routable here, so a failure on it is a real
    // regression. The absolute-origin variant is the CSP case documented above.
    if (/settings\/sync/i.test(request.url()) && request.url().startsWith(appOrigin)) {
      unexpectedDiagnostics.push(
        `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`,
      );
    }
  });

  await injectMockCloudAuth(page, { planTier: 'max' });
  await mockCloudApi(page, {
    planTier: 'max',
    createdConversation: conversation,
    messagesByConversation: { [conversation.id]: [] },
  });
  // Registered after mockCloudApi so the streaming completion wins over the
  // catch-all.
  await mockCloudChat(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await expectCloudShellReady(page);

  const composer = page.getByRole('textbox', { name: /chat message input/i });
  await composer.fill('Research the current official documentation');
  await page.getByRole('button', { name: /send message/i }).click();

  const assistant = page.locator('[data-role="assistant"]').last();
  await expect(assistant).toContainText('The verified research pass is complete.');
  await expect(assistant.getByRole('region', { name: 'Agent activity' })).toHaveCount(1);

  const activityToggle = assistant.getByRole('button', { name: /show agent activity/i });
  await expect(activityToggle).toHaveAttribute('aria-expanded', 'false');
  // The completed row keeps Claude's semantic “what happened” summary. Its
  // check icon and live-region announcement carry completion state without
  // replacing the useful action label with an elapsed-time pill.
  await expect(activityToggle).toContainText('Searching official sources');
  await expect(activityToggle).not.toContainText(/Done in|1 tool/);
  await expect(assistant.getByText('Official AGI documentation')).toHaveCount(0);

  await activityToggle.click();

  const expandedActivityToggle = assistant.getByRole('button', { name: /hide agent activity/i });
  await expect(expandedActivityToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(assistant.getByText('Planning the research pass')).toBeVisible();
  await expect(
    assistant.getByRole('button', { name: 'Searching official sources', exact: true }),
  ).toBeVisible();
  await expect(assistant.getByText('Official AGI documentation')).toBeVisible();
  await expect(assistant.getByText('example.com')).toBeVisible();
  await expect(assistant.getByText('Done', { exact: true })).toBeVisible();
  expect(unexpectedDiagnostics).toEqual([]);
});
