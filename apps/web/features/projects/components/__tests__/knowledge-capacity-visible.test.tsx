import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROJECT_KNOWLEDGE_FILES } from '@agiworkforce/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'token') }));
vi.mock('../../services/project-knowledge-upload', () => ({
  uploadProjectKnowledgeFile: vi.fn(),
}));
vi.mock('../FilePreviewModal', () => ({ FilePreviewModal: () => null }));

import { KnowledgeFilesPanel } from '../KnowledgeFilesPanel';

function file(n: number) {
  return {
    id: `f-${n}`,
    projectId: 'p-1',
    fileName: `doc-${n}.pdf`,
    mimeType: 'application/pdf',
    byteCount: 1024,
    checksumSha256: 'x'.repeat(64),
    summary: null,
    sourceSurface: 'web',
    addedByUserId: 'u-1',
    addedAt: '2026-08-21T00:00:00.000Z',
    storageUri: 's3://x',
  };
}

const fetchMock = vi.fn();

function mountWith(count: number) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ files: Array.from({ length: count }, (_, i) => file(i)) }),
  });
  return render(<KnowledgeFilesPanel projectId="p-1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

// The upload route refuses the 21st file. Until then the cap was invisible, so
// the only way to learn a project was full was to be told no.
describe('knowledge file capacity is visible before it is enforced', () => {
  it('states the cap alongside the count', async () => {
    mountWith(3);

    expect(
      await screen.findByText(new RegExp(`3 of ${MAX_PROJECT_KNOWLEDGE_FILES} files`)),
    ).toBeVisible();
  });

  it('says the project is full at the cap, and how to make room', async () => {
    mountWith(MAX_PROJECT_KNOWLEDGE_FILES);

    await waitFor(() => expect(screen.getByText(/full, remove one to add another/)).toBeVisible());
  });

  it('does not cry full below the cap', async () => {
    mountWith(MAX_PROJECT_KNOWLEDGE_FILES - 1);

    await screen.findByText(
      new RegExp(`${MAX_PROJECT_KNOWLEDGE_FILES - 1} of ${MAX_PROJECT_KNOWLEDGE_FILES} files`),
    );
    expect(screen.queryByText(/full, remove one/)).toBeNull();
  });

  it('reads the cap from the shared contract, so the panel cannot drift from the server', () => {
    expect(MAX_PROJECT_KNOWLEDGE_FILES).toBe(20);
  });
});

describe('account storage capacity is visible before it is enforced', () => {
  function mountWithStorage(usedBytes: number | null, limitBytes: number | null) {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [file(1)], storage: { usedBytes, limitBytes } }),
    });
    return render(<KnowledgeFilesPanel projectId="p-1" />);
  }

  it('states used and total storage', async () => {
    mountWithStorage(50 * 1024 * 1024, 100 * 1024 * 1024);

    expect(await screen.findByText(/50 MB of 100 MB storage used/)).toBeVisible();
  });

  it('says nothing when the plan has no storage cap', async () => {
    mountWithStorage(50 * 1024 * 1024, null);

    await screen.findByText(new RegExp(`1 of ${MAX_PROJECT_KNOWLEDGE_FILES} files`));
    expect(screen.queryByText(/storage used/)).toBeNull();
  });

  it('says nothing rather than guessing when usage could not be read', async () => {
    mountWithStorage(null, 100 * 1024 * 1024);

    await screen.findByText(new RegExp(`1 of ${MAX_PROJECT_KNOWLEDGE_FILES} files`));
    expect(screen.queryByText(/storage used/)).toBeNull();
  });

  it('still lists the files when the meter is absent entirely', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [file(1)] }),
    });
    render(<KnowledgeFilesPanel projectId="p-1" />);

    expect(await screen.findByText(/doc-1\.pdf/)).toBeVisible();
  });
});
