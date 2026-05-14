/**
 * Regression test: all models in MODEL_METADATA must have unique apiModelId values.
 *
 * Audit finding: duplicate apiModelId values could cause silent routing errors
 * where the wrong model is invoked at the provider API level.
 *
 * This test pins the constraint so any future duplicate is caught immediately.
 */
import { describe, it, expect } from 'vitest';
import { modelsCatalogJson } from '@agiworkforce/types';
import { MODEL_ID_ALIASES, MODEL_METADATA, normalizeModelId } from '../../constants/llm';

describe('MODEL_METADATA — apiModelId uniqueness (audit regression)', () => {
  const canonicalCatalogEntries = Object.entries(
    modelsCatalogJson.models as Record<string, { id: string; apiModelId?: string }>,
  ).filter(([modelId, metadata]) => metadata.id === modelId);

  it('all canonical models with an apiModelId have unique values across the catalog', () => {
    const seen = new Map<string, string>(); // apiModelId → model id
    const duplicates: Array<{ apiModelId: string; first: string; duplicate: string }> = [];

    for (const [modelId, metadata] of canonicalCatalogEntries) {
      if (!metadata.apiModelId) continue; // auto-mode entries have no apiModelId

      if (seen.has(metadata.apiModelId)) {
        duplicates.push({
          apiModelId: metadata.apiModelId,
          first: seen.get(metadata.apiModelId)!,
          duplicate: modelId,
        });
      } else {
        seen.set(metadata.apiModelId, modelId);
      }
    }

    expect(duplicates).toHaveLength(0);
    if (duplicates.length > 0) {
      const details = duplicates
        .map((d) => `  apiModelId="${d.apiModelId}" shared by "${d.first}" and "${d.duplicate}"`)
        .join('\n');
      throw new Error(`Duplicate apiModelId values found:\n${details}`);
    }
  });

  it('all canonical model metadata entries have a non-empty id field', () => {
    for (const [modelId, metadata] of canonicalCatalogEntries) {
      expect(metadata.id).toBeTruthy();
      expect(metadata.id).toBe(modelId);
    }
  });

  it('all model aliases resolve to canonical metadata entries', () => {
    for (const [alias, canonicalId] of Object.entries(MODEL_ID_ALIASES)) {
      expect(normalizeModelId(alias)).toBe(canonicalId);

      // When the alias also exists as a live (non-deprecated) catalog
      // entry, the entry takes precedence in MODEL_METADATA so callers
      // looking up the literal ID get the entry's canonical metadata.
      // (deepseek-chat is the canonical example: V3 entry is still
      // accessible alongside the v4-flash alias used by clients that
      // want the latest deepseek chat.)
      const meta = MODEL_METADATA[alias];
      const aliasIsLiveEntry = meta && meta.id === alias && !meta.deprecated;
      if (aliasIsLiveEntry) continue;

      expect(meta?.id).toBe(canonicalId);
    }
  });

  it('all model metadata entries have a non-empty name field', () => {
    for (const metadata of Object.values(MODEL_METADATA)) {
      expect(metadata.name).toBeTruthy();
    }
  });

  it('all model metadata entries have a valid provider', () => {
    const validProviders = [
      'managed_cloud',
      'openai',
      'anthropic',
      'google',
      'xai',
      'deepseek',
      'qwen',
      'ollama',
      'ollama_cloud',
      'moonshot',
      'perplexity',
      'zhipu',
      'mistral',
      'groq',
      'together',
      'fireworks',
      'cerebras',
      'deepinfra',
      'nvidia_nim',
      'open_router',
      'cohere',
      'ai21',
      'sambanova',
      'azure',
      'bedrock',
      'minimax',
      'runway',
    ];

    for (const [modelId, metadata] of Object.entries(MODEL_METADATA)) {
      expect(validProviders).toContain(metadata.provider);
      if (!validProviders.includes(metadata.provider)) {
        throw new Error(
          `Model "${modelId}" has unknown provider "${metadata.provider}". ` +
            `Expected one of: ${validProviders.join(', ')}`,
        );
      }
    }
  });

  it('no model apiModelId contains phantom model names from the audit', () => {
    const phantomNames = ['gemini-3-deep-think', 'qwen-coder'];

    for (const [modelId, metadata] of canonicalCatalogEntries) {
      if (!metadata.apiModelId) continue;

      for (const phantom of phantomNames) {
        expect(metadata.apiModelId).not.toBe(phantom);
        if (metadata.apiModelId === phantom) {
          throw new Error(
            `Model "${modelId}" uses phantom apiModelId "${phantom}" — this must be removed`,
          );
        }
      }
    }
  });
});
