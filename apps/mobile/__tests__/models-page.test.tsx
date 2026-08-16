/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

let lastModelPickerProps: { modelScope?: 'local' | 'cloud' | 'all' } | null = null;

interface MockModelInstallState {
  jobs: Record<string, unknown>;
  installedModelIds: string[];
  readySystemModelIds: string[];
  hydrateInstalledModels: jest.Mock;
  statusForModel: () => { status: string };
}

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaView: ({ children }: { children: unknown }) => children,
  };
});

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    ChevronRight: icon,
    Cloud: icon,
    Cpu: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceBase: '#fff',
    border: '#ddd',
    transparent: 'transparent',
    surfaceHover: '#f5f5f5',
    textSecondary: '#666',
    textPrimary: '#111',
    textMuted: '#777',
    accentSurface: '#eef',
    accentBorder: '#ccd',
    teal: '#0aa',
  }),
}));

jest.mock('../src/features/cloud-bridge', () => {
  const { View } = require('react-native');
  return {
    InviteCodeModal: () => <View testID="invite-code-modal" />,
  };
});

jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => {
  const { View } = require('react-native');
  return {
    ModelPickerSheet: (props: { modelScope?: 'local' | 'cloud' | 'all' }) => {
      lastModelPickerProps = props;
      return <View testID="model-picker-sheet" />;
    },
  };
});

jest.mock('../src/features/model-picker/installStore', () => ({
  useModelInstallStore: (selector: (state: MockModelInstallState) => unknown) =>
    selector({
      jobs: {},
      installedModelIds: [],
      readySystemModelIds: [],
      hydrateInstalledModels: jest.fn(),
      statusForModel: () => ({ status: 'ready' }),
    }),
}));

import ModelsScreen from '../app/(app)/models';
import { getDefaultModel } from '@agiworkforce/local-llm';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { LOCAL_MODEL_LIST } from '../src/features/model-picker/service';

describe('Models screen', () => {
  beforeEach(() => {
    lastModelPickerProps = null;
    useModelStore.setState({
      selectedModel: getDefaultModel().id,
      selectedProvider: 'local',
      favorites: [],
      recentModels: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
    useWaitlistStore.setState({
      joined: false,
      email: undefined,
      country: undefined,
      rank: undefined,
      joinedAt: undefined,
      cloudUnlocked: false,
      inviteId: undefined,
      inviteCode: undefined,
      cloudUnlockedAt: undefined,
    });
  });

  it('opens the model picker in local scope when Cloud is locked', () => {
    render(<ModelsScreen />);

    expect(lastModelPickerProps?.modelScope).toBe('local');
  });

  it('opens the model picker with all models when Cloud is unlocked', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    render(<ModelsScreen />);

    expect(lastModelPickerProps?.modelScope).toBe('all');
  });

  it('renders favorite/recent models as tappable rows (regression: MOBILE-MODELS-FAVORITES-INERT)', () => {
    const fav = LOCAL_MODEL_LIST[0];
    useModelStore.setState({ favorites: [fav.id], recentModels: [fav.id] });

    const { getAllByLabelText } = render(<ModelsScreen />);
    const rows = getAllByLabelText(`Select ${fav.name}`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].props.accessibilityRole).toBe('button');
    fireEvent.press(rows[0]);
  });
});
