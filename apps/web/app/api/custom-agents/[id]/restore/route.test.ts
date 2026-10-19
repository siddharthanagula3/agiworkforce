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
  restoreAgentVersion: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  restoreAgentVersion: mocks.restoreAgentVersion,
}));

const { POST } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/restore`;

describe('POST /api/custom-agents/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.restoreAgentVersion.mockResolvedValue(agentRow());
  });

  it('restores the named version through the CSRF-checked write path', async () => {
    const response = await POST(agentRequest(PATH, 'POST', { version: 3 }), agentContext());

    expect(response.status).toBe(200);
    expect(mocks.openRead).not.toHaveBeenCalled();
    expect(mocks.restoreAgentVersion).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID, 3);
    expect(((await response.json()) as { agent: { id: string } }).agent.id).toBe(AGENT_ID);
  });

  it('refuses a version that is not a positive whole number', async () => {
    const response = await POST(agentRequest(PATH, 'POST', { version: 0 }), agentContext());
    expect(response.status).toBe(400);
    expect(mocks.restoreAgentVersion).not.toHaveBeenCalled();
  });

  it('returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(agentRequest(PATH, 'POST', { version: 3 }), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.restoreAgentVersion).not.toHaveBeenCalled();
  });
});
