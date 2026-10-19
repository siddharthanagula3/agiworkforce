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
  setAgentStatus: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  setAgentStatus: mocks.setAgentStatus,
}));

const { POST } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/status`;

describe('POST /api/custom-agents/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.setAgentStatus.mockResolvedValue(agentRow({ status: 'paused' }));
  });

  it('pauses the agent through the CSRF-checked write path', async () => {
    const response = await POST(agentRequest(PATH, 'POST', { status: 'paused' }), agentContext());

    expect(response.status).toBe(200);
    expect(mocks.openRead).not.toHaveBeenCalled();
    expect(mocks.setAgentStatus).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID, 'paused');
    expect(((await response.json()) as { agent: { status: string } }).agent.status).toBe('paused');
  });

  it('refuses a status the product does not have', async () => {
    const response = await POST(agentRequest(PATH, 'POST', { status: 'deleted' }), agentContext());
    expect(response.status).toBe(400);
    expect(mocks.setAgentStatus).not.toHaveBeenCalled();
  });

  it('returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(agentRequest(PATH, 'POST', { status: 'paused' }), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.setAgentStatus).not.toHaveBeenCalled();
  });
});
