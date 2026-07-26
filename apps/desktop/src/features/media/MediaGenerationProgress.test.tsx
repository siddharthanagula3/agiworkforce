import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaGenerationProgress } from './MediaGenerationProgress';

describe('MediaGenerationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports only observable image-generation state and elapsed time', () => {
    render(<MediaGenerationProgress type="image" provider="openai" prompt="A glass lighthouse" />);

    expect(screen.getByText('Waiting for OpenAI image model')).toBeInTheDocument();
    expect(screen.getByText('0s elapsed')).toBeInTheDocument();

    const progress = screen.getByRole('progressbar', { name: 'Generating image' });
    expect(progress).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText(/almost there|painting details|%/i)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByText('3s elapsed')).toBeInTheDocument();
  });
});
