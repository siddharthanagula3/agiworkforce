import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { isWebSearchAvailable } from '@agiworkforce/search';
import { getModelMetadataById } from '@agiworkforce/types';
import { TaskChips } from '@/src/features/chat/components/TaskChips';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useTierStore } from '@/src/features/billing/store';
import { useRemoteCapabilityStore } from '@/src/lib/capabilities';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const searchModel = requireMobileCloudModel((candidate) => {
  const model = getModelMetadataById(candidate.id);
  return isWebSearchAvailable({
    provider: model?.provider,
    modelSupportsNativeSearch: model?.capabilities.search,
    modelSupportsTools: model?.capabilities.tools,
    genericBackendConfigured: true,
  });
}, 'Cloud model with a supported web-search route');

describe('chat quick actions', () => {
  beforeEach(() => {
    act(() => {
      useChatViewStore.setState((state) => ({
        features: { ...state.features, webSearch: true },
      }));
      useTierStore.setState({ genericWebSearchAvailable: true });
      useRemoteCapabilityStore.getState().clear();
    });
  });

  it('offers web search only when the selected Cloud route can actually request it', () => {
    const onChipPress = jest.fn();
    const screen = render(
      <TaskChips onChipPress={onChipPress} showCloudSuggestions modelId={searchModel.id} />,
    );

    fireEvent.press(screen.getByLabelText('Search the web'));
    expect(onChipPress).toHaveBeenCalledWith('research');

    act(() => {
      useChatViewStore.setState((state) => ({
        features: { ...state.features, webSearch: false },
      }));
    });
    expect(screen.queryByLabelText('Search the web')).toBeNull();
    expect(screen.getByLabelText('Write or edit')).toBeTruthy();
  });

  it('hides web search in Local Mode and while the server has switched it off', () => {
    const screen = render(
      <TaskChips onChipPress={jest.fn()} showCloudSuggestions={false} modelId={searchModel.id} />,
    );
    expect(screen.queryByLabelText('Search the web')).toBeNull();

    screen.rerender(
      <TaskChips onChipPress={jest.fn()} showCloudSuggestions modelId={searchModel.id} />,
    );
    expect(screen.getByLabelText('Search the web')).toBeTruthy();

    act(() => useRemoteCapabilityStore.setState({ switchedOff: { canUseWebSearch: true } }));
    expect(screen.queryByLabelText('Search the web')).toBeNull();
  });
});
