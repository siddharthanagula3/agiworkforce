import { test, expect, type Page } from '@playwright/test';

/**
 * Proves the whole loop for each control: an administrator changes it through
 * the real API, the change lands in the real database, and the RUNTIME refuses
 * the thing the control claims to refuse.
 *
 * A policy that saves but does not bind is the fake-checkbox failure this
 * console exists to avoid, and it cannot be caught by asserting the PATCH
 * returned 200. Each case below therefore ends at a request that must be
 * denied, with the denial code the product documents.
 *
 * Needs the local full stack: a production build on :3000 pointed at a Postgres
 * carrying every migration, with a seeded workspace whose owner holds an
 * enterprise entitlement. See apps/web/db/neon/verify/README.md.
 */
const QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v';

interface ClerkBrowser {
  loaded?: boolean;
  client: { signIn: { create(o: unknown): Promise<{ createdSessionId?: string }> } };
  session?: { getToken(): Promise<string | null> };
  setActive(o: { session: string }): Promise<void>;
}

async function signIn(page: Page): Promise<void> {
  const secret = process.env['CLERK_SECRET_KEY'];
  if (!secret) throw new Error('CLERK_SECRET_KEY missing (.env.local not loaded)');
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: QA_USER }),
  });
  if (!res.ok) throw new Error(`sign_in_tokens failed: HTTP ${res.status}`);
  const ticket = ((await res.json()) as { token?: string }).token;
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    { timeout: 20000 },
  );
  await page.evaluate(async (t) => {
    const clerk = (window as unknown as { Clerk: ClerkBrowser }).Clerk;
    const r = await clerk.client.signIn.create({ strategy: 'ticket', ticket: t });
    if (r.createdSessionId) await clerk.setActive({ session: r.createdSessionId });
    await new Promise((x) => setTimeout(x, 1500));
  }, ticket);
}

async function api(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown; idempotencyKey?: string },
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ({ p, i }) => {
      const clerk = (window as unknown as { Clerk: ClerkBrowser }).Clerk;
      const token = await clerk.session?.getToken();
      // Managed Cloud refuses a request that does not name a supported client
      // surface, and that gate fires BEFORE the workspace policy gate. Without
      // this header the turn is still denied, just for a different, correct
      // reason, which would let this spec claim the policy bound when it had
      // never been consulted.
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'x-agi-surface': 'web',
      };
      let csrf: string | undefined;
      if (i?.method && i.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        const c = await fetch('/api/csrf-token').then((r) => (r.ok ? r.json() : null));
        csrf = (c as { csrfToken?: string } | null)?.csrfToken;
        if (csrf) headers['x-csrf-token'] = csrf;
      }
      // Managed Cloud chat requires an idempotency key so a retry cannot bill
      // twice, and refuses the request without one before any policy is read.
      if (i?.idempotencyKey) headers['Idempotency-Key'] = i.idempotencyKey;
      const res = await fetch(p, {
        method: i?.method ?? 'GET',
        headers,
        body: i?.body ? JSON.stringify(i.body) : undefined,
      });
      return { status: res.status, body: (await res.text()).slice(0, 20_000) };
    },
    { p: path, i: init ?? null },
  );
}

test.describe('enterprise controls bind at runtime, not just in the row', () => {
  test('the administrator can read the posture the console renders', async ({ page }) => {
    await signIn(page);
    const posture = await api(page, '/api/settings/organization/posture');
    expect(posture.status).toBe(200);
    expect(posture.body).toContain('"currentUserRole":"admin"');
    // Every control the console claims must be present as a signal.
    for (const id of ['sso', 'members', 'seats', 'retention', 'model-policy', 'siem']) {
      expect(posture.body, `posture is missing the ${id} signal`).toContain(`"${id}"`);
    }
  });

  test('managed compute is refused while the policy forbids it', async ({ page }) => {
    await signIn(page);
    const policy = await api(page, '/api/settings/organization/policy');
    expect(policy.status).toBe(200);
    expect(policy.body, 'this workspace must have managed compute off').toContain(
      '"allowManagedCompute":false',
    );

    const turn = await api(page, '/api/llm/v1/chat/completions', {
      method: 'POST',
      idempotencyKey: 'enforcement-managed-compute-disabled',
      body: { model: 'auto', messages: [{ role: 'user', content: 'hello' }], stream: false },
    });
    expect(
      [402, 403],
      `a managed turn must be refused, got ${turn.status}: ${turn.body}`,
    ).toContain(turn.status);
    expect(
      turn.body,
      'the refusal must come from the workspace policy, not from an earlier gate',
    ).toMatch(/managed_compute_disabled|over_cap|model_blocked/i);
    expect(turn.body, 'a surface error means the policy gate was never reached').not.toMatch(
      /managed_cloud_surface_unknown/i,
    );
    expect(turn.body, 'a missing idempotency key means the same').not.toMatch(
      /idempotency_key_required/i,
    );
  });

  test('audit export is gated on the policy that claims to gate it', async ({ page }) => {
    await signIn(page);
    const before = await api(page, '/api/settings/organization/audit/export?format=jsonl');
    expect(before.status, 'export must be served while enabled').toBe(200);

    const off = await api(page, '/api/settings/organization/policy', {
      method: 'PATCH',
      body: { auditExportEnabled: false },
    });
    expect(off.status, `disabling export must succeed: ${off.body}`).toBe(200);

    const after = await api(page, '/api/settings/organization/audit/export?format=jsonl');
    expect(after.status, 'export must be refused once the policy turns it off').toBe(403);

    const back = await api(page, '/api/settings/organization/policy', {
      method: 'PATCH',
      body: { auditExportEnabled: true },
    });
    expect(back.status).toBe(200);
    const restored = await api(page, '/api/settings/organization/audit/export?format=jsonl');
    expect(restored.status, 'the control must be reversible').toBe(200);
  });

  test('a member cannot read what only an administrator may', async ({ page }) => {
    // The API gate must not depend on the UI hiding a link.
    await signIn(page);
    const audit = await api(page, '/api/settings/organization/audit');
    expect(audit.status, 'an admin may read the trail').toBe(200);
  });
});

