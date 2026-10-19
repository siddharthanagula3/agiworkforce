import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ID, OWNER } from '@/lib/agents/__tests__/agent-fixtures';
import { agentRequest, opened, refused } from '@/app/api/custom-agents/__tests__/agent-route-kit';

type AgentRouteModule = typeof import('@/lib/agents/agent-route');
type AgentServiceModule = typeof import('@/lib/services/custom-agent-service');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  deleteAgentFile: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agents/agent-route', async (importOriginal) => ({
  ...(await importOriginal<AgentRouteModule>()),
  openAgentRead: mocks.openRead,
  openAgentWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<AgentServiceModule>()),
  deleteAgentFile: mocks.deleteAgentFile,
}));

const { DELETE } = await import('./route');

const FILE_ID = '0190a000-0000-7000-8000-0000000000d1';
const PATH = `/api/custom-agents/${AGENT_ID}/files/${FILE_ID}`;

function context(id = AGENT_ID, fileId = FILE_ID) {
  return { params: Promise.resolve({ id, fileId }) };
}

describe('DELETE /api/custom-agents/[id]/files/[fileId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.deleteAgentFile.mockResolvedValue(undefined);
  });

  it('removes the file through the CSRF-checked write path', async () => {
    const response = await DELETE(agentRequest(PATH, 'DELETE'), context());

    expect(response.status).toBe(204);
    expect(mocks.deleteAgentFile).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID, FILE_ID);
  });

  it('answers 404 for ids that are not agent or file ids', async () => {
    expect((await DELETE(agentRequest(PATH, 'DELETE'), context('nope'))).status).toBe(404);
    expect((await DELETE(agentRequest(PATH, 'DELETE'), context(AGENT_ID, 'nope'))).status).toBe(
      404,
    );
    expect(mocks.openWrite).not.toHaveBeenCalled();
  });

  it('returns the refusal and deletes nothing when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await DELETE(agentRequest(PATH, 'DELETE'), context());
    expect(response.status).toBe(403);
    expect(mocks.deleteAgentFile).not.toHaveBeenCalled();
  });
});
