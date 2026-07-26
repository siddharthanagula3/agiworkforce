import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageGenerationCard } from './ImageGenerationCard';

describe('ImageGenerationCard progress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports one truthful provider-wait state with elapsed time instead of fake stages', () => {
    vi.useFakeTimers();
    render(<ImageGenerationCard isGenerating prompt="Draw a star" />);

    expect(screen.getByText('Generating image')).toBeInTheDocument();
    expect(screen.getByText(/waiting for the image provider · 0:00 elapsed/i)).toBeInTheDocument();
    expect(screen.queryByText(/painting details|almost there|sketching it out/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(screen.getByText(/waiting for the image provider · 0:12 elapsed/i)).toBeInTheDocument();
  });

  it('stops the loader after failure and offers the original request again', () => {
    const onRegenerate = vi.fn().mockResolvedValue('/api/files/generated');
    render(
      <ImageGenerationCard
        isGenerating={false}
        prompt="Draw a star"
        aspectRatio="16:9"
        modelId="gpt-image-2"
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.queryByLabelText('Generating image')).toBeNull();
    expect(screen.getByLabelText('Image generation stopped')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRegenerate).toHaveBeenCalledWith({
      prompt: 'Draw a star',
      aspectRatio: '16:9',
      modelId: 'gpt-image-2',
    });
  });
});
