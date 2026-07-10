/**
 * MessageGeneratedFiles — message-level generated-file section.
 *
 * Pins: entry → GeneratedFileCard presentation mapping (completed status so
 * Download is enabled), download through the host bridge's authed
 * fetchCloudFile, the same-origin fetch fallback, and the honest inline
 * error state when the download fails (no silent no-op buttons).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HostBridgeContext, type ChatHostBridge } from '../../lib/hostBridge';
import { MessageGeneratedFiles, generatedFileFromEntry } from '../MessageGeneratedFiles';
import type { GeneratedFileEntry } from '../../lib/types';

const entry: GeneratedFileEntry = {
  id: 'gf-1',
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  uri: 'https://cloud.example/api/files/gf-1',
  byteCount: 2048,
  kind: 'pdf',
  checksumSha256: 'a'.repeat(64),
};

const message = { generatedFiles: [entry], createdAt: '2026-07-10T00:00:00.000Z' };

function bridgeWith(fetchCloudFile: ChatHostBridge['fetchCloudFile']): ChatHostBridge {
  return {
    getSnapshot: () => ({ activeConversationId: null, conversations: [] }),
    fetchCloudFile,
  };
}

function renderWithBridge(bridge: ChatHostBridge | null) {
  return render(
    <HostBridgeContext.Provider value={bridge}>
      <MessageGeneratedFiles message={message} />
    </HostBridgeContext.Provider>,
  );
}

beforeEach(() => {
  // jsdom logs "Not implemented: navigation" when the download anchor is
  // clicked; the click itself is the browser's job, not under test.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generatedFileFromEntry', () => {
  it('maps a UI entry onto the suite-contract GeneratedFile (managed cloud provenance)', () => {
    const file = generatedFileFromEntry(entry, '2026-07-10T00:00:00.000Z');
    expect(file).toMatchObject({
      id: 'gf-1',
      kind: 'pdf',
      fileName: 'report.pdf',
      uri: 'https://cloud.example/api/files/gf-1',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      checksumSha256: 'a'.repeat(64),
    });
  });

  it('falls back to kind "other" for unknown wire kinds', () => {
    expect(generatedFileFromEntry({ ...entry, kind: 'mystery' }, 'now').kind).toBe('other');
  });
});

describe('MessageGeneratedFiles', () => {
  it('renders a card per file with Download enabled (completed status)', () => {
    renderWithBridge(null);
    expect(screen.getByTestId('message-generated-files')).toBeDefined();
    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByRole('button', { name: /download generated file/i })).toBeDefined();
  });

  it('renders nothing when the message has no generated files', () => {
    const { container } = render(<MessageGeneratedFiles message={{ generatedFiles: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it('downloads through the host bridge fetchCloudFile when provided', async () => {
    const fetchCloudFile = vi.fn().mockResolvedValue(new Blob(['%PDF-1.7']));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    renderWithBridge(bridgeWith(fetchCloudFile));
    fireEvent.click(screen.getByRole('button', { name: /download generated file/i }));

    await waitFor(() => expect(fetchCloudFile).toHaveBeenCalledWith(entry.uri));
    expect(screen.queryByTestId('generated-file-download-error')).toBeNull();
  });

  it('falls back to a same-origin fetch when no bridge fetcher exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.7'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    renderWithBridge(null);
    fireEvent.click(screen.getByRole('button', { name: /download generated file/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(entry.uri, { credentials: 'same-origin' }),
    );
  });

  it('shows an inline error when the download fails (e.g. 401 unauthenticated)', async () => {
    const fetchCloudFile = vi.fn().mockRejectedValue(new Error('HTTP 401'));

    renderWithBridge(bridgeWith(fetchCloudFile));
    fireEvent.click(screen.getByRole('button', { name: /download generated file/i }));

    const error = await screen.findByTestId('generated-file-download-error');
    expect(error.textContent).toContain('HTTP 401');
  });
});