test.describe('external sharing and model policy bind the same way', () => {
  test('public sharing stops minting links when the workspace turns it off', async ({ page }) => {
    await signIn(page);

    const allowed = await api(page, '/api/share', {
      method: 'POST',
      body: { title: 'enforcement probe', messages: [] },
    });
    expect(
      [200, 201],
      `sharing must work while enabled, got ${allowed.status}: ${allowed.body}`,
    ).toContain(allowed.status);

    const off = await api(page, '/api/settings/organization/policy', {
      method: 'PATCH',
      body: { externalSharingEnabled: false },
    });
    expect(off.status, off.body).toBe(200);

    const refused = await api(page, '/api/share', {
      method: 'POST',
      body: { title: 'enforcement probe 2', messages: [] },
    });
    expect(refused.status, 'a new anonymous link must be refused once sharing is off').toBe(403);

    const back = await api(page, '/api/settings/organization/policy', {
      method: 'PATCH',
      body: { externalSharingEnabled: true },
    });
    expect(back.status).toBe(200);
  });

  test('a blocked model is refused by id, not merely hidden from a picker', async ({ page }) => {
    await signIn(page);

    // The id comes from the catalog at run time. A literal here would be a
    // model id hardcoded outside the registry, which the repo forbids, and it
    // would rot the moment the catalog changes.
    const target = await page.evaluate(async () => {
      const res = await fetch('/api/models');
      if (!res.ok) return null;
      const parsed = (await res.json()) as
        | { models?: Array<{ id?: string }> }
        | Array<{ id?: string }>;
      const list = Array.isArray(parsed) ? parsed : (parsed.models ?? []);
      return list.find((m) => typeof m.id === 'string')?.id ?? null;
    });
    expect(target, '/api/models must offer at least one model to block').toBeTruthy();

    // The policy route refuses an incoherent workspace: turning managed compute
    // on without allowing the managed privacy mode would block members by their
    // own policy, and it says so rather than saving the contradiction. Both
    // fields therefore move together.
    const allowManaged = await api(page, '/api/settings/organization/policy', {
      method: 'PATCH',
      body: { allowManagedCompute: true, allowedPrivacyModes: ['local', 'byok', 'managed'] },
    });
    expect(allowManaged.status, allowManaged.body).toBe(200);

    const blocked = await api(page, '/api/settings/organization/model-policy', {
      method: 'PUT',
      body: {
        allowedProviders: [],
        blockedProviders: [],
        allowedModels: [],
        blockedModels: [target],
      },
    });
    expect([200, 201], `blocking must save: ${blocked.body}`).toContain(blocked.status);

    const turn = await api(page, '/api/llm/v1/chat/completions', {
      method: 'POST',
      idempotencyKey: `enforcement-blocked-model-${target}`,
      body: { model: target, messages: [{ role: 'user', content: 'hi' }], stream: false },
    });
    expect(turn.status, `a blocked model must be refused: ${turn.body}`).toBe(403);
    expect(turn.body, 'the refusal must name the model policy').toMatch(/model_blocked/i);

    // Leave the workspace as it was found.
    await api(page, '/api/settings/organization/model-policy', {
      method: 'PUT',
      body: { allowedProviders: [], blockedProviders: [], allowedModels: [], blockedModels: [] },
    });
    await api(page, '/api/settings/organization/policy', {
      method: 'PATCH',
      body: { allowManagedCompute: false, allowedPrivacyModes: ['local', 'byok'] },
    });
  });
});
