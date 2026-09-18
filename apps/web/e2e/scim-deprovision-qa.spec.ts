import { test, expect, type Page } from '@playwright/test';

import { signIn, signInAs } from './qa-capability-harness';

/**
 * Deprovisioning through SCIM must end the member's access to Chat, Work and
 * Code, not merely delete a membership row. A row delete that leaves a live
 * session behind is the offboarding hole this spec exists to close, and it
 * cannot be caught by asserting the SCIM DELETE returned 204.
 *
 * Needs the local full stack: a production build on :3000 pointed at a Postgres
 * carrying every migration, an admin QA identity that may manage directory
 * sync, and SCIM_QA_SECOND_EMAIL naming the secondary QA identity's address so
 * the IdP-side user links to a real account. See apps/web/db/neon/verify.
 */
const SECOND_EMAIL = process.env['SCIM_QA_SECOND_EMAIL'];

interface Json {
  status: number;
  body: string;
  headers: Record<string, string>;
}

async function api(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<Json> {
  return page.evaluate(
    async ({ p, i }) => {
      const clerk = (
        window as unknown as {
          Clerk: { session?: { getToken(): Promise<string | null> } };
        }
      ).Clerk;
      const token = await clerk.session?.getToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'x-agi-surface': 'web',
        ...(i?.headers ?? {}),
      };
      if (i?.method && i.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        const csrf = await fetch('/api/csrf').then((r) => (r.ok ? r.json() : null));
        const value = (csrf as { token?: string } | null)?.token;
        if (value) headers['x-csrf-token'] = value;
      }
      const res = await fetch(p, {
        method: i?.method ?? 'GET',
        headers,
        body: i?.body === undefined ? undefined : JSON.stringify(i.body),
      });
      const out: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        out[k] = v;
      });
      return { status: res.status, body: (await res.text()).slice(0, 20_000), headers: out };
    },
    { p: path, i: init ?? null },
  );
}

/** The SCIM API authenticates with its own bearer, never the admin's session. */
async function scim(
  page: Page,
  bearer: string,
  path: string,
  init?: { method?: string; body?: unknown; ifMatch?: string },
): Promise<Json> {
  return page.evaluate(
    async ({ b, p, i }) => {
      const headers: Record<string, string> = { Authorization: `Bearer ${b}` };
      if (i?.body !== undefined) headers['Content-Type'] = 'application/scim+json';
      if (i?.ifMatch) headers['If-Match'] = i.ifMatch;
      const res = await fetch(p, {
        method: i?.method ?? 'GET',
        headers,
        body: i?.body === undefined ? undefined : JSON.stringify(i.body),
      });
      const out: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        out[k] = v;
      });
      return { status: res.status, body: (await res.text()).slice(0, 20_000), headers: out };
    },
    { b: bearer, p: path, i: init ?? null },
  );
}

interface Provisioner {
  bearer: string;
  base: string;
  organizationId: string;
}

async function provisioner(page: Page): Promise<Provisioner> {
  const directoryId = `qa-deprovision-${Date.now()}`;
  const created = await api(page, '/api/admin/directory-sync', {
    method: 'POST',
    body: {
      provider: 'okta',
      directory_id: directoryId,
      display_name: 'QA deprovision probe',
    },
  });
  expect([200, 201], `creating a connection failed: ${created.body}`).toContain(created.status);
  const connection = JSON.parse(created.body) as {
    connection: { id: string; organization_id: string };
  };

  const minted = await api(page, '/api/admin/directory-sync/tokens', {
    method: 'POST',
    body: { connectionId: connection.connection.id, name: 'qa-deprovision' },
  });
  expect(minted.status, `minting a SCIM token failed: ${minted.body}`).toBe(201);
  const token = JSON.parse(minted.body) as { raw_token: string; scim_base_url: string };

  return {
    bearer: token.raw_token,
    base: new URL(token.scim_base_url).pathname,
    organizationId: connection.connection.organization_id,
  };
}

async function createUser(p: Provisioner, page: Page, email: string) {
  const created = await scim(page, p.bearer, `${p.base}/Users`, {
    method: 'POST',
    body: {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: email,
      externalId: `qa-${Date.now()}`,
      emails: [{ value: email, primary: true }],
      active: true,
    },
  });
  expect(created.status, `provisioning failed: ${created.body}`).toBe(201);
  return JSON.parse(created.body) as { id: string; meta: { version: string } };
}

async function createGroup(p: Provisioner, page: Page, displayName: string, memberId: string) {
  const created = await scim(page, p.bearer, `${p.base}/Groups`, {
    method: 'POST',
    body: {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      displayName,
      members: [{ value: memberId }],
    },
  });
  expect(created.status, `group creation failed: ${created.body}`).toBe(201);
  return JSON.parse(created.body) as { id: string; meta: { version: string } };
}

