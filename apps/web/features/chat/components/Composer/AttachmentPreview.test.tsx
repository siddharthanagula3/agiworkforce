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

describe('AttachmentPreview · where the files are going', () => {
  const DESTINATION = 'AGI Cloud';

  function onePreviewOfEachKind(): AttachmentPreviewData[] {
    return [
      {
        file: new File(['png'], 'diagram.png', { type: 'image/png' }),
        url: 'blob:image-1',
        type: 'image',
      },
      {
        file: new File(['pdf'], 'contract.pdf', { type: 'application/pdf' }),
        url: 'blob:doc-1',
        type: 'document',
      },
    ];
  }

  it('names the outbound destination on every staged attachment, whatever its kind', () => {
    const previews = onePreviewOfEachKind();
    render(
      <AttachmentPreview previews={previews} onRemove={vi.fn()} privacyShortLabel={DESTINATION} />,
    );

    const labelled = screen.getAllByLabelText(`Outbound destination: ${DESTINATION}`);
    expect(labelled).toHaveLength(previews.length);
    for (const chip of labelled) expect(chip.textContent).toContain(DESTINATION);
  });

  it('says nothing about a destination when the surface has none to name', () => {
    render(<AttachmentPreview previews={onePreviewOfEachKind()} onRemove={vi.fn()} />);

    expect(screen.queryByLabelText(/outbound destination/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove diagram.png' })).toBeTruthy();
  });
});

describe('AttachmentPreview · upload lifecycle', () => {
  const preview: AttachmentPreviewData = {
    file: new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    url: 'blob:upload-notes',
    type: 'document',
  };

  it('announces an indeterminate phase instead of a made-up percentage', () => {
    render(
      <AttachmentPreview
        previews={[preview]}
        statuses={[{ phase: 'uploading' }]}
        onRemove={vi.fn()}
      />,
    );

    const progress = screen.getByRole('progressbar', { name: 'Uploading notes.txt' });
    expect(progress).toHaveAttribute('aria-valuetext', 'Uploading…');
    expect(progress).not.toHaveAttribute('aria-valuenow');
  });

  it('keeps a failed file in place and retries it from its chip', () => {
    const onRetry = vi.fn();
    render(
      <AttachmentPreview
        previews={[preview]}
        statuses={[{ phase: 'failed', error: 'Storage unavailable' }]}
        onRetry={onRetry}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload for notes.txt' }));
    expect(onRetry).toHaveBeenCalledWith(0);
  });
});
