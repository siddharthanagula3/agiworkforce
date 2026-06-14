import {
  DEFAULT_CLOUD_MODEL_ID,
  getShortDisplayName,
  getModelListForCloudAccess,
  isSelectableModelIdForCloudAccess,
  LOCKED_CLOUD_MODELS,
} from '../src/features/model-picker/service';

describe('mobile cloud model labels', () => {
  it('keeps generic app labels AGI-owned while provider/model rows stay accurate', () => {
    const lockedNames = LOCKED_CLOUD_MODELS.map((model) => model.name);
    const unlockedModels = getModelListForCloudAccess(true).filter(
      (model) => model.surface === 'cloud_managed',
    );
    const unlockedNames = unlockedModels.map((model) => model.name);

    expect([...lockedNames, ...unlockedNames].join(' ')).not.toMatch(
      /AGI Cloud (OpenAI|Anthropic|Google|xAI|DeepSeek)/,
    );
    expect(unlockedModels.length).toBeGreaterThan(0);
    expect(getShortDisplayName(unlockedModels[0]!.id)).toBe('AGI Cloud');
    expect(
      unlockedModels.map((model) => `${model.description} ${model.detailLabel}`).join(' '),
    ).not.toMatch(/route/i);
    expect(unlockedModels[0]!.description).toMatch(/model in AGI Cloud$/);
  });

  it('keeps the mobile cloud catalog aligned with configured production providers', () => {
    const providerIds = LOCKED_CLOUD_MODELS.map((model) => model.provider);
    const unlockedProviderIds = new Set(
      getModelListForCloudAccess(true)
        .filter((model) => model.surface === 'cloud_managed')
        .map((model) => model.provider),
    );

    expect(providerIds).toEqual([
      'openai',
      'anthropic',
      'google',
      'xai',
      'deepseek',
      'qwen',
      'moonshot',
    ]);
    expect(providerIds).not.toContain('perplexity');
    expect(unlockedProviderIds).not.toContain('perplexity');
  });

  it('uses the shared OpenAI probe model after cloud invite access', () => {
    const unlockedCloudModels = getModelListForCloudAccess(true).filter(
      (model) => model.surface === 'cloud_managed',
    );

    expect(DEFAULT_CLOUD_MODEL_ID).toBe('gpt-5.4-mini');
    expect(unlockedCloudModels.some((model) => model.id === 'gpt-5.4-mini')).toBe(true);
    expect(isSelectableModelIdForCloudAccess('gpt-5.4-mini', false)).toBe(false);
    expect(isSelectableModelIdForCloudAccess('gpt-5.4-mini', true)).toBe(true);
  });
});
