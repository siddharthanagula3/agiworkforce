/**
 * Catalog SSOT regression: ANTHROPIC_MODEL_CATALOG must derive from
 * `models.json` and surface every Anthropic-provider entry, including
 * the latest generation (claude-opus-4.7 etc.). Earlier versions were
 * hardcoded and lagged models.json by a generation — see
 * `rule-models-json.md` (NEVER hardcode model IDs).
 */

import { describe, expect, it } from 'vitest';

import { ANTHROPIC_MODEL_CATALOG } from '../catalog';

describe('ANTHROPIC_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(ANTHROPIC_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('contains the latest opus model (claude-opus-4.7) per models.json', () => {
    const ids = ANTHROPIC_MODEL_CATALOG.map((m) => m.id);
    expect(ids).toContain('claude-opus-4.7');
  });

  it('only contains models with provider === "anthropic"', () => {
    for (const m of ANTHROPIC_MODEL_CATALOG) {
      expect(m.provider).toBe('anthropic');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of ANTHROPIC_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
