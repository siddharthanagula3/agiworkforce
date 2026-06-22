/**
 * Regression: selecting a managed-cloud model inside a Cloud chat must NOT pop a
 * "Switch from AGI Cloud to Local Mode?" dialog.
 *
 * Root cause: chat/[id].tsx resolveAppMode classified the tapped model via
 * getModelById, whose map (allModelMap) holds only local models + ONE "preview"
 * cloud model per provider (cloudPreviewModelByProvider). Every non-preview cloud
 * model — Claude Opus 4.8, GPT-5.5, Grok 4.3 — was therefore unknown to it and
 * fell through to 'local', triggering a spurious mode-switch prompt. The fix
 * routes resolveAppMode through executionModeForModel, which consults the FULL
 * managed-cloud catalog (cloudModelSourceMap).
 *
 * This test asserts the canonical classifier the fix relies on is correct for the
 * exact models that were misclassified. It fails against the old getModelById path.
 */
import { isCloudManagedModelId } from '@/src/features/model-picker/service';
import { executionModeForModel } from '@/src/features/chat/utils/conversationMode';

describe('managed-cloud model classification (resolveAppMode root cause)', () => {
  it.each([
    'claude-opus-4.8', // Max flagship — the model in the bug report
    'grok-4.3', // Max flagship
    'gpt-5.5', // Pro flagship
  ])('classifies non-preview managed-cloud model %s as cloud', (modelId) => {
    expect(isCloudManagedModelId(modelId)).toBe(true);
    expect(executionModeForModel(modelId)).toBe('cloud');
  });

  it('still classifies unknown / on-device model ids as local', () => {
    expect(executionModeForModel('definitely-not-a-real-model')).toBe('local');
    expect(executionModeForModel(undefined)).toBe('local');
    expect(executionModeForModel(null)).toBe('local');
  });
});
