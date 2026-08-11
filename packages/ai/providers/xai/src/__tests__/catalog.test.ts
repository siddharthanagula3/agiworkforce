import { describe, expect, it } from 'vitest';

import { XAI_MODEL_CATALOG } from '../catalog';

describe('XAI_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(XAI_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "xai"', () => {
    for (const m of XAI_MODEL_CATALOG) {
      expect(m.provider).toBe('xai');
    }
  });

  it('contains a current chat or reasoning entry', () => {
    expect(
      XAI_MODEL_CATALOG.some((model) => ['chat', 'reasoning'].includes(model.modelType ?? '')),
    ).toBe(true);
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of XAI_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
