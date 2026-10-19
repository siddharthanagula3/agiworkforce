import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER, agentConfig, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
import {
  ORGANIZATION_ID,
  agentRequest,
  opened,
  refused,
} from '@/app/api/custom-agents/__tests__/agent-route-kit';

type AgentRouteModule = typeof import('@/lib/agents/agent-route');
type AgentServiceModule = typeof import('@/lib/services/custom-agent-service');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  createAgent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  createAgent: mocks.createAgent,
}));

const { POST } = await import('./route');

const { agentToSubagentMarkdown } = await import('@/lib/agents/agent-markdown');

const PATH = '/api/custom-agents/import';

describe('POST /api/custom-agents/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.createAgent.mockResolvedValue(agentRow());
  });

  it('creates an agent from an exported subagent file', async () => {
    const markdown = agentToSubagentMarkdown(agentConfig());
    const response = await POST(agentRequest(PATH, 'POST', { markdown }));

    expect(response.status).toBe(201);
    expect(mocks.createAgent).toHaveBeenCalledWith(
      expect.anything(),
      OWNER,
      ORGANIZATION_ID,
      expect.objectContaining({ name: agentConfig().name }),
    );
    expect(((await response.json()) as { agent: { id: string } }).agent.id).toBe(AGENT_ID);
  });

  it('refuses a file that is not an agent definition and creates nothing', async () => {
    const response = await POST(agentRequest(PATH, 'POST', { markdown: 'just some notes' }));
    expect(response.status).toBe(400);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it('returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(agentRequest(PATH, 'POST', { markdown: 'x' }));
    expect(response.status).toBe(403);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });
});
