import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

function record(name: string, value: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, name), JSON.stringify(value, null, 2));
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 4000);
  }
}

test.describe('QA, connector lifecycle against the running server', () => {
  test('walks discovery, capabilities, OAuth start, custom connectors and permissions', async ({
    page,
  }) => {
    await signIn(page);
    const evidence: Record<string, unknown> = {};

    const list = await page.request.get('/api/connectors');
    const listBody = safeParse(await list.text());
    evidence['list'] = { status: list.status(), body: listBody };
    expect(list.status(), 'connector registry must answer an authenticated caller').toBe(200);

    const connectors = Array.isArray((listBody as { connectors?: unknown[] })?.connectors)
      ? ((listBody as { connectors: Record<string, unknown>[] }).connectors ?? [])
      : [];
    const ids = connectors
      .map((c) => (typeof c['id'] === 'string' ? c['id'] : null))
      .filter((v): v is string => v !== null);
    evidence['connectorIds'] = ids;

    // Capability discovery for each advertised connector.
    const capabilities: Record<string, unknown> = {};
    for (const id of ids.slice(0, 12)) {
      const res = await page.request.get(`/api/connectors/${encodeURIComponent(id)}/capabilities`);
      capabilities[id] = { status: res.status(), body: safeParse(await res.text()) };
    }
    evidence['capabilities'] = capabilities;

    // Tool permissions surface.
    const perms = await page.request.get('/api/connectors/permissions');
    evidence['permissions'] = { status: perms.status(), body: safeParse(await perms.text()) };

    // OAuth start: the interesting part locally is which redirect_uri origin it
    // mints, since that is what the localhost config was added to change.
    const oauthStarts: Record<string, unknown> = {};
    for (const id of ids.slice(0, 6)) {
      const res = await page.request.post('/api/connectors/oauth/start', {
        data: { connectorId: id },
        failOnStatusCode: false,
      });
      oauthStarts[id] = { status: res.status(), body: safeParse(await res.text()) };
    }
    evidence['oauthStart'] = oauthStarts;

    const badCallback = await page.request.get(
      '/api/connectors/oauth/callback?code=fake&state=forged',
      { failOnStatusCode: false },
    );
    evidence['forgedCallback'] = {
      status: badCallback.status(),
      body: safeParse(await badCallback.text()),
    };

    // Custom connector validation.
    const badCustom = await page.request.post('/api/connectors/custom', {
      data: { name: '', url: 'not-a-url' },
      failOnStatusCode: false,
    });
    evidence['customValidation'] = {
      status: badCustom.status(),
      body: safeParse(await badCustom.text()),
    };

    // SSRF probe: a custom connector must not be pointable at link-local metadata.
    const ssrf = await page.request.post('/api/connectors/custom', {
      data: {
        name: 'probe',
        serverUrl: 'http://169.254.169.254/latest/meta-data/',
        url: 'http://169.254.169.254/latest/meta-data/',
      },
      failOnStatusCode: false,
    });
    evidence['ssrfProbe'] = { status: ssrf.status(), body: safeParse(await ssrf.text()) };

    record('connector-lifecycle.json', evidence);
    console.log('[qa-connectors]', JSON.stringify(evidence).slice(0, 1800));

    expect(badCallback.status(), 'a forged OAuth callback must not succeed').not.toBe(200);
    expect(ssrf.status(), 'a link-local server URL must be refused').not.toBe(200);
  });
});
