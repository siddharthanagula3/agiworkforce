import { describe, expect, it } from 'vitest';
import { getAutoRoutingProfiles, getPickerModels } from '@agiworkforce/types';
import {
  getCurrentModelOptions,
  getManagedAutoModelOptions,
  getProviderModelOptions,
} from '../../constants/llm';

const CHAT_MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal', 'search'] as const;

describe('Desktop model options', () => {
  it('projects Auto modes from routing policy instead of a compatibility preset partition', () => {
    expect(getManagedAutoModelOptions()).toEqual(
      getAutoRoutingProfiles().map((profile) => ({
        value: profile.id,
        label: profile.label,
      })),
    );
  });

  it('projects provider options from the canonical selectable tier roster', () => {
    expect(getProviderModelOptions('openai')).toEqual(
      getPickerModels({ modelTypes: [...CHAT_MODEL_TYPES] })
        .filter((model) => model.provider === 'openai')
        .map((model) => ({ value: model.id, label: model.name })),
    );
  });

  it('builds one scheduler roster from Auto policy plus canonical provider models', () => {
    expect(getCurrentModelOptions()).toEqual([
      ...getAutoRoutingProfiles().map((profile) => ({
        value: profile.id,
        label: profile.label,
        provider: 'managed_cloud',
      })),
      ...getPickerModels({ modelTypes: [...CHAT_MODEL_TYPES] }).map((model) => ({
        value: model.id,
        label: model.name,
        provider: model.provider,
      })),
    ]);
  });
});
