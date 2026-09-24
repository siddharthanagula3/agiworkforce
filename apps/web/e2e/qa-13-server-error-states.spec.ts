import { expect, test, type Page, type Route } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * Server error states, reached by answering the list request with a status.
 *
 * A live sweep cannot see these: the API works, so the failure branch never
 * renders. Every surface here shipped at least one of - a status code on
 * screen, a failure nothing announced, or wording that blamed the reader's
 * connection for a 403.
 */

const SURFACES = [
  { route: '/chat/projects', api: '**/api/projects*' },
  { route: '/chat/library', api: '**/api/library**' },
  { route: '/tasks', api: '**/api/llm/v1/chat/completions/runs*' },
  { route: '/chat/schedules', api: '**/api/schedules*' },
];

const CASES = [
  { status: 500, body: { error: { message: 'Internal error' } } },
  { status: 403, body: { error: { message: 'Forbidden' } } },
  { status: 429, body: { error: { message: 'Too many requests' } } },
  // 401 has its own answer: the reader is not at fault and retrying will not
  // help until they sign in again.
  { status: 401, body: { error: { message: 'Unauthorized' } } },
];

const PROJECTS_ENDPOINT = /\/api\/projects(?:\?.*)?$/;
const LIBRARY_ENDPOINT = /\/api\/library(?:\?.*)?$/;
const TASK_RUNS_ENDPOINT = /\/api\/llm\/v1\/chat\/completions\/runs(?:\?.*)?$/;
const TASK_ARCHIVE_ENDPOINT = /\/api\/llm\/v1\/chat\/completions\/runs\/[0-9a-f-]+\/archive$/;
const SCHEDULES_ENDPOINT = /\/api\/schedules(?:\?.*)?$/;
const TASK_RUN_ID = '11111111-1111-4111-8111-111111111111';
const RAW_FAILURE = /500|Internal error|TypeError|Error:/i;

const libraryItem = {
  id: 'qa-write-failure-item',
  file_name: 'qa-write-failure.txt',
  mime_type: 'text/plain',
  kind: 'file',
  byte_count: 128,
  uri: '/api/files/qa-write-failure-item',
  surface: 'file',
  previewable: false,
  origin: 'generated',
  source_surface: 'web',
  provider: null,
  model: null,
  prompt: null,
  created_at: '2026-09-22T00:00:00.000Z',
};

const completedTask = {
  id: TASK_RUN_ID,
  userId: 'qa-user',
  requestId: 'qa-write-failure',
  conversationId: null,
  conversationTitle: 'Write failure fixture',
  conversationPreview: 'Verify that failed writes remain recoverable.',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'completed',
  provider: 'openai',
  model: 'fixture-task-model',
  lastEventSequence: 1,
  cancellationRequestedAt: null,
  completedAt: '2026-09-22T00:05:00.000Z',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:05:00.000Z',
};

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function dismissConsent(page: Page) {
  await page
    .getByLabel('Close and reject non-essential cookies')
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

test('server error states are announced, actionable and free of raw detail', async ({ page }) => {
  test.setTimeout(900_000);
  await signIn(page);
  const findings: unknown[] = [];

  for (const c of CASES) {
    for (const s of SURFACES) {
      await page.route(s.api, (r) =>
        r.fulfill({
          status: c.status,
          contentType: 'application/json',
          body: JSON.stringify(c.body),
        }),
      );
      await page.goto(s.route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);

      findings.push(
        await page.evaluate(
          ({ route, status }) => {
            const main = (document.querySelector('main') ?? document.body) as HTMLElement;
            const text = main.innerText;
            const alerts = [
              ...document.querySelectorAll('[role="alert"],[role="status"],[aria-live]'),
            ]
              .map((e) => (e as HTMLElement).innerText.trim())
              .filter(Boolean);
            const retry = [...document.querySelectorAll('button')]
              .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim())
              .filter((t) => /retry|try again|reload|refresh/i.test(t));
            // Wording that belongs in a log, not on screen.
            const raw = (text.match(
              /\b(500|403|429|Internal error|Forbidden|undefined|null|\[object Object\]|TypeError|Error:)\b/g,
            ) ?? []) as string[];
            return {
              route,
              status,
              visibleChars: text.trim().length,
              announced: alerts.slice(0, 2),
              retryOffered: [...new Set(retry)].slice(0, 3),
              rawLeak: [...new Set(raw)].slice(0, 5),
            };
          },
          { route: s.route, status: c.status },
        ),
      );
      await page.unroute(s.api);
    }
  }
  type Finding = {
    route: string;
    status: number;
    announced: string[];
    rawLeak: string[];
    visibleChars: number;
  };
  const results = findings as Finding[];

  const silent = results
    .filter((f) => f.announced.length === 0)
    .map((f) => `${f.status} ${f.route}`);
  expect(silent, `failure announced to nobody: ${silent.join(', ')}`).toEqual([]);

  const leaking = results
    .filter((f) => f.rawLeak.length > 0)
    .map((f) => `${f.status} ${f.route} -> ${f.rawLeak.join('/')}`);
  expect(leaking, `machine wording on screen: ${leaking.join(', ')}`).toEqual([]);

  const blank = results.filter((f) => f.visibleChars < 60).map((f) => `${f.status} ${f.route}`);
  expect(blank, `blank on error: ${blank.join(', ')}`).toEqual([]);

  // 401 is not a generic failure: retrying cannot help until the reader signs
  // in again, so the answer has to say so rather than offering the same
  // "something went wrong" as a 500.
  const vagueOn401 = results
    .filter((f) => f.status === 401)
    .filter((f) => !/sign in|session/i.test(f.announced.join(' ')))
    .map((f) => `${f.route}: ${f.announced.join(' ').slice(0, 60)}`);
  expect(vagueOn401, `401 answered generically on: ${vagueOn401.join(', ')}`).toEqual([]);
});

