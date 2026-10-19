// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createError } from '@/lib/errors';
import { AGENT_ID, OWNER, agentRow } from '@/lib/agents/__tests__/agent-fixtures';
import {
  agentContext,
  agentRequest,
  opened,
  refused,
} from '@/app/api/custom-agents/__tests__/agent-route-kit';

type AgentRouteModule = typeof import('@/lib/agents/agent-route');
type AgentServiceModule = typeof import('@/lib/services/custom-agent-service');
type UploadScanModule = typeof import('@/lib/security/upload-scan');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  requireReadableAgent: vi.fn(),
  requireOwnedAgent: vi.fn(),
  listAgentFiles: vi.fn(),
  addAgentFile: vi.fn(),
  refuseUnsafeUpload: vi.fn(),
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
  requireOwnedAgent: mocks.requireOwnedAgent,
  listAgentFiles: mocks.listAgentFiles,
  addAgentFile: mocks.addAgentFile,
}));
vi.mock('@/lib/security/upload-scan', async (importOriginal) => ({
  ...(await importOriginal<UploadScanModule>()),
  refuseUnsafeUpload: mocks.refuseUnsafeUpload,
}));

const { GET, POST } = await import('./route');

const { NextRequest } = await import('next/server');

const PATH = `/api/custom-agents/${AGENT_ID}/files`;
const FILE = {
  id: '0190a000-0000-7000-8000-0000000000d1',
  name: 'style-guide.md',
  mimeType: 'text/markdown',
  byteSize: 24,
  createdAt: '2026-10-19T00:00:00.000Z',
};

function upload(form: FormData) {
  return new NextRequest(`https://agiworkforce.test${PATH}`, { method: 'POST', body: form });
}

describe('/api/custom-agents/[id]/files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.requireReadableAgent.mockResolvedValue(agentRow());
    mocks.requireOwnedAgent.mockResolvedValue(agentRow());
    mocks.listAgentFiles.mockResolvedValue([FILE]);
    mocks.addAgentFile.mockResolvedValue(FILE);
    mocks.refuseUnsafeUpload.mockResolvedValue(undefined);
  });

  it('GET lists the files of an agent the caller can read, uncached', async () => {
    const response = await GET(agentRequest(PATH), agentContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.requireReadableAgent).toHaveBeenCalledWith(expect.anything(), AGENT_ID);
    expect(await response.json()).toEqual({ files: [FILE] });
  });

  it('POST scans the upload, reads its text and saves it to an agent the caller owns', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File(['# Style\nLead with the change.'], 'style-guide.md', { type: 'text/markdown' }),
    );

    const response = await POST(upload(form), agentContext());

    expect(response.status).toBe(201);
    expect(mocks.requireOwnedAgent).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID);
    expect(mocks.refuseUnsafeUpload).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'text/markdown',
      expect.objectContaining({ filename: 'style-guide.md' }),
    );
    expect(mocks.addAgentFile).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT_ID, {
      name: 'style-guide.md',
      mimeType: 'text/markdown',
      content: '# Style\nLead with the change.',
    });
    expect(await response.json()).toEqual({ file: FILE });
  });

  it('POST saves nothing when the upload scan refuses the file', async () => {
    mocks.refuseUnsafeUpload.mockRejectedValue(createError.validation('This file was refused.'));
    const form = new FormData();
    form.set('file', new File(['payload'], 'notes.txt', { type: 'text/plain' }));

    const response = await POST(upload(form), agentContext());

    expect(response.status).toBe(400);
    expect(mocks.addAgentFile).not.toHaveBeenCalled();
  });

  it('POST asks for a file when the form carries none', async () => {
    const response = await POST(upload(new FormData()), agentContext());
    expect(response.status).toBe(400);
    expect(mocks.addAgentFile).not.toHaveBeenCalled();
  });

  it('POST returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(upload(new FormData()), agentContext());
    expect(response.status).toBe(403);
    expect(mocks.requireOwnedAgent).not.toHaveBeenCalled();
  });
});
