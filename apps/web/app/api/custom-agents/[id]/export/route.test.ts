import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, agentConfig, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
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
}));

const { GET } = await import('./route');

const { agentFromSubagentMarkdown } = await import('@/lib/agents/agent-markdown');

const PATH = `/api/custom-agents/${AGENT_ID}/export`;

describe('GET /api/custom-agents/[id]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.requireReadableAgent.mockResolvedValue(agentRow());
  });

  it('downloads the agent as a subagent file that imports back to the same agent', async () => {
    const response = await GET(agentRequest(PATH), agentContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename=".+\.md"$/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const imported = agentFromSubagentMarkdown(await response.text());
    expect(imported.name).toBe(agentConfig().name);
    expect(imported.instructions).toBe(agentConfig().instructions);
  });

  it('returns the refusal when the read is limited', async () => {
    mocks.openRead.mockResolvedValue(refused());
    const response = await GET(agentRequest(PATH), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.requireReadableAgent).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not an agent id', async () => {
    const response = await GET(agentRequest(PATH), agentContext('not-an-id'));
    expect(response.status).toBe(404);
  });
});
