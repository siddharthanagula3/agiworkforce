/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { getModelMetadataById, getProviderDisplayLabel } from '@agiworkforce/types';

const mockSwitchToCloud = jest.fn(() => true);
let mockCloudUnlocked = true;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        const Icon = () => <Text>{`icon-${name}`}</Text>;
        return Icon;
      },
    },
  );
});

jest.mock('@/src/features/chat/hooks/useAppModeSwitch', () => ({
  useAppModeSwitch: () => ({
    appMode: 'local',
    get cloudUnlocked() {
      return mockCloudUnlocked;
    },
    switchToLocal: jest.fn(() => true),
    switchToCloud: mockSwitchToCloud,
  }),
}));

import MediaSettingsScreen from '@/src/features/settings/media';
import * as mediaMode from '@/src/features/chat/actions/mediaMode';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useTierStore } from '@/src/features/billing/store';

const imageModels = mediaMode.listMediaModels('image');
const nameOf = (modelId: string) => getModelMetadataById(modelId)?.name ?? modelId;

function requireModel(index: number): string {
  const modelId = imageModels[index];
  if (!modelId) throw new Error(`Catalog has no live image model at position ${index}`);
  return modelId;
}

describe('Settings > Media', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloudUnlocked = true;
    act(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useChatViewStore.setState({ selectedMediaModel: {} });
      useChatViewStore.getState().setFeature('imageGen', true);
      useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] } as never);
    });
  });

  it('needs at least two live image models for these cases to mean anything', () => {
    expect(imageModels.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the model the registry picks while nothing is chosen', () => {
    const defaultId = mediaMode.resolveMediaModelId('image', {});
    const screen = render(<MediaSettingsScreen />);

    expect(screen.getByText('Image generation model')).toBeTruthy();
    expect(
      screen.getByLabelText(`Image generation model. ${defaultId ? nameOf(defaultId) : 'Default'}`),
    ).toBeTruthy();
  });

  it('lists Default first, then every live image model with its provider and a check', () => {
    const chosen = requireModel(1);
    act(() => {
      useChatViewStore.getState().setMediaModel('image', chosen);
    });
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByLabelText(`Image generation model. ${nameOf(chosen)}`));

    const sheet = screen.getByTestId('media.image-model-sheet');
    const rows = within(sheet).getAllByTestId(/^media\.image-model\./);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'media.image-model.default',
      ...imageModels.map((id) => `media.image-model.${id}`),
    ]);
    for (const modelId of imageModels) {
      const provider = getProviderDisplayLabel(getModelMetadataById(modelId)?.provider ?? '');
      const row = within(sheet).getByTestId(`media.image-model.${modelId}`);
      expect(within(row).getByText(nameOf(modelId))).toBeTruthy();
      expect(within(row).getByText(provider)).toBeTruthy();
      expect(row.props.accessibilityState).toMatchObject({ selected: modelId === chosen });
    }
    expect(
      within(sheet).getByTestId('media.image-model.default').props.accessibilityState,
    ).toMatchObject({ selected: false });
  });

  it('writes the choice to the store the composer sheet reads and closes the list', () => {
    const chosen = requireModel(1);
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByLabelText(/^Image generation model\./));
    fireEvent.press(screen.getByTestId(`media.image-model.${chosen}`));

    expect(useChatViewStore.getState().selectedMediaModel.image).toBe(chosen);
    expect(mediaMode.resolveMediaModelId('image')).toBe(chosen);
    expect(screen.getByLabelText(`Image generation model. ${nameOf(chosen)}`)).toBeTruthy();
    expect(screen.queryByTestId('media.image-model-sheet')).toBeNull();
  });

  it('shows a choice made in the composer sheet', () => {
    const screen = render(<MediaSettingsScreen />);
    const chosen = requireModel(1);

    act(() => {
      useChatViewStore.getState().setMediaModel('image', chosen);
    });

    expect(screen.getByLabelText(`Image generation model. ${nameOf(chosen)}`)).toBeTruthy();
  });

  it('clears the choice when Default is picked, so the registry slot applies again', () => {
    const chosen = requireModel(1);
    act(() => {
      useChatViewStore.getState().setMediaModel('image', chosen);
      useChatViewStore.getState().setMediaModel('video', 'kept-video-choice');
    });
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByLabelText(`Image generation model. ${nameOf(chosen)}`));
    fireEvent.press(screen.getByTestId('media.image-model.default'));

    expect(useChatViewStore.getState().selectedMediaModel).toEqual({ video: 'kept-video-choice' });
    expect(mediaMode.resolveMediaModelId('image')).toBe(mediaMode.resolveMediaModelId('image', {}));
  });

  it('checks Default while the stored choice is no longer a live model', () => {
    act(() => {
      useChatViewStore.setState({ selectedMediaModel: { image: 'retired-image-model' } });
    });
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByLabelText(/^Image generation model\./));

    expect(screen.getByTestId('media.image-model.default').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('leaves the list without a change on Cancel', () => {
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByLabelText(/^Image generation model\./));
    fireEvent.press(screen.getByTestId('media.image-model-cancel'));

    expect(screen.queryByTestId('media.image-model-sheet')).toBeNull();
    expect(useChatViewStore.getState().selectedMediaModel).toEqual({});
  });

  it('says Not available, and cannot be opened, when no image model is live', () => {
    const list = jest.spyOn(mediaMode, 'listMediaModels').mockReturnValue([]);
    try {
      const screen = render(<MediaSettingsScreen />);

      expect(screen.getByText('Image generation model')).toBeTruthy();
      fireEvent.press(screen.getByText('Not available'));
      expect(screen.queryByTestId('media.image-model-sheet')).toBeNull();
      expect(screen.queryByText('Default')).toBeNull();
    } finally {
      list.mockRestore();
    }
  });

  it('says Not available, and cannot be opened, on a plan without image creation', () => {
    act(() => {
      useTierStore.setState({ tier: 'free', grantedCapabilities: [] } as never);
    });
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByText('Not available'));

    expect(screen.queryByTestId('media.image-model-sheet')).toBeNull();
    expect(screen.queryByText('Default')).toBeNull();
  });

  it('says Not available when the server has not granted image creation', () => {
    act(() => {
      useTierStore.setState({ tier: 'pro', grantedCapabilities: [] } as never);
    });
    const screen = render(<MediaSettingsScreen />);

    expect(screen.getByText('Not available')).toBeTruthy();
  });

  it('says Not available after the person switches image creation off in Capabilities', () => {
    act(() => {
      useChatViewStore.getState().setFeature('imageGen', false);
    });
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByText('Not available'));

    expect(screen.queryByTestId('media.image-model-sheet')).toBeNull();
  });

  it('offers the switch to AGI Cloud in Local Mode and makes it', () => {
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
    });
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByLabelText('Image generation model. Switch to AGI Cloud'));

    expect(mockSwitchToCloud).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('media.image-model-sheet')).toBeNull();
  });

  it('offers Sign in in Local Mode while Cloud is not unlocked', () => {
    mockCloudUnlocked = false;
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
    });
    const screen = render(<MediaSettingsScreen />);

    fireEvent.press(screen.getByLabelText('Image generation model. Sign in'));

    expect(mockSwitchToCloud).toHaveBeenCalledTimes(1);
  });

  it('shows only names, providers and the Default choice in the list, with no plan tag', () => {
    const screen = render(<MediaSettingsScreen />);
    fireEvent.press(screen.getByLabelText(/^Image generation model\./));

    const allowed = new Set([
      'Image generation model',
      'Default',
      'Cancel',
      ...imageModels.map(nameOf),
      ...imageModels.map((id) => getProviderDisplayLabel(getModelMetadataById(id)?.provider ?? '')),
    ]);
    const shown = within(screen.getByTestId('media.image-model-sheet'))
      .getAllByText(/.+/)
      .map((node) => String(node.props.children))
      .filter((text) => !text.startsWith('icon-'));
    expect(shown.filter((text) => !allowed.has(text))).toEqual([]);
  });
});
