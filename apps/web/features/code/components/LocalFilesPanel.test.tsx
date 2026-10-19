import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileEntry, FileTextContent } from '@agiworkforce/local-runtime-contract';
type ScanModule0 = typeof import('@/features/desktop-host');

const listWorkspaceFiles = vi.fn();
const findWorkspaceFilesByName = vi.fn();
const readWorkspaceText = vi.fn();
const writeWorkspaceText = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  findWorkspaceFilesByName,
  listWorkspaceFiles,
  readWorkspaceText,
  writeWorkspaceText,
}));

const { LocalFilesPanel } = await import('./LocalFilesPanel');

function entry(path: string, kind: FileEntry['kind']): FileEntry {
  return { name: path.split('/').pop() ?? path, path, kind, sizeBytes: 10, modifiedAtMs: 1 };
}

function onDisk(path: string, text: string): FileTextContent {
  return { path, text, sizeBytes: text.length, modifiedAtMs: 1, truncated: false, sha256: 'abc' };
}

const FOLDERS: Record<string, FileEntry[]> = {
  '': [entry('README.md', 'file'), entry('src', 'directory'), entry('link', 'symlink')],
  src: [entry('src/app.ts', 'file'), entry('src/util.ts', 'file')],
};

function renderPanel(searchFocusKey = 0) {
  listWorkspaceFiles.mockImplementation(async (_root: string, path: string) => FOLDERS[path] ?? []);
  readWorkspaceText.mockImplementation(async (_root: string, path: string) =>
    onDisk(path, `contents of ${path}`),
  );
  const onClose = vi.fn();
  const view = render(
    <LocalFilesPanel rootId="root-1" searchFocusKey={searchFocusKey} onClose={onClose} />,
  );
  return { onClose, ...view };
}

describe('the files panel of a local coding session', () => {
  it('lists the folder with directories first, opens a directory on demand and hides symlinks', async () => {
    renderPanel();

    const panel = await screen.findByRole('complementary', { name: 'Files' });
    const rows = await within(panel).findAllByRole('button', { name: /src|README\.md/ });
    expect(rows.map((row) => row.textContent)).toEqual(['src', 'README.md']);
    expect(within(panel).queryByText('link')).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'src' }));
    expect(await within(panel).findByRole('button', { name: 'app.ts' })).toBeInTheDocument();
    expect(listWorkspaceFiles).toHaveBeenCalledWith('root-1', 'src');
  });

  it('finds files by name and opens each in its own tab', async () => {
    findWorkspaceFilesByName.mockResolvedValue([
      entry('src/app.ts', 'file'),
      entry('src', 'directory'),
    ]);
    renderPanel();

    await userEvent.type(await screen.findByLabelText('Search files by name'), 'app');
    await userEvent.click(await screen.findByRole('button', { name: 'src/app.ts' }));
    expect(findWorkspaceFilesByName).toHaveBeenCalledWith('root-1', 'app', '');
    expect(screen.queryByRole('button', { name: /^src$/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search files by name'));
    await userEvent.click(await screen.findByRole('button', { name: 'README.md' }));

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['app.ts', 'README.md']);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(tabs[0] as HTMLElement);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('asks before closing a tab with unsaved edits, and closes a clean one at once', async () => {
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'README.md' }));
    const field = await screen.findByDisplayValue('contents of README.md');
    await userEvent.type(field, ' edited');
    await waitFor(() => expect(screen.getByRole('tab')).toHaveTextContent('README.md •'));

    await userEvent.click(screen.getByRole('button', { name: 'Close README.md' }));
    const confirmDialog = await screen.findByRole('alertdialog');
    expect(confirmDialog).toHaveTextContent('Your unsaved edits to README.md cannot be recovered.');
    await userEvent.click(within(confirmDialog).getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.queryByRole('tab')).not.toBeInTheDocument());
  });

  it('puts the cursor in the search field when asked to', async () => {
    const { rerender, onClose } = renderPanel();
    await screen.findByRole('button', { name: 'README.md' });

    rerender(<LocalFilesPanel rootId="root-1" searchFocusKey={1} onClose={onClose} />);

    expect(screen.getByLabelText('Search files by name')).toHaveFocus();
  });
});
