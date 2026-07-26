import { describe, expect, it } from 'vitest';
import { getProviderModelCatalog } from '@agiworkforce/types';

import { OPENROUTER_MODEL_CATALOG } from '../catalog';

describe('OPENROUTER_MODEL_CATALOG', () => {
  it('matches the canonical registry projection without inventing fallback models', () => {
    expect(OPENROUTER_MODEL_CATALOG).toEqual(getProviderModelCatalog('open_router'));
  });

  it('only contains models with provider === "open_router"', () => {
    for (const m of OPENROUTER_MODEL_CATALOG) {
      expect(m.provider).toBe('open_router');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of OPENROUTER_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
