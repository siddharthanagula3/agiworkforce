import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  ListConversationToolGrantsResponseSchema,
  conversationToolGrantsPath,
} from '@agiworkforce/cloud-contracts';

type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));

import { GET } from '../route';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const OTHER_CONVERSATION = '22222222-2222-4222-8222-222222222222';
const GRANT = '33333333-3333-4333-8333-333333333333';
const OTHER_GRANT = '44444444-4444-4444-8444-444444444444';
const ORGANIZATION = '55555555-5555-4555-8555-555555555555';

interface GrantRow {
  id: string;
  user_id: string;
  conversation_id: string;
  organization_id: string | null;
  connector_id: string;
  tool_name: string;
  trust_boundary: string;
  risk_tier: string;
  destructive: boolean;
  created_at: Date;
  deleted: boolean;
  temporary: boolean;
}

function grantRow(overrides: Partial<GrantRow>): GrantRow {
  return {
    id: GRANT,
    user_id: 'user-owner',
    conversation_id: CONVERSATION,
    organization_id: ORGANIZATION,
    connector_id: 'github',
    tool_name: 'create_issue',
    trust_boundary: 'managed',
    risk_tier: 'medium',
    destructive: false,
    created_at: new Date('2026-11-15T08:00:00.000Z'),
    deleted: false,
    temporary: false,
    ...overrides,
  };
}

function modeledDb(rows: GrantRow[]) {
  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('order by grant_row.created_at')) {
        const [user, conversation, boundary, organization] = params;
        return rows.filter(
          (row) =>
            row.user_id === user &&
            row.conversation_id === conversation &&
            row.trust_boundary === boundary &&
            row.organization_id === organization &&
            !row.deleted &&
            !row.temporary,
        );
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}

function listRequest(conversationId: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://localhost:3000${conversationToolGrantsPath(conversationId)}`),
    { params: Promise.resolve({ id: conversationId }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/chat/conversations/[id]/tool-grants', () => {
  it("lists only this chat's Managed Cloud grants with when each was given", async () => {
    const model = modeledDb([
      grantRow({ id: GRANT }),
      grantRow({
        id: OTHER_GRANT,
        tool_name: 'delete_repo',
        risk_tier: 'critical',
        destructive: true,
        created_at: new Date('2026-11-15T09:30:00.000Z'),
      }),
      grantRow({ id: '66666666-6666-4666-8666-666666666666', conversation_id: OTHER_CONVERSATION }),
      grantRow({ id: '77777777-7777-4777-8777-777777777777', trust_boundary: 'byok' }),
      grantRow({ id: '88888888-8888-4888-8888-888888888888', user_id: 'someone-else' }),
      grantRow({ id: '99999999-9999-4999-8999-999999999999', organization_id: null }),
    ]);
    mocks.getUserScopedDb.mockResolvedValue({
      db: model,
      userId: 'user-owner',
      organizationId: ORGANIZATION,
    });

    const response = await GET(...listRequest(CONVERSATION));

    expect(response.status).toBe(200);
    const body = ListConversationToolGrantsResponseSchema.parse(await response.json());
    expect(body.grants).toEqual([
      {
        id: GRANT,
        connectorId: 'github',
        toolName: 'create_issue',
        riskTier: 'medium',
        destructive: false,
        grantedAt: '2026-11-15T08:00:00.000Z',
      },
      {
        id: OTHER_GRANT,
        connectorId: 'github',
        toolName: 'delete_repo',
        riskTier: 'critical',
        destructive: true,
        grantedAt: '2026-11-15T09:30:00.000Z',
      },
    ]);
  });

  it('refuses a conversation id that is not a chat', async () => {
    const response = await GET(...listRequest('not-a-chat'));
    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });
});
