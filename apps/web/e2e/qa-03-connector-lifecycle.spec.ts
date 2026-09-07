import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

const OAUTH_START_PATH = '/api/connectors/oauth/start';
const OAUTH_CALLBACK_PATH = '/api/connectors/oauth/callback';
const CONNECTORS_PATH = '/api/connectors';
const SAMPLE_LIMIT = 6;
const LINK_LOCAL_URL = 'http://169.254.169.254/latest/meta-data/';

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

interface ConnectorRow {
  connectorId?: unknown;
  toolConnectorId?: unknown;
  health?: unknown;
}

function toolRef(row: ConnectorRow): string | null {
  if (typeof row.toolConnectorId === 'string' && row.toolConnectorId.length > 0) {
    return row.toolConnectorId;
  }
  return typeof row.connectorId === 'string' && row.connectorId.length > 0 ? row.connectorId : null;
}

async function csrfToken(page: Page): Promise<string> {
  const token = await page.evaluate(async () => {
    const response = await fetch('/api/csrf');
    if (!response.ok) return null;
    return ((await response.json()) as { token?: string }).token ?? null;
  });
  expect(token, 'the CSRF endpoint must issue a token to a signed-in caller').toBeTruthy();
  return token as string;
}

test.describe('QA, connector lifecycle against the running server', () => {
  test('walks discovery, capabilities, OAuth start, custom connectors and permissions', async ({
    page,
  }) => {
    await signIn(page);
    const evidence: Record<string, unknown> = {};
    const csrf = await csrfToken(page);
    const writeHeaders = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const list = await page.request.get(CONNECTORS_PATH);
    const listBody = safeParse(await list.text());
    evidence['list'] = { status: list.status(), body: listBody };
    expect(list.status(), 'connector registry must answer an authenticated caller').toBe(200);

    const connectors: ConnectorRow[] = Array.isArray(
      (listBody as { connectors?: unknown[] })?.connectors,
    )
      ? ((listBody as { connectors: ConnectorRow[] }).connectors ?? [])
      : [];
    const refs = connectors.map(toolRef).filter((v): v is string => v !== null);
    const displayIds = connectors
      .map((c) => (typeof c.connectorId === 'string' ? c.connectorId : null))
      .filter((v): v is string => v !== null);
    evidence['connectorRefs'] = refs;

    expect(refs.length, 'every listed connector must expose a tool-facing id').toBe(
      connectors.length,
    );
    for (const row of connectors) {
      expect(typeof row.health, 'every listed connector must carry a resolved health').toBe(
        'string',
      );
    }

    const capabilities: Record<string, unknown> = {};
    for (const ref of refs.slice(0, SAMPLE_LIMIT)) {
      const res = await page.request.get(
        `${CONNECTORS_PATH}/${encodeURIComponent(ref)}/capabilities`,
        { failOnStatusCode: false },
      );
      capabilities[ref] = { status: res.status(), body: safeParse(await res.text()) };
      expect(
        [200, 404, 429, 503],
        `capability discovery for ${ref} must answer, not fault`,
      ).toContain(res.status());
    }
    evidence['capabilities'] = capabilities;

    const perms = await page.request.get(`${CONNECTORS_PATH}/permissions`);
    evidence['permissions'] = { status: perms.status(), body: safeParse(await perms.text()) };
    expect(perms.status(), 'the tool permission store must answer').toBe(200);

    const oauthStarts: Record<string, unknown> = {};
    for (const id of displayIds.slice(0, SAMPLE_LIMIT)) {
      const res = await page.request.get(
        `${OAUTH_START_PATH}?mode=json&connectorId=${encodeURIComponent(id)}`,
        { failOnStatusCode: false, maxRedirects: 0 },
      );
      const body = safeParse(await res.text());
      oauthStarts[id] = { status: res.status(), body };
      expect(res.status(), `OAuth start for ${id} must not fault`).toBeLessThan(500);
      if (res.status() >= 400) {
        expect(
          (body as { message?: unknown })?.message,
          `a refused OAuth start must say why, for ${id}`,
        ).toBeTruthy();
      }
    }
    evidence['oauthStart'] = oauthStarts;

    const badCallback = await page.request.get(`${OAUTH_CALLBACK_PATH}?code=fake&state=forged`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    const callbackLocation = badCallback.headers()['location'] ?? '';
    evidence['forgedCallback'] = { status: badCallback.status(), location: callbackLocation };
    expect(
      [301, 302, 303, 307, 308],
      'a forged OAuth callback must redirect, not exchange the code',
    ).toContain(badCallback.status());
    expect(callbackLocation, 'the redirect must carry the invalid-state outcome').toContain(
      'status=invalid_state',
    );

    const badCustom = await page.request.post(`${CONNECTORS_PATH}/custom`, {
      headers: writeHeaders,
      data: { name: '', url: 'not-a-url' },
      failOnStatusCode: false,
    });
    const badCustomBody = safeParse(await badCustom.text());
    evidence['customValidation'] = { status: badCustom.status(), body: badCustomBody };
    expect(badCustom.status(), 'an empty name must be refused as a validation error').toBe(400);
    expect(JSON.stringify(badCustomBody)).toMatch(/name is required/i);

    const ssrf = await page.request.post(`${CONNECTORS_PATH}/custom`, {
      headers: writeHeaders,
      data: { name: 'probe', url: LINK_LOCAL_URL },
      failOnStatusCode: false,
    });
    const ssrfBody = safeParse(await ssrf.text());
    evidence['ssrfProbe'] = { status: ssrf.status(), body: ssrfBody };
    expect(ssrf.status(), 'a link-local server URL must be refused as a validation error').toBe(
      400,
    );
    expect(
      JSON.stringify(ssrfBody),
      'the refusal must name the URL itself, not CSRF, auth or a plan limit',
    ).toMatch(/must use https|private or unsafe network address/i);

    record('connector-lifecycle.json', evidence);

    expect(JSON.stringify(evidence), 'no evidence file may carry a credential').not.toMatch(
      /"(authToken|apiKey|accessToken|refreshToken)"\s*:\s*"[^"]/,
    );
  });
});
