/**
 * L1 Security - Provider Routing (no hardcoded model IDs)
 *
 * Exercises the canonical model-routing layer used by application surfaces:
 *   - @agiworkforce/routing (resolveAutoRoute)
 *   - apps/web/constants/llm.ts (getAllModels, getModelMetadata, normalizeModelId)
 *
 * Both read from the single source of truth packages/contracts/types/src/models.json.
 * No external mocks: this validates that routing decisions come from catalog
 * metadata, never from string literals invented at the call site.
 */

import { describe, test, expect } from 'vitest';
import { classifyTaskLocally, resolveAutoRoute } from '@agiworkforce/routing';
import {
  getAllModels,
  getModelContextWindow,
  getModelMetadata,
  normalizeModelId,
  MODEL_CONTEXT_WINDOWS,
  MODEL_METADATA,
} from '@shared/config/llm';

describe('L1 Security - Provider Routing (No Hardcoding)', () => {
  test('SECURITY: model catalog is loaded from metadata (models.json), not empty/hardcoded', () => {
    const models = getAllModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    // Every catalog entry must carry a provider sourced from metadata.
    for (const model of models) {
      expect(typeof model.id).toBe('string');
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.provider).toBe('string');
      expect(model.provider.length).toBeGreaterThan(0);
    }
  });

  test('SECURITY: getModelMetadata resolves from catalog and exposes provider, not a literal', () => {
    // Pick a real model id straight from the catalog (no hardcoded id in test).
    const someId = getAllModels()[0]!.id;
    const meta = getModelMetadata(someId);
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe(someId);
    expect(meta!.provider).toBe(MODEL_METADATA[someId]!.provider);
    // Capabilities object is structured metadata, not a guessed string.
    expect(meta!.capabilities).toBeDefined();
    expect(typeof meta!.capabilities).toBe('object');
  });

  test('SECURITY: manual selection routes to a normalized catalog id (no invented id)', () => {
    // Pick a concrete, manually-selectable model (not an "auto*" pseudo-model).
    const realId = getAllModels().find((m) => !m.id.startsWith('auto'))!.id;
    const result = resolveAutoRoute({
      selection: realId,
      taskType: 'general',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });
    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(result.reason).toBe('explicit');
    // Resolved id must normalize to a real catalog entry.
    const canonical = normalizeModelId(result.modelKey) ?? result.modelKey;
    expect(getModelMetadata(canonical)).not.toBeNull();
  });

  test('SECURITY: auto mode resolves to a real catalog model (not a hardcoded fallback)', () => {
    const classifier = classifyTaskLocally('Write a function to sort an array', []);
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: classifier.type,
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });
    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    const canonical = normalizeModelId(result.modelKey) ?? result.modelKey;
    // The routed model must exist in the catalog — proves routing is data-driven.
    expect(getModelMetadata(canonical)).not.toBeNull();
  });

  test('SECURITY: unknown model selections fail closed', () => {
    const result = resolveAutoRoute({
      selection: 'totally-not-a-real-model-xyz',
      taskType: 'general',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });

    expect(result).toMatchObject({ status: 'unavailable', code: 'unknown_selection' });
  });

  test('SECURITY: unknown model id does not resolve to catalog metadata', () => {
    // A model id that is not in the catalog must not resolve to real metadata.
    // (normalizeModelId echoes unknown ids; the catalog lookup is the guard.)
    expect(getModelMetadata('totally-not-a-real-model-xyz')).toBeNull();
    expect(MODEL_METADATA['totally-not-a-real-model-xyz']).toBeUndefined();
  });

  test('SECURITY: media metadata never receives a fabricated token context', () => {
    const videoModelId = getAllModels().find((model) => model.capabilities.videoGen)?.id;
    expect(videoModelId).toBeDefined();
    expect(MODEL_CONTEXT_WINDOWS).not.toHaveProperty(videoModelId!);
    expect(() => getModelContextWindow(videoModelId!)).toThrow(
      'does not publish a token context window',
    );
    expect(Object.values(MODEL_CONTEXT_WINDOWS).every((value) => value > 0)).toBe(true);
  });
});
