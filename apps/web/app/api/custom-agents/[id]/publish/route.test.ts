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
  publishAgent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  publishAgent: mocks.publishAgent,
}));

const { POST } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/publish`;

describe('POST /api/custom-agents/[id]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.publishAgent.mockResolvedValue(agentRow({ published_version: 2 }));
  });

  it('publishes the draft with its note through the CSRF-checked write path', async () => {
    const response = await POST(
      agentRequest(PATH, 'POST', { note: 'Tighter tone' }),
      agentContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.openRead).not.toHaveBeenCalled();
    expect(mocks.publishAgent).toHaveBeenCalledWith(
      expect.anything(),
      OWNER,
      AGENT_ID,
      'Tighter tone',
    );
    const body = (await response.json()) as { agent: { id: string } };
    expect(body.agent.id).toBe(AGENT_ID);
  });

  it('publishes without a note', async () => {
    await POST(agentRequest(PATH, 'POST', {}), agentContext());
    expect(mocks.publishAgent).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID, null);
  });

  it('returns the refusal and publishes nothing when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(agentRequest(PATH, 'POST', {}), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.publishAgent).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not an agent id', async () => {
    const response = await POST(agentRequest(PATH, 'POST', {}), agentContext('not-an-id'));
    expect(response.status).toBe(404);
    expect(mocks.openWrite).not.toHaveBeenCalled();
  });
});
