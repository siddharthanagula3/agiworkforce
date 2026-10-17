import { randomUUID } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { test, expect, type BrowserContext, type Page, type Frame } from '@playwright/test';
import { apiCall, signIn } from './qa-capability-harness';

// This suite writes only a uniquely owned acceptance artifact and revokes it.
// It is never part of ordinary local, CI or production smoke discovery.
// llm-guardrail-allow: Live writes require an explicitly owned non-production origin and QA credentials; this suite is run separately for release acceptance.
test.skip(process.env['AGI_E10_RELEASE'] !== '1', 'Explicit release environment required.');
test.use({ trace: 'off', video: 'off' });

async function protect(context: BrowserContext, origin: string, token: string | undefined) {
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

async function mountedCounter(
  page: Page,
  sandboxOrigin: string,
  diagnostics: unknown[] = [],
): Promise<Frame> {
  let selected: Frame | undefined;
  try {
    await expect
      .poll(
        async () => {
          const matches: Frame[] = [];
          for (const frame of page.frames()) {
            let owner: Frame | null = frame;
            let belongsToSandbox = false;
            while (owner) {
              try {
                if (new URL(owner.url()).origin === sandboxOrigin) belongsToSandbox = true;
              } catch {
                /* Opaque nested document. */
              }
              owner = owner.parentFrame();
            }
            if (
              belongsToSandbox &&
              (await frame
                .locator('#count')
                .count()
                .catch(() => 0)) === 1
            )
              matches.push(frame);
          }
          selected = matches[0];
          return matches.length;
        },
        { timeout: 20_000 },
      )
      .toBe(1);
  } catch {
    const frames = await Promise.all(
      page.frames().map(async (frame) => ({
        origin: (() => {
          try {
            return new URL(frame.url()).origin;
          } catch {
            return frame.url().startsWith('about:') ? frame.url() : 'opaque';
          }
        })(),
        parent: frame.parentFrame() ? page.frames().indexOf(frame.parentFrame()!) : null,
        count: await frame
          .locator('#count')
          .count()
          .catch(() => -1),
        buttons: await frame
          .getByRole('button')
          .allTextContents()
          .catch(() => []),
      })),
    );
    const elements = await page.locator('iframe').evaluateAll((nodes) =>
      nodes.map((node) => ({
        title: node.getAttribute('title'),
        srcOrigin: node.getAttribute('src')
          ? new URL(node.getAttribute('src')!, globalThis.location.href).origin
          : null,
        srcdoc: node.hasAttribute('srcdoc'),
      })),
    );
    throw new Error(
      JSON.stringify({
        expectedSandbox: sandboxOrigin,
        actualPageOrigin: new URL(page.url()).origin,
        frames,
        elements,
        diagnostics,
      }),
    );
  }
  return selected!;
}

test('publishes, executes saved data, restores a version and revokes an owned artifact', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error('An isolated release baseURL is required.');
  page.context().setDefaultTimeout(20_000);
  const origin = new URL(baseURL).origin;
  if (origin !== process.env['AGI_E10_OWNED_ORIGIN'])
    throw new Error('The release baseURL must match the explicitly owned acceptance origin.');
  await protect(page.context(), origin, process.env['VERCEL_OIDC_TOKEN']);
  const sandbox = process.env['AGI_E10_SANDBOX_ORIGIN'];
  if (!sandbox)
    throw new Error('A real separate sandbox origin is required for release acceptance.');
  if (sandbox) await protect(page.context(), sandbox, process.env['AGI_E10_SANDBOX_OIDC_TOKEN']);
  const anonymous = await browser.newContext({ baseURL });
  await protect(anonymous, origin, process.env['VERCEL_OIDC_TOKEN']);
  if (sandbox) await protect(anonymous, sandbox, process.env['AGI_E10_SANDBOX_OIDC_TOKEN']);
  const receipt: Record<string, unknown> = { origin, observedAt: new Date().toISOString() };
  const mark = (phase: string) => {
    receipt['phase'] = phase;
    console.info('[E10]', phase);
  };
  const cleanupPath = testInfo.outputPath('owned-artifact.json');
  const artifactId = `e10-${randomUUID()}`;
  const title = `Owned acceptance ${artifactId}`;
  const content = `<!doctype html><html><body><h2>Saved counter</h2><output id="count">ready</output>
<button id="load">Load saved count</button><button id="increment">Increment</button><script>
const count = document.getElementById('count');
document.getElementById('load').onclick = async () => { try { const entry = await window.agi.storage.get('counter'); count.textContent = entry?.value ?? '0'; } catch (error) { count.textContent = error.message; } };
document.getElementById('increment').onclick = async () => { try { const entry = await window.agi.storage.get('counter'); const value = String(Number(entry?.value ?? '0') + 1); await window.agi.storage.set('counter', value); count.textContent = value; } catch (error) { count.textContent = error.message; } };
</script></body></html>`;
  let token: string | undefined;
  let revoked = false;
  try {
    mark('sign-in');
    await signIn(page);
    const me = await apiCall(page, '/api/me');
    expect(me.status, me.body).toBe(200);
    receipt['authenticatedDatabase'] = 'passed';
    mark('authenticated');
    const publish = await apiCall(page, '/api/artifacts/publish', {
      method: 'POST',
      body: { artifactId, title, kind: 'html', content },
    });
    expect(publish.status, publish.body).toBe(201);
    const first = JSON.parse(publish.body) as { token: string; version: number };
    token = first.token;
    await writeFile(cleanupPath, JSON.stringify({ artifactId, token }), { mode: 0o600 });
    mark('published');
    expect(first.version).toBe(1);
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`/shared-artifact/${token}`);
    await expect(publicPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    receipt['anonymousShare'] = 'passed';
    mark('anonymous-shared-view');

    const viewer = await page.context().newPage();
    const diagnostics: unknown[] = [];
    viewer.on('pageerror', (error) => diagnostics.push({ pageError: error.message.slice(0, 700) }));
    viewer.on('framenavigated', async (frame) => {
      if (frame.url().startsWith(sandbox)) {
        try {
          await frame.waitForLoadState('domcontentloaded', { timeout: 10_000 });
          diagnostics.push({
            sdkState: await frame.evaluate(() => ({
              state: document.readyState,
              bridge: typeof (window as unknown as { __agiRuntimeBridge?: unknown })
                .__agiRuntimeBridge,
              purifier: typeof (window as unknown as { DOMPurify?: unknown }).DOMPurify,
            })),
          });
        } catch {
          diagnostics.push({ sandboxDetachedBeforeDomReady: true });
        }
      }
    });

    viewer.on('console', (message) => {
      if (/Content Security Policy|Refused|frame|blocked/i.test(message.text()))
        diagnostics.push({
          console: message
            .text()
            .replace(/'nonce-[^']+'/g, "'nonce-[redacted]'")
            .slice(0, 1000),
        });
    });
    viewer.on('requestfailed', (request) =>
      diagnostics.push({
        failedOrigin: new URL(request.url()).origin,
        resource: request.resourceType(),
        error: request.failure()?.errorText,
      }),
    );
    viewer.on('response', async (response) => {
      if (
        response.request().resourceType() === 'script' &&
        ['unpkg.com', 'cdn.jsdelivr.net'].includes(new URL(response.url()).hostname)
      )
        diagnostics.push({
          script: new URL(response.url()).origin + new URL(response.url()).pathname,
          status: response.status(),
        });
      if (response.request().resourceType() !== 'document') return;
      const headers = await response.allHeaders();
      diagnostics.push({
        documentOrigin: new URL(response.url()).origin,
        status: response.status(),
        contentType: headers['content-type'],
        disposition: headers['content-disposition'],
        xFrameOptions: headers['x-frame-options'],
        embedderPolicy: headers['cross-origin-embedder-policy'],
        resourcePolicy: headers['cross-origin-resource-policy'],
        framePolicy: headers['content-security-policy']
          ?.split(';')
          .filter((part) => /frame-src|frame-ancestors|child-src/.test(part)),
        sandboxDocument:
          new URL(response.url()).origin === sandbox
            ? await response
                .text()
                .then((body) => body.includes('sandbox-ready'))
                .catch(() => false)
            : undefined,
      });
    });

    await viewer.goto(`/shared-artifact/${token}`);
    const signedIn = () =>
      Boolean(
        (window as unknown as { Clerk?: { loaded?: boolean; session?: unknown } }).Clerk?.loaded &&
        (window as unknown as { Clerk?: { session?: unknown } }).Clerk?.session,
      );
    mark('waiting-for-viewer-identity');
    await viewer.waitForFunction(signedIn);
    mark('viewer-identity-ready');
    let counter = await mountedCounter(viewer, sandbox, diagnostics);
    await counter.getByRole('button', { name: 'Load saved count' }).click();
    await expect(counter.locator('#count')).toHaveText('0');
    mark('counter-zero');
    await counter.getByRole('button', { name: 'Increment', exact: true }).click();
    await expect(counter.locator('#count')).toHaveText('1');
    mark('counter-incremented');
    await viewer.reload();
    counter = await mountedCounter(viewer, sandbox, diagnostics);
    mark('waiting-for-viewer-identity');
    await viewer.waitForFunction(signedIn);
    mark('viewer-identity-ready');
    await counter.getByRole('button', { name: 'Load saved count' }).click();
    await expect(counter.locator('#count')).toHaveText('1');
    receipt['renderedSavedCounterAcrossReload'] = '0 → 1 → reload → 1';
    mark('persisted-across-reload');

    const rename = await apiCall(page, `/api/artifacts/publish/${token}`, {
      method: 'PATCH',
      body: { title: `${title} renamed` },
    });
    expect(rename.status, rename.body).toBe(200);
    const changed = await apiCall(page, '/api/artifacts/publish', {
      method: 'POST',
      body: {
        artifactId,
        title,
        kind: 'html',
        content: content.replace('Saved counter', 'Version two counter'),
      },
    });
    expect(changed.status, changed.body).toBe(201);
    expect(JSON.parse(changed.body)).toMatchObject({
      token,
      version: 2,
      title: `${title} renamed`,
    });
    const old = await apiCall(page, `/api/artifacts/publish/${token}/versions/1`);
    expect(old.status, old.body).toBe(200);
    expect(JSON.parse(old.body)).toMatchObject({ content });
    const restore = await apiCall(page, '/api/artifacts/publish', {
      method: 'POST',
      body: { artifactId, title, kind: 'html', content },
    });
    expect(restore.status, restore.body).toBe(201);
    expect(JSON.parse(restore.body)).toMatchObject({ token, version: 3 });
    const versions = await apiCall(page, `/api/artifacts/publish/${token}/versions`);
    expect(versions.status, versions.body).toBe(200);
    expect(
      JSON.parse(versions.body)
        .versions.map((entry: { version: number }) => entry.version)
        .sort(),
    ).toEqual([1, 2, 3]);
    receipt['renameAppendOnlyRestore'] = 'passed';

    const revoke = await apiCall(page, `/api/artifacts/publish/${token}`, { method: 'DELETE' });
    expect(revoke.status, revoke.body).toBe(200);
    revoked = true;
    await publicPage.reload();
    await expect(
      publicPage.getByRole('heading', { name: 'Shared artifact unavailable' }),
    ).toBeVisible();
    const retiredStorage = await apiCall(page, `/api/artifacts/runtime/${token}/storage`, {
      method: 'POST',
      body: { op: 'get', key: 'counter', shared: false },
    });
    expect(retiredStorage.status, retiredStorage.body).toBe(404);
    receipt['revocationClosesPageAndStorage'] = 'passed';
  } finally {
    testInfo.setTimeout(240_000);
    if (token && !revoked) {
      const cleanup = await apiCall(page, `/api/artifacts/publish/${token}`, { method: 'DELETE' });
      receipt['cleanupStatus'] = cleanup.status;
      expect(cleanup.status, cleanup.body).toBe(200);
      revoked = true;
    }
    if (revoked) await rm(cleanupPath, { force: true });
    await anonymous.close();
    await testInfo.attach('e10-acceptance', {
      body: JSON.stringify(receipt, null, 2),
      contentType: 'application/json',
    });
  }
});
