import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
import {
  ORGANIZATION_ID,
  agentRequest,
  opened,
  refused,
} from '@/app/api/custom-agents/__tests__/agent-route-kit';

type AgentRouteModule = typeof import('@/lib/agents/agent-route');
type AgentServiceModule = typeof import('@/lib/services/custom-agent-service');
type NeonDbModule = typeof import('@/lib/server/neon-db');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  listAgentRows: vi.fn(),
  createAgent: vi.fn(),
  readOwnerNames: vi.fn(),
  serviceQuery: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  listAgentRows: mocks.listAgentRows,
  createAgent: mocks.createAgent,
  readOwnerNames: mocks.readOwnerNames,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({ query: mocks.serviceQuery }),
}));

const { GET, POST } = await import('./route');

const PATH = '/api/custom-agents';

describe('/api/custom-agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.readOwnerNames.mockResolvedValue(new Map());
    mocks.listAgentRows.mockResolvedValue([agentRow()]);
    mocks.createAgent.mockResolvedValue(agentRow());
  });

  it('GET lists the agents the caller can see in their workspace, uncached', async () => {
    const response = await GET(agentRequest(PATH));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.listAgentRows).toHaveBeenCalledWith(expect.anything(), OWNER, ORGANIZATION_ID);
    const body = (await response.json()) as { agents: Array<{ id: string }> };
    expect(body.agents.map((agent) => agent.id)).toEqual([AGENT_ID]);
  });

  it('GET returns the refusal when the read is limited', async () => {
    mocks.openRead.mockResolvedValue(refused());
    const response = await GET(agentRequest(PATH));
    expect(response.status).toBe(403);
    expect(mocks.listAgentRows).not.toHaveBeenCalled();
  });

  it('POST creates the agent through the CSRF-checked write path', async () => {
    const response = await POST(agentRequest(PATH, 'POST', { name: 'Release notes writer' }));

    expect(response.status).toBe(201);
    expect(mocks.openRead).not.toHaveBeenCalled();
    expect(mocks.createAgent).toHaveBeenCalledWith(
      expect.anything(),
      OWNER,
      ORGANIZATION_ID,
      expect.objectContaining({ name: 'Release notes writer' }),
    );
    expect(((await response.json()) as { agent: { id: string } }).agent.id).toBe(AGENT_ID);
  });

  it('POST refuses a body that is not an agent definition', async () => {
    const response = await POST(agentRequest(PATH, 'POST', { name: 42 }));
    expect(response.status).toBe(400);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it('POST returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(agentRequest(PATH, 'POST', { name: 'x' }));
    expect(response.status).toBe(403);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });
});
