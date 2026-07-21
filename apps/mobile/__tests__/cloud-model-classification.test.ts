/**
 * Regression: selecting a managed-cloud model inside a Cloud chat must NOT pop a
 * "Switch from AGI Cloud to Local Mode?" dialog.
 *
 * Root cause: chat/[id].tsx resolveAppMode classified the tapped model via
 * getModelById, whose map (allModelMap) holds only local models + ONE "preview"
 * cloud model per provider (cloudPreviewModelByProvider). Every non-preview cloud
 * model — Claude Opus 4.8, GPT-5.6 Terra, Grok 4.3 — was therefore unknown to it and
 * fell through to 'local', triggering a spurious mode-switch prompt. The fix
 * routes resolveAppMode through executionModeForModel, which consults the FULL
 * managed-cloud catalog (cloudModelSourceMap).
 *
 * This test asserts the canonical classifier the fix relies on is correct for the
 * exact models that were misclassified. It fails against the old getModelById path.
 */
import { isCloudManagedModelId } from '@/src/features/model-picker/service';
import {
  executionModeForModel,
  executionModeForSelection,
} from '@/src/features/chat/utils/conversationMode';

describe('managed-cloud model classification (resolveAppMode root cause)', () => {
  it.each([
    'claude-opus-4.8', // Max flagship — the model in the bug report
    'grok-4.5', // Max flagship
    'gpt-5.6-terra', // current balanced OpenAI model
  ])('classifies non-preview managed-cloud model %s as cloud', (modelId) => {
    expect(isCloudManagedModelId(modelId)).toBe(true);
    expect(executionModeForModel(modelId)).toBe('cloud');
  });

  it('still classifies unknown / on-device model ids as local', () => {
    expect(executionModeForModel('definitely-not-a-real-model')).toBe('local');
    expect(executionModeForModel(undefined)).toBe('local');
    expect(executionModeForModel(null)).toBe('local');
  });

  it.each(['auto-economy', 'auto-balanced', 'auto-premium'])(
    'keeps boundary-neutral selection %s inside the active Cloud boundary',
    (modelId) => {
      expect(executionModeForSelection(modelId, 'cloud')).toBe('cloud');
    },
  );

  it.each(['auto-economy', 'auto-balanced', 'auto-premium'])(
    'keeps boundary-neutral selection %s inside the active Local boundary',
    (modelId) => {
      expect(executionModeForSelection(modelId, 'local')).toBe('local');
    },
  );

  it('still lets explicit models determine their own boundary', () => {
    expect(executionModeForSelection('claude-opus-4.8', 'local')).toBe('cloud');
    expect(executionModeForSelection('qwen3-4b-instruct-2507', 'cloud')).toBe('local');
  });
});
