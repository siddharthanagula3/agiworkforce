import { beforeEach, describe, expect, it, vi } from 'vitest';

const { modulePromise } = vi.hoisted(() => ({
  modulePromise: Promise.resolve({ MarkdownContent: {} }),
}));

vi.mock('@agiworkforce/unified-chat', () => modulePromise);

describe('preloadTranscriptMarkdown', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reuses one module request across repeated composer intent', async () => {
    const { preloadTranscriptMarkdown } = await import('./preload-transcript-markdown');

    const first = preloadTranscriptMarkdown();
    const second = preloadTranscriptMarkdown();

    expect(second).toBe(first);
    await expect(first).resolves.toBeDefined();
  });
});
