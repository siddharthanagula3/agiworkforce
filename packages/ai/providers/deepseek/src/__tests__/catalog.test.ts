import { describe, expect, it } from 'vitest';

import { DEEPSEEK_MODEL_CATALOG } from '../catalog';

describe('DEEPSEEK_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(DEEPSEEK_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "deepseek"', () => {
    for (const m of DEEPSEEK_MODEL_CATALOG) {
      expect(m.provider).toBe('deepseek');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of DEEPSEEK_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
