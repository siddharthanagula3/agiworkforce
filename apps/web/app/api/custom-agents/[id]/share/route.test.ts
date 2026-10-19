import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER, TEAMMATE, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
import {
  ORGANIZATION_ID,
  agentContext,
  agentRequest,
  opened,
  refused,
} from '@/app/api/custom-agents/__tests__/agent-route-kit';

type AgentRouteModule = typeof import('@/lib/agents/agent-route');
type AgentServiceModule = typeof import('@/lib/services/custom-agent-service');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type MemberAdminModule = typeof import('@/lib/services/organization-member-admin-service');
type WorkspaceAuditModule = typeof import('@/lib/workspace-audit');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  requireOwnedAgent: vi.fn(),
  readAgentAccess: vi.fn(),
  shareAgent: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  recordWorkspaceAuditEvent: vi.fn(),
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
  requireOwnedAgent: mocks.requireOwnedAgent,
  readAgentAccess: mocks.readAgentAccess,
  shareAgent: mocks.shareAgent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({ query: mocks.serviceQuery }),
}));
vi.mock('@/lib/services/organization-member-admin-service', async (importOriginal) => ({
  ...(await importOriginal<MemberAdminModule>()),
  listWorkspaceMembers: mocks.listWorkspaceMembers,
}));
vi.mock('@/lib/workspace-audit', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceAuditModule>()),
  recordWorkspaceAuditEvent: mocks.recordWorkspaceAuditEvent,
}));

const { GET, PUT } = await import('./route');

const PATH = `/api/custom-agents/${AGENT_ID}/share`;

const MEMBERS = {
  data: [
    { userId: OWNER, name: 'Owner', email: 'owner@example.com' },
    { userId: TEAMMATE, name: null, email: 'teammate@example.com' },
  ],
};

describe('/api/custom-agents/[id]/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.requireOwnedAgent.mockResolvedValue(agentRow());
    mocks.shareAgent.mockResolvedValue(agentRow({ visibility: 'people' }));
    mocks.readAgentAccess.mockResolvedValue(new Set([TEAMMATE]));
    mocks.listWorkspaceMembers.mockResolvedValue(MEMBERS);
    mocks.serviceQuery.mockResolvedValue([{ name: 'Acme' }]);
    mocks.recordWorkspaceAuditEvent.mockResolvedValue(undefined);
  });

  it('GET lists the workspace people other than the owner, with who has access', async () => {
    const response = await GET(agentRequest(PATH), agentContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.requireOwnedAgent).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID);
    expect(mocks.listWorkspaceMembers).toHaveBeenCalledWith(
      expect.anything(),
      ORGANIZATION_ID,
      expect.objectContaining({ afterId: null, email: null }),
    );
    expect(await response.json()).toEqual({
      visibility: 'private',
      workspaceName: 'Acme',
      members: [
        {
          userId: TEAMMATE,
          name: 'teammate@example.com',
          email: 'teammate@example.com',
          hasAccess: true,
        },
      ],
    });
  });

  it('GET answers a personal agent with no workspace and no people', async () => {
    mocks.requireOwnedAgent.mockResolvedValue(agentRow({ organization_id: null }));
    const response = await GET(agentRequest(PATH), agentContext());

    expect(await response.json()).toEqual({
      visibility: 'private',
      workspaceName: null,
      members: [],
    });
    expect(mocks.listWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('PUT shares with the named people and records it in the workspace audit log', async () => {
    const response = await PUT(
      agentRequest(PATH, 'PUT', { visibility: 'people', userIds: [TEAMMATE] }),
      agentContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.shareAgent).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID, {
      visibility: 'people',
      userIds: [TEAMMATE],
    });
    expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        userId: OWNER,
        eventType: 'agent_shared',
        detail: { resourceType: 'agent', resourceId: AGENT_ID, status: 'people', count: 1 },
      }),
    );
    expect(((await response.json()) as { visibility: string }).visibility).toBe('people');
  });

  it('PUT refuses a visibility the product does not have', async () => {
    const response = await PUT(agentRequest(PATH, 'PUT', { visibility: 'public' }), agentContext());
    expect(response.status).toBe(400);
    expect(mocks.shareAgent).not.toHaveBeenCalled();
  });

  it('PUT returns the refusal and shares nothing when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await PUT(
      agentRequest(PATH, 'PUT', { visibility: 'workspace' }),
      agentContext(),
    );
    expect(response.status).toBe(403);
    expect(mocks.shareAgent).not.toHaveBeenCalled();
  });
});
