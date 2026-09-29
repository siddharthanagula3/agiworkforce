import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DesktopRuntimeError,
  MAX_TEXT_READ_BYTES,
  type FileTextContent,
  type FileTextWrite,
} from '@agiworkforce/local-runtime-contract';
import type { LocalFileEditorProps } from './LocalFileEditor';

const readWorkspaceText = vi.fn();
const writeWorkspaceText = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/desktop-host')>()),
  readWorkspaceText,
  writeWorkspaceText,
}));

const { LocalFileEditor } = await import('./LocalFileEditor');

const PATH = 'src/app.ts';
const OPENED = 'a'.repeat(64);
const ON_DISK = 'b'.repeat(64);
const WRITTEN = 'c'.repeat(64);

function onDisk(text: string, sha256?: string): FileTextContent {
  return {
    path: PATH,
    text,
    sizeBytes: text.length,
    modifiedAtMs: 1,
    truncated: false,
    ...(sha256 ? { sha256 } : {}),
  };
}

function written(sha256: string): FileTextWrite {
  return {
    name: 'app.ts',
    path: PATH,
    kind: 'file',
    sizeBytes: 4,
    modifiedAtMs: 2,
    binary: false,
    readOnly: false,
    sha256,
  };
}

const changedOnDisk = () =>
  new DesktopRuntimeError({
    code: 'conflict',
    message: `${PATH} changed on disk since it was read.`,
  });
const missing = () =>
  new DesktopRuntimeError({ code: 'not-found', message: 'That path does not exist.' });

function renderEditor(overrides: Partial<LocalFileEditorProps> = {}) {
  const props: LocalFileEditorProps = {
    rootId: 'root-1',
    path: PATH,
    refreshKey: 1,
    onDirtyChange: vi.fn(),
    onSaved: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<LocalFileEditor {...props} />);
  return { ...view, props };
}

async function replaceText(text: string): Promise<HTMLElement> {
  const field = await screen.findByLabelText(PATH);
  await userEvent.clear(field);
  await userEvent.type(field, text);
  return field;
}

async function confirmIn(dialogAction: string): Promise<void> {
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: dialogAction }));
}

