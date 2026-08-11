import { describe, expect, it } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

import { ANTHROPIC_MODEL_CATALOG } from '../catalog';

describe('ANTHROPIC_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(ANTHROPIC_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('surfaces every provider entry from models.json', () => {
    const expectedIds = listCanonicalModels()
      .filter((model) => model.provider === 'anthropic')
      .map((model) => model.id)
      .sort();
    expect(ANTHROPIC_MODEL_CATALOG.map((model) => model.id).sort()).toEqual(expectedIds);
  });

  it('only contains models with provider === "anthropic"', () => {
    for (const m of ANTHROPIC_MODEL_CATALOG) {
      expect(m.provider).toBe('anthropic');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of ANTHROPIC_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
