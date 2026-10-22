import { test, expect, type BrowserContext } from '@playwright/test';
import { holdMockDevBrowser, mockAuthProvider } from './lib/mock-auth-provider';

test.use({ trace: 'off', video: 'off' });

function acceptanceOrigin(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('Configure the browser acceptance base URL.');
  const url = new URL(baseURL);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Use an origin without credentials, a path or query parameters.');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (loopback && ['http:', 'https:'].includes(url.protocol)) return url.origin;
  if (
    process.env['AGI_E10_DESKTOP_LOGIN'] === '1' &&
    process.env['AGI_E10_OWNED_ORIGIN'] === url.origin &&
    url.protocol === 'https:' &&
    url.hostname.endsWith('-siddharthanagula4.vercel.app')
  )
    return url.origin;
  throw new Error('Use loopback, or explicitly opt into the owned protected Preview.');
}

async function protect(context: BrowserContext, origin: string) {
  const token = process.env['VERCEL_OIDC_TOKEN'];
  if (!token) return;
  await context.route(`${origin}/**`, async (route) =>
    route.continue({
      headers: {
        ...(await route.request().allHeaders()),
        'x-vercel-trusted-oidc-idp-token': token,
      },
    }),
  );
}

// Exercise the shipped UI without an account. Protected Preview runs keep their
// real signed-out provider; local CI uses the existing browser-only provider fixture.
test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = acceptanceOrigin(baseURL);
  if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) {
    await holdMockDevBrowser(page, origin);
    await mockAuthProvider(page);
  } else {
    await protect(context, origin);
  }
});

test('shared Web login stays usable through Desktop handoff, reload, cancellation and expiry', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const origin = acceptanceOrigin(baseURL);
  await page.setViewportSize({ width: 1280, height: 800 });
  let pending: { kind: 'idle' } | { kind: 'waiting'; expiresAtMs: number } = { kind: 'idle' };
  let starts = 0;
  let cancellations = 0;
  let rejectCancellation = false;
  let lifetime = 60_000;
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await context.exposeBinding('__e10NativeSignIn', async (_source, command: string) => {
    if (command === 'browser_sign_in_state') {
      if (pending.kind === 'waiting' && pending.expiresAtMs <= Date.now())
        pending = { kind: 'idle' };
      return { ok: true, value: pending };
    }
    if (command === 'browser_sign_in_start') {
      starts += 1;
      if (pending.kind === 'idle')
        pending = { kind: 'waiting', expiresAtMs: Date.now() + lifetime };
      return { ok: true, value: { started: true, expiresAtMs: pending.expiresAtMs } };
    }
    if (command === 'browser_sign_in_cancel') {
      if (rejectCancellation)
        return {
          ok: false,
          error: { code: 'io-error', message: 'Cancellation could not be confirmed. Try again.' },
        };
      cancellations += 1;
      pending = { kind: 'idle' };
      return { ok: true, value: { cancelled: true } };
    }
    return {
      ok: false,
      error: { code: 'unsupported-platform', message: 'Outside this controlled sign-in check.' },
    };
  });
  await context.addInitScript(() => {
    const hostWindow = window as typeof window & {
      __e10NativeSignIn: (command: string) => Promise<unknown>;
    };
    Object.defineProperty(hostWindow, 'agiHost', {
      value: {
        shell: 'electron',
        browserSignIn: { cancellation: true },
        platform: 'electron-darwin',
        appVersion: '0.0.4-e10.20261017',
        invokeRuntime: (command: string) => hostWindow.__e10NativeSignIn(command),
        onRuntimeEvent: () => () => undefined,
        onDeepLink: () => () => undefined,
        onHostCommand: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
        openExternal: async () => undefined,
        notify: async () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto(`${origin}/login?redirectTo=%2Fchat&surface=desktop`);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue in your browser', exact: true }),
  ).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  await expect(page.getByLabel('Cookie consent', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cookie-consent'))).toBeNull();
  await expect(
    page.locator('script[src*="googletagmanager"],script[src*="google-analytics"]'),
  ).toHaveCount(0);

  await page.getByRole('button', { name: /Continue with Google/ }).click();
  await expect(page.getByRole('button', { name: 'Cancel sign-in', exact: true })).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Open the browser again', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('form button[type="submit"]')).toBeDisabled();
  await expect(page.getByTestId('auth-phase')).toContainText('Finish signing in in your browser');
  await expect(page.locator('form button[type="submit"]')).not.toHaveAttribute('aria-busy', 'true');
  expect(new URL(page.url()).origin).toBe(origin);
  expect(starts).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('desktop-sign-in-waiting.png') });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Cancel sign-in', exact: true })).toBeInViewport();
  await expect(page.locator('form button[type="submit"]')).toBeDisabled();
  expect(starts).toBe(1);
  rejectCancellation = true;
  await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
  await expect(page.getByText('Cancellation could not be confirmed. Try again.')).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeDisabled();
  rejectCancellation = false;
  await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  expect(cancellations).toBe(1);
  await expect(page.getByTestId('auth-phase')).toBeEmpty();
  await page.screenshot({
    path: testInfo.outputPath('desktop-sign-in-cancelled.png'),
  });

  await page.getByRole('button', { name: /Continue with Google/ }).click();
  await expect(page.getByRole('button', { name: 'Cancel sign-in', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  expect(cancellations).toBe(2);

  lifetime = 1000;
  await page.getByRole('button', { name: 'Continue in your browser', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to sign in', exact: true })).toBeInViewport();
  await expect(page.getByText(/That sign-in link has expired/)).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to sign in', exact: true })).toHaveCount(0);
  expect(starts).toBe(3);
  await expect(page.getByLabel('Cookie consent', { exact: true })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('the ordinary website still offers cookie preferences', async ({ page, baseURL }) => {
  const origin = acceptanceOrigin(baseURL);
  await page.goto(`${origin}/login?redirectTo=%2Fchat`);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.getByLabel('Cookie consent', { exact: true })).toBeVisible();
});

test('an older Desktop gets a clear update message and usable local sign-in', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = acceptanceOrigin(baseURL);
  let commands = 0;
  await context.exposeBinding('__e10UnsupportedNative', () => {
    commands += 1;
    throw new Error('Old native host must not be called');
  });
  await context.addInitScript(() => {
    const hostWindow = window as typeof window & { __e10UnsupportedNative: () => Promise<never> };
    Object.defineProperty(hostWindow, 'agiHost', {
      value: {
        shell: 'electron',
        platform: 'electron-darwin',
        appVersion: '0.0.3-e10.20261017',
        invokeRuntime: () => hostWindow.__e10UnsupportedNative(),
        onRuntimeEvent: () => () => undefined,
        onDeepLink: () => () => undefined,
        onHostCommand: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto(`${origin}/login?redirectTo=%2Fchat&surface=desktop`);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Continue in your browser', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /Continue with Google/ }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Update AGI Desktop');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  expect(new URL(page.url()).origin).toBe(origin);
  expect(commands).toBe(0);
});