test('failed writes stay recoverable on projects, library, tasks and schedules', async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.route('**/api/me', async (route) => {
    const response = await route.fetch();
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }
    const body = (await response.json()) as { plan?: Record<string, unknown> };
    if (body.plan) {
      body.plan['tier'] = 'pro';
      body.plan['display_name'] = 'Pro';
    }
    await route.fulfill({ response, json: body });
  });

  await signIn(page);
  await dismissConsent(page);

  await page.route(PROJECTS_ENDPOINT, (route) =>
    route.request().method() === 'POST'
      ? json(route, 500, { error: { message: 'Internal error' } })
      : json(route, 200, { projects: [] }),
  );
  await page.goto('/chat/projects?new=1', { waitUntil: 'domcontentloaded' });
  const projectDialog = page.getByRole('dialog', { name: 'Create project' });
  await expect(projectDialog).toBeVisible({ timeout: 20_000 });
  await projectDialog.getByLabel('Project name').fill('Write failure project');
  await projectDialog.getByRole('button', { name: 'Create project', exact: true }).click();
  const projectFailure = projectDialog.getByRole('alert');
  await expect(projectFailure).toContainText('Something went wrong on our side');
  await expect(projectFailure).not.toContainText(RAW_FAILURE);
  await expect(projectDialog.getByLabel('Project name')).toHaveValue('Write failure project');
  await page.unroute(PROJECTS_ENDPOINT);

  await page.route(PROJECTS_ENDPOINT, (route) => json(route, 200, { projects: [] }));
  await page.route(LIBRARY_ENDPOINT, (route) =>
    json(route, 200, { items: [libraryItem], has_more: false, next_offset: null }),
  );
  await page.route(/\/api\/media\?id=qa-write-failure-item$/, (route) =>
    json(route, 500, { error: { message: 'Internal error' } }),
  );
  await page.goto('/chat/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(libraryItem.file_name).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: `Actions for ${libraryItem.file_name}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const libraryFailure = page.getByRole('status').filter({
    hasText: 'Something went wrong on our side',
  });
  await expect(libraryFailure).toBeVisible();
  await expect(libraryFailure).not.toContainText(RAW_FAILURE);
  await expect(page.getByText(libraryItem.file_name).first()).toBeVisible();
  await page.unroute(PROJECTS_ENDPOINT);
  await page.unroute(LIBRARY_ENDPOINT);
  await page.unroute(/\/api\/media\?id=qa-write-failure-item$/);

  await page.route(TASK_RUNS_ENDPOINT, (route) =>
    json(route, 200, { runs: [completedTask], nextCursor: null }),
  );
  await page.route(TASK_ARCHIVE_ENDPOINT, (route) =>
    json(route, 500, { error: { message: 'Internal error' } }),
  );
  await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
  const archive = page.getByRole('button', { name: 'Archive', exact: true });
  await expect(archive).toBeVisible({ timeout: 20_000 });
  await archive.click();
  const taskFailure = page.locator('[data-sonner-toast]').filter({
    hasText: 'Something went wrong on our side',
  });
  await expect(taskFailure).toBeVisible();
  await expect(taskFailure).not.toContainText(RAW_FAILURE);
  await expect(archive).toBeVisible();
  await page.unroute(TASK_RUNS_ENDPOINT);
  await page.unroute(TASK_ARCHIVE_ENDPOINT);

  await page.route(PROJECTS_ENDPOINT, (route) => json(route, 200, { projects: [] }));
  await page.route(SCHEDULES_ENDPOINT, (route) =>
    route.request().method() === 'POST'
      ? json(route, 500, { error: { message: 'Internal error' } })
      : json(route, 200, { schedules: [], pagination: { limit: 20, offset: 0 } }),
  );
  await page.goto('/chat/schedules', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Daily briefing' }).click({ timeout: 20_000 });
  const scheduleDialog = page.getByRole('dialog', { name: 'Create Schedule' });
  await expect(scheduleDialog).toBeVisible();
  await scheduleDialog.getByRole('button', { name: 'Create Schedule' }).click();
  const scheduleFailure = scheduleDialog.getByRole('alert');
  await expect(scheduleFailure).toContainText('Something went wrong on our side');
  await expect(scheduleFailure).not.toContainText(RAW_FAILURE);
  await expect(scheduleDialog.getByLabel('Schedule Name')).toHaveValue('Daily briefing');
});
