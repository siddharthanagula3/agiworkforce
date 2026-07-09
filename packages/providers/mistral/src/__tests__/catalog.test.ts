import { describe, expect, it } from 'vitest';

import { MISTRAL_MODEL_CATALOG } from '../catalog';

describe('MISTRAL_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(MISTRAL_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "mistral"', () => {
    for (const m of MISTRAL_MODEL_CATALOG) {
      expect(m.provider).toBe('mistral');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of MISTRAL_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
