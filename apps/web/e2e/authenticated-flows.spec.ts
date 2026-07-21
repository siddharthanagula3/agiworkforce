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
  });
});
