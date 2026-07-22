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
import {
  MessageGeneratedFiles,
  generatedFileFromEntry,
  hasRunningExecutionTool,
  type MessageGeneratedFilesMessage,
} from '../MessageGeneratedFiles';
import type { GeneratedFileEntry } from '../../lib/types';

const entry: GeneratedFileEntry = {
  id: 'gf-1',
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  uri: 'https://cloud.example/api/files/gf-1',
  byteCount: 2048,
  kind: 'pdf',
  checksumSha256: 'a'.repeat(64),
  previewable: true,
};

const message = { generatedFiles: [entry], createdAt: '2026-07-10T00:00:00.000Z' };

function bridgeWith(fetchCloudFile: ChatHostBridge['fetchCloudFile']): ChatHostBridge {
  return {
    getSnapshot: () => ({ activeConversationId: null, conversations: [] }),
    fetchCloudFile,
  };
}

function renderWithBridge(
  bridge: ChatHostBridge | null,
  msg: MessageGeneratedFilesMessage = message,
) {
  return render(
    <HostBridgeContext.Provider value={bridge}>
      <MessageGeneratedFiles message={msg} />
    </HostBridgeContext.Provider>,
  );
}

/** Deferred promise helper so tests can hold a download in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
    expect(screen.getByRole('button', { name: /preview/i })).toBeDefined();
  });

  it('previews an authenticated PDF inline through the host bridge', async () => {
    const fetchCloudFile = vi
      .fn()
      .mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });

    renderWithBridge(bridgeWith(fetchCloudFile));
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));

    await waitFor(() => expect(fetchCloudFile).toHaveBeenCalledWith(entry.uri));
    expect((await screen.findByTitle('Preview report.pdf')).getAttribute('src')).toBe(
      'blob:preview',
    );
  });

  it('shows an honest unavailable state with Download for unsupported Office previews', () => {
    const fetchCloudFile = vi.fn();
    const docx: GeneratedFileEntry = {
      ...entry,
      id: 'gf-docx',
      fileName: 'report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      kind: 'docx',
    };

    renderWithBridge(bridgeWith(fetchCloudFile), {
      ...message,
      generatedFiles: [docx],
    });
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));

    expect(screen.getByText('Preview unavailable')).toBeDefined();
    expect(screen.getByRole('button', { name: /download report\.docx/i })).toBeDefined();
    expect(fetchCloudFile).not.toHaveBeenCalled();
  });

  it('does not offer Preview when the server marks a file non-previewable', () => {
    renderWithBridge(null, {
      ...message,
      generatedFiles: [{ ...entry, previewable: false }],
    });

    expect(screen.queryByRole('button', { name: /^preview$/i })).toBeNull();
  });

  it('surfaces preview fetch failures with a Retry action', async () => {
    const fetchCloudFile = vi.fn().mockRejectedValue(new Error('HTTP 401'));

    renderWithBridge(bridgeWith(fetchCloudFile));
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));

    expect(await screen.findByText(/preview couldn.t load/i)).toBeDefined();
    expect(screen.getByText(/HTTP 401/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /retry preview/i }));
    await waitFor(() => expect(fetchCloudFile).toHaveBeenCalledTimes(2));
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

describe('pending execution state (isRunning wiring)', () => {
  const runningMessage: MessageGeneratedFilesMessage = {
    generatedFiles: [],
    isStreaming: true,
    toolCalls: [{ id: 'tc-1', name: 'execute_code', args: {}, status: 'running' }],
  };

  it('shows an honest "Running code…" strip while execute_code runs and no files exist', () => {
    renderWithBridge(null, runningMessage);
    const pending = screen.getByTestId('generated-files-pending');
    expect(pending.textContent).toContain('Running code…');
    // Honest: no file card, no Download action — nothing claims a file exists.
    expect(screen.queryByTestId('generated-file-card')).toBeNull();
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });

  it('labels write_file activity honestly', () => {
    renderWithBridge(null, {
      ...runningMessage,
      toolCalls: [{ id: 'tc-2', name: 'write_file', args: {}, status: 'running' }],
    });
    expect(screen.getByTestId('generated-files-pending').textContent).toContain('Writing file…');
  });

  it('renders nothing once the turn ends without files (isStreaming false)', () => {
    const { container } = renderWithBridge(null, { ...runningMessage, isStreaming: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-execution running tools (e.g. web_search)', () => {
    const { container } = renderWithBridge(null, {
      ...runningMessage,
      toolCalls: [{ id: 'tc-3', name: 'web_search', args: {}, status: 'running' }],
    });
    expect(container.firstChild).toBeNull();
  });

  it('replaces the pending strip with real cards once files land, even mid-run', () => {
    renderWithBridge(null, { ...runningMessage, generatedFiles: [entry] });
    expect(screen.queryByTestId('generated-files-pending')).toBeNull();
    expect(screen.getByTestId('generated-file-card')).toBeDefined();
  });

  it('hasRunningExecutionTool tracks streaming + execution tool status', () => {
    expect(hasRunningExecutionTool(runningMessage)).toBe(true);
    expect(hasRunningExecutionTool({ ...runningMessage, isStreaming: false })).toBe(false);
    expect(
      hasRunningExecutionTool({
        ...runningMessage,
        toolCalls: [{ id: 'tc-4', name: 'execute_code', args: {}, status: 'completed' }],
      }),
    ).toBe(false);
    expect(hasRunningExecutionTool({ generatedFiles: [] })).toBe(false);
  });
});

describe('per-file retry', () => {
  it('retries the same download path from the error line and clears the error on success', async () => {
    const fetchCloudFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce(new Blob(['%PDF-1.7']));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    renderWithBridge(bridgeWith(fetchCloudFile));
    fireEvent.click(screen.getByRole('button', { name: /download generated file/i }));
    const retry = await screen.findByRole('button', { name: /retry download of report\.pdf/i });

    fireEvent.click(retry);
    await waitFor(() => expect(fetchCloudFile).toHaveBeenCalledTimes(2));
    expect(fetchCloudFile).toHaveBeenNthCalledWith(2, entry.uri);
    await waitFor(() => expect(screen.queryByTestId('generated-file-download-error')).toBeNull());
  });

  it('disables Retry while the retried download is in flight', async () => {
    const held = deferred<Blob>();
    const fetchCloudFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockReturnValueOnce(held.promise);

    renderWithBridge(bridgeWith(fetchCloudFile));
    fireEvent.click(screen.getByRole('button', { name: /download generated file/i }));
    const retry = await screen.findByRole('button', { name: /retry download of report\.pdf/i });

    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: /retry download of report\.pdf/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    held.reject(new Error('HTTP 500'));
    // After settling, the retry affordance re-enables for another attempt.
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: /retry download of report\.pdf/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
});

describe('download all', () => {
  const secondEntry: GeneratedFileEntry = {
    id: 'gf-2',
    fileName: 'data.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    uri: 'https://cloud.example/api/files/gf-2',
    byteCount: 4096,
    kind: 'xlsx',
  };
  const multiFileMessage: MessageGeneratedFilesMessage = {
    generatedFiles: [entry, secondEntry],
    createdAt: '2026-07-10T00:00:00.000Z',
  };

  it('is hidden for single-file turns', () => {
    renderWithBridge(null);
    expect(screen.queryByRole('button', { name: /download all generated files/i })).toBeNull();
  });

  it('sequentially downloads every file through the same per-file path', async () => {
    const fetchCloudFile = vi.fn().mockResolvedValue(new Blob(['bytes']));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    renderWithBridge(bridgeWith(fetchCloudFile), multiFileMessage);
    fireEvent.click(screen.getByRole('button', { name: /download all generated files/i }));

    await waitFor(() => expect(fetchCloudFile).toHaveBeenCalledTimes(2));
    expect(fetchCloudFile).toHaveBeenNthCalledWith(1, entry.uri);
    expect(fetchCloudFile).toHaveBeenNthCalledWith(2, secondEntry.uri);
  });

  it('disables the button while the bulk download runs', async () => {
    const held = deferred<Blob>();
    const fetchCloudFile = vi.fn().mockReturnValue(held.promise);

    renderWithBridge(bridgeWith(fetchCloudFile), multiFileMessage);
    const button = screen.getByRole('button', {
      name: /download all generated files/i,
    }) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(true));
    held.reject(new Error('HTTP 500'));
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('surfaces per-file failures on their own error lines', async () => {
    const fetchCloudFile = vi.fn((uri: string) =>
      uri === entry.uri
        ? Promise.reject(new Error('HTTP 500'))
        : Promise.resolve(new Blob(['bytes'])),
    );
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    renderWithBridge(
      bridgeWith(fetchCloudFile as ChatHostBridge['fetchCloudFile']),
      multiFileMessage,
    );
    fireEvent.click(screen.getByRole('button', { name: /download all generated files/i }));

    await waitFor(() => expect(fetchCloudFile).toHaveBeenCalledTimes(2));
    const errors = await screen.findAllByTestId('generated-file-download-error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.textContent).toContain('HTTP 500');
  });
});
