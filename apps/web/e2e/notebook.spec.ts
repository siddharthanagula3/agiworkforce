import { expect, test, type Page, type Route } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * The notebook surface runs on the verified E2B code-interpreter template.
 * Provisioning a real sandbox here would depend on this deployment's E2B
 * configuration and the QA account's plan entitlement, neither of which this
 * spec controls, so every Code-session and notebook endpoint is mocked at the
 * API boundary: the browser runs the real notebook UI against a scripted
 * server, which is what the surface under test actually is.
 */
const SESSION_ID = '3f7a1c9e-2b4d-4a6f-9c1e-8d2b5a7f6e10';
const FAKE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    title: 'Notebook workspace',
    repositoryUrl: null,
    repositoryBranch: null,
    networkAccess: 'none',
    runtimeId: 'code-interpreter-v1',
    extraHosts: [],
    state: 'ready',
    workspacePath: '/home/user',
    lastError: null,
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockNotebookApi(page: Page): Promise<{ uploaded: string[] }> {
  const state = { uploaded: [] as string[] };

  const handler = async (route: Route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === '/api/code/sessions' && method === 'GET') {
      return fulfillJson(route, {
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session()],
        runtimes: [
          {
            id: 'code-interpreter-v1',
            name: 'Code Interpreter',
            kind: 'image',
            summary: 'Python with Jupyter, pandas, numpy and plotting.',
            agentCommand: null,
            cpuCount: 2,
            memoryMB: 4096,
            diskSizeMB: 10240,
            isPublic: true,
          },
        ],
      });
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}` && method === 'GET') {
      return fulfillJson(route, { session: session(), terminalEntries: [] });
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}/agent/approvals` && method === 'GET') {
      return fulfillJson(route, { approvals: [] });
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}/notebook/execute` && method === 'POST') {
      const body = request.postDataJSON() as { code?: string };
      const code = body.code ?? '';
      const outputs =
        code.includes('raise') || code.includes('NameError')
          ? [
              {
                kind: 'error',
                data: 'NameError: x is not defined\nTraceback (most recent call last)',
              },
            ]
          : [
              { kind: 'stream', data: 'total_sales 42\n' },
              { kind: 'image', data: FAKE_PNG_BASE64 },
              {
                kind: 'html',
                data: '<table><thead><tr><th>region</th><th>sales</th></tr></thead><tbody><tr><td>west</td><td>42</td></tr></tbody></table>',
              },
            ];
      return fulfillJson(route, { session: session(), ok: !code.includes('raise'), outputs });
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}/notebook/files` && method === 'GET') {
      return fulfillJson(route, {
        session: session(),
        files: state.uploaded.map((path) => ({ path, name: path, isDir: false, byteSize: 11 })),
      });
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}/notebook/files` && method === 'POST') {
      state.uploaded.push('sales.csv');
      return fulfillJson(route, {
        session: session(),
        file: { path: 'sales.csv', name: 'sales.csv', isDir: false, byteSize: 11 },
      });
    }

    if (
      pathname === `/api/code/sessions/${SESSION_ID}/notebook/files/sales.csv` &&
      method === 'GET'
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        headers: { 'Content-Disposition': 'attachment; filename="sales.csv"' },
        body: 'region,sales',
      });
    }

    return route.continue();
  };

  await page.route('**/api/code/sessions', handler);
  await page.route('**/api/code/sessions/**', handler);

  return state;
}

test.describe('notebook', () => {
  test.beforeEach(async ({ page }) => {
    await mockNotebookApi(page);
    await signIn(page);
  });

  test('runs a cell and renders ordered text, image and table outputs', async ({ page }) => {
    await page.goto('/code', { waitUntil: 'domcontentloaded' });

    const cellCode = page.getByLabel('Cell 1 code');
    await expect(cellCode).toBeVisible({ timeout: 20000 });
    await cellCode.fill("print('total_sales', 42)");
    await page.getByRole('button', { name: 'Run cell 1' }).click();

    await expect(page.getByText('total_sales 42')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Cell output' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'west' })).toBeVisible();

    const outputsBox = page.locator('[data-cell-status="ok"] [aria-live="polite"]');
    const order = await outputsBox.evaluate((el) =>
      Array.from(el.children).map((child) => child.tagName.toLowerCase()),
    );
    expect(order.indexOf('pre')).toBeLessThan(order.indexOf('img'));
    expect(order.indexOf('img')).toBeLessThan(order.indexOf('div'));
  });

  test('surfaces a failed cell as an error output', async ({ page }) => {
    await page.goto('/code', { waitUntil: 'domcontentloaded' });

    const cellCode = page.getByLabel('Cell 1 code');
    await expect(cellCode).toBeVisible({ timeout: 20000 });
    await cellCode.fill('raise NameError("x is not defined")');
    await page.getByRole('button', { name: 'Run cell 1' }).click();

    await expect(page.getByText('NameError: x is not defined')).toBeVisible();
  });

  test('Shift+Enter runs the cell, adds a new one, and moves keyboard focus to it', async ({
    page,
  }) => {
    await page.goto('/code', { waitUntil: 'domcontentloaded' });

    const firstCell = page.getByLabel('Cell 1 code');
    await expect(firstCell).toBeVisible({ timeout: 20000 });
    await firstCell.fill('1 + 1');
    await firstCell.press('Shift+Enter');

    const secondCell = page.getByLabel('Cell 2 code');
    await expect(secondCell).toBeVisible();
    await expect(secondCell).toBeFocused();
    await expect(page.getByText('total_sales 42')).toBeVisible();
  });

  test('uploads a file into the sandbox and downloads it back', async ({ page }) => {
    await page.goto('/code', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel('Cell 1 code')).toBeVisible({ timeout: 20000 });
    await page.getByLabel('Upload file', { exact: false }).setInputFiles({
      name: 'sales.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('region,sales'),
    });

    await expect(page.getByText('sales.csv')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download sales.csv' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('sales.csv');
  });

  for (const themeName of ['light', 'dark'] as const) {
    test(`renders the notebook panel in ${themeName} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: themeName });
      await page.goto('/code', { waitUntil: 'domcontentloaded' });

      const cellCode = page.getByLabel('Cell 1 code');
      await expect(cellCode).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: 'Add cell' })).toBeVisible();

      await cellCode.fill("print('total_sales', 42)");
      await page.getByRole('button', { name: 'Run cell 1' }).click();
      await expect(page.getByText('total_sales 42')).toBeVisible();
    });
  }
});
