/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockCreateConversation = jest.fn();
const mockSendMessage = jest.fn();
const mockResolveLocalModelRef = jest.fn();
let mockComposerSend: (text: string) => Promise<unknown>;
jest.mock('@/src/features/model-picker/localModelRuntime', () => ({
  ...jest.requireActual('@/src/features/model-picker/localModelRuntime'),
  resolveLocalModelRef: () => mockResolveLocalModelRef(),
}));

jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: null }) }));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
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
  ...jest.requireActual('@agiworkforce/compliance'),
  composeShortFirstRunDisclosure: jest.fn().mockReturnValue({
    title: 'Before you continue',
    summary: 'On-device.',
    article50_1: 'Article 50(1)',
    sourceUrl: 'https://eur-lex.europa.eu',
    acceptLabel: 'Continue',
    declineLabel: 'Not now',
    detailsLabel: 'Why we show this',
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

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      loadConversations: jest.fn(),
      createConversation: mockCreateConversation,
      sendMessage: mockSendMessage,
      beginImageGeneration: jest.fn(),
      completeImageGeneration: jest.fn(),
      failImageGeneration: jest.fn(),
      deleteMessage: jest.fn(),
      setPaywallError: jest.fn(),
      clearError: jest.fn(),
      clearUnscopedError: jest.fn(),
      discardUnsentConversation: jest.fn(async () => undefined),
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
      props: { onSend: (text: string) => Promise<unknown> },
      ref: React.Ref<unknown>,
    ) {
      mockComposerSend = props.onSend;
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

import OnboardingScreen from '../app/(public)/onboarding';
import ChatTabScreen from '../app/(app)/(tabs)/chat';
import {
  detectCapabilities,
  getDefaultModel,
  getSystemModelForTier1Runtime,
} from '@agiworkforce/local-llm';
import { storage } from '../lib/mmkv';
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

async function skipAboutYou(getByTestId: (id: string) => unknown) {
  await waitFor(() => expect(getByTestId('onboarding-about-you-screen')).toBeTruthy());
  await act(async () => {
    fireEvent.press(getByTestId('about-you-skip-btn') as never);
    await Promise.resolve();
  });
}

describe('onboarding on a tier-1 (Apple Intelligence) device', () => {
  it('recommends the detected built-in model without a download', async () => {
    const { getByTestId, queryByText } = render(<OnboardingScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('hero-start-chatting-btn'));
      await Promise.resolve();
    });
    await skipAboutYou(getByTestId);
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
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

it('lets a new Local user defer the model download', async () => {
  jest.mocked(detectCapabilities).mockResolvedValueOnce({
    totalRAMMB: 4096,
    tier1Available: false,
    tier1Runtime: null,
    tier1Status: 'unavailable',
    tier2Available: true,
    tier3Available: true,
    osVersion: '14.0',
    thermalThrottled: false,
  });
  const { getByTestId } = render(<OnboardingScreen />);
  await act(async () => {
    fireEvent.press(getByTestId('hero-start-chatting-btn'));
    await Promise.resolve();
  });
  await skipAboutYou(getByTestId);
  await waitFor(() => expect(getByTestId('device-tier-skip-btn')).toBeTruthy());

  fireEvent.press(getByTestId('device-tier-skip-btn'));

  expect(storage.set).toHaveBeenCalledWith('onboarding-done', 'true');
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(app)' });
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

  it('holds the download banner to the same reading column as the composer', () => {
    mockInstalledModelIds = [SYNTHETIC_RETIRED_MODEL_ID];
    const { getByTestId } = render(<ChatTabScreen />);

    expect(
      StyleSheet.flatten(getByTestId('download-model-banner.column').props.style),
    ).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      marginTop: 16,
    });
  });

  it('keeps the first draft when there is no runnable model and opens model setup on request', async () => {
    mockResolveLocalModelRef.mockRejectedValueOnce(new Error('Model is not downloaded'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    try {
      render(<ChatTabScreen />);

      await act(async () => {
        expect(await mockComposerSend('Keep this draft')).toBe(false);
      });
      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      const [title, detail, buttons] = alert.mock.calls.at(-1) ?? [];
      expect(title).toBe('Download a model to chat');
      expect(detail).toContain('Your draft stays here');
      expect(mockPush).not.toHaveBeenCalled();
      buttons?.find((button) => button.text === 'Open Models')?.onPress?.();
      expect(mockPush).toHaveBeenCalledWith('/(app)/models');
    } finally {
      alert.mockRestore();
    }
  });

  it('starts the draft when the runtime confirms readiness before the model list updates', async () => {
    mockResolveLocalModelRef.mockResolvedValueOnce({ modelId: DOWNLOADABLE_MODEL.id });
    mockCreateConversation.mockResolvedValueOnce('local-ready');
    mockSendMessage.mockImplementationOnce((_id, _text, _model, _attachments, options) => {
      options.onAccepted();
      return Promise.resolve(true);
    });
    render(<ChatTabScreen />);

    await act(async () => {
      expect(await mockComposerSend('Use the ready model')).toEqual({
        openedConversationId: 'local-ready',
      });
    });

    expect(mockCreateConversation).toHaveBeenCalledWith('Use the ready model');
    expect(mockSendMessage).toHaveBeenCalledWith(
      'local-ready',
      'Use the ready model',
      DOWNLOADABLE_MODEL.id,
      undefined,
      expect.objectContaining({ onAccepted: expect.any(Function) }),
    );
  });

  it('hides the banner once a picker-selectable model is installed', () => {
    mockInstalledModelIds = [DOWNLOADABLE_MODEL.id];
    const { queryByTestId } = render(<ChatTabScreen />);
    expect(queryByTestId('download-model-banner')).toBeNull();
  });
});
