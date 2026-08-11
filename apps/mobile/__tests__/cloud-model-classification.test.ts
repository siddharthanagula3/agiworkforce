/**
 * Regression: selecting a managed-cloud model inside a Cloud chat must NOT pop a
 * "Switch from AGI Cloud to Local Mode?" dialog.
 *
 * Root cause: chat/[id].tsx resolveAppMode classified the tapped model via
 * getModelById, whose map (allModelMap) holds only local models + ONE "preview"
 * cloud model per provider (cloudPreviewModelByProvider). Non-preview cloud
 * models were therefore unknown to it and fell through to 'local', triggering
 * a spurious mode-switch prompt. The fix
 * routes resolveAppMode through executionModeForModel, which consults the FULL
 * managed-cloud catalog (cloudModelSourceMap).
 *
 * This test asserts the canonical classifier the fix relies on is correct for the
 * exact models that were misclassified. It fails against the old getModelById path.
 */
import {
  DEFAULT_LOCAL_MODEL_ID,
  LOCKED_CLOUD_MODELS,
  getModelListForCloudAccess,
  isCloudManagedModelId,
} from '@/src/features/model-picker/service';
import {
  executionModeForModel,
  executionModeForSelection,
} from '@/src/features/chat/utils/conversationMode';
import { requireAutoMode } from '../test-utils/modelFixtures';

describe('managed-cloud model classification (resolveAppMode root cause)', () => {
  const autoModelId = requireAutoMode().id;
  const previewIds = new Set(LOCKED_CLOUD_MODELS.map((model) => model.id));
  const nonPreviewCloudModelIds = getModelListForCloudAccess(true, 'max')
    .filter((model) => model.surface === 'cloud_managed' && !previewIds.has(model.id))
    .map((model) => model.id);

  it('has a non-preview cloud fixture derived from the full catalog', () => {
    expect(nonPreviewCloudModelIds.length).toBeGreaterThan(0);
  });

  it.each(nonPreviewCloudModelIds)(
    'classifies non-preview managed-cloud model %s as cloud',
    (modelId) => {
      expect(isCloudManagedModelId(modelId)).toBe(true);
      expect(executionModeForModel(modelId)).toBe('cloud');
    },
  );

  it('still classifies unknown / on-device model ids as local', () => {
    expect(executionModeForModel('definitely-not-a-real-model')).toBe('local');
    expect(executionModeForModel(undefined)).toBe('local');
    expect(executionModeForModel(null)).toBe('local');
  });

  it('keeps the canonical boundary-neutral selection inside the active Cloud boundary', () => {
    expect(executionModeForSelection(autoModelId, 'cloud')).toBe('cloud');
  });

  it('keeps the canonical boundary-neutral selection inside the active Local boundary', () => {
    expect(executionModeForSelection(autoModelId, 'local')).toBe('local');
  });

  it('still lets explicit models determine their own boundary', () => {
    expect(executionModeForSelection(nonPreviewCloudModelIds[0]!, 'local')).toBe('cloud');
    expect(executionModeForSelection(DEFAULT_LOCAL_MODEL_ID, 'cloud')).toBe('local');
  });
});
