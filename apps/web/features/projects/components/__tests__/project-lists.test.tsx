import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  artifactIndex: vi.fn(),
  authToken: vi.fn(async () => 'token'),
  fetchImpl: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/features/chat/hooks/use-artifact-index', () => ({
  useArtifactIndex: (...args: unknown[]) => mocks.artifactIndex(...args),
}));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: () => mocks.authToken() }));

import { ProjectArtifactsPanel } from '../ProjectArtifactsPanel';
import { ProjectWorkPanel } from '../ProjectWorkPanel';

const PROJECT = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetchImpl);
});

describe('ProjectArtifactsPanel', () => {
  it('asks the index for this project only', () => {
    mocks.artifactIndex.mockReturnValue({ artifacts: [], loaded: true });

    render(<ProjectArtifactsPanel projectId={PROJECT} projectName="Launch" />);

    expect(mocks.artifactIndex).toHaveBeenCalledWith({ projectId: PROJECT });
  });

  it('lists the project artifacts and opens the chat that produced one', () => {
    mocks.artifactIndex.mockReturnValue({
      loaded: true,
      artifacts: [
        {
          id: 'a1',
          conversationId: 'conv-1',
          messageId: 'msg-1',
          title: 'Quarterly plan',
          type: 'document',
          language: 'md',
          projectId: PROJECT,
          createdAt: '2026-09-13T00:00:00.000Z',
        },
      ],
    });

    render(<ProjectArtifactsPanel projectId={PROJECT} projectName="Launch" />);

    const row = screen.getByRole('button', { name: /Quarterly plan/ });
    row.click();
    expect(mocks.push).toHaveBeenCalledWith('/chat/conv-1');
  });

  it('names the project in its empty state instead of showing a bare list', () => {
    mocks.artifactIndex.mockReturnValue({ artifacts: [], loaded: true });

    render(<ProjectArtifactsPanel projectId={PROJECT} projectName="Launch" />);

    expect(screen.getByText('No artifacts yet')).toBeInTheDocument();
    expect(screen.getByText(/chats in Launch produce/i)).toBeInTheDocument();
  });

  it('shows a loading status rather than an empty state before the first response', () => {
    mocks.artifactIndex.mockReturnValue({ artifacts: [], loaded: false });

    render(<ProjectArtifactsPanel projectId={PROJECT} projectName="Launch" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No artifacts yet')).not.toBeInTheDocument();
  });
});

describe('ProjectWorkPanel', () => {
  it('asks for this project and for every run state, not only the active ones', async () => {
    mocks.fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ runs: [] }) });

    render(<ProjectWorkPanel projectId={PROJECT} projectName="Launch" />);

    await waitFor(() => expect(mocks.fetchImpl).toHaveBeenCalled());
    const url = new URL(String(mocks.fetchImpl.mock.calls[0]![0]), 'https://agiworkforce.com');
    expect(url.searchParams.get('projectId')).toBe(PROJECT);
    expect(url.searchParams.getAll('state')).toContain('completed');
    expect(url.searchParams.getAll('state')).toContain('running');
  });

  it('lists a run with its state and opens its conversation', async () => {
    mocks.fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({
        runs: [
          {
            id: 'run-1',
            userId: 'user-1',
            requestId: 'req-1',
            conversationId: 'conv-9',
            conversationTitle: 'Draft the brief',
            originSurface: 'web',
            workMode: 'agiwork',
            state: 'completed',
            provider: 'anthropic',
            model: 'model-a',
            lastEventSequence: 3,
            cancellationRequestedAt: null,
            completedAt: '2026-09-13T00:00:00.000Z',
            createdAt: '2026-09-13T00:00:00.000Z',
            updatedAt: '2026-09-13T00:00:00.000Z',
          },
        ],
      }),
    });

    render(<ProjectWorkPanel projectId={PROJECT} projectName="Launch" />);

    const row = await screen.findByRole('button', { name: /Draft the brief/ });
    expect(screen.getByText('Done')).toBeInTheDocument();
    row.click();
    expect(mocks.push).toHaveBeenCalledWith('/chat/conv-9');
  });

  it('says so when the work list cannot be read, rather than claiming there is none', async () => {
    mocks.fetchImpl.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    render(<ProjectWorkPanel projectId={PROJECT} projectName="Launch" />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No work yet')).not.toBeInTheDocument();
  });

  it('names the project in its empty state', async () => {
    mocks.fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ runs: [] }) });

    render(<ProjectWorkPanel projectId={PROJECT} projectName="Launch" />);

    expect(await screen.findByText('No work yet')).toBeInTheDocument();
    expect(screen.getByText(/chat in Launch to AGI Work/i)).toBeInTheDocument();
  });
});
