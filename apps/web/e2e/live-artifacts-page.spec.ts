import { expect, test } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const LIVE_ARTIFACTS_PAGE = '/chat/live-artifacts';
const LIVE_ARTIFACTS_API = '**/api/artifacts/live';

const ARTIFACT = {
  artifactId: '33333333-3333-4333-8333-333333333333',
  conversationId: '44444444-4444-4444-8444-444444444444',
  title: 'Weekly pipeline',
  type: 'react',
  connectors: ['slack'],
  allowedTools: [],
  refreshPolicy: 'on_open',
  lastRefreshedAt: null,
  readiness: 'ready',
  missingConnectors: [],
  createdAt: '2026-10-22T10:00:00.000Z',
  updatedAt: '2026-10-22T10:00:00.000Z',
};

test.describe('live artifacts page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('/chat/live-artifacts lists the artifacts that read connected apps', async ({ page }) => {
    await page.route(LIVE_ARTIFACTS_API, (route) =>
      route.fulfill({ json: { artifacts: [ARTIFACT] } }),
    );
    await page.goto(LIVE_ARTIFACTS_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: 'Live artifacts' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('live-artifact-card')).toHaveCount(1);
    await expect(page.getByText('Weekly pipeline')).toBeVisible();
    await expect(page.getByTestId('live-artifacts-empty')).toHaveCount(0);
  });

  test('/chat/live-artifacts says so when nothing reads a connected app yet', async ({ page }) => {
    await page.route(LIVE_ARTIFACTS_API, (route) => route.fulfill({ json: { artifacts: [] } }));
    await page.goto(LIVE_ARTIFACTS_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('live-artifacts-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('live-artifact-card')).toHaveCount(0);
  });

  test('/chat/live-artifacts offers a retry when the list cannot be loaded', async ({ page }) => {
    let failing = true;
    await page.route(LIVE_ARTIFACTS_API, (route) =>
      failing
        ? route.fulfill({ status: 500, json: { error: { message: 'Down.' } } })
        : route.fulfill({ json: { artifacts: [ARTIFACT] } }),
    );
    await page.goto(LIVE_ARTIFACTS_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    failing = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('live-artifact-card')).toHaveCount(1);
  });
});
