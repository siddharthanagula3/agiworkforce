import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../FilePreviewModal', () => ({ FilePreviewModal: () => null }));

const toastInfo = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

const service = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  reindex: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  upload: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('../../services/project-knowledge-upload', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listProjectKnowledgeFiles: (...args: unknown[]) => service.list(...args),
  reindexProjectKnowledgeFile: (...args: unknown[]) => service.reindex(...args),
  uploadProjectKnowledgeFile: (...args: unknown[]) => service.upload(...args),
}));

import { SourcesPanel } from '../SourcesPanel';

const IMAGE_WARNING =
  'Not readable: text is not extracted from images, so only this file name reaches the model.';

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-a',
    projectId: 'project-1',
    fileName: 'diagram.png',
    mimeType: 'image/png',
    byteCount: 2048,
    checksumSha256: 'a'.repeat(64),
    sourceSurface: 'web',
    addedAt: '2026-01-01T00:00:00.000Z',
    storageUri: '/api/projects/project-1/knowledge-files/file-a',
    ...overrides,
  };
}

const failedIndexing = {
  status: 'failed',
  chunkCount: 0,
  semantic: false,
  attempts: 3,
  error: 'Not indexed',
  indexedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockReset();
  service.reindex.mockReset();
  service.upload.mockReset();
});

describe('SourcesPanel processing visibility', () => {
  it('shows the stored unreadability warning on the source row', async () => {
    service.list.mockResolvedValueOnce([source({ summary: IMAGE_WARNING })]);
    render(<SourcesPanel projectId="project-1" />);

    expect((await screen.findByTestId('sources-file-note')).textContent).toBe(IMAGE_WARNING);
  });

  it('shows no note for a source that carries no summary', async () => {
    service.list.mockResolvedValueOnce([source({ summary: null })]);
    render(<SourcesPanel projectId="project-1" />);

    await screen.findByText('diagram.png');
    expect(screen.queryByTestId('sources-file-note')).toBeNull();
  });

  it('surfaces the withheld-scan notice returned by an upload', async () => {
    service.list.mockResolvedValue([]);
    service.upload.mockImplementationOnce(async (input) => {
      (input as { onNotice?: (notice: string) => void }).onNotice?.(
        'Some scanned pages were not read.',
      );
      return source();
    });
    render(<SourcesPanel projectId="project-1" />);

    await screen.findByTestId('sources-empty-state');
    fireEvent.change(screen.getByTestId('sources-file-input'), {
      target: { files: [new File(['x'], 'scan.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith('Some scanned pages were not read.'),
    );
  });

  it('offers the owner a retry for a failed index and applies the returned state', async () => {
    service.list.mockResolvedValueOnce([source({ indexing: failedIndexing })]);
    service.reindex.mockResolvedValueOnce({ ...failedIndexing, status: 'indexed', chunkCount: 4 });
    render(<SourcesPanel projectId="project-1" />);

    fireEvent.click(await screen.findByTestId('knowledge-files-retry-index'));

    await waitFor(() => expect(service.reindex).toHaveBeenCalledWith('project-1', 'file-a'));
    await waitFor(() => expect(screen.queryByTestId('knowledge-files-index-status')).toBeNull());
  });

  it('shows a failed index to a read-only member without the retry action', async () => {
    service.list.mockResolvedValueOnce([source({ indexing: failedIndexing })]);
    render(<SourcesPanel projectId="project-1" readOnly />);

    expect((await screen.findByTestId('knowledge-files-index-status')).textContent).toContain(
      'Not indexed',
    );
    expect(screen.queryByTestId('knowledge-files-retry-index')).toBeNull();
  });
});
