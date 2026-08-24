import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v';

const CONSOLE_ROUTES = [
  '/workspace',
  '/workspace/people',
  '/workspace/identity',
  '/workspace/policy',
  '/workspace/models',
  '/workspace/sharing',
  '/workspace/audit',
  '/workspace/data',
  '/workspace/usage',
  '/workspace/billing',
] as const;

/** The shape of `window.Clerk` this suite actually touches. */
interface ClerkBrowser {
  loaded?: boolean;
  client: { signIn: { create(options: unknown): Promise<{ createdSessionId?: string }> } };
  session?: { getToken(): Promise<string | null> };
  setActive(options: { session: string }): Promise<void>;
}

async function mintSignInTicket(): Promise<string> {
  const secret = process.env['CLERK_SECRET_KEY'];
  if (!secret) {
    throw new Error('CLERK_SECRET_KEY missing from process.env (.env.local not loaded)');
  }
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: QA_USER }),
  });
  if (!res.ok) throw new Error(`sign_in_tokens failed: HTTP ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error('sign_in_tokens returned no token');
  return json.token;
}

/**
 * Server-side `auth()` verifies the session's authorized party against
 * `CLERK_AUTHORIZED_PARTIES`, which falls back to `NEXT_PUBLIC_APP_URL`'s
 * origin. Against a localhost dev server that fallback is the production
 * origin, so every protected page redirects to sign-in no matter how valid the
 * browser session is. Run this suite with
 * `CLERK_AUTHORIZED_PARTIES=http://localhost:3000` on the SERVER process.
 */
async function signIn(page: Page): Promise<void> {
  const ticket = await mintSignInTicket();
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    { timeout: 20000 },
  );
  await page.evaluate(async (t) => {
    const clerk = (window as unknown as { Clerk: ClerkBrowser }).Clerk;
    const res = await clerk.client.signIn.create({ strategy: 'ticket', ticket: t });
    if (res.createdSessionId) await clerk.setActive({ session: res.createdSessionId });
  }, ticket);
  await page.waitForTimeout(2000);
}

async function authedFetch(page: Page, path: string): Promise<{ status: number; body: string }> {
  return page.evaluate(async (p) => {
    const clerk = (window as unknown as { Clerk: ClerkBrowser }).Clerk;
    const token = await clerk.session?.getToken();
    const res = await fetch(p, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: (await res.text()).slice(0, 400) };
  }, path);
}

test.describe('workspace administration console', () => {
  test('a signed-out visitor is gated, and told where they were going', async ({ page }) => {
    for (const route of CONSOLE_ROUTES) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBeLessThan(400);
      expect(page.url(), `${route} must gate an anonymous visitor`).toContain('/login');
      expect(page.url(), `${route} must preserve the destination`).toContain(
        `redirectTo=${encodeURIComponent(route)}`,
      );
    }
  });

  test('every console route renders a named state for a signed-in user', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await signIn(page);

    for (const route of CONSOLE_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      expect(page.url(), `${route} must not bounce a signed-in caller to sign-in`).not.toContain(
        '/login',
      );
      await expect(page.locator('body'), route).not.toContainText(
        /something went wrong|application error|internal server error/i,
      );

      // A blank frame is the failure this console exists to avoid: whatever the
      // caller's role, the page must SAY which state it is in.
      const heading = page.getByRole('heading', { level: 1 }).first();
      await expect(heading, `${route} must state what it is showing`).toBeVisible({
        timeout: 20000,
      });
      expect((await heading.textContent())?.trim().length ?? 0).toBeGreaterThan(0);
    }

    expect(errors.filter((e) => !/favicon|manifest|clerk/i.test(e))).toEqual([]);
  });

  test('the console UI and the posture API agree about who administers', async ({ page }) => {
    // The invariant is AGREEMENT, not a particular answer. This assertion used
    // to hardcode 403, which quietly encoded a bug as the expectation: every
    // non-owner administrator was refused, because entitlement resolved from
    // the OWNER's subscription row over an RLS-scoped connection that can only
    // see the caller's own. The suite stayed green while the whole
    // administration surface was closed to delegated admins. Pinning the
    // expected status is what let that happen, so this asks the two gates
    // whether they say the same thing.
    await signIn(page);
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const deniedInUi = await page
      .locator('body')
      .innerText()
      .then((t) => /you do not administer this workspace/i.test(t));

    const posture = await authedFetch(page, '/api/settings/organization/posture');

    if (deniedInUi) {
      expect(posture.status, 'UI refused, so the API must refuse too').toBe(403);
    } else {
      expect(posture.status, 'UI rendered the console, so the API must serve the same caller').toBe(
        200,
      );
    }
  });

  test('the reachable console page is free of serious accessibility violations', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // @axe-core/playwright bundles its own Playwright types, which do not
    // structurally match this repo's. authenticated-flows.spec.ts casts the
    // same way.
    const results = await new AxeBuilder({ page: page as never })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      'serious or critical accessibility violations on /workspace',
    ).toEqual([]);
  });
});
