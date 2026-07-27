import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudFolderAttachSheet } from '../CloudFolderAttachSheet';
import type { ApprovedFolderFile } from '../readFolderFiles';

afterEach(cleanup);

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

function approved(relativePath: string, content: string): ApprovedFolderFile {
  return {
    candidate: {
      path: `/Users/x/repo/${relativePath}`,
      relativePath,
      mimeType: 'text/plain',
      byteCount: content.length,
    },
    file: new File([content], relativePath, { type: 'text/plain' }),
    content,
  };
}

function renderSheet(files: ApprovedFolderFile[], onApprove = vi.fn()) {
  const onClose = vi.fn();
  render(
    <CloudFolderAttachSheet
      folderPath="/Users/x/repo"
      sourceSessionId="conv-1"
      onClose={onClose}
      onApprove={onApprove}
      readCandidates={async () => files}
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

  it('renders nothing when no folder is picked', () => {
    const { container } = render(
      <CloudFolderAttachSheet
        folderPath={null}
        sourceSessionId="conv-1"
        onClose={vi.fn()}
        onApprove={vi.fn()}
        readCandidates={async () => []}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
