import { describe, expect, it } from 'vitest';
import {
  calculateCatalogVideoCostCents,
  isExecutableVideoModel,
  isModelLive,
  modelsCatalog,
  resolveVideoGenerationOutputSize,
  type ModelMetadata,
} from '../model-catalog';

function tokenPricedVideoModel(): ModelMetadata {
  const candidates = Object.values(modelsCatalog.models).filter(
    (model) =>
      model.provider === 'open_router' &&
      model.modelType === 'video' &&
      model.videoGeneration?.pricing?.unit === 'video_tokens',
  );
  expect(candidates).toHaveLength(1);
  return candidates[0]!;
}

describe('catalog-driven video generation', () => {
  it('keeps every pre-existing live priced video model executable', () => {
    const current = tokenPricedVideoModel();
    const preExistingLive = Object.values(modelsCatalog.models).filter(
      (model) =>
        model.id !== current.id &&
        model.modelType === 'video' &&
        model.capabilities.videoGen &&
        isModelLive(model) &&
        (model.videoPerSecondCost !== undefined ||
          Object.keys(model.videoPerSecondCostByResolution ?? {}).length > 0),
    );

    expect(preExistingLive.length).toBeGreaterThan(0);
    expect(preExistingLive.every((model) => isExecutableVideoModel(model))).toBe(true);
    expect(
      Object.values(modelsCatalog.models)
        .filter((model) => model.modelType === 'video' && !isModelLive(model))
        .some((model) => isExecutableVideoModel(model)),
    ).toBe(false);
  });

  it('admits the full provider duration envelope from catalog metadata', () => {
    const durations = tokenPricedVideoModel().videoGeneration!.durationSecs;
    expect(durations).toHaveLength(27);
    expect(durations[0]).toBe(4);
    expect(durations[durations.length - 1]).toBe(30);
    expect(
      durations.every((duration, index) => index === 0 || duration === durations[index - 1]! + 1),
    ).toBe(true);
  });

  it('prices every resolution/aspect tuple from its exact pixel dimensions', () => {
    const model = tokenPricedVideoModel();
    const video = model.videoGeneration!;
    const formula = video.pricing!;
    const durationSecs = video.durationSecs[video.durationSecs.length - 1]!;

    expect(video.outputSizes).toHaveLength(12);
    for (const output of video.outputSizes) {
      expect(
        resolveVideoGenerationOutputSize(model, output.resolution, output.aspectRatio),
      ).toEqual(output);
      const expected = Math.ceil(
        Number(
          (
            ((output.width * output.height * durationSecs * formula.framesPerSecond) /
              formula.pixelsPerToken) *
            formula.usdPerToken *
            100
          ).toFixed(8),
        ),
      );
      expect(
        calculateCatalogVideoCostCents({
          model,
          resolution: output.resolution,
          aspectRatio: output.aspectRatio,
          durationSecs,
          generateAudio: true,
        }),
      ).toBe(expected);
    }
  });

  it('does not collapse differently sized aspect ratios into one resolution price', () => {
    const model = tokenPricedVideoModel();
    const video = model.videoGeneration!;
    const durationSecs = video.durationSecs[video.durationSecs.length - 1]!;
    const costs = new Map(
      video.outputSizes.map((output) => [
        `${output.resolution}/${output.aspectRatio}`,
        calculateCatalogVideoCostCents({
          model,
          resolution: output.resolution,
          aspectRatio: output.aspectRatio,
          durationSecs,
          generateAudio: true,
        }),
      ]),
    );

    for (const resolution of new Set(video.outputSizes.map((output) => output.resolution))) {
      const perResolution = [...costs.entries()]
        .filter(([key]) => key.startsWith(`${resolution}/`))
        .map(([, cost]) => cost);
      expect(new Set(perResolution).size).toBeGreaterThan(1);
    }
  });

  it('rejects tuples, durations, and audio modes absent from model capabilities', () => {
    const model = tokenPricedVideoModel();
    const video = model.videoGeneration!;
    const supported = video.outputSizes[0]!;

    expect(
      calculateCatalogVideoCostCents({
        model,
        resolution: supported.resolution,
        aspectRatio: supported.aspectRatio,
        durationSecs: video.durationSecs[video.durationSecs.length - 1]! + 1,
        generateAudio: true,
      }),
    ).toBeNull();
    expect(
      resolveVideoGenerationOutputSize(model, supported.resolution, 'unsupported-aspect'),
    ).toBeNull();
    expect(
      calculateCatalogVideoCostCents({
        model: {
          videoGeneration: {
            ...video,
            supportsAudio: false,
          },
        },
        resolution: supported.resolution,
        aspectRatio: supported.aspectRatio,
        durationSecs: video.durationSecs[0]!,
        generateAudio: true,
      }),
    ).toBeNull();
  });
});
