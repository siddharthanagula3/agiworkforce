import { expect, test, type Page, type Route } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * The browser runs the real AGI Code page. GitHub and the sandbox stay mocked:
 * this checks connection state and that Send puts the typed repository on the
 * create request. It does not install a GitHub App or clone a repository.
 */
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SETTINGS_KEY = 'agiworkforce-web-settings';

type ConnectionStatus =
  | 'unconfigured'
  | 'linking-unavailable'
  | 'unauthorized'
  | 'authorization-pending'
  | 'connected'
  | 'no-repositories'
  | 'reauthorization-required';

interface CapturedCreate {
  repository: { installationId: number; fullName: string; branch: string | null } | null;
  repositoryUrl: string | null;
  repositoryBranch: string | null;
  networkAccess: string;
  title: string;
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    title: 'Run the tests',
    repositoryUrl: null,
    repositoryBranch: null,
    networkAccess: 'trusted',
    runtimeId: null,
    extraHosts: [],
    state: 'ready',
    workspacePath: '/home/user',
    workingBranch: null,
    baseBranch: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    archivedAt: null,
    contextInputTokens: 0,
    contextOutputTokens: 0,
    lastError: null,
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

function repositoryList(status: ConnectionStatus) {
  const connected = status === 'connected';
  return {
    repositories: connected
      ? [
          {
            installationId: 42,
            owner: 'acme',
            name: 'widgets',
            fullName: 'acme/widgets',
            defaultBranch: 'main',
            isPrivate: false,
          },
        ]
      : [],
    installationCount:
      connected || status === 'reauthorization-required' || status === 'no-repositories' ? 1 : 0,
    truncated: false,
    unreachable:
      status === 'reauthorization-required' ? [{ installationId: 42, accountLogin: 'acme' }] : [],
    connection: { status },
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installCodeRoutes(
  page: Page,
  status: ConnectionStatus,
): Promise<{ creates: CapturedCreate[]; goals: string[] }> {
  const creates: CapturedCreate[] = [];
  const goals: string[] = [];
  let created = session();

  await page.route('**/api/github/repositories**', async (route) => {
    if (route.request().method() !== 'GET') return route.abort();
    return fulfillJson(route, repositoryList(status));
  });

  await page.route('**/api/code/sessions**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === '/api/code/sessions' && method === 'GET') {
      return fulfillJson(route, {
        availability: {
          deploymentEnabled: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: creates.length > 0 ? [created] : [],
        runtimes: [],
      });
    }

    if (pathname === '/api/code/sessions' && method === 'POST') {
      const body = request.postDataJSON() as CapturedCreate;
      creates.push(body);
      created = session({
        title: body.title,
        repositoryUrl: body.repositoryUrl,
        repositoryBranch: body.repositoryBranch,
        networkAccess: body.networkAccess,
        state: 'ready',
      });
      return fulfillJson(route, { session: created, terminalEntries: [], turns: [] }, 201);
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}` && method === 'GET') {
      return fulfillJson(route, { session: created, terminalEntries: [], turns: [] });
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}/agent/approvals` && method === 'GET') {
      return fulfillJson(route, { approvals: [] });
    }

    if (pathname === `/api/code/sessions/${SESSION_ID}/agent` && method === 'POST') {
      const body = request.postDataJSON() as { goal?: string };
      goals.push(body.goal ?? '');
      return fulfillJson(route, {
        turnId: '22222222-2222-4222-8222-222222222222',
        stopReason: 'done',
        stepsUsed: 1,
        finalMessage: 'Ran the tests.',
        steps: [],
      });
    }

    return route.continue();
  });

  return { creates, goals };
}

async function skipFirstRun(page: Page) {
  await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    const stored = raw
      ? (JSON.parse(raw) as { state?: Record<string, unknown>; version?: number })
      : {};
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...stored,
        state: { ...(stored.state ?? {}), codeFirstRunCompleted: true },
        version: stored.version ?? 0,
      }),
    );
  }, SETTINGS_KEY);
}

async function openCode(page: Page) {
  await page.goto('/code', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('textbox', { name: 'Describe a task or ask a question' }),
  ).toBeVisible({
    timeout: 30_000,
  });
}

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'Select repository' }).click();
  const panel = page.locator('[data-side="top"]').last();
  await expect(panel).toBeVisible();
  return panel;
}

