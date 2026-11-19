import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageMaskDialog } from '../ImageMaskDialog';

vi.mock('../../RegionSelector', () => ({
  RegionSelector: ({ onMaskChange }: { onMaskChange: (mask: File | null) => void }) => (
    <button
      type="button"
      onClick={() => onMaskChange(new File(['m'], 'selection.png', { type: 'image/png' }))}
    >
      Paint
    </button>
  ),
}));

interface Bitmap {
  width: number;
  height: number;
  close: () => void;
}

const bitmap = (): Bitmap => ({ width: 8, height: 8, close: vi.fn() });

describe('ImageMaskDialog', () => {
  let pending: Array<{ resolve: (value: Bitmap) => void; reject: (reason: Error) => void }> = [];
  const source = new File(['s'], 'source.png', { type: 'image/png' });

  beforeEach(() => {
    pending = [];
    URL.createObjectURL = vi.fn(() => 'blob:mask-test');
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => new Promise<Bitmap>((resolve, reject) => pending.push({ resolve, reject }))),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const settleNext = async () => {
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    const next = pending.shift();
    await act(async () => {
      next?.resolve(bitmap());
    });
  };

  const failNext = async () => {
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    const next = pending.shift();
    await act(async () => {
      next?.reject(new Error('decode'));
    });
  };

  const startPreparing = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Paint' }));
    fireEvent.click(screen.getByRole('button', { name: /use this area/i }));
  };

  it('adopts the mask when preparation completes without cancelling', async () => {
    const onDone = vi.fn();
    render(<ImageMaskDialog file={source} onClose={vi.fn()} onDone={onDone} />);
    await startPreparing();
    await settleNext();
    await settleNext();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0]?.[0]).toMatchObject({ source: null });
  });

  it('adopts nothing when cancelled while the mask is decoding', async () => {
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(<ImageMaskDialog file={source} onClose={onClose} onDone={onDone} />);
    await startPreparing();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await settleNext();
    await settleNext();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('adopts nothing when cancelled while the source is decoding', async () => {
    const onDone = vi.fn();
    render(<ImageMaskDialog file={source} onClose={vi.fn()} onDone={onDone} />);
    await startPreparing();
    await settleNext();
    await waitFor(() => expect(pending.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settleNext();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('does not let a cancelled session complete into a reopened one', async () => {
    const onDone = vi.fn();
    const { rerender } = render(
      <ImageMaskDialog file={source} onClose={vi.fn()} onDone={onDone} />,
    );
    await startPreparing();
    rerender(<ImageMaskDialog file={null} onClose={vi.fn()} onDone={onDone} />);
    rerender(<ImageMaskDialog file={source} onClose={vi.fn()} onDone={onDone} />);
    await settleNext();
    await settleNext();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /use this area/i })).toBeDisabled();
  });

  it('does not show an error from a retired preparation', async () => {
    const onDone = vi.fn();
    const { rerender } = render(
      <ImageMaskDialog file={source} onClose={vi.fn()} onDone={onDone} />,
    );
    await startPreparing();
    rerender(<ImageMaskDialog file={null} onClose={vi.fn()} onDone={onDone} />);
    rerender(<ImageMaskDialog file={source} onClose={vi.fn()} onDone={onDone} />);
    await failNext();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the preparation error for the live session', async () => {
    render(<ImageMaskDialog file={source} onClose={vi.fn()} onDone={vi.fn()} />);
    await startPreparing();
    await failNext();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be prepared/i);
  });
});
