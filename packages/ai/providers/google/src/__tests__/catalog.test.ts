/**
 * Catalog SSOT regression: GOOGLE_MODEL_CATALOG must derive from
 * `models.json` and surface every Google-provider entry. Earlier versions
 * were hardcoded inline.
 */

import { describe, expect, it } from 'vitest';

import { fetchGoogleCatalog, GOOGLE_MODEL_CATALOG } from '../catalog';

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

  it('does not invent capabilities for dynamically discovered models', async () => {
    const models = await fetchGoogleCatalog({
      apiKey: 'test-key',
      fetch: async () =>
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/gemini-dynamic-test',
                displayName: 'Gemini Dynamic Test',
                inputTokenLimit: 1234,
                outputTokenLimit: 567,
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    expect(models.find((model) => model.id === 'gemini-dynamic-test')).toEqual({
      id: 'gemini-dynamic-test',
      name: 'Gemini Dynamic Test',
      provider: 'google',
      contextWindow: 1234,
      maxOutputTokens: 567,
    });
  });
});