describe('saving a local file', () => {
  it('sends the version it read, then the version it wrote', async () => {
    readWorkspaceText.mockResolvedValueOnce(onDisk('one', OPENED));
    writeWorkspaceText.mockResolvedValue(written(WRITTEN));
    const { props } = renderEditor();

    await replaceText('two');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await replaceText('three');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(writeWorkspaceText).toHaveBeenNthCalledWith(1, 'root-1', PATH, 'two', OPENED);
    expect(writeWorkspaceText).toHaveBeenNthCalledWith(2, 'root-1', PATH, 'three', WRITTEN);
    expect(props.onSaved).toHaveBeenCalledTimes(2);
  });

  it('saves as before when the desktop app reports no version', async () => {
    readWorkspaceText.mockResolvedValueOnce(onDisk('one'));
    writeWorkspaceText.mockResolvedValue(written(WRITTEN));
    renderEditor();

    await replaceText('two');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(writeWorkspaceText).toHaveBeenCalledWith('root-1', PATH, 'two', undefined);
  });

  it('refuses text it could not read back, and keeps it', async () => {
    readWorkspaceText.mockResolvedValueOnce(onDisk('one', OPENED));
    renderEditor();

    const field = await screen.findByLabelText(PATH);
    const oversized = 'a'.repeat(MAX_TEXT_READ_BYTES + 1);
    fireEvent.change(field, { target: { value: oversized } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is too large to edit here.',
    );
    expect(writeWorkspaceText).not.toHaveBeenCalled();
    expect(field).toHaveValue(oversized);
  });
});

describe('a file that changed on disk after it was opened', () => {
  it('keeps the edits, warns, and overwrites only once asked, against the version now on disk', async () => {
    readWorkspaceText
      .mockResolvedValueOnce(onDisk('one', OPENED))
      .mockResolvedValue(onDisk('agent', ON_DISK));
    writeWorkspaceText.mockRejectedValueOnce(changedOnDisk()).mockResolvedValue(written(WRITTEN));
    const { props } = renderEditor();

    const field = await replaceText('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file changed on disk since you opened it.',
    );
    expect(field).toHaveValue('mine');
    expect(props.onSaved).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    expect(writeWorkspaceText).toHaveBeenCalledTimes(1);
    await confirmIn('Overwrite');

    await waitFor(() =>
      expect(writeWorkspaceText).toHaveBeenLastCalledWith('root-1', PATH, 'mine', ON_DISK),
    );
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it('reloads the version on disk only once asked, since that drops the edits', async () => {
    readWorkspaceText
      .mockResolvedValueOnce(onDisk('one', OPENED))
      .mockResolvedValue(onDisk('agent', ON_DISK));
    writeWorkspaceText.mockRejectedValueOnce(changedOnDisk());
    renderEditor();

    const field = await replaceText('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reload' }));

    expect(
      await screen.findByText(`Your unsaved edits to ${PATH} cannot be recovered.`, {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(field).toHaveValue('mine');
    await confirmIn('Reload');

    await waitFor(() => expect(field).toHaveValue('agent'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(writeWorkspaceText).toHaveBeenCalledTimes(1);
  });

  it('says the file was deleted, and creates it again without a version when overwritten', async () => {
    readWorkspaceText.mockResolvedValueOnce(onDisk('one', OPENED)).mockRejectedValue(missing());
    writeWorkspaceText.mockRejectedValueOnce(changedOnDisk()).mockResolvedValue(written(WRITTEN));
    renderEditor();

    await replaceText('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file was deleted since you opened it.',
    );
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    await confirmIn('Overwrite');

    await waitFor(() =>
      expect(writeWorkspaceText).toHaveBeenLastCalledWith('root-1', PATH, 'mine', undefined),
    );
  });
});

describe('unsaved edits', () => {
  it('are discarded only once asked, for the version on disk now', async () => {
    readWorkspaceText
      .mockResolvedValueOnce(onDisk('one', OPENED))
      .mockResolvedValue(onDisk('agent', ON_DISK));
    renderEditor();

    const field = await replaceText('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(field).toHaveValue('mine');
    await confirmIn('Discard');

    await waitFor(() => expect(field).toHaveValue('agent'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('ask before the editor closes over them, and not when there are none', async () => {
    readWorkspaceText.mockResolvedValueOnce(onDisk('one', OPENED));
    const { props } = renderEditor();

    await screen.findByDisplayValue('one');
    await userEvent.click(screen.getByRole('button', { name: 'Close the file' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await replaceText('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Close the file' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await confirmIn('Discard');

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(2));
  });

  it('are reported, so the panel can ask before leaving them', async () => {
    readWorkspaceText.mockResolvedValueOnce(onDisk('one', OPENED));
    writeWorkspaceText.mockResolvedValue(written(WRITTEN));
    const { props } = renderEditor();

    await replaceText('mine');
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onDirtyChange).toHaveBeenLastCalledWith(false));
  });
});

describe('a session step that touches the open file', () => {
  it('shows the new version when there are no edits', async () => {
    readWorkspaceText
      .mockResolvedValueOnce(onDisk('one', OPENED))
      .mockResolvedValue(onDisk('agent', ON_DISK));
    const { props, rerender } = renderEditor();

    const field = await screen.findByDisplayValue('one');
    rerender(<LocalFileEditor {...props} refreshKey={2} />);

    await waitFor(() => expect(field).toHaveValue('agent'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns before a save when there are edits, and keeps them', async () => {
    readWorkspaceText
      .mockResolvedValueOnce(onDisk('one', OPENED))
      .mockResolvedValue(onDisk('agent', ON_DISK));
    const { props, rerender } = renderEditor();

    const field = await replaceText('mine');
    rerender(<LocalFileEditor {...props} refreshKey={2} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file changed on disk since you opened it.',
    );
    expect(field).toHaveValue('mine');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(writeWorkspaceText).not.toHaveBeenCalled();
  });

  it('clears the warning when the file on disk matches what was opened again', async () => {
    readWorkspaceText
      .mockResolvedValueOnce(onDisk('one', OPENED))
      .mockResolvedValueOnce(onDisk('agent', ON_DISK))
      .mockResolvedValue(onDisk('one', OPENED));
    const { props, rerender } = renderEditor();

    await replaceText('mine');
    rerender(<LocalFileEditor {...props} refreshKey={2} />);
    await screen.findByRole('alert');
    rerender(<LocalFileEditor {...props} refreshKey={3} />);

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
