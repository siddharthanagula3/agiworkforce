import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withRateLimit: vi.fn(async () => null),
}));

const { getDb } = vi.hoisted(() => ({ getDb: { current: null as unknown } }));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getNeonDb: () => getDb.current,
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb, type FakeScimDbState } from './fake-scim-db';
import { createScimToken } from '@/lib/server/scim/scim-token-service';
import { SCIM_SCHEMA } from '@/lib/server/scim/scim-protocol';

const SCIM_ROOT = join(__dirname, '..');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const ADMIN = 'admin-user';
const RESOURCE_ID = '44444444-4444-4444-8444-444444444444';

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

async function handlers() {
  const found: Array<{ name: string; method: string; handler: Handler }> = [];
  for (const file of routeFiles(SCIM_ROOT)) {
    const routeModule = (await import(file)) as Record<string, unknown>;
    for (const method of METHODS) {
      const handler = routeModule[method];
      if (typeof handler === 'function') {
        found.push({
          name: `${method} ${relative(SCIM_ROOT, file)}`,
          method,
          handler: handler as Handler,
        });
      }
    }
  }
  return found;
}

async function seed(planTier: string): Promise<{ state: FakeScimDbState; rawToken: string }> {
  const { adapter, state } = createFakeScimDb({
    directory_sync_connections: [
      {
        id: CONNECTION,
        organization_id: ORG,
        provider: 'okta',
        directory_id: 'dir-1',
        display_name: 'Okta',
        is_active: true,
        last_sync_at: null,
      },
    ],
    sso_connections: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        organization_id: ORG,
        domain: 'example.com',
        domain_verified_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    organization_members: [
      {
        organization_id: ORG,
        user_id: ADMIN,
        role: 'owner',
        provisioning_source: 'manual',
        provisioned_at: null,
        joined_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    profiles: [{ id: 'clerk_ada', email: 'ada@example.com' }],
    subscriptions: [
      {
        id: 'sub-1',
        user_id: ADMIN,
        plan_tier: planTier,
        status: 'active',
        current_period_start: '2026-01-01T00:00:00.000Z',
        current_period_end: '2027-01-01T00:00:00.000Z',
        stripe_subscription_id: 'sub_stripe',
        stripe_price_id: null,
        apple_original_transaction_id: null,
        google_purchase_token: null,
      },
    ],
  });
  getDb.current = adapter as unknown as DatabaseAdapter;
  const { rawToken } = await createScimToken(adapter as unknown as DatabaseAdapter, {
    connectionId: CONNECTION,
    organizationId: ORG,
    name: 'Okta production',
    createdByUserId: ADMIN,
  });
  return { state, rawToken };
}

function call(entry: { method: string; handler: Handler }, token: string | null) {
  const headers = new Headers({ 'content-type': 'application/scim+json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  const body =
    entry.method === 'GET' || entry.method === 'DELETE'
      ? undefined
      : JSON.stringify({
          schemas: [SCIM_SCHEMA.user],
          userName: 'ada@example.com',
          emails: [{ value: 'ada@example.com', primary: true }],
          active: true,
        });
  return entry.handler(
    new Request(`https://app.example.com/api/scim/v2/resource/${RESOURCE_ID}`, {
      method: entry.method,
      headers,
      ...(body ? { body } : {}),
    }),
    { params: Promise.resolve({ userId: RESOURCE_ID, groupId: RESOURCE_ID }) },
  );
}

function unchanged(state: FakeScimDbState) {
  expect(state.scim_provisioned_users).toHaveLength(0);
  expect(state.scim_groups).toHaveLength(0);
  expect(state.organization_members.map((row) => row['user_id'])).toEqual([ADMIN]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('every SCIM handler provisions nothing without an entitled directory token', () => {
  it('finds the handlers the directory calls, rather than proving nothing', async () => {
    const found = await handlers();
    expect(found.length).toBeGreaterThanOrEqual(11);
    expect(found.map((entry) => entry.method)).toEqual(expect.arrayContaining([...METHODS]));
  });

  it('refuses every handler without a bearer token', async () => {
    for (const entry of await handlers()) {
      const { state } = await seed('enterprise');
      const response = await call(entry, null);
      expect(response.status, entry.name).toBe(401);
      unchanged(state);
    }
  });

  it('refuses every handler for a workspace that is not entitled to directory sync', async () => {
    for (const entry of await handlers()) {
      const { state, rawToken } = await seed('team');
      const response = await call(entry, rawToken);
      expect(response.status, entry.name).toBe(403);
      unchanged(state);
    }
  });
});
