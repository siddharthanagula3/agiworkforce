import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageTranscriptRecoveryNotice } from './ImageTranscriptRecoveryNotice';

describe('ImageTranscriptRecoveryNotice', () => {
  it('states that prompt-save failure prevented provider and billing egress', () => {
    const onRetry = vi.fn();
    render(
      <ImageTranscriptRecoveryNotice
        phase="prompt"
        retrying={false}
        onRetry={onRetry}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Image request was not sent');
    expect(screen.getByRole('alert')).toHaveTextContent('no credits were used');
    expect(screen.getByRole('alert')).toHaveTextContent('no image provider was called');

    fireEvent.click(screen.getByRole('button', { name: 'Retry save and create image' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers a transcript-only retry without implying another generation', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ImageTranscriptRecoveryNotice
        phase="result"
        retrying={false}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('The image is safe in Library');
    expect(screen.getByRole('alert')).toHaveTextContent('without generating or charging again');

    fireEvent.click(screen.getByRole('button', { name: 'Retry saving chat card' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss image save recovery' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while the same row is being retried', () => {
    render(
      <ImageTranscriptRecoveryNotice
        phase="result"
        retrying
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss image save recovery' })).toBeDisabled();
  });
});
