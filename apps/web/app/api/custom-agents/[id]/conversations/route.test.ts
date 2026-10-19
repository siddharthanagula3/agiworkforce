import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
import {
  ORGANIZATION_ID,
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
  createAgentConversation: vi.fn(),
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
  createAgentConversation: mocks.createAgentConversation,
}));

const { POST } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/conversations`;
const CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000c1';

describe('POST /api/custom-agents/[id]/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.requireReadableAgent.mockResolvedValue(agentRow());
    mocks.createAgentConversation.mockResolvedValue(CONVERSATION_ID);
  });

  it('starts a conversation with an active agent', async () => {
    const response = await POST(agentRequest(PATH, 'POST'), agentContext());

    expect(response.status).toBe(201);
    expect(mocks.createAgentConversation).toHaveBeenCalledWith(
      expect.anything(),
      OWNER,
      ORGANIZATION_ID,
      expect.objectContaining({ id: AGENT_ID }),
    );
    expect(await response.json()).toEqual({ conversationId: CONVERSATION_ID });
  });

  it('refuses a paused agent with the reason and starts nothing', async () => {
    mocks.requireReadableAgent.mockResolvedValue(agentRow({ status: 'paused' }));
    const response = await POST(agentRequest(PATH, 'POST'), agentContext());

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain('is paused');
    expect(mocks.createAgentConversation).not.toHaveBeenCalled();
  });

  it('returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(agentRequest(PATH, 'POST'), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.requireReadableAgent).not.toHaveBeenCalled();
  });
});
