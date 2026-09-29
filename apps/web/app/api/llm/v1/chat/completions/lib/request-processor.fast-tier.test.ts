import { describe, expect, it, vi } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { fastTierFor } from './request-processor';

const fastModel = listCanonicalModels().find((model) => model.fastTier);
const standardModel = listCanonicalModels().find(
  (model) => model.provider === 'anthropic' && !model.fastTier,
);

describe('fastTierFor', () => {
  it('offers the fast tier only on the first-party route of a model that declares it', () => {
    if (!fastModel || !standardModel) throw new Error('The catalogue must declare both kinds');
    expect(fastTierFor('anthropic', fastModel.id)).toEqual(fastModel.fastTier);
    expect(fastTierFor('openrouter', fastModel.id)).toBeNull();
    expect(fastTierFor('anthropic', standardModel.id)).toBeNull();
  });
});
