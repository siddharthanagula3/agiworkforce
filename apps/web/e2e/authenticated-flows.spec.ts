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
import { readFile } from 'node:fs/promises';
import { getModels, isExecutableImageModel } from '@agiworkforce/types';

const QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v'; // max-tier QA account
const LIVE_GOOGLE_IMAGE_MODEL = getModels({
  modelTypes: ['image'],
  requireCapabilities: { imageGen: true },
})
  .filter(
    (model) =>
      model.provider === 'google' &&
      isExecutableImageModel(model) &&
      typeof model.imagePerImageCost === 'number' &&
      Number.isFinite(model.imagePerImageCost) &&
      model.imagePerImageCost > 0,
  )
  .sort(
    (left, right) =>
      (left.imagePerImageCost ?? Number.POSITIVE_INFINITY) -
      (right.imagePerImageCost ?? Number.POSITIVE_INFINITY),
  )[0];

const LIVE_IMAGE_PROMPT =
  'QA live image acceptance: a single cobalt blue circle centered on a plain white background, no text.';

const GENERATED_IMAGE_EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

function assertGeneratedImageBytes(
  bytes: Buffer,
  mimeType: keyof typeof GENERATED_IMAGE_EXTENSION_BY_MIME,
) {
  expect(bytes.length).toBeGreaterThan(12);

  switch (mimeType) {
    case 'image/jpeg':
      expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect([...bytes.subarray(-2)]).toEqual([0xff, 0xd9]);
      return;
    case 'image/png':
      expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(bytes.subarray(-8, -4).toString('ascii')).toBe('IEND');
      return;
    case 'image/webp':
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
  }
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
    await page.goto('/chat/projects');
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
    await page.goto('/chat/customize');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);

    await page.goto('/chat/library');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);
    // Recently-deleted bin (new): toggling into the bin and back must render
    // without an app error boundary, exercising the ?deleted=true list path.
    await page.getByRole('button', { name: 'Recently deleted' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);
    await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to library' }).click();

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
    // Switching the Active/All filter reloads the list without an error boundary.
    await page.getByTestId('tasks-view').getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);

    // 3c) Global search federates projects + files (env-independent:
    //     web_conversations, user_projects, media_assets all exist): the
    //     /api/search response carries the projects and files arrays the search
    //     dialog now renders.
    const searchRes = await page.request.get('/api/search?q=test&limit=5');
    expect(searchRes.status()).toBe(200);
    const searchBody = (await searchRes.json()) as { projects: unknown[]; files: unknown[] };
    expect(Array.isArray(searchBody.projects)).toBe(true);
    expect(Array.isArray(searchBody.files)).toBe(true);

    // 3d) The global-search dialog opens from the chat shell (real UI, not just
    //     the API) via the ?search=true deep link and renders without error.
    //     NB: /chat holds persistent connections, so we wait for the dialog
    //     directly rather than networkidle (which may never settle here).
    await page.goto('/chat?search=true', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);

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

  test('opt-in: cheapest live Google image generates, downloads, reloads, and appears in Library', async ({
    page,
  }, testInfo) => {
    // llm-guardrail-allow: this test performs an explicitly authorized billed provider request and must remain opt-in.
    test.skip(
      process.env['RUN_LIVE_MEDIA_E2E'] !== '1',
      'Set RUN_LIVE_MEDIA_E2E=1 to authorize a real billed provider request.',
    );
    // A failed assertion after provider acceptance must never trigger another
    // billed generation. The config disables retries for authorized live runs;
    // these guards also fail before egress if a CLI override requests a retry
    // or repeat.
    expect(testInfo.retry, 'Billed media tests must not retry').toBe(0);
    expect(testInfo.repeatEachIndex, 'Billed media tests must not repeat').toBe(0);
    test.setTimeout(240_000);
    expect(
      LIVE_GOOGLE_IMAGE_MODEL,
      'No live Google image model exists in models.json',
    ).toBeTruthy();
    const expectedMimeType = LIVE_GOOGLE_IMAGE_MODEL?.imageOutputMimeType;
    if (!expectedMimeType) {
      throw new Error('The selected image model has no canonical output MIME contract');
    }
    const liveImagePrompt = `${LIVE_IMAGE_PROMPT} Acceptance run ${Date.now()}.`;

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const ticket = await mintSignInTicket();
    await signInWithTicket(page, ticket);

    const availabilityPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/media/availability') && response.request().method() === 'GET',
      { timeout: 30_000 },
    );
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    const availabilityResponse = await availabilityPromise;
    expect(availabilityResponse.status()).toBe(200);
    const availability = (await availabilityResponse.json()) as {
      models: Array<{ model_id: string; state: string }>;
    };
    expect(availability.models).toContainEqual(
      expect.objectContaining({ model_id: LIVE_GOOGLE_IMAGE_MODEL!.id, state: 'enabled' }),
    );

    const composer = page.getByRole('textbox', { name: /message input/i });
    await expect(composer).toBeEditable({ timeout: 20_000 });
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    const createImageButton = page.getByRole('button', { name: /create image/i });
    await expect(createImageButton).not.toContainText(/checking|upgrade/i, { timeout: 20_000 });
    await createImageButton.click();
    await page.getByRole('button', { name: /select image model/i }).click();
    await page.getByRole('button', { name: LIVE_GOOGLE_IMAGE_MODEL!.name, exact: true }).click();
    await composer.fill(liveImagePrompt);

    const generationResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/media/image/generate') &&
        response.request().method() === 'POST',
      { timeout: 180_000 },
    );
    await page.getByRole('button', { name: /send message/i }).click();
    const generationResponse = await generationResponsePromise;
    const generationRequest = generationResponse.request().postDataJSON() as {
      prompt: string;
      conversation_id?: string;
      provider?: string;
      model?: string;
    };
    expect(generationRequest).toMatchObject({
      prompt: liveImagePrompt,
      provider: 'google',
      model: LIVE_GOOGLE_IMAGE_MODEL!.id,
    });
    expect(generationRequest.conversation_id).toMatch(/^[0-9a-f-]{36}$/i);
    const generationPayload = await generationResponse.json();
    expect(
      generationResponse.status(),
      `Image generation response: ${JSON.stringify(generationPayload)}`,
    ).toBe(200);
    const generation = generationPayload as {
      success: boolean;
      persisted: boolean;
      provider: string;
      images: Array<{ url?: string }>;
    };
    expect(generation).toMatchObject({ success: true, persisted: true, provider: 'google' });
    const persistedUrl = generation.images[0]?.url;
    expect(persistedUrl).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/i);
    const persistedAssetId = persistedUrl!.slice('/api/files/'.length);

    const generatedImage = page.getByRole('img', { name: liveImagePrompt });
    await expect(generatedImage).toBeVisible({ timeout: 30_000 });
    expect(
      await generatedImage.evaluate((image: HTMLImageElement) => ({
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      })),
    ).toMatchObject({ complete: true, naturalWidth: expect.any(Number) });
    expect(
      await generatedImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'More actions' }).last().click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^ai-image-\\d+\\.${GENERATED_IMAGE_EXTENSION_BY_MIME[expectedMimeType]}$`),
    );
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const downloadedBytes = await readFile(downloadPath!);
    assertGeneratedImageBytes(downloadedBytes, expectedMimeType);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedImage = page.getByRole('img', { name: liveImagePrompt });
    await expect(reloadedImage).toBeVisible({ timeout: 30_000 });
    expect(
      await reloadedImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);

    await page.goto('/chat/library', { waitUntil: 'domcontentloaded' });
    const librarySearch = page.getByRole('searchbox', { name: 'Search library files' });
    await expect(librarySearch).toBeVisible({ timeout: 20_000 });
    const libraryGrid = page.getByTestId('library-grid');
    await expect(libraryGrid).toBeVisible({ timeout: 20_000 });
    const filteredLibraryResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/library' && url.searchParams.get('q') === liveImagePrompt;
    });
    await librarySearch.fill(liveImagePrompt);
    await expect(librarySearch).toHaveValue(liveImagePrompt);
    const filteredLibraryResponse = await filteredLibraryResponsePromise;
    expect(filteredLibraryResponse.status()).toBe(200);
    const filteredLibrary = (await filteredLibraryResponse.json()) as {
      items: Array<{ id: string; prompt: string | null; uri: string }>;
    };
    expect(filteredLibrary.items).toContainEqual(
      expect.objectContaining({
        id: persistedAssetId,
        prompt: liveImagePrompt,
        uri: persistedUrl,
      }),
    );
    await expect(libraryGrid.locator(`img[src="${persistedUrl}"]`)).toBeVisible();

    await testInfo.attach('live-google-image', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
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
      // axe-core bundles its own playwright-core; Page is structurally identical but
      // nominally distinct from @playwright/test's, so cast at this one boundary.
      const results = await new AxeBuilder({ page: page as never }).analyze();
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

    await page.goto('/chat/projects', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 20000 });
    await expectNoCriticalA11y('/chat/projects');
  });
});
