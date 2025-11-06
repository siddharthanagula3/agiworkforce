import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileAttachmentPreview } from '../FileAttachmentPreview';
import type { FileAttachment } from '../../../types/chat';
import { TooltipProvider } from '../../ui/Tooltip';
import type { ReactElement } from 'react';

function renderWithTooltipProvider(component: ReactElement) {
  return render(<TooltipProvider>{component}</TooltipProvider>);
}

describe('FileAttachmentPreview', () => {
  const mockImageAttachment: FileAttachment = {
    id: '1',
    name: 'test-image.png',
    size: 1024 * 100, // 100KB
    type: 'image/png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  const mockPdfAttachment: FileAttachment = {
    id: '2',
    name: 'document.pdf',
    size: 1024 * 1024 * 2, // 2MB
    type: 'application/pdf',
  };

  const mockErrorAttachment: FileAttachment = {
    id: '3',
    name: 'large-file.zip',
    size: 1024 * 1024 * 20, // 20MB
    type: 'application/zip',
    error: 'File size must be less than 10MB',
  };

  it('renders image attachment with preview', () => {
    const { container } = renderWithTooltipProvider(
      <FileAttachmentPreview attachment={mockImageAttachment} />,
    );

    const img = container.querySelector('img[alt="test-image.png"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', mockImageAttachment.data);
  });

  it('renders non-image attachment with file info', () => {
    renderWithTooltipProvider(<FileAttachmentPreview attachment={mockPdfAttachment} />);

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('PDF Document')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
  });

  it('displays error state', () => {
    renderWithTooltipProvider(<FileAttachmentPreview attachment={mockErrorAttachment} />);

    expect(screen.getByText('large-file.zip')).toBeInTheDocument();
    expect(screen.getByText('File size must be less than 10MB')).toBeInTheDocument();
  });

  it('shows upload progress', () => {
    const uploadingAttachment: FileAttachment = {
      ...mockImageAttachment,
      uploadProgress: 45,
    };

    renderWithTooltipProvider(<FileAttachmentPreview attachment={uploadingAttachment} />);

    expect(screen.getByText('Uploading... 45%')).toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn();

    renderWithTooltipProvider(
      <FileAttachmentPreview
        attachment={mockImageAttachment}
        onRemove={onRemove}
        removable={true}
      />,
    );

    const removeButton = screen.getByLabelText(/remove/i);
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not show remove button when not removable', () => {
    renderWithTooltipProvider(
      <FileAttachmentPreview attachment={mockImageAttachment} removable={false} />,
    );

    const removeButton = screen.queryByLabelText(/remove/i);
    expect(removeButton).not.toBeInTheDocument();
  });

  it('handles image load error', async () => {
    const { container } = renderWithTooltipProvider(
      <FileAttachmentPreview
        attachment={{
          ...mockImageAttachment,
          data: 'invalid-data-url',
        }}
      />,
    );

    const img = container.querySelector('img');
    if (img) {
      fireEvent.error(img);
    }

    // After error, should show file info instead of image
    expect(screen.getByText('test-image.png')).toBeInTheDocument();
  });
});
