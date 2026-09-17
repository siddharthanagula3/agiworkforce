import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectKnowledgeFile, ProjectKnowledgeIndexState } from '@agiworkforce/types';
import { KnowledgeFilesPanel } from './KnowledgeFilesPanel';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));
vi.mock('./FilePreviewModal', () => ({ FilePreviewModal: () => null }));

function file(indexing: ProjectKnowledgeIndexState | null): ProjectKnowledgeFile {
  return {
    id: 'file-1',
    projectId: 'project-1',
    fileName: 'handbook.pdf',
    mimeType: 'application/pdf',
    byteCount: 4096,
    checksumSha256: 'abc',
    sourceSurface: 'web',
    addedByUserId: 'user-1',
    addedAt: '2026-09-17T00:00:00.000Z',
    storageUri: '/api/projects/project-1/knowledge-files/file-1',
    indexing,
  };
}

const FAILED: ProjectKnowledgeIndexState = {
  status: 'failed',
  chunkCount: 0,
  semantic: false,
  attempts: 5,
  error: 'This source could not be indexed. Retry indexing to try again.',
  indexedAt: null,
};

function stubFetch(listed: ProjectKnowledgeFile) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'POST' && url.endsWith('/reindex')) {
      return {
        ok: true,
        status: 202,
        json: async () => ({
          indexing: { ...FAILED, status: 'pending', error: null, attempts: 0 },
        }),
      } as Response;
    }
    return { ok: true, json: async () => ({ files: [listed] }) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('KnowledgeFilesPanel indexing state', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('says a file is being indexed while its index run is outstanding', async () => {
    stubFetch(file({ ...FAILED, status: 'indexing', error: null, attempts: 0 }));
    render(<KnowledgeFilesPanel projectId="project-1" />);

    const status = await screen.findByTestId('knowledge-files-index-status');
    expect(status.textContent).toContain('Indexing for search');
    expect(screen.queryByTestId('knowledge-files-retry-index')).toBeNull();
  });

  it('shows nothing extra once a file is indexed', async () => {
    stubFetch(file({ ...FAILED, status: 'indexed', chunkCount: 12, semantic: true, error: null }));
    render(<KnowledgeFilesPanel projectId="project-1" />);

    await screen.findByText('handbook.pdf');
    expect(screen.queryByTestId('knowledge-files-index-status')).toBeNull();
  });

  it('shows the failure and restarts indexing through the reindex endpoint', async () => {
    const fetchMock = stubFetch(file(FAILED));
    render(<KnowledgeFilesPanel projectId="project-1" />);

    expect((await screen.findByTestId('knowledge-files-index-status')).textContent).toContain(
      FAILED.error,
    );
    fireEvent.click(screen.getByTestId('knowledge-files-retry-index'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/knowledge-files/file-1/reindex',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('knowledge-files-index-status').textContent).toContain(
        'Indexing for search',
      ),
    );
  });
});
