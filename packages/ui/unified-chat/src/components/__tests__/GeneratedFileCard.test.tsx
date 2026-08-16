
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeneratedFileCard } from '../GeneratedFileCard';
import type { GeneratedFilePresentation } from '@agiworkforce/types';

function basePresentation(
  overrides: Partial<GeneratedFilePresentation> = {},
): GeneratedFilePresentation {
  return {
    title: 'design.pdf',
    fileName: 'design.pdf',
    kindLabel: 'PDF document',
    mimeType: 'application/pdf',
    status: 'completed',
    statusLabel: 'Completed',
    isRunning: false,
    isComplete: true,
    isFailed: false,
    privacyMode: 'local',
    privacyLabel: 'Local only',
    privacyShortLabel: 'Local',
    providerMode: 'Local',
    providerLabel: 'Local model',
    sourceSurface: 'desktop',
    sourceSurfaceLabel: 'Desktop',
    sourceSessionId: 'sess-1',
    sourceSessionLabel: 'Session sess-1',
    computeSessionId: 'cs-1',
    generatedFileId: 'gf-1',
    artifactManifestId: 'am-1',
    primaryUri: 'file:///tmp/design.pdf',
    previewUri: undefined,
    byteCountLabel: '128 KB',
    checksumShort: 'abcdef012345',
    retentionLabel: undefined,
    storageScope: 'local_device',
    canPreview: true,
    canDownload: true,
    canShare: false,
    localOnly: true,
    ...overrides,
  };
}

describe('GeneratedFileCard', () => {
  it('renders the title, kind, size, checksum, and status badge', () => {
    render(<GeneratedFileCard presentation={basePresentation()} />);
    expect(screen.getByText('design.pdf')).toBeDefined();
    expect(screen.getByText('PDF document')).toBeDefined();
    const card = screen.getByTestId('generated-file-card');
    expect(card.textContent).toContain('128 KB');
    expect(card.textContent).toContain('abcdef012345');
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('shows the Loader spinner badge text when running', () => {
    render(
      <GeneratedFileCard
        presentation={basePresentation({
          status: 'running',
          statusLabel: 'Running',
          isRunning: true,
          isComplete: false,
        })}
      />,
    );
    expect(screen.getByText('Running')).toBeDefined();
  });

  it('shows a Failed badge when status is failed', () => {
    render(
      <GeneratedFileCard
        presentation={basePresentation({
          status: 'failed',
          statusLabel: 'Failed',
          isRunning: false,
          isComplete: false,
          isFailed: true,
        })}
      />,
    );
    expect(screen.getByText('Failed')).toBeDefined();
  });

  it('disables the download action while the file is not complete', () => {
    const onDownload = vi.fn();
    render(
      <GeneratedFileCard
        presentation={basePresentation({
          status: 'running',
          statusLabel: 'Running',
          isRunning: true,
          isComplete: false,
        })}
        onDownload={onDownload}
      />,
    );
    expect(screen.queryByLabelText('Download generated file')).toBeNull();
  });

  it('fires onDownload when the Download button is clicked', () => {
    const onDownload = vi.fn();
    render(<GeneratedFileCard presentation={basePresentation()} onDownload={onDownload} />);
    fireEvent.click(screen.getByLabelText('Download generated file'));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('hides the share affordance unless canShare AND onShare are both supplied', () => {
    const { rerender } = render(
      <GeneratedFileCard presentation={basePresentation({ canShare: true })} onShare={undefined} />,
    );
    expect(screen.queryByLabelText('Share generated file')).toBeNull();

    const onShare = vi.fn();
    rerender(
      <GeneratedFileCard presentation={basePresentation({ canShare: true })} onShare={onShare} />,
    );
    expect(screen.getByLabelText('Share generated file')).toBeDefined();

    rerender(
      <GeneratedFileCard presentation={basePresentation({ canShare: false })} onShare={onShare} />,
    );
    expect(screen.queryByLabelText('Share generated file')).toBeNull();
  });

  it('renders a preview thumbnail when previewUri is present', () => {
    const { container } = render(
      <GeneratedFileCard
        presentation={basePresentation({
          previewUri: 'https://example.invalid/preview.png',
        })}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.invalid/preview.png');
  });

  it('falls back to the kind icon and reports an inline thumbnail error', () => {
    const onPreviewError = vi.fn();
    render(
      <GeneratedFileCard
        presentation={basePresentation({ previewUri: '/api/files/fixture-image' })}
        onPreview={vi.fn()}
        onPreviewError={onPreviewError}
      />,
    );

    fireEvent.error(screen.getByAltText(/preview$/i));

    expect(onPreviewError).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText(/preview$/i)).toBeNull();
    expect(screen.getByText(/preview unavailable/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
  });

  it('jumps to the source session via onOpenSourceSession', () => {
    const onOpenSourceSession = vi.fn();
    render(
      <GeneratedFileCard
        presentation={basePresentation()}
        onOpenSourceSession={onOpenSourceSession}
      />,
    );
    fireEvent.click(screen.getByText('Session sess-1'));
    expect(onOpenSourceSession).toHaveBeenCalledTimes(1);
  });

  it('renders privacy, provider, and source-surface chips when present', () => {
    render(<GeneratedFileCard presentation={basePresentation()} />);
    expect(screen.getByText('Local')).toBeDefined();
    expect(screen.getByText('Local model')).toBeDefined();
    expect(screen.getByText('Desktop')).toBeDefined();
  });
});
