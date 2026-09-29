import { describe, expect, it, vi } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { fastModeRefusal, fastTierFor } from './request-processor';

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

describe('fastModeRefusal', () => {
  const allowed = {
    model: 'model',
    modelOffersFast: true,
    paidPlan: true,
    workspaceAllowsFast: true,
  };

  it('allows a paid account on a model with a fast tier', () => {
    expect(fastModeRefusal(allowed)).toBeNull();
  });

  it('refuses a model without the tier, a free or trial account, and a workspace that has not enabled it', () => {
    expect(fastModeRefusal({ ...allowed, modelOffersFast: false })?.status).toBe(422);
    expect(fastModeRefusal({ ...allowed, paidPlan: false })?.message).toMatch(/paid plans/);
    expect(fastModeRefusal({ ...allowed, workspaceAllowsFast: false })?.message).toBe(
      'Fast mode has been disabled by your organization.',
    );
  });
});
