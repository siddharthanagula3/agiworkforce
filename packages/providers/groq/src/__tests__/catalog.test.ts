import { describe, expect, it } from 'vitest';

import { GROQ_MODEL_CATALOG } from '../catalog';

describe('GROQ_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(GROQ_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "groq"', () => {
    for (const m of GROQ_MODEL_CATALOG) {
      expect(m.provider).toBe('groq');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of GROQ_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
