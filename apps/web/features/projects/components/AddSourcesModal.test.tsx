import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddSourcesModal } from './AddSourcesModal';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('AddSourcesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the text source dialog open until durable upload registration completes', async () => {
    const upload = deferred<void>();
    const onClose = vi.fn();
    const onUploadText = vi.fn(() => upload.promise);

    render(
      <AddSourcesModal
        open
        onClose={onClose}
        onUploadFile={vi.fn(async () => undefined)}
        onUploadText={onUploadText}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /text input/i }));
    fireEvent.change(screen.getByPlaceholderText('Paste or type text to add as a source...'), {
      target: { value: 'Persist this source.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));

    expect(onUploadText).toHaveBeenCalledWith('Persist this source.', 'Text note');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    upload.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps the source and reports the error when durable registration fails', async () => {
    const onClose = vi.fn();

    render(
      <AddSourcesModal
        open
        onClose={onClose}
        onUploadFile={vi.fn(async () => undefined)}
        onUploadText={vi.fn(async () => {
          throw new Error('Project source storage is unavailable.');
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /text input/i }));
    fireEvent.change(screen.getByPlaceholderText('Paste or type text to add as a source...'), {
      target: { value: 'Do not lose this source.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Project source storage is unavailable.',
    );
    expect(screen.getByDisplayValue('Do not lose this source.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the main dialog open and exposes file-upload failures above the overlay', async () => {
    const onClose = vi.fn();
    const onUploadFile = vi.fn(async () => {
      throw new Error('Local file storage is unavailable.');
    });

    render(
      <AddSourcesModal
        open
        onClose={onClose}
        onUploadFile={onUploadFile}
        onUploadText={vi.fn(async () => undefined)}
      />,
    );

    const input = screen.getByTestId('add-sources-file-input');
    const file = new File(['project source'], 'source.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local file storage is unavailable.',
    );
    expect(onUploadFile).toHaveBeenCalledWith(file);
    expect(screen.getByRole('dialog', { name: 'Add sources' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
