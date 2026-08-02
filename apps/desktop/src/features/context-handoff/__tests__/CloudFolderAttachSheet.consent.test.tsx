import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_FOLDER_CONSENT_TTL_MS,
  CloudFolderAttachSheet,
  type CloudFolderReadResult,
} from '../CloudFolderAttachSheet';
import type { ApprovedFolderFile } from '../readFolderFiles';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The guarantee this sheet exists to provide: local bytes carrying a secret
 * cannot reach the composer, and therefore cannot reach
 * uploadDesktopCloudAttachments.
 *
 * Before this component there was no code path anywhere in apps/desktop that
 * blocked a secret-bearing file from being uploaded to Managed Cloud — the
 * upload's own boundary guards check the account and trust mode, and know
 * nothing about where the bytes came from.
 */
const SECRET_CONTENT = 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456';

function approved(
  relativePath: string,
  content: string,
  checksumSha256 = 'ab'.repeat(32),
): ApprovedFolderFile {
  const file = new File([content], relativePath, { type: 'text/plain' });
  return {
    candidate: {
      path: `/Users/x/repo/${relativePath}`,
      relativePath,
      mimeType: 'text/plain',
      byteCount: file.size,
    },
    file,
    checksumSha256,
    secretScanStatus: 'scanned',
    content,
  };
}

function readResult(
  files: ApprovedFolderFile[],
  overrides: Partial<CloudFolderReadResult> = {},
): CloudFolderReadResult {
  return {
    files,
    defaultSelectedIds: files.map((file) => file.candidate.relativePath),
    discoveryTruncated: false,
    omittedForCap: 0,
    omittedDuringRead: 0,
    ...overrides,
  };
}

function renderSheet(
  files: ApprovedFolderFile[],
  onApprove = vi.fn(),
  resultOverrides: Partial<CloudFolderReadResult> = {},
) {
  const onClose = vi.fn();
  render(
    <CloudFolderAttachSheet
      folderPath="/Users/x/repo"
      folderGrantId="11111111-1111-4111-8111-111111111111"
      sourceSessionId="conv-1"
      managedBoundaryActive
      onClose={onClose}
      onApprove={onApprove}
      readCandidates={async () => readResult(files, resultOverrides)}
    />,
  );
  return { onApprove, onClose };
}

describe('CloudFolderAttachSheet consent guarantee', () => {
  it('refuses to emit a selection containing a secret', async () => {
    const { onApprove } = renderSheet([
      approved('notes.md', 'plain project notes'),
      approved('.env', SECRET_CONTENT),
    ]);

    await screen.findByText(/Secret findings block/);

    const confirm = screen.getByRole('button', {
      name: 'Attach to cloud chat',
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // Even if the button were somehow reachable, the handler re-checks.
    fireEvent.click(confirm);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('unblocks when the flagged file is unticked, rather than dead-ending', async () => {
    // Any real repository has a .env. If a single finding killed the whole
    // flow, the feature would be unusable on the machines it is built for.
    const { onApprove } = renderSheet([
      approved('notes.md', 'plain project notes'),
      approved('.env', SECRET_CONTENT),
    ]);

    await screen.findByText(/Secret findings block/);

    // Target the checkbox by its aria-label: '.env' also appears in the findings list.
    fireEvent.click(screen.getByLabelText('Include .env'));

    await waitFor(() => {
      const confirm = screen.getByRole('button', {
        name: 'Attach to cloud chat',
      }) as HTMLButtonElement;
      expect(confirm.disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Attach to cloud chat' }));

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledTimes(1);
    });
    const emitted = onApprove.mock.calls[0]?.[0] as File[];
    expect(emitted.map((f) => f.name)).toEqual(['notes.md']);
  });

  it('emits files named by their folder-relative path, never an absolute one', async () => {
    const { onApprove, onClose } = renderSheet([approved('src/index.ts', 'export const a = 1;')]);

    await waitFor(() => {
      const confirm = screen.getByRole('button', {
        name: 'Attach to cloud chat',
      }) as HTMLButtonElement;
      expect(confirm.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Attach to cloud chat' }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    const emitted = onApprove.mock.calls[0]?.[0] as File[];
    expect(emitted[0]?.name).toBe('src/index.ts');
    expect(emitted[0]?.name).not.toContain('/Users/');
    // Approving closes the sheet so the consent cannot be replayed.
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses confirmation after the payload preview consent expires', async () => {
    let now = Date.parse('2026-08-02T12:00:00.000Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { onApprove } = renderSheet([approved('notes.md', 'plain project notes')]);

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Attach to cloud chat' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    now += CLOUD_FOLDER_CONSENT_TTL_MS + 1;
    fireEvent.click(screen.getByRole('button', { name: 'Attach to cloud chat' }));

    expect(onApprove).not.toHaveBeenCalled();
    expect(await screen.findByText(/payload preview expired/i)).toBeInTheDocument();
  });

  it('clears a stale preview-build error when the selection becomes valid', async () => {
    const bad = approved('bad.txt', 'bad', 'not-a-checksum');
    const good = approved('good.txt', 'safe', 'cd'.repeat(32));
    renderSheet([bad, good], vi.fn(), { defaultSelectedIds: ['bad.txt'] });

    expect(await screen.findByText(/Invalid SHA-256 checksum/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Include bad.txt'));
    fireEvent.click(screen.getByLabelText('Include good.txt'));

    await waitFor(() => {
      expect(screen.queryByText(/Invalid SHA-256 checksum/)).not.toBeInTheDocument();
      expect(
        (screen.getByRole('button', { name: 'Attach to cloud chat' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
  });

  it('discloses truncated discovery and cap omissions without blocking reviewed files', async () => {
    renderSheet([approved('notes.md', 'plain project notes')], vi.fn(), {
      discoveryTruncated: true,
      omittedForCap: 3,
      omittedDuringRead: 1,
    });

    expect(await screen.findByText(/1,000-result limit/)).toHaveTextContent(
      /3 eligible files were left unselected/,
    );
    expect(screen.getByText(/1,000-result limit/)).toHaveTextContent(
      /1 selected file changed, disappeared, or could not be read/,
    );
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Attach to cloud chat' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
  });

  it('synchronously blocks and closes when the Managed Cloud account boundary changes', async () => {
    const onApprove = vi.fn();
    const onClose = vi.fn();
    const files = [approved('notes.md', 'plain project notes')];
    const view = render(
      <CloudFolderAttachSheet
        folderPath="/Users/x/repo"
        folderGrantId="11111111-1111-4111-8111-111111111111"
        sourceSessionId="conv-1"
        managedBoundaryActive
        onClose={onClose}
        onApprove={onApprove}
        readCandidates={async () => readResult(files)}
      />,
    );

    await screen.findByRole('button', { name: 'Attach to cloud chat' });
    view.rerender(
      <CloudFolderAttachSheet
        folderPath="/Users/x/repo"
        folderGrantId="11111111-1111-4111-8111-111111111111"
        sourceSessionId="conv-1"
        managedBoundaryActive={false}
        onClose={onClose}
        onApprove={onApprove}
        readCandidates={async () => readResult(files)}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Attach to cloud chat' })).not.toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('renders nothing when no folder is picked', () => {
    const { container } = render(
      <CloudFolderAttachSheet
        folderPath={null}
        folderGrantId={null}
        sourceSessionId="conv-1"
        managedBoundaryActive
        onClose={vi.fn()}
        onApprove={vi.fn()}
        readCandidates={async () => readResult([])}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
