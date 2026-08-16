import { describe, expect, it } from 'vitest';
import { getModels, isExecutableVideoModel } from '@agiworkforce/types';

/**
 * WEB-05 said the video picker offers a preview-only model that 400s on submit.
 * The composer builds its list from isExecutableVideoModel, which requires the
 * catalog's availability to be live — so preview and unavailable entries are
 * already excluded. This pins that, because the filter is what makes the claim
 * false and a change to it would make the claim true again.
 */

describe('video model picker offers only models the route will accept', () => {
  const videoModels = getModels({ modelTypes: ['video'] });

  it('has video models to reason about', () => {
    expect(videoModels.length).toBeGreaterThan(0);
  });

  it('never marks a non-live model executable', () => {
    const wrong = videoModels
      .filter((model) => isExecutableVideoModel(model))
      .filter((model) => (model.availability ?? 'live') !== 'live')
      .map((model) => `${model.id} (${model.availability})`);

    expect(wrong, `these would be offered but are not live: ${wrong.join(', ')}`).toEqual([]);
  });

  it('excludes every preview and unavailable entry the catalog carries', () => {
    const nonLive = videoModels.filter((model) => (model.availability ?? 'live') !== 'live');
    expect(nonLive.length).toBeGreaterThan(0);
    for (const model of nonLive) {
      expect(isExecutableVideoModel(model), `${model.id} should not be selectable`).toBe(false);
    }
  });

  it('leaves at least one live model selectable, or the picker is empty', () => {
    expect(videoModels.filter((model) => isExecutableVideoModel(model)).length).toBeGreaterThan(0);
  });
});
