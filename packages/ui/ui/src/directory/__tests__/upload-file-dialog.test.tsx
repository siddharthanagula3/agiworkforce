import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatePluginDialog } from '../CreatePluginDialog';
import { UploadFileDialog } from '../UploadFileDialog';
import {
  UPLOAD_BUSY_LABEL,
  UPLOAD_CHOOSE_FILE_LABEL,
  UPLOAD_NO_FILE_LABEL,
  UPLOAD_PLUGIN_ACCEPT,
  UPLOAD_PLUGIN_FAILED_COPY,
  UPLOAD_PLUGIN_INTRO,
  UPLOAD_PLUGIN_LABEL,
  UPLOAD_SUBMIT_LABEL,
} from '../constants';
import type { DirectoryUploadResult } from '../types';

afterEach(cleanup);

const RESULT: DirectoryUploadResult = {
  title: 'Plugin installed',
  lines: ['Release notes', '1 skill is now available in chat.'],
};

function archive(name = 'plugin.zip'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/zip' });
}

function renderUpload(props: Partial<Parameters<typeof UploadFileDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(RESULT);
  const onClose = vi.fn();
  render(
    <UploadFileDialog
      open
      title={UPLOAD_PLUGIN_LABEL}
      description={UPLOAD_PLUGIN_INTRO}
      accept={UPLOAD_PLUGIN_ACCEPT}
      failureCopy={UPLOAD_PLUGIN_FAILED_COPY}
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, onClose };
}

function chooseFile(file: File) {
  const input = screen.getByLabelText(UPLOAD_CHOOSE_FILE_LABEL) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('UploadFileDialog', () => {
  it('cannot submit before a file is chosen', () => {
    renderUpload();
    expect(screen.getByText(UPLOAD_NO_FILE_LABEL)).toBeTruthy();
    expect(screen.getByRole('button', { name: UPLOAD_SUBMIT_LABEL })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('names the chosen file and only then allows the upload', () => {
    renderUpload();
    chooseFile(archive('release-notes.zip'));
    expect(screen.getByText('release-notes.zip')).toBeTruthy();
    expect(screen.getByRole('button', { name: UPLOAD_SUBMIT_LABEL })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('accepts only the file types the route reads', () => {
    renderUpload();
    expect(screen.getByLabelText(UPLOAD_CHOOSE_FILE_LABEL).getAttribute('accept')).toBe(
      UPLOAD_PLUGIN_ACCEPT,
    );
  });

  it('shows a busy state while the upload is in flight and hands the file to the caller', async () => {
    let release: (value: DirectoryUploadResult) => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<DirectoryUploadResult>((resolve) => {
          release = resolve;
        }),
    );
    renderUpload({ onSubmit });
    const file = archive();
    chooseFile(file);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD_SUBMIT_LABEL }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(file));
    expect(screen.getByRole('button', { name: new RegExp(UPLOAD_BUSY_LABEL) })).toHaveProperty(
      'disabled',
      true,
    );
    release(RESULT);
    await screen.findByText(RESULT.lines[0]!);
  });

  it('renders what was installed when the upload succeeds', async () => {
    renderUpload();
    chooseFile(archive());
    fireEvent.click(screen.getByRole('button', { name: UPLOAD_SUBMIT_LABEL }));
    await screen.findByText('Plugin installed');
    expect(screen.getByText('1 skill is now available in chat.')).toBeTruthy();
  });

  it('renders the rejection the server gave and keeps the dialog open', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('That file is not a readable zip archive.'));
    const { onClose } = renderUpload({ onSubmit });
    chooseFile(archive());
    fireEvent.click(screen.getByRole('button', { name: UPLOAD_SUBMIT_LABEL }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('That file is not a readable zip archive.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(UPLOAD_CHOOSE_FILE_LABEL)).toBeTruthy();
  });

  it('falls back to its own copy when the failure carries no message', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error(''));
    renderUpload({ onSubmit });
    chooseFile(archive());
    fireEvent.click(screen.getByRole('button', { name: UPLOAD_SUBMIT_LABEL }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(UPLOAD_PLUGIN_FAILED_COPY);
  });
});

describe('CreatePluginDialog', () => {
  function renderCreate(props: Partial<Parameters<typeof CreatePluginDialog>[0]> = {}) {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ title: 'Plugin created', lines: ['Release notes'] });
    const onClose = vi.fn();
    render(<CreatePluginDialog open onClose={onClose} onSubmit={onSubmit} {...props} />);
    return { onSubmit, onClose };
  }

  function fill() {
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Release notes' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Turns a changelog into release notes' },
    });
    fireEvent.change(screen.getByLabelText('Skill name'), {
      target: { value: 'draft-release-notes' },
    });
    fireEvent.change(screen.getByLabelText('Skill description'), {
      target: { value: 'Draft release notes' },
    });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Read the changelog.' },
    });
  }

  it('refuses to submit until every field of every skill is filled', () => {
    renderCreate();
    const submit = screen.getByRole('button', { name: 'Create plugin' });
    expect(submit).toHaveProperty('disabled', true);
    fill();
    expect(screen.getByRole('button', { name: 'Create plugin' })).toHaveProperty('disabled', false);
  });

  it('sends the trimmed draft the authored route expects', async () => {
    const { onSubmit } = renderCreate();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create plugin' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Release notes',
        description: 'Turns a changelog into release notes',
        skills: [
          {
            name: 'draft-release-notes',
            description: 'Draft release notes',
            body: 'Read the changelog.',
          },
        ],
      }),
    );
  });

  it('adds and removes skill rows, and never offers to remove the only one', () => {
    renderCreate();
    expect(screen.queryByRole('button', { name: 'Remove this skill' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add another skill' }));
    expect(screen.getAllByLabelText('Skill name')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Remove this skill' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this skill' })[1]!);
    expect(screen.getAllByLabelText('Skill name')).toHaveLength(1);
  });

  it('renders the rejection the server gave and keeps the draft on screen', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('Each skill in a plugin needs its own name.'));
    renderCreate({ onSubmit });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create plugin' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Each skill in a plugin needs its own name.');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Release notes');
  });
});
