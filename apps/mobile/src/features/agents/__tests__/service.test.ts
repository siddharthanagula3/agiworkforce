const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockPut = jest.fn();
const mockApiFetch = jest.fn();
const mockGuardedFetch = jest.fn();

jest.mock('@/services/api', () => ({
  ApiHttpError: jest.requireActual('@/services/apiErrors').ApiHttpError,
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer token' })),
}));
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
}));
jest.mock('@/src/platform/platformHeaders', () => ({ platformRequestHeaders: () => ({}) }));

import { NEW_AGENT_DRAFT } from '@agiworkforce/cloud-contracts';
import {
  createAgent,
  deleteAgent,
  importAgentMarkdown,
  listAgents,
  publishAgent,
  restoreAgentVersion,
  setAgentStatus,
  startAgentConversation,
  transferAgent,
  updateAgentShare,
  uploadAgentFile,
} from '../service';

const AGENT = {
  ...NEW_AGENT_DRAFT,
  name: 'Planner',
  id: '7d1b5c1e-0b3f-4a43-9a43-6b1d0f2b5f11',
  isOwner: true,
  ownerName: null,
  organizationId: null,
  status: 'active',
  visibility: 'private',
  publishedVersion: null,
  hasUnpublishedChanges: false,
  pausedAt: null,
  retiredAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('agents service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists agents and rejects a malformed response', async () => {
    mockGet.mockResolvedValueOnce({ agents: [AGENT] });
    await expect(listAgents()).resolves.toEqual([AGENT]);
    expect(mockGet).toHaveBeenCalledWith('/api/custom-agents', { signal: undefined });
    mockGet.mockResolvedValueOnce({ agents: [{ id: 'x' }] });
    await expect(listAgents()).rejects.toThrow();
  });

  it('creates, imports and starts chats through the custom-agents routes', async () => {
    mockPost.mockResolvedValueOnce({ agent: AGENT });
    await createAgent({ ...NEW_AGENT_DRAFT, name: 'Planner' });
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/custom-agents',
      expect.objectContaining({ name: 'Planner', webSearch: true }),
    );

    mockPost.mockResolvedValueOnce({ agent: AGENT });
    await importAgentMarkdown('# Planner');
    expect(mockPost).toHaveBeenLastCalledWith('/api/custom-agents/import', {
      markdown: '# Planner',
    });

    mockPost.mockResolvedValueOnce({ conversationId: '1d4c3a3e-1f9a-4c55-8c11-1f0e0e7b9a01' });
    await expect(startAgentConversation(AGENT.id)).resolves.toBe(
      '1d4c3a3e-1f9a-4c55-8c11-1f0e0e7b9a01',
    );
    expect(mockPost).toHaveBeenLastCalledWith(`/api/custom-agents/${AGENT.id}/conversations`, {});
  });

  it('publishes with a trimmed note, restores, changes status and transfers', async () => {
    mockPost.mockResolvedValue({ agent: AGENT });
    await publishAgent(AGENT.id, '  first cut ');
    expect(mockPost).toHaveBeenLastCalledWith(`/api/custom-agents/${AGENT.id}/publish`, {
      note: 'first cut',
    });
    await publishAgent(AGENT.id, '   ');
    expect(mockPost).toHaveBeenLastCalledWith(`/api/custom-agents/${AGENT.id}/publish`, {});
    await restoreAgentVersion(AGENT.id, 2);
    expect(mockPost).toHaveBeenLastCalledWith(`/api/custom-agents/${AGENT.id}/restore`, {
      version: 2,
    });
    await setAgentStatus(AGENT.id, 'retired');
    expect(mockPost).toHaveBeenLastCalledWith(`/api/custom-agents/${AGENT.id}/status`, {
      status: 'retired',
    });
    mockPost.mockResolvedValueOnce({});
    await transferAgent(AGENT.id, 'user-2');
    expect(mockPost).toHaveBeenLastCalledWith(`/api/custom-agents/${AGENT.id}/transfer`, {
      newOwnerId: 'user-2',
    });
  });

  it('shares with named people', async () => {
    mockPut.mockResolvedValueOnce({ visibility: 'people', workspaceName: 'Acme', members: [] });
    await updateAgentShare(AGENT.id, { visibility: 'people', userIds: ['u1'] });
    expect(mockPut).toHaveBeenCalledWith(`/api/custom-agents/${AGENT.id}/share`, {
      visibility: 'people',
      userIds: ['u1'],
    });
  });

  it('surfaces the server message when delete is refused', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Only the owner can delete.' } }), {
        status: 403,
      }),
    );
    await expect(deleteAgent(AGENT.id)).rejects.toThrow('Only the owner can delete.');
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/custom-agents/${AGENT.id}`, {
      method: 'DELETE',
    });
  });

  it('uploads a knowledge file as multipart without forcing a JSON content type', async () => {
    mockGuardedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          file: {
            id: '2f4c3a3e-1f9a-4c55-8c11-1f0e0e7b9a02',
            name: 'notes.md',
            mimeType: 'text/markdown',
            byteSize: 12,
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        }),
        { status: 201 },
      ),
    );
    const file = await uploadAgentFile(AGENT.id, {
      uri: 'file:///notes.md',
      name: 'notes.md',
      mimeType: 'text/markdown',
    });
    expect(file.name).toBe('notes.md');
    const [url, init] = mockGuardedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/api/custom-agents/${AGENT.id}/files$`));
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.headers).toHaveProperty('Authorization', 'Bearer token');
  });
});