async function panelFit(panel: ReturnType<Page['locator']>) {
  return panel.evaluate((element) => {
    const view = { width: window.innerWidth, height: window.innerHeight };
    const rect = element.getBoundingClientRect();
    const clipped: string[] = [];
    for (const node of element.querySelectorAll<HTMLElement>('*')) {
      if (node.closest('.sr-only') || node.clientWidth < 2 || node.clientHeight < 2) continue;
      const style = getComputedStyle(node);
      const wraps = style.whiteSpace === 'normal' || style.whiteSpace === 'pre-wrap';
      if (!wraps && node.scrollWidth > node.clientWidth + 1) {
        clipped.push((node.textContent ?? '').trim().slice(0, 80));
      }
    }
    return {
      view,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      inside:
        rect.left >= -1 &&
        rect.top >= -1 &&
        rect.right <= view.width + 1 &&
        rect.bottom <= view.height + 1,
      clipped,
    };
  });
}

test.describe('AGI Code GitHub connection and repository URL', () => {
  test('lists repositories when GitHub is already connected', async ({ page }) => {
    await installCodeRoutes(page, 'connected');
    await signIn(page);
    await skipFirstRun(page);
    await openCode(page);

    await page.getByRole('button', { name: 'Select repository' }).click();

    await expect(page.getByRole('button', { name: /acme\/widgets/ })).toBeVisible();
    await expect(page.getByText('Connect your GitHub account')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Connect GitHub' })).toHaveCount(0);
  });

  test('explains an unconfigured GitHub App and keeps the repository URL', async ({ page }) => {
    await installCodeRoutes(page, 'unconfigured');
    await signIn(page);
    await skipFirstRun(page);
    await openCode(page);

    await page.getByRole('button', { name: 'Select repository' }).click();

    await expect(page.getByText('GitHub is not configured')).toBeVisible();
    await expect(page.getByLabel('Repository URL')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connect GitHub' })).toHaveCount(0);
  });

  test('asks to finish authorization instead of starting setup from scratch', async ({ page }) => {
    await installCodeRoutes(page, 'authorization-pending');
    await signIn(page);
    await skipFirstRun(page);
    await openCode(page);

    await page.getByRole('button', { name: 'Select repository' }).click();

    const finish = page.getByRole('link', { name: 'Finish GitHub authorization' });
    await expect(finish).toBeVisible();
    await expect(finish).toHaveAttribute('href', '/api/github/install/start?returnPath=%2Fcode');
    await expect(page.getByText('Connect your GitHub account')).toHaveCount(0);
  });

  test('offers reconnection when the saved GitHub authorization cannot list repositories', async ({
    page,
  }) => {
    await installCodeRoutes(page, 'reauthorization-required');
    await signIn(page);
    await skipFirstRun(page);
    await openCode(page);

    await page.getByRole('button', { name: 'Select repository' }).click();

    const reconnect = page.getByRole('link', { name: 'Reconnect GitHub' });
    await expect(reconnect).toBeVisible();
    await expect(reconnect).toHaveAttribute('href', '/api/github/install/start?returnPath=%2Fcode');
  });

  test('sends a typed repository URL with the task and starts the turn', async ({ page }) => {
    const api = await installCodeRoutes(page, 'connected');
    await signIn(page);
    await skipFirstRun(page);
    await openCode(page);

    await page.getByRole('button', { name: 'Select repository' }).click();
    await page.getByRole('button', { name: 'Use a repository URL instead' }).click();
    await page.getByLabel('Repository URL').fill('https://github.com/acme/widgets.git/');
    await page.getByLabel('Branch').fill('release');
    await page
      .getByRole('textbox', { name: 'Describe a task or ask a question' })
      .fill('run the tests');
    await page.getByRole('button', { name: 'Start the task' }).click();

    await expect
      .poll(() => api.creates[0]?.repositoryUrl)
      .toBe('https://github.com/acme/widgets.git');
    expect(api.creates[0]).toMatchObject({
      repository: null,
      repositoryBranch: 'release',
      networkAccess: 'trusted',
    });
    await expect.poll(() => api.goals[0]).toBe('run the tests');
    await expect(page.getByText('Ran the tests.')).toBeVisible();
  });

  test('keeps the task on the page when the repository URL is not a GitHub repository', async ({
    page,
  }) => {
    const api = await installCodeRoutes(page, 'unconfigured');
    await signIn(page);
    await skipFirstRun(page);
    await openCode(page);

    await page.getByRole('button', { name: 'Select repository' }).click();
    await page.getByLabel('Repository URL').fill('https://example.com/acme/widgets');
    await page
      .getByRole('textbox', { name: 'Describe a task or ask a question' })
      .fill('run the tests');
    await page.getByRole('button', { name: 'Start the task' }).click();

    await expect(page.getByTestId('code-notices').getByRole('alert')).toContainText(
      'Only public HTTPS GitHub repository URLs in owner/repository form are supported.',
    );
    await expect
      .poll(() =>
        page.getByRole('textbox', { name: 'Describe a task or ask a question' }).inputValue(),
      )
      .toBe('run the tests');
    expect(api.creates).toHaveLength(0);
  });

  test('shows the GitHub result after the browser returns from authorization', async ({ page }) => {
    await installCodeRoutes(page, 'connected');
    await signIn(page);
    await skipFirstRun(page);
    await page.goto('/code?github=connected', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('GitHub connected.')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/code$/);
  });

  test('renders each connection state inside the viewport', async ({ page }) => {
    test.setTimeout(180_000);
    const shots = test.info().outputPath('render');
    await installCodeRoutes(page, 'connected');
    await signIn(page);
    await skipFirstRun(page);

    const states = [
      'connected',
      'unconfigured',
      'linking-unavailable',
      'authorization-pending',
      'reauthorization-required',
      'no-repositories',
    ] as const;
    const frames = [
      { name: 'desktop-dark', width: 1440, height: 900, theme: 'dark' },
      { name: 'desktop-light', width: 1440, height: 900, theme: 'light' },
      { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
      { name: 'narrow-dark', width: 320, height: 700, theme: 'dark' },
    ];

    for (const frame of frames) {
      await page.emulateMedia({ colorScheme: frame.theme === 'light' ? 'light' : 'dark' });
      await page.setViewportSize({ width: frame.width, height: frame.height });
      await page.addInitScript((theme) => {
        try {
          window.localStorage.setItem('theme', theme);
        } catch {
          /* storage can be unavailable during the first clerk document */
        }
      }, frame.theme);

      for (const status of states) {
        await page.unroute('**/api/github/repositories**');
        await page.route('**/api/github/repositories**', async (route) => {
          if (route.request().method() !== 'GET') return route.abort();
          return fulfillJson(route, repositoryList(status));
        });
        await page.goto('/code', { waitUntil: 'domcontentloaded' });
        await expect(
          page.getByRole('textbox', { name: 'Describe a task or ask a question' }),
        ).toBeVisible({ timeout: 30_000 });
        await page.evaluate((theme) => {
          document.documentElement.classList.remove('light', 'dark');
          document.documentElement.classList.add(theme);
          document.documentElement.setAttribute('data-theme', theme);
          document.documentElement.style.colorScheme = theme;
        }, frame.theme);
        const panel = await openPicker(page);
        const fit = await panelFit(panel);
        const hit = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = Math.min(Math.max(rect.top + 28, 0), rect.bottom - 8);
          const top = document.elementsFromPoint(x, y)[0];
          const describe = (node: Element | null) =>
            node
              ? {
                  tag: node.tagName,
                  testId: node.getAttribute('data-testid'),
                  className: String(node.className).slice(0, 140),
                  z: getComputedStyle(node).zIndex,
                }
              : null;
          return {
            inside: top ? element.contains(top) || top === element : false,
            panelZ: getComputedStyle(element).zIndex,
            wrapperZ: element.parentElement ? getComputedStyle(element.parentElement).zIndex : null,
            top: describe(top ?? null),
          };
        });
        expect(fit.inside, `${frame.name} ${status} ${JSON.stringify(fit.rect)}`).toBe(true);
        expect(fit.clipped, `${frame.name} ${status}`).toEqual([]);
        expect(hit.inside, `${frame.name} ${status} ${JSON.stringify(hit)}`).toBe(true);
        await panel.screenshot({ path: `${shots}/${frame.name}-${status}.png` });
      }
    }
  });
});
