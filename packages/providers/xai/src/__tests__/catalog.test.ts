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

  it('contains a Grok 4 family entry', () => {
    const ids = XAI_MODEL_CATALOG.map((m) => m.id).join(' ');
    expect(ids.toLowerCase()).toMatch(/grok/);
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of XAI_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
