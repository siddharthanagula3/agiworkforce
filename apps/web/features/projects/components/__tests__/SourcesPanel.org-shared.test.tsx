import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../FilePreviewModal', () => ({ FilePreviewModal: () => null }));

const service = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  remove: vi.fn(async () => undefined),
  upload: vi.fn(async () => ({})),
  uploadText: vi.fn(async () => ({})),
}));

vi.mock('../../services/project-knowledge-upload', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listProjectKnowledgeFiles: (...args: unknown[]) => service.list(...args),
  removeProjectKnowledgeFile: service.remove,
  uploadProjectKnowledgeFile: service.upload,
}));

import { SourcesPanel } from '../SourcesPanel';

const FILE = {
  id: 'file-1',
  projectId: 'project-1',
  fileName: 'brief.pdf',
  mimeType: 'application/pdf',
  byteCount: 2048,
  checksumSha256: 'a'.repeat(64),
  sourceSurface: 'web',
  addedAt: '2026-01-01T00:00:00.000Z',
  storageUri: '/api/projects/project-1/knowledge-files/file-1',
};

function stubFiles(files: unknown[]) {
  service.list.mockResolvedValue(files);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ files, storage: { usedBytes: 2048, limitBytes: null } }),
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * Migration 0090 grants an organisation member SELECT on a shared project's
 * knowledge files and restricts every write to the owner. The panel used to
 * render the upload and delete controls to everyone, so a shared member was
 * offered three controls whose routes answer 404.
 */
describe('SourcesPanel on a project shared with the caller', () => {
  it('still lists the sources the member is allowed to read', async () => {
    stubFiles([FILE]);
    render(<SourcesPanel projectId="project-1" readOnly />);

    expect(await screen.findByText('brief.pdf')).toBeTruthy();
  });

  it('offers no upload or delete control', async () => {
    stubFiles([FILE]);
    render(<SourcesPanel projectId="project-1" readOnly />);

    await screen.findByText('brief.pdf');
    expect(screen.queryByTestId('sources-add-btn-inline')).toBeNull();
    expect(screen.queryByTestId('sources-delete')).toBeNull();
  });

  it('says the owner owns the sources instead of inviting an upload that would fail', async () => {
    stubFiles([]);
    render(<SourcesPanel projectId="project-1" readOnly />);

    await waitFor(() => expect(screen.queryByTestId('sources-add-btn')).toBeNull());
    expect(screen.getByText(/only they can add or remove them/i)).toBeTruthy();
  });

  it('keeps every control for a project the caller owns', async () => {
    stubFiles([FILE]);
    render(<SourcesPanel projectId="project-1" />);

    await screen.findByText('brief.pdf');
    expect(screen.getByTestId('sources-add-btn-inline')).toBeTruthy();
    expect(screen.getByTestId('sources-delete')).toBeTruthy();
  });

  it('offers the upload call to action on an owned project with no sources yet', async () => {
    stubFiles([]);
    render(<SourcesPanel projectId="project-1" />);

    expect(await screen.findByTestId('sources-add-btn')).toBeTruthy();
  });
});
