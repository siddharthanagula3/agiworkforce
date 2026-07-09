import { describe, expect, it } from 'vitest';

import { OPENROUTER_MODEL_CATALOG } from '../catalog';

describe('OPENROUTER_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(OPENROUTER_MODEL_CATALOG.length).toBeGreaterThan(0);
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
