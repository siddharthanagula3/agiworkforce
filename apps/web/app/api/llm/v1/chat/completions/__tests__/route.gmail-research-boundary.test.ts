// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { modelRegistry } from '@agiworkforce/model-registry';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  process: vi.fn(),
  research: vi.fn(),
  files: vi.fn(),
}));
vi.mock('../lib/auth-gate', () => ({
  runAuthGate: async () => ({
    ok: true,
    userId: 'user-1',
    token: 'test-token',
    subscription: { plan_tier: 'pro' },
  }),
}));
vi.mock('../lib/turn-slot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/turn-slot')>()),
  withManagedTurnSlot: (_input: unknown, body: () => Promise<unknown>) => body(),
}));
vi.mock('../lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/request-processor')>()),
  processRequest: mocks.process,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getVerifiedBearerUserScopedDb: async () => ({ db: { query: mocks.query }, userId: 'user-1' }),
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  buildManagedComputeGateResponse: () => null,
  buildOrganizationPolicyGateResponse: async () => null,
  buildSpendLimitGateResponse: async () => null,
  resolveWorkspaceControlsForRequest: async () => ({ ok: true, controls: {} }),
}));
vi.mock('../lib/research-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/research-loop')>()),
  runResearchLoop: mocks.research,
}));
vi.mock('@/lib/services/research-file-source-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/research-file-source-service')>()),
  searchResearchFileSources: mocks.files,
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  finalizeManagedUsageRequest: async () => ({ actualCostCents: 0 }),
}));

import { POST } from '../route';
const model = Object.values(modelRegistry.routes).find(
  (route) => route.provider === 'vercel_gateway' && route.trustModes.includes('managed_cloud'),
)?.modelKey;
if (!model) throw new Error('Canonical managed gateway fixture unavailable');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([{ gmail_data_present: true }]);
  mocks.process.mockResolvedValue({
    ok: true,
    chatSurface: 'web',
    provider: 'vercel_gateway',
    requestId: 'request-1',
    conversationId: 'conversation-1',
    gmailDataPresent: false,
    gmailDataPolicy: { userId: 'user-1', conversationId: 'conversation-1', organizationId: null },
    zeroDataRetentionOnly: true,
    researchMode: true,
    researchSources: { files: true },
    chatRequest: { model, stream: true },
    llmRequest: { model, messages: [{ role: 'user', content: 'gmail-sentinel' }] },
    estimatedCostCents: 0,
    managedUsage: { requestId: 'request-1', userId: 'user-1' },
  });
});

describe('protected Gmail research route boundary', () => {
  it('reloads the durable marker and refuses before research delegate or semantic file query', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/llm/v1/chat/completions', { method: 'POST' }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'gmail_data_route_restricted' } });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('gmail_data_present'), [
      'conversation-1',
      'user-1',
      null,
    ]);
    expect(mocks.research).not.toHaveBeenCalled();
    expect(mocks.files).not.toHaveBeenCalled();
  });
});
