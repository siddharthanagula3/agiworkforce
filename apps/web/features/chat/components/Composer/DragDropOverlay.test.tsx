import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CHAT_ATTACHMENT_COUNT } from '@agiworkforce/cloud-contracts';
import { DragDropOverlay } from './DragDropOverlay';

afterEach(cleanup);

describe('DragDropOverlay', () => {
  it('shows the canonical attachment ceiling and leaves enforcement to the attachment owner', async () => {
    const onDrop = vi.fn();
    const files = Array.from(
      { length: MAX_CHAT_ATTACHMENT_COUNT + 1 },
      (_, index) => new File([String(index)], `file-${index}.txt`, { type: 'text/plain' }),
    );
    render(<DragDropOverlay onDrop={onDrop} />);

    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files } });

    expect(await screen.findByText(`Up to ${MAX_CHAT_ATTACHMENT_COUNT} files`)).toBeInTheDocument();

    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files } });

    await waitFor(() => expect(onDrop).toHaveBeenCalledWith(files));
  });
});
