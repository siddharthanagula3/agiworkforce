import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER } from '@/lib/agents/__tests__/agent-fixtures';
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
  readAgentUsage: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  readAgentUsage: mocks.readAgentUsage,
}));

const { GET } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/usage`;
const USAGE = { windowDays: 30, conversations: 4, people: 2, turns: 19 };

describe('GET /api/custom-agents/[id]/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.readAgentUsage.mockResolvedValue(USAGE);
  });

  it('answers with the usage the service read for the caller', async () => {
    const response = await GET(agentRequest(PATH), agentContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.readAgentUsage).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID);
    expect(await response.json()).toEqual(USAGE);
  });

  it('returns the refusal and reads nothing when the read is limited', async () => {
    mocks.openRead.mockResolvedValue(refused());
    const response = await GET(agentRequest(PATH), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.readAgentUsage).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not an agent id', async () => {
    const response = await GET(agentRequest(PATH), agentContext('not-an-id'));
    expect(response.status).toBe(404);
  });
});
