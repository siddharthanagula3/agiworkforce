import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createChatModelInfo, useChatModelStore } from '@agiworkforce/unified-chat';
import { getModelMetadataById, getModelsForTierAndSurface } from '@agiworkforce/types';

import { useDesktopCloudResearchCapability } from '../useDesktopCloudResearchCapability';

describe('useDesktopCloudResearchCapability', () => {
  afterEach(() => {
    useChatModelStore.getState().setModels([]);
    useChatModelStore.getState().selectModel('');
  });

  it('reacts to the same picker selection used by the managed send path', () => {
    const admitted = getModelsForTierAndSurface('max', 'desktop/cloud-chat', {
      modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
    });
    const researchModel = admitted.find(
      (model) => getModelMetadataById(model.id)?.capabilities.research === true,
    );
    const nonResearchModel = admitted.find(
      (model) => getModelMetadataById(model.id)?.capabilities.research !== true,
    );
    expect(researchModel).toBeTruthy();
    expect(nonResearchModel).toBeTruthy();

    act(() => {
      useChatModelStore.getState().setModels(
        [researchModel!, nonResearchModel!].map((model) =>
          createChatModelInfo({
            id: model.id,
            name: model.name,
            provider: model.provider,
            isLocal: false,
            isByok: false,
          }),
        ),
      );
      useChatModelStore.getState().selectModel(researchModel!.id);
    });
    const { result } = renderHook(() => useDesktopCloudResearchCapability('max', true));
    expect(result.current).toBe(true);

    act(() => useChatModelStore.getState().selectModel(nonResearchModel!.id));
    expect(result.current).toBe(false);
  });

  it('fails closed outside Managed Cloud even for an entitled model', () => {
    act(() => useChatModelStore.getState().selectModel('auto'));
    const { result } = renderHook(() => useDesktopCloudResearchCapability('max', false));
    expect(result.current).toBe(false);
  });
});
