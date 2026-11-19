import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../FilePreviewModal', () => ({ FilePreviewModal: () => null }));

const service = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  remove: vi.fn<(...args: unknown[]) => Promise<void>>(),
  upload: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('../../services/project-knowledge-upload', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listProjectKnowledgeFiles: (...args: unknown[]) => service.list(...args),
  removeProjectKnowledgeFile: (...args: unknown[]) => service.remove(...args),
  uploadProjectKnowledgeFile: (...args: unknown[]) => service.upload(...args),
}));

import { SourcesPanel } from '../SourcesPanel';

function source(id: string, fileName: string, addedAt: string) {
  return {
    id,
    projectId: 'project-1',
    fileName,
    mimeType: 'application/pdf',
    byteCount: 2048,
    checksumSha256: 'a'.repeat(64),
    sourceSurface: 'web',
    addedAt,
    storageUri: `/api/projects/project-1/knowledge-files/${id}`,
  };
}

const A = source('file-a', 'alpha.pdf', '2026-01-01T00:00:00.000Z');
const B = source('file-b', 'bravo.pdf', '2026-01-02T00:00:00.000Z');
const C = source('file-c', 'charlie.pdf', '2026-01-03T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockReset();
  service.remove.mockReset();
  service.upload.mockReset();
});

describe('SourcesPanel failed removal', () => {
  it('keeps a source uploaded after the confirmation opened when the removal fails', async () => {
    service.list.mockResolvedValueOnce([A, C]);
    service.list.mockResolvedValueOnce([A, B, C]);
    let finishUpload: (value: unknown) => void = () => {};
    service.upload.mockReturnValueOnce(new Promise((resolve) => (finishUpload = resolve)));
    service.remove.mockRejectedValueOnce(new Error('Forbidden'));
    render(<SourcesPanel projectId="project-1" />);

    await screen.findByText('alpha.pdf');
    fireEvent.change(screen.getByTestId('sources-file-input'), {
      target: { files: [new File(['b'], 'bravo.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove alpha.pdf' }));
    await screen.findByRole('button', { name: 'Remove file' });

    await act(async () => finishUpload(B));
    await screen.findByText('bravo.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));
    await waitFor(() => expect(service.remove).toHaveBeenCalledTimes(1));

    expect(await screen.findByText('alpha.pdf')).toBeTruthy();
    expect(screen.getByText('bravo.pdf')).toBeTruthy();
    expect(screen.getByText('charlie.pdf')).toBeTruthy();
  });

  it('puts only the failed source back when nothing else changed', async () => {
    service.list.mockResolvedValueOnce([A, C]);
    service.remove.mockRejectedValueOnce(new Error('Forbidden'));
    render(<SourcesPanel projectId="project-1" />);

    await screen.findByText('alpha.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Remove alpha.pdf' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove file' }));

    await waitFor(() => expect(service.remove).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('alpha.pdf')).toBeTruthy();
    expect(screen.getByText('charlie.pdf')).toBeTruthy();
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
