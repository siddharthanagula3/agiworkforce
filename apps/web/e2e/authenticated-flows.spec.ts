/**
 * Authenticated real-UI e2e: signs the QA user in via a Clerk sign-in *ticket*
 * (no stored password), then exercises primary logged-in workflows that the
 * signed-out specs cannot reach.
 *
 * Auth recipe (per project-web-auth-clerk-qa-gotchas / reference-clerk-ticket-
 * playwright-evidence): mint POST api.clerk.com/v1/sign_in_tokens {user_id} with
 * CLERK_SECRET_KEY (loaded into process.env by playwright.config's .env.local
 * loader — never printed), then in-page signIn.create({strategy:'ticket'}) +
 * setActive. The dev handshake can destroy the first eval context, so Clerk-load
 * is retried.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v'; // max-tier QA account

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
  if (!res.ok) {
    throw new Error(`sign_in_tokens failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error('sign_in_tokens returned no token');
  return json.token;
}

async function signInWithTicket(page: Page, ticket: string): Promise<void> {
  // The Clerk dev handshake redirects /sign-in and destroys the eval context, so
  // retry the whole load-then-signin sequence and settle navigation each time.
  let signedIn = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < 4 && !signedIn; attempt++) {
    try {
      await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
      // Let the dev handshake redirect finish before touching the page.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForFunction(
        () => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
        { timeout: 15000 },
      );
      await page.evaluate(async (t) => {
        const clerk = (
          window as unknown as {
            Clerk: {
              client: {
                signIn: { create: (o: unknown) => Promise<{ createdSessionId?: string }> };
              };
              setActive: (o: unknown) => Promise<void>;
            };
          }
        ).Clerk;
        const res = await clerk.client.signIn.create({ strategy: 'ticket', ticket: t });
        if (res.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId });
        }
      }, ticket);
      signedIn = true;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1500);
    }
  }
  if (!signedIn) {
    throw new Error(`Clerk ticket sign-in failed after retries: ${String(lastError)}`);
  }

  // Give Clerk a moment to persist the session cookies before navigating.
  await page.waitForTimeout(1500);
}

// This suite exercises real logged-in flows, so it genuinely requires the Clerk
// secret to mint a sign-in ticket. mintSignInTicket() throws a clear error if
// CLERK_SECRET_KEY is absent (rather than silently skipping) — an authenticated
// e2e without credentials is not meaningfully "passing".
test.describe('authenticated primary workflows', () => {
  test('signed-in user reaches cloud projects (not the sign-in gate) and the composer', async ({
    page,
  }) => {
    const ticket = await mintSignInTicket();
    await signInWithTicket(page, ticket);

    // 1) Projects: the signed-out gate ("Sign in to view your cloud projects")
    //    must be gone, and the projects hub chrome must render for a real user.
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/sign in to view your cloud projects/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    // 2) Chat: the composer (the core product surface) renders for a signed-in
    //    user with a usable message input.
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    const composer = page.getByRole('textbox').first();
    await expect(composer).toBeVisible({ timeout: 20000 });
    await expect(composer).toBeEditable();

    // 3) Other primary signed-in surfaces render for a real user (not a gate or
    //    an error boundary): Customize (settings) and Library.
    await page.goto('/customize');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);

    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);

    // 3b) AGI Work task history (new /tasks surface): the run-list consumer
    //     renders for a real user (heading + Active/All filter, not a gate or an
    //     app error boundary) and degrades gracefully. The underlying /runs API
    //     depends on migrations 0061-0066 (cloud_agent_runs) being applied to the
    //     target DB; when they are not, the page shows an honest error state —
    //     which must never be an app error boundary. (See known-flaws
    //     WEB-CLOUD-AGENT-RUNS-MIGRATION-UNAPPLIED-01.)
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Active' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);

    // 3c) Global search federates projects (env-independent: web_conversations
    //     and user_projects both exist): the /api/search response carries the
    //     projects array the search dialog now renders.
    const searchRes = await page.request.get('/api/search?q=test&limit=5');
    expect(searchRes.status()).toBe(200);
    const searchBody = (await searchRes.json()) as { projects: unknown[] };
    expect(Array.isArray(searchBody.projects)).toBe(true);

    // 4) Cross-device cloud sync (WEB-CHAT-SYNC-500 regression): the pull endpoint
    //    must return 200 for a user WITH data. node-postgres returns timestamptz as
    //    Date, which the wire schema (z.string()) rejected on any non-empty page —
    //    500ing sync for every real account. page.request shares the signed-in
    //    session cookie, so this exercises the live RLS + Date-serialization path.
    const syncRes = await page.request.get('/api/chat/sync?since=0');
    expect(syncRes.status()).toBe(200);
    const syncBody = (await syncRes.json()) as {
      conversations: unknown[];
      messages: unknown[];
      artifacts: unknown[];
    };
    expect(Array.isArray(syncBody.conversations)).toBe(true);
    expect(Array.isArray(syncBody.messages)).toBe(true);
  });

  // DoD dimensions that only the real, signed-in UI can verify (validation,
  // cancellation, authorization, concurrency, persistence are covered by
  // SendButton.test.tsx, the RLS/route contract tests, and the run-concurrency
  // guard). One sign-in, three checks, to respect Clerk dev usage limits.
  // Failure recovery: a failing background sync must NOT take down the chat UI.
  // Force /api/chat/sync to 500 and assert the composer still renders (graceful
  // degradation — the exact class of WEB-CHAT-SYNC-500, now a guarded contract).
  // The forced route is torn down with the page context (no manual unroute — the
  // 500 triggers client retry traffic that unroute would block draining behind).
  test('chat UI degrades gracefully when background sync fails', async ({ page }) => {
    const ticket = await mintSignInTicket();
    await signInWithTicket(page, ticket);

    await page.route('**/api/chat/sync**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced"}' }),
    );
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);
  });

  // Responsiveness + accessibility on the two primary signed-in surfaces. Waits on
  // concrete elements (not networkidle) so background polling never stalls the wait.
  test('signed-in surfaces are responsive and free of critical a11y violations', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const ticket = await mintSignInTicket();
    await signInWithTicket(page, ticket);

    async function expectNoCriticalA11y(label: string) {
      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter((v) => v.impact === 'critical');
      expect(
        critical,
        `${label} critical a11y violations: ${critical.map((v) => v.id).join(', ')}`,
      ).toEqual([]);
    }

    // Phone viewport: composer stays reachable, no horizontal overflow (a common
    // broken-mobile-layout tell).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 20000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding tolerance

    // Accessibility on the two primary surfaces — no CRITICAL axe violations
    // (keyboard traps, unlabeled interactive controls, etc.). Scan /chat IN PLACE
    // at desktop width (re-navigating to the same URL detaches the frame), then
    // navigate once to /projects.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await expectNoCriticalA11y('/chat');

    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 20000 });
    await expectNoCriticalA11y('/projects');
  });
});
