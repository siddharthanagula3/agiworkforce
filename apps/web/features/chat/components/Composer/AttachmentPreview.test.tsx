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

describe('AttachmentPreview · no destination badge', () => {
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

  it('shows staged files of every kind without a destination or lock badge', () => {
    const { container } = render(
      <AttachmentPreview previews={onePreviewOfEachKind()} onRemove={vi.fn()} />,
    );

    expect(screen.queryByLabelText(/outbound destination/i)).toBeNull();
    expect(container.textContent).not.toMatch(/managed/i);
    expect(screen.getByRole('button', { name: 'Remove diagram.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove contract.pdf' })).toBeTruthy();
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

  it('names a refusal and offers no retry that cannot succeed', () => {
    const refusal = 'This file could not be attached because its contents failed a safety check.';
    render(
      <AttachmentPreview
        previews={[preview]}
        statuses={[{ phase: 'failed', error: refusal, retryable: false }]}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(refusal);
    expect(screen.queryByRole('button', { name: 'Retry upload for notes.txt' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove notes.txt' })).toBeTruthy();
  });
});

describe('AttachmentPreview · document type line', () => {
  it('names the file kind beside its size', () => {
    const csv: AttachmentPreviewData = {
      file: new File(['a,b\n1,2'], 'report.csv', { type: 'text/csv' }),
      url: 'blob:csv-1',
      type: 'document',
    };
    const pdf: AttachmentPreviewData = {
      file: new File(['pdf'], 'contract.pdf', { type: 'application/pdf' }),
      url: 'blob:pdf-1',
      type: 'document',
    };

    render(<AttachmentPreview previews={[csv, pdf]} onRemove={vi.fn()} />);

    expect(screen.getByText('Spreadsheet · 7 B')).toBeTruthy();
    expect(screen.getByText('PDF · 3 B')).toBeTruthy();
  });
});

describe('AttachmentPreview · image order', () => {
  function threeImages(): AttachmentPreviewData[] {
    return ['source.png', 'guide-a.png', 'guide-b.png'].map((name, index) => ({
      file: new File(['png'], name, { type: 'image/png' }),
      url: `blob:image-order-${index}`,
      type: 'image' as const,
    }));
  }

  it('numbers images in the order they were added when asked', () => {
    render(<AttachmentPreview previews={threeImages()} onRemove={vi.fn()} numberImages />);

    expect(screen.getAllByTestId('attachment-order').map((badge) => badge.textContent)).toEqual([
      'Image 1',
      'Image 2',
      'Image 3',
    ]);
  });

  it('shows no numbers by default', () => {
    render(<AttachmentPreview previews={threeImages()} onRemove={vi.fn()} />);

    expect(screen.queryByTestId('attachment-order')).toBeNull();
  });
});
