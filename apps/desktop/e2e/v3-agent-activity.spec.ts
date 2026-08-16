import { expect, test, type Page } from '@playwright/test';
import modelRegistryJson from '@agiworkforce/model-registry/registry.json' with { type: 'json' };
import modelsCatalogJson from '@agiworkforce/types/models.json' with { type: 'json' };
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import {
  cloudConversationFixture,
  expectCloudShellReady,
  mockCloudApi,
} from './utils/mock-cloud-api';

interface CatalogFixtureModel {
  name: string;
  provider: string;
  modelType: string;
  status?: string;
  availability?: string;
  capabilities: { search: boolean; research: boolean };
}

interface RegistryFixtureRoute {
  modelKey: string;
  harnessId: string;
  trustModes: string[];
  availability: string;
  selectable: boolean;
}

function resolveGeminiResearchModel() {
  const catalog = modelsCatalogJson as unknown as {
    models: Record<string, CatalogFixtureModel>;
    tierAllowedModels: Record<string, string[]>;
  };
  const registry = modelRegistryJson as unknown as {
    runtimeProfiles: Record<
      string,
      { status: string; trustMode: string; allowedHarnessIds: string[] }
    >;
    routes: Record<string, RegistryFixtureRoute>;
  };
  const profile = registry.runtimeProfiles['desktop/cloud-chat'];
  if (!profile || profile.status !== 'implemented') {
    throw new Error('The canonical Desktop Cloud runtime profile is unavailable.');
  }

  const allowedHarnessIds = new Set(profile.allowedHarnessIds);
  const maxTierModelIds = new Set(Object.values(catalog.tierAllowedModels).flat());
  const routesByModelId = new Map(
    Object.values(registry.routes).map((route) => [route.modelKey, route]),
  );
  const chatModelTypes = new Set(['chat', 'code', 'reasoning', 'multimodal', 'search']);

  for (const [id, model] of Object.entries(catalog.models)) {
    const route = routesByModelId.get(id);
    if (
      model.provider === 'google' &&
      maxTierModelIds.has(id) &&
      chatModelTypes.has(model.modelType) &&
      model.status !== 'deprecated' &&
      (model.availability ?? 'live') === 'live' &&
      model.capabilities.search &&
      model.capabilities.research &&
      route?.selectable === true &&
      route.availability === 'live' &&
      route.trustModes.includes(profile.trustMode) &&
      allowedHarnessIds.has(route.harnessId)
    ) {
      return { id, name: model.name, provider: model.provider };
    }
  }

  throw new Error(
    'The canonical max-tier Desktop Cloud catalog has no live Google model capable of research.',
  );
}

const GEMINI_RESEARCH_MODEL = resolveGeminiResearchModel();

const conversation = cloudConversationFixture({
  id: '9c3a1b52-6d2f-4c8e-9a44-1f0b5c7d2e31',
  title: 'Agent activity check',
  model: GEMINI_RESEARCH_MODEL.id,
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

async function mockCloudChat(page: Page): Promise<Array<Record<string, unknown>>> {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/api/llm/v1/chat/completions', (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
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
  return requests;
}

test('Desktop Cloud renders one collapsed, progressively expandable canonical activity spine', async ({
  page,
}, testInfo) => {
  const appOrigin = new URL(testInfo.project.use.baseURL ?? 'http://127.0.0.1:5175').origin;
  const unexpectedDiagnostics: string[] = [];
  const observedApiRequests: string[] = [];
  const runtimeErrors: string[] = [];
  const isUnmockableEgress = (text: string) =>
    /TypeError: Failed to fetch/.test(text) &&
    /managedCloudSettingsSync|Failed to refresh Clerk\/Neon/i.test(text);

  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') runtimeErrors.push(`console: ${text}`);
    if (
      /analytics_set_privacy_mode|managedCloudSettingsSync|Failed to refresh Clerk\/Neon/i.test(
        text,
      ) &&
      !isUnmockableEgress(text)
    ) {
      unexpectedDiagnostics.push(`${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      observedApiRequests.push(`${request.method()} ${url.pathname}${url.search}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (/settings\/sync/i.test(request.url()) && request.url().startsWith(appOrigin)) {
      unexpectedDiagnostics.push(
        `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`,
      );
    }
  });

  await injectMockCloudAuth(page, { planTier: 'max' });
  await mockCloudApi(page, {
    planTier: 'max',
    models: [
      {
        id: GEMINI_RESEARCH_MODEL.id,
        name: GEMINI_RESEARCH_MODEL.name,
        provider: GEMINI_RESEARCH_MODEL.provider,
      },
    ],
    createdConversation: conversation,
    messagesByConversation: { [conversation.id]: [] },
  });
  const cloudChatRequests = await mockCloudChat(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await expectCloudShellReady(page);

  const modelPicker = page.getByRole('button', { name: 'Select model' });
  await modelPicker.click();
  await page.getByRole('button').filter({ hasText: GEMINI_RESEARCH_MODEL.name }).first().click();
  await expect(modelPicker).toContainText(GEMINI_RESEARCH_MODEL.name);

  const composer = page.getByRole('textbox', { name: /chat message input/i });
  await composer.fill('Research the current official documentation');
  await page.getByRole('button', { name: /send message/i }).click();

  await expect
    .poll(() => cloudChatRequests.length, {
      message: `No managed completion request was sent. API traffic: ${observedApiRequests.join(', ') || '(none)'}. Runtime errors: ${runtimeErrors.join(' | ') || '(none)'}.`,
    })
    .toBe(1);
  expect(cloudChatRequests[0]?.['model']).toBe(GEMINI_RESEARCH_MODEL.id);

  const assistant = page.locator('[data-role="assistant"]').last();
  await expect(assistant).toContainText('The verified research pass is complete.');
  await expect(assistant.getByRole('region', { name: 'Agent activity' })).toHaveCount(1);

  const activityToggle = assistant.getByRole('button', { name: /show agent activity/i });
  await expect(activityToggle).toHaveAttribute('aria-expanded', 'false');
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
