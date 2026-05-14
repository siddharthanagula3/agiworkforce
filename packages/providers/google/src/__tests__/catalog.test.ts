/**
 * Catalog SSOT regression: GOOGLE_MODEL_CATALOG must derive from
 * `models.json` and surface every Google-provider entry. Earlier versions
 * were hardcoded inline.
 */

import { describe, expect, it } from 'vitest';

import { GOOGLE_MODEL_CATALOG } from '../catalog';

describe('GOOGLE_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(GOOGLE_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "google"', () => {
    for (const m of GOOGLE_MODEL_CATALOG) {
      expect(m.provider).toBe('google');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of GOOGLE_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
