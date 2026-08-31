import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageGenerationCard, ShareModal, imageDownloadFilename } from './ImageGenerationCard';
import { IMAGE_MODELS, resolveImageGenerationRequestOptions } from '../lib/imageGenerationOptions';

const OPENAI_IMAGE_MODEL_ID = (() => {
  const model = IMAGE_MODELS.find((candidate) => candidate.provider === 'openai');
  if (!model) throw new Error('Canonical model catalog must expose an OpenAI image model');
  return model.id;
})();

describe('imageDownloadFilename', () => {
  it.each([
    ['image/jpeg', 'generated.jpg'],
    ['image/png', 'generated.png'],
    ['image/webp', 'generated.webp'],
    ['application/octet-stream', 'generated.img'],
  ])('derives the extension from %s bytes', (mimeType, expected) => {
    expect(imageDownloadFilename('generated', mimeType)).toBe(expected);
  });
});

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

  it('stops the loader after failure without replaying a legacy ratio the selected model rejects', () => {
    const onRegenerate = vi.fn().mockResolvedValue('/api/files/generated');
    render(
      <ImageGenerationCard
        isGenerating={false}
        prompt="Draw a star"
        aspectRatio="16:9"
        modelId={OPENAI_IMAGE_MODEL_ID}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.queryByLabelText('Generating image')).toBeNull();
    expect(screen.getByLabelText('Image generation stopped')).toBeInTheDocument();
    expect(
      screen.getByText('The saved 16:9 ratio is unavailable for this model. Retry will use Auto.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRegenerate).toHaveBeenCalledWith({
      prompt: 'Draw a star',
      aspectRatio: 'auto',
      modelId: OPENAI_IMAGE_MODEL_ID,
    });
  });

  it('keeps Retry-After as a countdown on the explicit user retry button', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
    const onRegenerate = vi.fn().mockResolvedValue('/api/files/generated');
    render(
      <ImageGenerationCard
        isGenerating={false}
        prompt="Draw a star"
        retryAt="2026-08-10T12:00:03.000Z"
        onRegenerate={onRegenerate}
      />,
    );

    const retryButton = screen.getByRole('button', { name: 'Try again in 3s' });
    expect(retryButton).toBeDisabled();
    fireEvent.click(retryButton);
    expect(onRegenerate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('gates revision-panel generation until the persisted Retry-After expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
    const onRegenerate = vi.fn().mockResolvedValue('/api/files/generated');
    render(
      <ImageGenerationCard
        imageUrl="/api/files/original"
        isGenerating={false}
        prompt="Draw a star"
        retryAt="2026-08-10T12:00:03.000Z"
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /new version/i }));
    expect(screen.getByText('Try again in 3s before generating another version.')).toBeVisible();
    const aspectControl = screen.getByTitle('Generate this image with a different aspect ratio');
    const editInput = screen.getByPlaceholderText('Describe a change to generate a new version...');
    expect(aspectControl).toBeDisabled();
    expect(editInput).toBeDisabled();
    fireEvent.click(aspectControl);
    expect(onRegenerate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(aspectControl).toBeEnabled();
    expect(editInput).toBeEnabled();
    fireEvent.change(editInput, { target: { value: 'add a moon' } });
    fireEvent.click(screen.getByRole('button', { name: /generate a new version/i }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it.each([undefined, 'removed-catalog-image-fixture'])(
    'does not invent a provider or ratio for missing/unknown model metadata (%s)',
    (modelId) => {
      expect(resolveImageGenerationRequestOptions('16:9', modelId)).toEqual({});
    },
  );
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

  it('does not call a fresh generation an edit of the source image', () => {
    openPanel();

    expect(screen.queryByLabelText('Edit image')).toBeNull();
    expect(screen.queryByLabelText('Apply edit')).toBeNull();
    expect(screen.getByText(/generates a new image from the updated description/i)).toBeVisible();
    expect(screen.getByText(/the image above is not modified/i)).toBeVisible();
  });

  it('advertises no region-selection control it cannot perform', () => {
    openPanel();

    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/select region/i)).toBeNull();
  });

  it('does not offer an exact 3:4 regeneration to the OpenAI adapter', () => {
    render(
      <ImageGenerationCard
        imageUrl="/api/files/original"
        isGenerating={false}
        prompt="Draw a star"
        aspectRatio="1:1"
        modelId={OPENAI_IMAGE_MODEL_ID}
        onRegenerate={vi.fn().mockResolvedValue('/api/files/next')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /new version/i }));
    fireEvent.click(screen.getByTitle('Generate this image with a different aspect ratio'));

    expect(screen.queryByRole('button', { name: /portrait 3:4/i })).toBeNull();
    expect(screen.getByRole('button', { name: /portrait 2:3/i })).toBeInTheDocument();
  });

  it('normalizes a persisted legacy ratio before a describe-change regeneration', () => {
    const onRegenerate = vi.fn().mockResolvedValue('/api/files/next');
    render(
      <ImageGenerationCard
        imageUrl="/api/files/original"
        isGenerating={false}
        prompt="Draw a star"
        aspectRatio="16:9"
        modelId={OPENAI_IMAGE_MODEL_ID}
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /new version/i }));
    expect(
      screen.getByTitle('Generate this image with a different aspect ratio'),
    ).toHaveTextContent('Auto');
    fireEvent.change(
      screen.getByPlaceholderText('Describe a change to generate a new version...'),
      { target: { value: 'add a moon' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /generate a new version/i }));

    expect(onRegenerate).toHaveBeenCalledWith({
      prompt: 'Draw a star. Edit: add a moon',
      aspectRatio: 'auto',
      modelId: OPENAI_IMAGE_MODEL_ID,
    });
  });
});

