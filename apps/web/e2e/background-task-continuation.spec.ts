import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKPOINT_STATES = new Set([
  'completed',
  'ready_for_review',
  'awaiting_input',
  'failed',
  'cancelled',
]);
const CHECKPOINT_POLL_TIMEOUT_MS = 150_000;
const CHECKPOINT_POLL_INTERVAL_MS = 3_000;
const RELIABLE_LOCAL_PROVIDERS = new Set(['openai', 'google', 'anthropic']);

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  category: string;
  capabilities: { tools: boolean };
  availability: { state: string };
  pricing: { inputPerMillion: number; outputPerMillion: number };
}

interface CloudAgentRunSnapshot {
  run: {
    id: string;
    state: string;
    lastEventSequence: number;
    conversationTitle?: string | null;
    usage?: { costCents: number | null } | undefined;
  };
  events: unknown[];
}

async function cheapestReliableAgentModel(request: APIRequestContext): Promise<CatalogModel> {
  const response = await request.get('/api/models');
  expect(response.status(), 'GET /api/models failed').toBe(200);
  const body = (await response.json()) as { models: CatalogModel[] };
  const eligible = body.models
    .filter(
      (model) =>
        model.capabilities.tools &&
        model.availability.state === 'available' &&
        model.category !== 'chat' &&
        model.category !== 'image' &&
        model.category !== 'video' &&
        RELIABLE_LOCAL_PROVIDERS.has(model.provider),
    )
    .sort(
      (a, b) =>
        a.pricing.inputPerMillion +
        a.pricing.outputPerMillion -
        (b.pricing.inputPerMillion + b.pricing.outputPerMillion),
    );
  expect(
    eligible.length,
    'no tool-capable configured model found in GET /api/models',
  ).toBeGreaterThan(0);
  return eligible[0]!;
}

async function selectComposerModel(page: Page, modelName: string): Promise<void> {
  await page.getByRole('button', { name: /change model|saving model selection/i }).click();
  const target = page.getByRole('button', { name: modelName, exact: true });
  if (!(await target.isVisible({ timeout: 1500 }).catch(() => false))) {
    const searchBox = page.getByRole('textbox', { name: 'Search models' });
    if (await searchBox.count()) {
      await searchBox.fill(modelName);
    } else {
      const allModels = page.getByRole('button', { name: /All models/ });
      if (await allModels.count()) await allModels.first().click();
    }
  }
  await expect(target).toBeVisible({ timeout: 10_000 });
  await target.click();
}

async function fetchCloudAgentRun(
  request: APIRequestContext,
  runId: string,
): Promise<CloudAgentRunSnapshot> {
  const response = await request.get(
    `/api/llm/v1/chat/completions/runs/${runId}?after=-1&limit=500`,
  );
  expect(response.status(), `run detail fetch for ${runId} failed`).toBe(200);
  return (await response.json()) as CloudAgentRunSnapshot;
}

async function waitForCheckpoint(
  request: APIRequestContext,
  runId: string,
): Promise<CloudAgentRunSnapshot> {
  const deadline = Date.now() + CHECKPOINT_POLL_TIMEOUT_MS;
  let latest: CloudAgentRunSnapshot | undefined;
  while (Date.now() < deadline) {
    latest = await fetchCloudAgentRun(request, runId);
    if (CHECKPOINT_STATES.has(latest.run.state)) return latest;
    await new Promise((resolve) => setTimeout(resolve, CHECKPOINT_POLL_INTERVAL_MS));
  }
  throw new Error(
    `Run ${runId} never reached a checkpoint state with nobody attached; last state=${latest?.run.state} lastEventSequence=${latest?.run.lastEventSequence}`,
  );
}

test.describe('background task continuation', () => {
  test('an AGI Work run keeps executing on the server after its page closes', async ({ page }) => {
    test.setTimeout(300_000);
    const context = page.context();

    await signIn(page);

    const model = await cheapestReliableAgentModel(context.request);

    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    const composer = page.getByRole('textbox', { name: /message input/i });
    await expect(composer).toBeEditable({ timeout: 20_000 });

    await selectComposerModel(page, model.name);

    const agiWorkToggle = page.getByRole('button', { name: 'AGI Work', exact: true });
    await expect(agiWorkToggle).toBeVisible({ timeout: 20_000 });
    if ((await agiWorkToggle.getAttribute('aria-pressed')) !== 'true') {
      await agiWorkToggle.click();
    }
    await expect(agiWorkToggle).toHaveAttribute('aria-pressed', 'true');

    const marker = `bgtask-${Date.now()}`;
    const prompt = `Background task continuation check ${marker}. Reply with exactly one short sentence acknowledging this instruction. Do not ask follow-up questions.`;
    await composer.fill(prompt);

    const completionResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/llm/v1/chat/completions' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    const completionResponse = await completionResponsePromise;
    expect(
      completionResponse.status(),
      'the managed turn was rejected before a run could start',
    ).toBe(200);

    const headers = completionResponse.headers();
    const runId = headers['x-agi-agent-run-id'];
    expect(runId, 'server accepted the turn but returned no durable run id header').toMatch(
      RUN_ID_PATTERN,
    );
    expect(
      headers['x-agi-tool-loop'],
      'this AGI Work turn did not run on the durable Workflow transport, so closing the page would kill it',
    ).toBe('durable');

    const baseline = await fetchCloudAgentRun(context.request, runId!);

    // Simulate the browser tab closing mid-run: this aborts the in-flight
    // fetch that started the turn. A request-scoped execution dies with it;
    // a durable one keeps advancing with nobody attached.
    await page.close();

    const settled = await waitForCheckpoint(context.request, runId!);
    expect(
      settled.run.lastEventSequence,
      'the run recorded no further progress after its page was closed',
    ).toBeGreaterThanOrEqual(baseline.run.lastEventSequence);

    const reopened = await context.newPage();
    await reopened.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(reopened.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 20_000 });

    const listResponsePromise = reopened.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/llm/v1/chat/completions/runs' &&
        response.request().method() === 'GET',
    );
    await reopened
      .getByTestId('tasks-view')
      .getByRole('button', { name: 'All', exact: true })
      .click();
    const listResponse = await listResponsePromise;
    expect(listResponse.status()).toBe(200);
    const listBody = (await listResponse.json()) as {
      runs: Array<{ id: string; state: string }>;
    };
    const listedRun = listBody.runs.find((run) => run.id === runId);
    expect(
      listedRun,
      'the reopened Tasks list did not include the run started before the page closed',
    ).toBeTruthy();
    expect(listedRun!.state).toBe(settled.run.state);

    if (settled.run.usage && settled.run.usage.costCents !== null) {
      const costBadge = reopened.getByTestId(`task-cost-${runId}`);
      await expect(costBadge).toBeVisible({ timeout: 20_000 });
      await costBadge.click();
      await expect(reopened.getByTestId('task-cost')).toBeVisible({ timeout: 20_000 });
    }

    await reopened.close();
  });
});
