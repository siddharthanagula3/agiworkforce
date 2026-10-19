import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createError } from '@/lib/errors';
import { AGENT_ID, OWNER, agentConfig, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
import {
  agentContext,
  agentRequest,
  opened,
  refused,
} from '@/app/api/custom-agents/__tests__/agent-route-kit';

type AgentRouteModule = typeof import('@/lib/agents/agent-route');
type AgentServiceModule = typeof import('@/lib/services/custom-agent-service');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  requireOwnedAgent: vi.fn(),
  listAgentVersions: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  requireOwnedAgent: mocks.requireOwnedAgent,
  listAgentVersions: mocks.listAgentVersions,
}));

const { GET } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/versions`;
const VERSION = {
  version: 1,
  note: 'First cut',
  publishedAt: '2026-10-19T00:00:00.000Z',
  publishedByName: null,
  config: agentConfig(),
};

describe('GET /api/custom-agents/[id]/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.requireOwnedAgent.mockResolvedValue(agentRow());
    mocks.listAgentVersions.mockResolvedValue([VERSION]);
  });

  it('lists published versions only after confirming the caller owns the agent', async () => {
    const response = await GET(agentRequest(PATH), agentContext());

    expect(response.status).toBe(200);
    expect(mocks.requireOwnedAgent).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID);
    expect(mocks.listAgentVersions).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      OWNER,
      AGENT_ID,
    );
    expect(await response.json()).toEqual({ versions: [VERSION] });
  });

  it('lists nothing when the ownership check refuses', async () => {
    mocks.requireOwnedAgent.mockRejectedValue(createError.notFound('Agent not found'));
    const response = await GET(agentRequest(PATH), agentContext());
    expect(response.status).toBe(404);
    expect(mocks.listAgentVersions).not.toHaveBeenCalled();
  });

  it('returns the refusal when the read is limited', async () => {
    mocks.openRead.mockResolvedValue(refused());
    const response = await GET(agentRequest(PATH), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.requireOwnedAgent).not.toHaveBeenCalled();
  });
});
