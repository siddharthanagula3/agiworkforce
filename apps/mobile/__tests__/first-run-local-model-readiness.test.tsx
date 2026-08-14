/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * SIX-21 — a fresh install must always end up with a model it can actually use.
 *
 * On an Apple-Intelligence (tier-1) device the OS-resident row reported by
 * `readySystemModelIds` must also exist in `LOCAL_MODEL_LIST`; otherwise the
 * native runtime is detected but cannot be selected or auto-routed. These
 * tests lock the catalog, onboarding recommendation, and chat readiness to the
 * same capability result while keeping retired ids fail-closed.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  // `useNavigation`/`useFocusEffect` come from expo-router, NOT
  // @react-navigation/native: the monorepo resolves several copies of that
  // package and importing from it crashed the app at launch. The mock has to
  // follow the production import or every screen using them throws here.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // Stands in for useFocusEffect's fire-once-on-focus behaviour. Adding `cb` to the
    // deps would re-run it on every render, which is the opposite of what it mocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(false),
    back: jest.fn(),
  }),
  useNavigation: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    const ReactRuntime = require('react');
    ReactRuntime.useEffect(() => effect(), [effect]);
  },
}));

// react-native-reanimated is mocked globally in jest.setup.js; both screens
// under test need the full hook surface (AgiMark uses useSharedValue), so do
// not narrow it here.

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { View } = require('react-native');
    return <View {...rest}>{children}</View>;
  },
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : Icon) });
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn().mockReturnValue(undefined), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const mockBottomSheet = jest
    .fn()
    .mockImplementation(({ children }: { children: React.ReactNode }) => children);
  return {
    __esModule: true,
    default: mockBottomSheet,
    BottomSheetBackdrop: jest.fn().mockReturnValue(null),
    BottomSheetScrollView: jest
      .fn()
      .mockImplementation(({ children }: { children: React.ReactNode }) => children),
  };
});

jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: jest.fn().mockReturnValue(null),
}));

jest.mock('@agiworkforce/compliance', () => ({
  composeFirstRunDisclosure: jest.fn().mockReturnValue({
    title: 'Before you continue',
    summary: 'On-device.',
    article50_1: 'Article 50(1)',
    sourceUrl: 'https://eur-lex.europa.eu',
    acceptLabel: 'Continue',
    declineLabel: 'Not now',
    thirdPartyAiProviders: [],
    offersManagedCloud: false,
  }),
  isDisclosureSatisfied: jest.fn().mockReturnValue(true),
  recordDisclosureAcceptance: jest.fn().mockResolvedValue(undefined),
  DISCLOSURE_LEDGER_KEY: 'disclosure_ledger',
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    platform: { ios: { model: 'iPhone17', systemVersion: '26.0' } },
    deviceName: 'Test iPhone',
  },
}));

// Tier-1 device: Apple Intelligence is available and the catalog ships the
// system-runtime row alongside the downloadable default.
jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual(
    '@agiworkforce/local-llm',
  ) as typeof import('@agiworkforce/local-llm');
  const downloadableModel = actual.getDefaultModel();
  const systemRuntimeModel = actual.getSystemModelForTier1Runtime('foundation_models');
  if (!systemRuntimeModel) {
    throw new Error('Local catalog has no system model for the tier-one fixture runtime');
  }

  return {
    detectCapabilities: jest.fn().mockResolvedValue({
      totalRAMMB: 8192,
      tier1Available: true,
      tier1Runtime: 'foundation_models',
      tier1Status: 'available',
      tier2Available: true,
      tier3Available: true,
      osVersion: '26.0',
      thermalThrottled: false,
    }),
    getCapabilities: jest.fn().mockResolvedValue({
      totalRAMMB: 8192,
      tier1Available: true,
      tier1Runtime: 'foundation_models',
      tier1Status: 'available',
      tier2Available: true,
      tier3Available: true,
      osVersion: '26.0',
      thermalThrottled: false,
    }),
    getDefaultModel: jest.fn(() => downloadableModel),
    getShippableModels: jest.fn(() => [downloadableModel, systemRuntimeModel]),
    getModelById: jest.fn((id: string) =>
      [downloadableModel, systemRuntimeModel].find((model) => model.id === id),
    ),
    getSystemModelForTier1Runtime: jest.fn(() => systemRuntimeModel),
    hasRunnableGgufArtifacts: jest.fn(() => false),
    tier2LoadModel: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../storage/installedModels', () => ({
  recordInstalledModel: jest.fn().mockResolvedValue(undefined),
  insertInstalledModel: jest.fn().mockResolvedValue(undefined),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

// --- chat-tab-only mocks ---------------------------------------------------

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      loadConversations: jest.fn(),
      createConversation: jest.fn(),
      sendMessage: jest.fn(),
      beginImageGeneration: jest.fn(),
      completeImageGeneration: jest.fn(),
      failImageGeneration: jest.fn(),
      deleteMessage: jest.fn(),
      setPaywallError: jest.fn(),
      clearError: jest.fn(),
      setSendError: jest.fn(),
      features: { imageGen: false },
      workMode: 'default',
    }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({ openNearestDrawer: jest.fn() }));

