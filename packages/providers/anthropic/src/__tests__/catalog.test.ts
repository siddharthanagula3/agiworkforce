/**
 * Catalog SSOT regression: ANTHROPIC_MODEL_CATALOG must derive from
 * `models.json` and surface every Anthropic-provider entry, including the
 * latest Opus generation (claude-opus-4.x etc.). Earlier versions were
 * hardcoded and lagged models.json by a generation — see
 * `rule-models-json.md` (NEVER hardcode model IDs). The assertions stay
 * version-agnostic so they don't re-break on the next Opus bump.
 */

import { describe, expect, it } from 'vitest';

import { ANTHROPIC_MODEL_CATALOG } from '../catalog';

describe('ANTHROPIC_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(ANTHROPIC_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('surfaces an Opus-tier model from models.json', () => {
    const ids = ANTHROPIC_MODEL_CATALOG.map((m) => m.id);
    expect(ids.some((id) => id.startsWith('claude-opus-'))).toBe(true);
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
