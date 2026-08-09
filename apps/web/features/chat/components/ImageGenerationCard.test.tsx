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

describe('ImageGenerationCard revision panel', () => {
  function openPanel() {
    const onRegenerate = vi.fn().mockResolvedValue('/api/files/next');
    render(
      <ImageGenerationCard
        imageUrl="/api/files/original"
        isGenerating={false}
        prompt="Draw a star"
        aspectRatio="16:9"
        onRegenerate={onRegenerate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /new version/i }));
    return onRegenerate;
  }

  // PP-18: the panel runs a fresh text-to-image generation — no client sends
  // `source_image`/`mask_image` to /api/media/image/generate — so it must not
  // present itself as editing the image the user is looking at.
  it('does not call a fresh generation an edit of the source image', () => {
    openPanel();

    expect(screen.queryByLabelText('Edit image')).toBeNull();
    expect(screen.queryByLabelText('Apply edit')).toBeNull();
    expect(screen.getByText(/generates a new image from the updated description/i)).toBeVisible();
    expect(screen.getByText(/the image above is not modified/i)).toBeVisible();
  });

  // The panel used to carry a permanently disabled "Select region to edit —
  // Coming soon" strip. Region/mask editing is unscheduled, so the promise is
  // gone rather than parked on screen forever.
  it('advertises no region-selection control it cannot perform', () => {
    openPanel();

    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/select region/i)).toBeNull();
  });
});
