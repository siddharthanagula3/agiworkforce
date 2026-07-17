import { describe, expect, it } from 'vitest';

import { QWEN_MODEL_CATALOG } from '../catalog';

describe('QWEN_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(QWEN_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "qwen"', () => {
    for (const m of QWEN_MODEL_CATALOG) {
      expect(m.provider).toBe('qwen');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of QWEN_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