describe('ImageGenerationCard model disclosure', () => {
  const OPENAI_IMAGE_MODEL_LABEL = (() => {
    const model = IMAGE_MODELS.find((candidate) => candidate.id === OPENAI_IMAGE_MODEL_ID);
    if (!model) throw new Error('Canonical model catalog must expose an OpenAI image model');
    return model.label;
  })();

  it('names the catalog model while the image is still generating', () => {
    render(
      <ImageGenerationCard isGenerating prompt="Draw a star" modelId={OPENAI_IMAGE_MODEL_ID} />,
    );

    expect(screen.getByText(`Generating with ${OPENAI_IMAGE_MODEL_LABEL}`)).toBeVisible();
  });

  it('names the catalog model on the finished image card', () => {
    render(
      <ImageGenerationCard
        imageUrl="/api/files/original"
        isGenerating={false}
        prompt="Draw a star"
        modelId={OPENAI_IMAGE_MODEL_ID}
      />,
    );

    expect(screen.getByText(`Generated with ${OPENAI_IMAGE_MODEL_LABEL}`)).toBeVisible();
  });

  it('stays silent rather than guessing when the message stored no catalog model', () => {
    render(
      <ImageGenerationCard
        imageUrl="/api/files/original"
        isGenerating={false}
        prompt="Draw a star"
      />,
    );

    expect(screen.queryByText(/generated with/i)).toBeNull();
  });
});

describe('ImageGenerationCard theme safety', () => {
  it('paints the generating placeholder with a token surface so its labels survive light theme', () => {
    render(<ImageGenerationCard isGenerating prompt="Draw a star" />);

    const placeholder = screen.getByLabelText('Generating image');
    expect(placeholder.className).toContain('bg-muted');
    expect(placeholder.className).not.toMatch(/bg-\[#/);
    expect(placeholder.getAttribute('style')).not.toMatch(/rgba\(255,\s*255,\s*255/);
  });
});

describe('ShareModal link', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function copyLinkFrom(imageUrl: string): string | undefined {
    let written: string | undefined;
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async (value: string) => {
          written = value;
        }),
      },
    });
    render(<ShareModal imageUrl={imageUrl} prompt="a red apple" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('Copy link'));
    return written;
  }

  it('copies an absolute url when the asset path is app-relative', () => {
    const written = copyLinkFrom('/api/files/47b7a4a4-bcfe-4ad3-a953-263354219d75');

    // A relative app path is meaningless to anything outside the app; the audit
    // found exactly this value reaching the clipboard and external targets.
    expect(written?.startsWith('/')).toBe(false);
    expect(written).toContain('/api/files/47b7a4a4-bcfe-4ad3-a953-263354219d75');
    expect(written).toMatch(/^https?:\/\//);
  });

  it('leaves an already-absolute url alone', () => {
    const written = copyLinkFrom('https://cdn.example.com/generated/apple.png');
    expect(written).toBe('https://cdn.example.com/generated/apple.png');
  });

  it('states who the link actually works for', () => {
    render(<ShareModal imageUrl="/api/files/abc" prompt="a red apple" onClose={() => {}} />);
    expect(screen.getByText(/only for people signed in to this workspace/i)).toBeTruthy();
  });

  it('offers no share target that cannot fetch a workspace-scoped asset', () => {
    const { container } = render(
      <ShareModal imageUrl="/api/files/abc" prompt="a red apple" onClose={() => {}} />,
    );
    const external = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(
      external.filter((href) => /twitter|x\.com|linkedin|reddit|facebook/.test(href ?? '')),
    ).toEqual([]);
  });
});
