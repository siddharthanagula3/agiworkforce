/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * SIX-21 — a fresh install must always end up with a model it can actually use.
 *
 * On an Apple-Intelligence (tier-1) device the OS-resident row is reported as
 * ready by `useModelInstallStore.readySystemModelIds`, but `service.ts`
 * deliberately filters system-runtime-only rows out of `LOCAL_MODEL_LIST`, so
 * `resolveLocalModelRef` can never resolve one. That produced two false
 * signals on a clean install:
 *   1. onboarding recommended it, claimed "already on your device · zero
 *      download", and skipped the download screen entirely;
 *   2. the chat tab then suppressed the "Download a model to chat" banner,
 *      leaving no offer and no selectable model — the first send failed.
 *
 * These tests lock both halves.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Shared catalog rows
// ---------------------------------------------------------------------------

const DOWNLOADABLE_MODEL = {
  id: 'qwen3-4b-instruct-2507',
  displayName: 'AGI Standard',
  family: 'qwen3',
  paramCountB: 4.0,
  fileSizeBytes: 2_147_483_648,
  supportedRuntimes: ['executorch', 'llama-rn'],
  contextWindow: 262_144,
  capabilities: {
    text: true,
    visionIn: false,
    audioIn: false,
    toolCalls: true,
    structuredOutput: true,
  },
  license: 'Apache-2.0',
  role: 'default',
  shipsInV1: true,
  executorchPreset: {
    modelName: 'qwen3-4b-quantized',
    modelSource: 'https://example.invalid/model.pte',
    tokenizerSource: 'https://example.invalid/tokenizer.json',
    tokenizerConfigSource: 'https://example.invalid/tokenizer_config.json',
  },
};

const SYSTEM_RUNTIME_MODEL = {
  id: 'apple-foundation-models',
  displayName: 'Apple Intelligence',
  family: 'apple-fm',
  paramCountB: 3.0,
  fileSizeBytes: 0,
  supportedRuntimes: ['apple-foundation-models'],
  contextWindow: 4_096,
  capabilities: {
    text: true,
    visionIn: true,
    audioIn: false,
    toolCalls: true,
    structuredOutput: true,
  },
  license: 'Apple Entitlement',
  role: 'system-multimodal',
  shipsInV1: true,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
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
jest.mock('@agiworkforce/local-llm', () => ({
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
  getDefaultModel: jest.fn(() => DOWNLOADABLE_MODEL),
  getShippableModels: jest.fn(() => [DOWNLOADABLE_MODEL, SYSTEM_RUNTIME_MODEL]),
  getModelById: jest.fn((id: string) =>
    [DOWNLOADABLE_MODEL, SYSTEM_RUNTIME_MODEL].find((m) => m.id === id),
  ),
  getSystemModelForTier1Runtime: jest.fn(() => SYSTEM_RUNTIME_MODEL),
  hasRunnableGgufArtifacts: jest.fn(() => false),
  tier2LoadModel: jest.fn().mockResolvedValue(undefined),
}));

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
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { isSelectableLocalCatalogModel } from '../src/features/model-picker/service';

beforeEach(() => {
  jest.clearAllMocks();
  mockInstalledModelIds = [];
  mockReadySystemModelIds = [];
  useChatAppModeStore.setState({ appMode: 'local' });
});

describe('the system-runtime row is not selectable for chat', () => {
  it('is the premise of both fixes below', () => {
    expect(isSelectableLocalCatalogModel(SYSTEM_RUNTIME_MODEL as never)).toBe(false);
    expect(isSelectableLocalCatalogModel(DOWNLOADABLE_MODEL as never)).toBe(true);
  });
});

describe('onboarding on a tier-1 (Apple Intelligence) device', () => {
  it('recommends a downloadable model instead of claiming a built-in one is ready', async () => {
    const { getByTestId, queryByText } = render(<OnboardingScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('hero-start-chatting-btn'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy();
    });

    // The CTA must offer a download, not "Continue" straight into a chat with
    // no usable model.
    await waitFor(() => {
      expect(getByTestId('device-tier-download-btn').props.accessibilityLabel).toBe(
        'Download model',
      );
    });
    expect(queryByText('Already on your device · Zero download')).toBeNull();
    expect(queryByText('A built-in local model is ready to use.')).toBeNull();
    expect(
      queryByText('Download one local model to start private chats on this device.'),
    ).toBeTruthy();
    // Nothing was finished — the user still has to complete the download.
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('chat tab download banner', () => {
  it('still offers the download when only an unselectable system model is "ready"', () => {
    mockReadySystemModelIds = [SYSTEM_RUNTIME_MODEL.id];
    const { getByTestId } = render(<ChatTabScreen />);
    expect(getByTestId('download-model-banner')).toBeTruthy();
  });

  it('still offers the download when the only installed id left the catalog', () => {
    mockInstalledModelIds = ['retired-model-id'];
    const { getByTestId } = render(<ChatTabScreen />);
    expect(getByTestId('download-model-banner')).toBeTruthy();
  });

  it('hides the banner once a picker-selectable model is installed', () => {
    mockInstalledModelIds = [DOWNLOADABLE_MODEL.id];
    const { queryByTestId } = render(<ChatTabScreen />);
    expect(queryByTestId('download-model-banner')).toBeNull();
  });
});
