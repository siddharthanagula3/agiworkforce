import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttachmentPreview } from './AttachmentPreview';
import type { AttachmentPreview as AttachmentPreviewData } from '@features/chat/hooks/use-attachments';

const DUPLICATE_KEY_WARNING = 'same key';
const ATTACHMENT_NAME = 'dup-attach-test.txt';
const ATTACHMENT_LAST_MODIFIED = 1700000000000;

function duplicateSelectionPreviews(): AttachmentPreviewData[] {
  const file = new File(['duplicate attachment repro'], ATTACHMENT_NAME, {
    type: 'text/plain',
    lastModified: ATTACHMENT_LAST_MODIFIED,
  });
  return [
    { file, url: 'blob:attachment-instance-1', type: 'document' },
    { file, url: 'blob:attachment-instance-2', type: 'document' },
  ];
}

describe('AttachmentPreview · the same file attached twice', () => {
  it('keys each attachment instance uniquely instead of by file identity', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AttachmentPreview previews={duplicateSelectionPreviews()} onRemove={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: `Remove ${ATTACHMENT_NAME}` })).toHaveLength(2);
    const duplicateKeyWarned = errorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes(DUPLICATE_KEY_WARNING)),
    );
    expect(duplicateKeyWarned).toBe(false);

    errorSpy.mockRestore();
  });

  it('removes the clicked instance by its list index', () => {
    const onRemove = vi.fn();

    render(<AttachmentPreview previews={duplicateSelectionPreviews()} onRemove={onRemove} />);

    const removeButtons = screen.getAllByRole('button', { name: `Remove ${ATTACHMENT_NAME}` });
    fireEvent.click(removeButtons[1]!);

    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
