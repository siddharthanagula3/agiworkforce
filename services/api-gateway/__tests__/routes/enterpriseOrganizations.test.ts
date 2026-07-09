/**
 * P1-GW-ENT regression test for GET /enterprise/organizations.
 *
 * Before the fix, the route used PostgREST resource-embedding
 * (`organization:organizations ( … )`). The Neon query layer collapses any
 * select containing `(` to `SELECT *`, so the embedded `organization` was never
 * returned and `.filter(row => row.organization)` dropped EVERY row — the
 * endpoint always returned `[]`.
 *
 * This mock models the REAL query shape: the `organization_members` read
 * returns rows WITHOUT a nested organization object, and a SEPARATE
 * `organizations` read returns the org rows. Against the old embed-only code
 * this yields `[]` (test fails); against the two-query fix it returns the
 * seeded org (test passes) — encoding the fix.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { state } = vi.hoisted(() => ({
  state: {
    // Membership rows as the DB actually returns them: NO nested organization.
    members: [
      {
        organization_id: '33333333-3333-4333-8333-333333333333',
        role: 'owner',
        joined_at: '2026-05-21T00:00:00.000Z',
      },
    ] as Record<string, unknown>[],
    // The organizations table, keyed in via a second `.in('id', [...])` query.
    orgs: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Globex',
        slug: 'globex',
        created_by: 'user-ent-1',
        created_at: '2026-05-21T00:00:00.000Z',
        updated_at: '2026-05-21T00:00:00.000Z',
      },
    ] as Record<string, unknown>[],
    lastInIds: null as unknown[] | null,
  },
}));

// P1-GW-RLS (Wave 4): organization_members/organizations have no RLS policy
// coverage (RLS-GAP), so routes/enterprise.ts now calls getServiceClient()
// for everything, same as middleware/auth.ts's kill-switch profiles lookup.
// One table-dispatching mock serves both.
vi.mock('../../src/lib/neonClients', () => {
  function from(table: string) {
    if (table === 'organization_members') {
      // select(...).eq('user_id', ...).order(...) resolves to membership rows.
      const q = {
        select: () => q,
        eq: () => q,
        order: () => Promise.resolve({ data: state.members, error: null }),
      };
      return q;
    }
    if (table === 'organizations') {
      // select(...).in('id', ids) resolves to org rows; capture the ids so the
      // test proves the second query was actually issued.
      const q = {
        select: () => q,
        in: (_col: string, ids: unknown[]) => {
          state.lastInIds = ids;
          return Promise.resolve({ data: state.orgs, error: null });
        },
      };
      return q;
    }
    // profiles kill-switch (middleware/auth.ts) and any other table.
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { account_status: 'active' }, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    };
  }

  const serviceClient = { from: vi.fn(from) };
  return {
    getServiceClient: vi.fn(() => serviceClient),
  };
});

const { enterpriseRouter } = await import('../../src/routes/enterprise');
const { errorHandler } = await import('../../src/middleware/errorHandler');

function createToken(userId = 'user-ent-1'): string {
  return jwt.sign({ userId, email: 'ent@example.com' }, process.env['JWT_SECRET'] as string, {
    algorithm: 'HS256',
    issuer: 'agiworkforce-api-gateway',
    audience: 'agiworkforce',
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/enterprise', enterpriseRouter);
  app.use(errorHandler);
  return app;
}

describe('P1-GW-ENT: GET /enterprise/organizations returns seeded orgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.lastInIds = null;
  });

  it('returns the member organizations via the explicit two-query join', async () => {
    const res = await request(createApp())
      .get('/api/v1/enterprise/organizations')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(res.status).toBe(200);
    // The core regression: the list must be NON-EMPTY for a member.
    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.organizations[0]).toMatchObject({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Globex',
      slug: 'globex',
      createdBy: 'user-ent-1',
      membership: { role: 'owner', joinedAt: '2026-05-21T00:00:00.000Z' },
    });
    // Proves the second (organizations) query was issued with the member's org id.
    expect(state.lastInIds).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  it('returns an empty list (not an error) when the user has no memberships', async () => {
    state.members = [];
    const res = await request(createApp())
      .get('/api/v1/enterprise/organizations')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations).toEqual([]);
    // No org lookup should run when there are no memberships.
    expect(state.lastInIds).toBeNull();

    // restore for other tests
    state.members = [
      {
        organization_id: '33333333-3333-4333-8333-333333333333',
        role: 'owner',
        joined_at: '2026-05-21T00:00:00.000Z',
      },
    ];
  });
});
