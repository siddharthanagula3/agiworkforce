import { describe, expect, it } from 'vitest';

import { ZHIPU_MODEL_CATALOG } from '../catalog';

describe('ZHIPU_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(ZHIPU_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "zhipu"', () => {
    for (const m of ZHIPU_MODEL_CATALOG) {
      expect(m.provider).toBe('zhipu');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of ZHIPU_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
