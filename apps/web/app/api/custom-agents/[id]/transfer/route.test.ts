import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER, TEAMMATE } from '@/lib/agents/__tests__/agent-fixtures';
import {
  agentContext,
  agentRequest,
  opened,
  refused,
} from '@/app/api/custom-agents/__tests__/agent-route-kit';

type AgentRouteModule = typeof import('@/lib/agents/agent-route');
type AgentServiceModule = typeof import('@/lib/services/custom-agent-service');
type WorkspaceAuditModule = typeof import('@/lib/workspace-audit');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  transferAgent: vi.fn(),
  recordWorkspaceAuditEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  transferAgent: mocks.transferAgent,
}));
vi.mock('@/lib/workspace-audit', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceAuditModule>()),
  recordWorkspaceAuditEvent: mocks.recordWorkspaceAuditEvent,
}));

const { POST } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/transfer`;

describe('POST /api/custom-agents/[id]/transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.transferAgent.mockResolvedValue(undefined);
    mocks.recordWorkspaceAuditEvent.mockResolvedValue(undefined);
  });

  it('hands the agent to the new owner and records it in the workspace audit log', async () => {
    const response = await POST(
      agentRequest(PATH, 'POST', { newOwnerId: TEAMMATE }),
      agentContext(),
    );

    expect(response.status).toBe(204);
    expect(mocks.transferAgent).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID, TEAMMATE);
    expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        userId: OWNER,
        eventType: 'agent_ownership_transferred',
        detail: { resourceType: 'agent', resourceId: AGENT_ID, targetUserId: TEAMMATE },
      }),
    );
  });

  it('records nothing when the transfer fails', async () => {
    mocks.transferAgent.mockRejectedValue(new Error('not a member'));
    const response = await POST(
      agentRequest(PATH, 'POST', { newOwnerId: TEAMMATE }),
      agentContext(),
    );
    expect(response.status).toBe(500);
    expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a request with no new owner', async () => {
    const response = await POST(agentRequest(PATH, 'POST', {}), agentContext());
    expect(response.status).toBe(400);
    expect(mocks.transferAgent).not.toHaveBeenCalled();
  });

  it('returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(
      agentRequest(PATH, 'POST', { newOwnerId: TEAMMATE }),
      agentContext(),
    );
    expect(response.status).toBe(403);
    expect(mocks.transferAgent).not.toHaveBeenCalled();
  });
});