jest.mock('@/src/features/chat/components/ChatInput', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    ChatInput: ReactRuntime.forwardRef(function MockChatInput(
      _props: Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      ReactRuntime.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      return <View testID="chat-input" />;
    }),
  };
});

jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const { View } = require('react-native');
  return { AddToChatSheet: () => <View testID="add-to-chat-sheet" /> };
});
jest.mock('@/src/features/chat/components/ProjectSelectorBar', () => {
  const { View } = require('react-native');
  return { ProjectSelectorBar: () => <View testID="project-selector-bar" /> };
});
jest.mock('@/src/features/chat/components/StyleSelector', () => {
  const { View } = require('react-native');
  return { StyleSelector: () => <View testID="style-selector" /> };
});

let mockInstalledModelIds: string[] = [];
let mockReadySystemModelIds: string[] = [];
jest.mock('@/src/features/model-picker/installStore', () => ({
  useModelInstallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      installedModelIds: mockInstalledModelIds,
      readySystemModelIds: mockReadySystemModelIds,
      jobs: {},
    }),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import OnboardingScreen from '../app/(public)/onboarding';
import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { getDefaultModel, getSystemModelForTier1Runtime } from '@agiworkforce/local-llm';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { isSelectableLocalCatalogModel } from '../src/features/model-picker/service';

const DOWNLOADABLE_MODEL = getDefaultModel();
const SYSTEM_RUNTIME_MODEL = getSystemModelForTier1Runtime('foundation_models');
const SYNTHETIC_RETIRED_MODEL_ID = 'fixture-retired-local-model';

if (!SYSTEM_RUNTIME_MODEL) {
  throw new Error('Local catalog has no system model for the tier-one fixture runtime');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInstalledModelIds = [];
  mockReadySystemModelIds = [];
  useChatAppModeStore.setState({ appMode: 'local' });
});

describe('the system-runtime row is selectable for chat', () => {
  it('is the premise of both fixes below', () => {
    expect(isSelectableLocalCatalogModel(SYSTEM_RUNTIME_MODEL as never)).toBe(true);
    expect(isSelectableLocalCatalogModel(DOWNLOADABLE_MODEL as never)).toBe(true);
  });
});

describe('onboarding on a tier-1 (Apple Intelligence) device', () => {
  it('recommends the detected built-in model without a download', async () => {
    const { getByTestId, queryByText } = render(<OnboardingScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('hero-start-chatting-btn'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy();
    });

    await waitFor(() => {
      expect(getByTestId('device-tier-download-btn').props.accessibilityLabel).toBe('Continue');
    });
    expect(queryByText('Already on your device · Zero download')).toBeTruthy();
    expect(queryByText('A built-in local model is ready to use.')).toBeTruthy();
    expect(
      queryByText('Download one local model to start private chats on this device.'),
    ).toBeNull();
    // Nothing was finished — the user still has to complete the download.
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('chat tab download banner', () => {
  it('hides the download when the detected system model is ready', () => {
    mockReadySystemModelIds = [SYSTEM_RUNTIME_MODEL.id];
    const { queryByTestId } = render(<ChatTabScreen />);
    expect(queryByTestId('download-model-banner')).toBeNull();
  });

  it('still offers the download when the only installed id left the catalog', () => {
    mockInstalledModelIds = [SYNTHETIC_RETIRED_MODEL_ID];
    const { getByTestId } = render(<ChatTabScreen />);
    expect(getByTestId('download-model-banner')).toBeTruthy();
  });

  it('hides the banner once a picker-selectable model is installed', () => {
    mockInstalledModelIds = [DOWNLOADABLE_MODEL.id];
    const { queryByTestId } = render(<ChatTabScreen />);
    expect(queryByTestId('download-model-banner')).toBeNull();
  });
});
