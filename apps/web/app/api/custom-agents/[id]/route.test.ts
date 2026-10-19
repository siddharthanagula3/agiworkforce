import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
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
  requireReadableAgent: vi.fn(),
  updateAgentDraft: vi.fn(),
  deleteAgent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  requireReadableAgent: mocks.requireReadableAgent,
  updateAgentDraft: mocks.updateAgentDraft,
  deleteAgent: mocks.deleteAgent,
}));

const { GET, PATCH, DELETE } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}`;

describe('/api/custom-agents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.requireReadableAgent.mockResolvedValue(agentRow());
    mocks.updateAgentDraft.mockResolvedValue(agentRow({ name: 'Renamed' }));
    mocks.deleteAgent.mockResolvedValue(undefined);
  });

  it('GET answers with an agent the caller can read, uncached', async () => {
    const response = await GET(agentRequest(PATH), agentContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.requireReadableAgent).toHaveBeenCalledWith(expect.anything(), AGENT_ID);
    expect(((await response.json()) as { agent: { id: string } }).agent.id).toBe(AGENT_ID);
  });

  it('GET answers 404 for an id that is not an agent id', async () => {
    const response = await GET(agentRequest(PATH), agentContext('not-an-id'));
    expect(response.status).toBe(404);
    expect(mocks.openRead).not.toHaveBeenCalled();
  });

  it('PATCH saves the draft change through the CSRF-checked write path', async () => {
    const response = await PATCH(agentRequest(PATH, 'PATCH', { name: 'Renamed' }), agentContext());

    expect(response.status).toBe(200);
    expect(mocks.updateAgentDraft).toHaveBeenCalledWith(
      expect.anything(),
      OWNER,
      AGENT_ID,
      expect.objectContaining({ name: 'Renamed' }),
    );
  });

  it('PATCH refuses a change that is not part of an agent definition', async () => {
    const response = await PATCH(agentRequest(PATH, 'PATCH', { webSearch: 'yes' }), agentContext());
    expect(response.status).toBe(400);
    expect(mocks.updateAgentDraft).not.toHaveBeenCalled();
  });

  it('DELETE removes the agent through the CSRF-checked write path', async () => {
    const response = await DELETE(agentRequest(PATH, 'DELETE'), agentContext());

    expect(response.status).toBe(204);
    expect(mocks.openRead).not.toHaveBeenCalled();
    expect(mocks.deleteAgent).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID);
  });

  it('DELETE returns the refusal and deletes nothing when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await DELETE(agentRequest(PATH, 'DELETE'), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.deleteAgent).not.toHaveBeenCalled();
  });
});
