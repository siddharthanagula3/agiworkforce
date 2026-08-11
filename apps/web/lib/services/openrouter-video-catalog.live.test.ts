import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getModels } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { providerApiUrl } from '@/lib/server/provider-endpoints';

interface OpenRouterVideoCatalogRecord {
  id: string;
  supported_resolutions: string[];
  supported_aspect_ratios: string[];
  supported_sizes: string[];
  supported_durations: number[];
  generate_audio: boolean;
  seed: boolean;
  pricing_skus: {
    video_tokens: string;
    video_tokens_without_audio?: string;
  };
}

interface OpenRouterVideoCatalogResponse {
  data: OpenRouterVideoCatalogRecord[];
}

const LIVE_CHECK_ENABLED = process.env['LIVE_OPENROUTER_CATALOG_CHECK'] === '1';
let previousBaseUrl: string | undefined;

describe.runIf(LIVE_CHECK_ENABLED)('live OpenRouter video catalog authority', () => {
  beforeAll(() => {
    previousBaseUrl = process.env['OPENROUTER_BASE_URL'];
    delete process.env['OPENROUTER_BASE_URL'];
  });

  afterAll(() => {
    if (previousBaseUrl === undefined) delete process.env['OPENROUTER_BASE_URL'];
    else process.env['OPENROUTER_BASE_URL'] = previousBaseUrl;
  });

  it('matches every executable token-priced capability authored in the canonical catalog', async () => {
    const candidates = getModels({
      modelTypes: ['video'],
      requireCapabilities: { videoGen: true },
    }).filter(
      (model) =>
        model.provider === 'open_router' && model.videoGeneration?.pricing?.unit === 'video_tokens',
    );
    expect(candidates).toHaveLength(1);
    const model = candidates[0]!;
    const capability = model.videoGeneration!;
    const pricing = capability.pricing!;
    expect(model.apiModelId).toBeTruthy();

    const response = await fetch(providerApiUrl('openrouter', 'videos/models'), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    expect(response.ok).toBe(true);
    const payload = (await response.json()) as OpenRouterVideoCatalogResponse;
    const source = payload.data.find((candidate) => candidate.id === model.apiModelId);
    expect(source).toBeTruthy();

    const resolutions = [...new Set(capability.outputSizes.map((output) => output.resolution))];
    const aspectRatios = [...new Set(capability.outputSizes.map((output) => output.aspectRatio))];
    const sizes = capability.outputSizes.map((output) => `${output.width}x${output.height}`);
    expect(source!.supported_resolutions).toEqual(resolutions);
    expect(source!.supported_aspect_ratios).toEqual(aspectRatios);
    expect(source!.supported_sizes).toEqual(sizes);
    expect(source!.supported_durations).toEqual(capability.durationSecs);
    expect(source!.generate_audio).toBe(capability.supportsAudio);
    expect(source!.seed).toBe(capability.supportsSeed);
    expect(Number(source!.pricing_skus.video_tokens)).toBe(pricing.usdPerToken);
    expect(Number(source!.pricing_skus.video_tokens_without_audio)).toBe(
      pricing.usdPerTokenWithoutAudio,
    );
  });
});
