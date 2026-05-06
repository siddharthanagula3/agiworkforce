/**
 * Catalog SSOT regression: OPENAI_MODEL_CATALOG must derive from
 * `models.json` and surface every OpenAI-provider entry, including the
 * current default `gpt-5.5`. Earlier versions were hardcoded at GPT-5.4
 * while models.json declared `defaultModel: 'gpt-5.5'`.
 */

import { describe, expect, it } from 'vitest';

import { OPENAI_MODEL_CATALOG } from '../catalog';

describe('OPENAI_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(OPENAI_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('contains the current default model (gpt-5.5) per models.json', () => {
    const ids = OPENAI_MODEL_CATALOG.map((m) => m.id);
    expect(ids).toContain('gpt-5.5');
  });

  it('only contains models with provider === "openai"', () => {
    for (const m of OPENAI_MODEL_CATALOG) {
      expect(m.provider).toBe('openai');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of OPENAI_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
