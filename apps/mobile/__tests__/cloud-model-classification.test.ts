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
