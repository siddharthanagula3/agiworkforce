
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
    for (const model of models) {
      expect(typeof model.id).toBe('string');
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.provider).toBe('string');
      expect(model.provider.length).toBeGreaterThan(0);
    }
  });

  test('SECURITY: getModelMetadata resolves from catalog and exposes provider, not a literal', () => {
    const someId = getAllModels()[0]!.id;
    const meta = getModelMetadata(someId);
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe(someId);
    expect(meta!.provider).toBe(MODEL_METADATA[someId]!.provider);
    expect(meta!.capabilities).toBeDefined();
    expect(typeof meta!.capabilities).toBe('object');
  });

  test('SECURITY: manual selection routes to a normalized catalog id (no invented id)', () => {
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
