import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler';
import { enterpriseRouter } from '../../src/routes/enterprise';

const { state } = vi.hoisted(() => ({
  state: {
    memberships: [
      {
        organization_id: '11111111-1111-4111-8111-111111111111',
        role: 'owner',
        joined_at: '2026-05-21T00:00:00.000Z',
        organization: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Acme',
          slug: 'acme',
          created_by: 'user-123',
          created_at: '2026-05-21T00:00:00.000Z',
          updated_at: '2026-05-21T00:00:00.000Z',
        },
      },
    ],
    membershipRole: 'owner',
    supportInsert: null as Record<string, unknown> | null,
  },
}));

vi.mock('../../src/lib/neonClients', () => {
  function createQuery(table: string) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => {
        if (table === 'organization_members') {
          return Promise.resolve({ data: state.memberships, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      maybeSingle: vi.fn(() => {
        if (table === 'organization_members') {
          return Promise.resolve({ data: { role: state.membershipRole }, error: null });
        }
        if (table === 'organization_admin_policies') {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        state.supportInsert = payload;
        return query;
      }),
      single: vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'case-1',
            status: 'open',
            created_at: '2026-05-21T01:00:00.000Z',
          },
          error: null,
        }),
      ),
    };

    return query;
  }

  const serviceClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { account_status: 'active' },
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  };

  const userClient = {
    from: vi.fn((table: string) => createQuery(table)),
  };

  return {
    getServiceClient: vi.fn(() => serviceClient),
    getUserClient: vi.fn(() => userClient),
    getUserScopedClient: vi.fn(() => userClient),
  };
});

function createToken(userId = 'user-123'): string {
  return jwt.sign(
    {
      userId,
      email: 'test@example.com',
    },
    process.env['JWT_SECRET'] as string,
    {
      algorithm: 'HS256',
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    },
  );
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/enterprise', enterpriseRouter);
  app.use(errorHandler);
  return app;
}

describe('enterpriseRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.membershipRole = 'owner';
    state.supportInsert = null;
  });

  it('lists organizations for the authenticated user', async () => {
    const response = await request(createApp())
      .get('/api/v1/enterprise/organizations')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.organizations).toHaveLength(1);
    expect(response.body.organizations[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Acme',
      membership: { role: 'owner' },
    });
  });

  it('returns the fail-closed default policy when no org policy row exists', async () => {
    const response = await request(createApp())
      .get('/api/v1/enterprise/organizations/11111111-1111-4111-8111-111111111111/policy')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.policy.allowManagedCompute).toBe(false);
    expect(response.body.policy.allowedPrivacyModes).toEqual(['local', 'byok']);
    expect(response.body.policy.chatSyncSurfaces).toEqual(['web', 'desktop', 'mobile']);
  });

  it('creates a support case scoped to the organization', async () => {
    const response = await request(createApp())
      .post('/api/v1/enterprise/organizations/11111111-1111-4111-8111-111111111111/support-cases')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({
        subject: 'SSO rollout help',
        description: 'Need help validating SAML metadata before rollout.',
        severity: 'high',
      });

    expect(response.status).toBe(201);
    expect(response.body.case).toMatchObject({ id: 'case-1', status: 'open' });
    expect(state.supportInsert).toMatchObject({
      organization_id: '11111111-1111-4111-8111-111111111111',
      requester_user_id: 'user-123',
      subject: 'SSO rollout help',
      severity: 'high',
      privacy_label: 'security_sensitive',
    });
  });

  it('requires an organization admin role for audit events', async () => {
    state.membershipRole = 'member';

    const response = await request(createApp())
      .get('/api/v1/enterprise/organizations/11111111-1111-4111-8111-111111111111/audit-events')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Organization admin access required');
  });
});
