import { describe, expect, it } from 'vitest';

import { MINIMAX_MODEL_CATALOG } from '../catalog';

describe('MINIMAX_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(MINIMAX_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "minimax"', () => {
    for (const m of MINIMAX_MODEL_CATALOG) {
      expect(m.provider).toBe('minimax');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of MINIMAX_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
