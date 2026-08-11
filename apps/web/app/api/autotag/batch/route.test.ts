import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  resolveOrganization: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.auth }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.query }) }));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.resolveOrganization,
}));

import { POST } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('POST /api/autotag/batch workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.resolveOrganization.mockResolvedValue(ORGANIZATION_ID);
    mocks.query.mockResolvedValue([{ conversation_id: 'conversation-1', tag: 'coding' }]);
  });

  it('reads tags only through live parent conversations in the active workspace', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/autotag/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationIds: ['conversation-1', 'conversation-2'] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('c.organization_id is not distinct from $3::uuid'),
      ['user-1', ['conversation-1', 'conversation-2'], ORGANIZATION_ID],
    );
    await expect(response.json()).resolves.toEqual({
      tags: { 'conversation-1': 'coding', 'conversation-2': 'general' },
    });
  });
});
