import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { state } = vi.hoisted(() => ({
  state: {
    members: [
      {
        organization_id: '33333333-3333-4333-8333-333333333333',
        role: 'owner',
        joined_at: '2026-05-21T00:00:00.000Z',
      },
    ] as Record<string, unknown>[],
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

vi.mock('../../src/lib/neonClients', () => {
  function from(table: string) {
    if (table === 'organization_members') {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => Promise.resolve({ data: state.members, error: null }),
      };
      return q;
    }
    if (table === 'organizations') {
      const q = {
        select: () => q,
        in: (_col: string, ids: unknown[]) => {
          state.lastInIds = ids;
          return Promise.resolve({ data: state.orgs, error: null });
        },
      };
      return q;
    }
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
    getUserScopedClient: vi.fn(() => serviceClient),
    getSystemClient: vi.fn(() => serviceClient),
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
    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.organizations[0]).toMatchObject({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Globex',
      slug: 'globex',
      createdBy: 'user-ent-1',
      membership: { role: 'owner', joinedAt: '2026-05-21T00:00:00.000Z' },
    });
    expect(state.lastInIds).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  it('returns an empty list (not an error) when the user has no memberships', async () => {
    state.members = [];
    const res = await request(createApp())
      .get('/api/v1/enterprise/organizations')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations).toEqual([]);
    expect(state.lastInIds).toBeNull();

    state.members = [
      {
        organization_id: '33333333-3333-4333-8333-333333333333',
        role: 'owner',
        joined_at: '2026-05-21T00:00:00.000Z',
      },
    ];
  });
});
