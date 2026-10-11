import { expect, test, type Page, type Route } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The Sites flow against a mocked publication, so the QA account's real
 * published pages are never renamed, cleared or unpublished. Every request
 * under /api/artifacts/publish is answered here; one the mock does not model
 * fails with a 500 instead of falling through to the account. It clicks the
 * rail entry, the site card, the detail tabs, Save, Clear shared data and
 * Unpublish with their confirmations; it never opens Visit or Edit in chat.
 */

const TOKEN = 'e2esiteaaaaaaaaaaaaaaaaa';
const ARTIFACT_ID = 'artifact-e2e-site';
const SHARE_URL = `https://agiworkforce.com/shared-artifact/${TOKEN}`;
const STAMP = '2026-10-09T10:00:00.000Z';
const LOAD_TIMEOUT_MS = 30_000;

interface MockSite {
  title: string;
  visibility: 'public' | 'organization';
  sharedEntries: number;
  published: boolean;
  writes: string[];
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockPublication(page: Page, site: MockSite): Promise<void> {
  await page.route('**/api/artifacts/publish**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const summary = {
      token: TOKEN,
      artifactId: ARTIFACT_ID,
      conversationId: null,
      title: site.title,
      kind: 'html',
      language: null,
      contentChars: 64,
      version: 1,
      visibility: site.visibility,
      createdAt: STAMP,
      updatedAt: STAMP,
      shareUrl: SHARE_URL,
      sandboxed: true,
    };

    if (path === '/api/artifacts/publish' && method === 'GET') {
      return json(route, 200, { artifacts: site.published ? [summary] : [], workspace: null });
    }
    if (path === `/api/artifacts/publish/${TOKEN}/versions` && method === 'GET') {
      return json(route, 200, {
        versions: [{ version: 1, title: site.title, kind: 'html', createdAt: STAMP, live: true }],
      });
    }
    if (path === `/api/artifacts/publish/${TOKEN}/versions/1` && method === 'GET') {
      return json(route, 200, {
        version: 1,
        title: site.title,
        kind: 'html',
        language: null,
        content: '<h1>Scoreboard</h1>',
      });
    }
    if (path === `/api/artifacts/publish/${TOKEN}` && method === 'PATCH') {
      const body = request.postDataJSON() as { title?: string };
      site.writes.push(`rename:${body.title}`);
      if (body.title) site.title = body.title;
      return json(route, 200, {
        token: TOKEN,
        shareUrl: SHARE_URL,
        title: site.title,
        visibility: site.visibility,
        organizationId: null,
        updatedAt: STAMP,
      });
    }
    if (path === `/api/artifacts/publish/${TOKEN}/data` && method === 'GET') {
      return json(route, 200, {
        supported: true,
        shared: {
          entries: Array.from({ length: site.sharedEntries }, (_, index) => ({
            key: `score-${index}`,
            bytes: 12,
            preview: String(index),
            truncated: false,
            updatedAt: STAMP,
          })),
          entryCount: site.sharedEntries,
          totalBytes: site.sharedEntries * 12,
          limitBytes: 20 * 1024 * 1024,
        },
        ownPersonalEntryCount: 0,
      });
    }
    if (path === `/api/artifacts/publish/${TOKEN}/data` && method === 'DELETE') {
      site.writes.push('clear');
      const cleared = site.sharedEntries;
      site.sharedEntries = 0;
      return json(route, 200, { cleared });
    }
    if (path === `/api/artifacts/publish/${TOKEN}` && method === 'DELETE') {
      site.writes.push('unpublish');
      site.published = false;
      return json(route, 200, { success: true, token: TOKEN });
    }
    return json(route, 500, { error: { message: `unmocked ${method} ${path}` } });
  });
}

test.describe('Sites', () => {
  test('lists a published site, renames it, clears its data and unpublishes it', async ({
    page,
  }) => {
    const site: MockSite = {
      title: 'Office scoreboard',
      visibility: 'public',
      sharedEntries: 2,
      published: true,
      writes: [],
    };
    await signIn(page);
    await mockPublication(page, site);

    await page.goto('/chat/library', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sites', exact: true }).first().click();
    await expect(page).toHaveURL(/\/chat\/sites$/, { timeout: LOAD_TIMEOUT_MS });

    const card = page.getByTestId('site-card');
    await expect(card).toHaveCount(1, { timeout: LOAD_TIMEOUT_MS });
    await expect(card.getByTestId('site-visibility')).toHaveText('Public');
    await card.getByRole('link', { name: 'Office scoreboard' }).click();
    await expect(page).toHaveURL(new RegExp(`/chat/sites/${TOKEN}$`));

    const name = page.getByLabel('Site name');
    await name.fill('League table');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('League table');

    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page.getByTestId('site-data-entry')).toHaveCount(2);
    await page.getByRole('button', { name: 'Clear shared data' }).click();
    const clearDialog = page.getByRole('alertdialog');
    await expect(clearDialog).toContainText('This cannot be undone.');
    await clearDialog.getByRole('button', { name: 'Clear shared data' }).click();
    await expect(page.getByText('Nothing shared yet.')).toBeVisible();

    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByTestId('site-unpublish').click();
    const unpublishDialog = page.getByRole('alertdialog');
    await expect(unpublishDialog).toContainText('stops working for everyone who has it');
    await unpublishDialog.getByRole('button', { name: 'Unpublish' }).click();

    await expect(page).toHaveURL(/\/chat\/sites$/, { timeout: LOAD_TIMEOUT_MS });
    await expect(page.getByTestId('sites-empty')).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    expect(site.writes).toEqual(['rename:League table', 'clear', 'unpublish']);
  });

  test('a cancelled unpublish leaves the site alone', async ({ page }) => {
    const site: MockSite = {
      title: 'Office scoreboard',
      visibility: 'public',
      sharedEntries: 0,
      published: true,
      writes: [],
    };
    await signIn(page);
    await mockPublication(page, site);

    await page.goto('/chat/sites', { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'More actions for Office scoreboard' })
      .click({ timeout: LOAD_TIMEOUT_MS });
    await page.getByRole('menuitem', { name: 'Unpublish' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByTestId('site-card')).toHaveCount(1);
    expect(site.writes).toEqual([]);
  });
});
