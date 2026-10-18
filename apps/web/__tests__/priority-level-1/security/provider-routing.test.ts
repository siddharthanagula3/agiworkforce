import { describe, test, expect } from 'vitest';
import { classifyTaskLocally, resolveAutoRoute } from '@agiworkforce/routing';
import { modelsById } from '@agiworkforce/types';
import { getModelMetadata, normalizeModelId } from '@shared/config/llm';

const catalogModels = () => Object.values(modelsById);

describe('L1 Security - Provider Routing (No Hardcoding)', () => {
  test('SECURITY: model catalog is loaded from metadata (models.json), not empty/hardcoded', () => {
    const models = catalogModels();
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
    const someId = catalogModels()[0]!.id;
    const meta = getModelMetadata(someId);
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe(someId);
    expect(meta!.provider).toBe(modelsById[someId]!.provider);
    expect(meta!.capabilities).toBeDefined();
    expect(typeof meta!.capabilities).toBe('object');
  });

  test('SECURITY: manual selection routes to a normalized catalog id (no invented id)', () => {
    const realId = catalogModels().find((m) => !m.id.startsWith('auto'))!.id;
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
    expect(modelsById['totally-not-a-real-model-xyz']).toBeUndefined();
  });
});
