import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileTextContent, WorkingTreeChanges } from '@agiworkforce/local-runtime-contract';
type ScanModule0 = typeof import('@/features/desktop-host');
type ScanModule1 = typeof import('./LocalPullRequest');
type ScanModule2 = typeof import('./LocalTerminal');

const readDeveloperSessionChanges = vi.fn();
const discardDeveloperSessionChanges = vi.fn();
const readWorkspaceText = vi.fn();
const writeWorkspaceText = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  discardDeveloperSessionChanges,
  readDeveloperSessionChanges,
  readWorkspaceText,
  writeWorkspaceText,
}));
vi.mock('./LocalPullRequest', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  LocalPullRequest: () => null,
}));
vi.mock('./LocalTerminal', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  LocalTerminal: ({ onCommandFinished }: { onCommandFinished: () => void }) => (
    <button type="button" onClick={onCommandFinished}>
      Run the formatter
    </button>
  ),
}));

const { LocalChangesPanel } = await import('./LocalChangesPanel');

const CHANGES: WorkingTreeChanges = {
  files: [
    { path: 'src/app.ts', state: 'modified', originalPath: null },
    { path: 'src/util.ts', state: 'modified', originalPath: null },
  ],
  diff: '',
  diffTruncated: false,
  folderPrefix: '',
};

function onDisk(path: string, text: string, sha256: string): FileTextContent {
  return { path, text, sizeBytes: text.length, modifiedAtMs: 1, truncated: false, sha256 };
}

function renderPanel(sessionBusy = false) {
  const onClose = vi.fn();
  const onReview = vi.fn();
  render(
    <LocalChangesPanel
      rootId="root-1"
      title="Tidy"
      refreshKey={0}
      sessionBusy={sessionBusy}
      onReview={onReview}
      onClose={onClose}
    />,
  );
  return { onClose, onReview };
}

async function openFile(path: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: `Edit ${path}` }));
  return screen.findByLabelText(path);
}

async function editOpenFile(path: string, opened: string, text: string): Promise<HTMLElement> {
  const field = await screen.findByLabelText(path);
  await screen.findByDisplayValue(opened);
  await userEvent.clear(field);
  await userEvent.type(field, text);
  return field;
}

describe('the file open in the changes panel', () => {
  it('follows a terminal command that rewrote it', async () => {
    readDeveloperSessionChanges.mockResolvedValue(CHANGES);
    readWorkspaceText
      .mockResolvedValueOnce(onDisk('src/app.ts', 'one', 'a'.repeat(64)))
      .mockResolvedValue(onDisk('src/app.ts', 'formatted', 'b'.repeat(64)));
    renderPanel();

    const field = await openFile('src/app.ts');
    await screen.findByDisplayValue('one');
    await userEvent.click(screen.getByRole('button', { name: 'Run the formatter' }));

    await waitFor(() => expect(field).toHaveValue('formatted'));
  });

  it('asks before another file replaces unsaved edits', async () => {
    readDeveloperSessionChanges.mockResolvedValue(CHANGES);
    readWorkspaceText.mockImplementation(async (_rootId: string, path: string) =>
      onDisk(path, `${path} on disk`, 'a'.repeat(64)),
    );
    renderPanel();

    await openFile('src/app.ts');
    const field = await editOpenFile('src/app.ts', 'src/app.ts on disk', 'mine');
    await userEvent.click(screen.getByRole('button', { name: 'Edit src/util.ts' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Your unsaved edits to src/app.ts cannot be recovered.');
    expect(field).toHaveValue('mine');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));

    expect(await screen.findByDisplayValue('src/util.ts on disk')).toBeInTheDocument();
  });

  it('asks before the panel closes over unsaved edits', async () => {
    readDeveloperSessionChanges.mockResolvedValue(CHANGES);
    readWorkspaceText.mockResolvedValue(onDisk('src/app.ts', 'one', 'a'.repeat(64)));
    const { onClose } = renderPanel();

    await openFile('src/app.ts');
    await editOpenFile('src/app.ts', 'one', 'mine');
    await userEvent.click(screen.getByRole('button', { name: 'Close the changes panel' }));

    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('reviewing the changes', () => {
  it('asks the session for one review turn', async () => {
    readDeveloperSessionChanges.mockResolvedValue(CHANGES);
    const { onReview } = renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Review code' }));

    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('waits while a turn runs', async () => {
    readDeveloperSessionChanges.mockResolvedValue(CHANGES);
    renderPanel(true);

    expect(await screen.findByRole('button', { name: 'Review code' })).toBeDisabled();
  });

  it('is not offered when nothing has changed', async () => {
    readDeveloperSessionChanges.mockResolvedValue({ ...CHANGES, files: [] });
    renderPanel();

    expect(await screen.findByText('No changes to show')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review code' })).not.toBeInTheDocument();
  });
});