test.describe('SCIM deprovisioning ends access to Chat, Work and Code', () => {
  // llm-guardrail-allow: deprovisioning destroys the signed-in identity, so this needs a second QA account and stays opt-in.
  test.skip(
    !SECOND_EMAIL,
    'set SCIM_QA_SECOND_EMAIL to the secondary QA identity address to run this spec',
  );
  test.describe.configure({ mode: 'serial' });

  test('a deprovisioned member is refused on every surface', async ({ page, browser }) => {
    await signIn(page);
    const p = await provisioner(page);
    const user = await createUser(p, page, SECOND_EMAIL!);
    await createGroup(p, page, `qa-engineering-${Date.now()}`, user.id);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await signInAs(memberPage, 'secondary');

    // While provisioned, the member reaches all three surfaces. Without this
    // the refusals below would prove nothing: they could be a pre-existing
    // denial that has nothing to do with deprovisioning.
    const chatBefore = await api(memberPage, '/api/chat/conversations');
    expect(chatBefore.status, `Chat must work while provisioned: ${chatBefore.body}`).toBe(200);

    const removed = await scim(page, p.bearer, `${p.base}/Users/${user.id}`, { method: 'DELETE' });
    expect(removed.status, `deprovision failed: ${removed.body}`).toBe(204);

    // The provider is told what could not be revoked; an empty warning list is
    // the claim the identity panel makes to the administrator.
    const log = await api(page, '/api/admin/directory-sync');
    expect(log.body).toContain('user.deprovisioned');
    expect(log.body, 'the directory log must record the credential revocation').toContain(
      '"credentialsRevoked":true',
    );

    for (const surface of [
      { name: 'Chat', path: '/api/chat/conversations', method: 'GET' },
      { name: 'Work', path: '/api/agents/session', method: 'POST' },
      { name: 'Code', path: '/api/code/sessions', method: 'GET' },
    ]) {
      const response = await api(memberPage, surface.path, {
        method: surface.method,
        ...(surface.method === 'POST' ? { body: {} } : {}),
      });
      expect(
        [401, 403],
        `${surface.name} must be refused after deprovision, got ${response.status}: ${response.body}`,
      ).toContain(response.status);
    }

    const workspace = await api(memberPage, '/api/settings/organization/posture');
    expect([401, 403], 'the workspace console must be refused too').toContain(workspace.status);

    await memberContext.close();
  });

  test('a member of several groups holds the strongest mapped role', async ({ page }) => {
    await signIn(page);
    const p = await provisioner(page);
    const user = await createUser(p, page, SECOND_EMAIL!);
    const viewers = await createGroup(p, page, `qa-viewers-${Date.now()}`, user.id);
    const admins = await createGroup(p, page, `qa-admins-${Date.now()}`, user.id);

    const groups = await api(page, '/api/settings/organization/groups');
    expect(groups.status, groups.body).toBe(200);
    expect(groups.body).toContain(viewers.id);
    expect(groups.body).toContain(admins.id);

    // Both groups are the provider's. The console offers role mapping and
    // nothing else, so no request can change who is in them.
    const manual = await api(page, `/api/settings/organization/groups/${admins.id}/members`, {
      method: 'POST',
      body: { userIds: [] },
    });
    expect(
      [403, 404, 405],
      `manual membership must not be writable, got ${manual.status}`,
    ).toContain(manual.status);
  });

  test('a write built from a stale read is refused rather than applied', async ({ page }) => {
    await signIn(page);
    const p = await provisioner(page);
    const user = await createUser(p, page, SECOND_EMAIL!);

    const stale = user.meta.version;
    expect(stale, 'the provider needs a version to send back').toMatch(/^W\/"\d+"$/);

    const replace = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: SECOND_EMAIL!,
      emails: [{ value: SECOND_EMAIL!, primary: true }],
      active: true,
      displayName: 'First writer',
    };
    const first = await scim(page, p.bearer, `${p.base}/Users/${user.id}`, {
      method: 'PUT',
      body: replace,
      ifMatch: stale,
    });
    expect(first.status, first.body).toBe(200);
    expect(first.headers['etag']).not.toBe(stale);

    // The retry an IdP sends after a timeout carries the version it last read.
    const second = await scim(page, p.bearer, `${p.base}/Users/${user.id}`, {
      method: 'PATCH',
      body: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      },
      ifMatch: stale,
    });
    expect(second.status, 'a deactivation built from a stale read must not land').toBe(412);

    const current = await scim(page, p.bearer, `${p.base}/Users/${user.id}`);
    expect(current.status).toBe(200);
    expect(current.body, 'the member must still be active').toContain('"active":true');
  });
});
