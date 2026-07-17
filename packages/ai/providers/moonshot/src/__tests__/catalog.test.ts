import { describe, expect, it } from 'vitest';

import { MOONSHOT_MODEL_CATALOG } from '../catalog';

describe('MOONSHOT_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(MOONSHOT_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "moonshot"', () => {
    for (const m of MOONSHOT_MODEL_CATALOG) {
      expect(m.provider).toBe('moonshot');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of MOONSHOT_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
