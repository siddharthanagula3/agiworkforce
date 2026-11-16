/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { isAutoModeModelId } from '@agiworkforce/types';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const mockPush = jest.fn();
const mockFocusHandles = new Set<{ focus: () => void; blur: () => void }>();
const mockCreateConversation = jest.fn(async (_title?: string, _projectId?: string) => 'conv-1');
const mockSendMessage = jest.fn(async () => true);
let mockChatInputProps: {
  onSend?: (text: string) => Promise<boolean>;
  onOpenCompare?: () => void;
} = {};
let mockSheetProps: {
  onOpenSkills?: () => void;
  onOpenCloudAccess?: () => void;
  onStartComposerRoundTrip?: () => void;
} = {};
let mockModelPickerProps: {
  onSelect?: (modelId: string) => void;
  onOpenCloudAccess?: () => void;
} = {};
let mockUsageBannerAction: (() => void) | undefined;

jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: null }) }));

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: jest.fn(async () => {
    throw new Error('no usage fixture');
  }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    const latest = React.useRef(callback);
    latest.current = callback;
    React.useEffect(() => {
      let cleanup: void | (() => void) = latest.current();
      const handle = {
        focus: () => {
          cleanup = latest.current();
        },
        blur: () => {
          if (typeof cleanup === 'function') cleanup();
          cleanup = undefined;
        },
      };
      mockFocusHandles.add(handle);
      return () => {
        mockFocusHandles.delete(handle);
        handle.blur();
      };
    }, []);
  },
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(() => effect(), [effect]);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        loadConversations: jest.fn(),
        createConversation: mockCreateConversation,
        sendMessage: mockSendMessage,
        workMode: 'chat',
        setWorkMode: jest.fn(),
        beginImageGeneration: jest.fn(),
        completeImageGeneration: jest.fn(),
        failImageGeneration: jest.fn(),
        deleteMessage: jest.fn(),
        setPaywallError: jest.fn(),
        setSendError: jest.fn(),
        clearError: jest.fn(),
        clearUnscopedError: jest.fn(),
        discardUnsentConversation: jest.fn(async () => undefined),
        features: { imageGen: false },
      }),
    { getState: () => ({ error: null, messages: {} }) },
  ),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('@/src/features/projects/service', () => ({
  ...jest.requireActual('@/src/features/projects/service'),
  refreshCloudProjectDetails: jest.fn(async () => undefined),
}));

jest.mock('@/src/features/chat/components/ChatInput', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChatInput: React.forwardRef(function MockChatInput(
      props: { onSend?: (text: string) => Promise<boolean>; onOpenCompare?: () => void },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      mockChatInputProps = props;
      return <View testID="chat-input" />;
    }),
  };
});

jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const { View } = require('react-native');
  return {
    AddToChatSheet: (props: typeof mockSheetProps) => {
      mockSheetProps = props;
      return <View testID="add-to-chat-sheet" />;
    },
  };
});

jest.mock('@/src/features/chat/components/UsageLimitBanner', () => ({
  UsageLimitBanner: (props: { onAction: () => void }) => {
    mockUsageBannerAction = props.onAction;
    return null;
  },
}));

jest.mock('@/src/features/chat/components/ProjectSelectorBar', () => ({
  ProjectSelectorBar: () => null,
}));

jest.mock('@/src/features/chat/components/StyleSelector', () => ({
  StyleSelector: () => null,
}));

jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: (props: typeof mockModelPickerProps) => {
    mockModelPickerProps = props;
    return null;
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : Icon) });
});

jest.mock('@/src/features/model-picker/installStore', () => ({
  useModelInstallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ installedModelIds: [], readySystemModelIds: [], jobs: {} }),
  readyLocalModelIdOr: (fallback: string) => fallback,
  pickReadyLocalModelId: () => null,
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';
import { useAuthStore } from '../src/features/auth/store';
import {
  canAccessCloudModelForTier,
  DEFAULT_LOCAL_MODEL_ID,
} from '../src/features/model-picker/service';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { clearPostAuthIntent } from '../src/features/auth/services/postAuthIntent';
import { useProjectStore } from '../src/features/projects/store';
import {
  useCloudProjectStore,
  type CloudProjectDetails,
} from '../stores/projects/cloudProjectStore';
import { clearNewChatProjectScope } from '../stores/projects/newChatProjectScope';

const OWNER = 'round-trip-owner';
function proCloudModelExcept(...excluded: string[]): string {
  return requireMobileCloudModel(
    (model) =>
      !isAutoModeModelId(model.id) &&
      canAccessCloudModelForTier(model.id, 'pro') &&
      !excluded.includes(model.id),
    'distinct Mobile Cloud model on the Pro plan',
  ).id;
}
const OWN_MODEL_ID = proCloudModelExcept();
const PROJECT_MODEL_ID = proCloudModelExcept(OWN_MODEL_ID);
const PICKED_MODEL_ID = proCloudModelExcept(OWN_MODEL_ID, PROJECT_MODEL_ID);

const projectDetails = (defaultModelId: string | null): CloudProjectDetails => ({
  iconEmoji: null,
  accentColor: null,
  defaultModelId,
  conversationCount: null,
  knowledgeFileCount: null,
  usesGlobalMemory: true,
  usesAccountInstructions: true,
  usesAccountStyle: true,
  isOrgShared: false,
  sharedAccess: null,
});

function cloudProject(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'mobile' as const,
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    deletedAt: null,
  };
}

function enterCloudProject(defaultModelId: string | null = null) {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useCloudProjectStore.setState({
    projects: [cloudProject('project-kite', 'Kite'), cloudProject('project-reef', 'Reef')],
    details: {
      'project-kite': projectDetails(defaultModelId),
      'project-reef': projectDetails(null),
    },
    activeProjectId: 'project-kite',
  });
}

function enterLocalProject() {
  useChatAppModeStore.setState({ appMode: 'local' });
  useProjectStore.setState({
    projects: [
      {
        id: 'project-garden',
        name: 'Garden',
        description: '',
        instructions: '',
        createdAt: '2026-11-14T10:00:00.000Z',
        updatedAt: '2026-11-14T10:00:00.000Z',
      },
    ],
    activeProjectId: 'project-garden',
  });
}

function blurScreen() {
  act(() => {
    for (const handle of mockFocusHandles) handle.blur();
  });
}

function focusScreen() {
  act(() => {
    for (const handle of mockFocusHandles) handle.focus();
  });
}

describe('New chat started in a project', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatInputProps = {};
    mockSheetProps = {};
    mockModelPickerProps = {};
    mockUsageBannerAction = undefined;
    clearPostAuthIntent();
    __resetCloudAccountSessionForTests();
    activateCloudAccount(OWNER);
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro', grantedCapabilities: [] });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: OWNER });
    useModelStore.setState({
      selectedModel: OWN_MODEL_ID,
      selectedProvider: 'cloud_managed',
      newChatModels: { local: DEFAULT_LOCAL_MODEL_ID, cloud: OWN_MODEL_ID },
      newChatModelOwner: OWNER,
      conversationModelShown: false,
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
    useProjectStore.setState({ projects: [], activeProjectId: null });
    useCloudProjectStore.setState({ projects: [], details: {}, activeProjectId: null });
  });

  afterEach(() => {
    clearNewChatProjectScope();
  });

  const cloudRoundTrips: Array<[string, () => void, unknown]> = [
    ['Skills', () => mockSheetProps.onOpenSkills?.(), '/(app)/skills?returnTo=composer'],
    ['Compare', () => mockChatInputProps.onOpenCompare?.(), '/(app)/compare'],
    [
      'the sign-in step from the + sheet',
      () => mockSheetProps.onOpenCloudAccess?.(),
      expect.objectContaining({ pathname: '/(auth)/login' }),
    ],
    [
      'the sign-in step from the model list',
      () => mockModelPickerProps.onOpenCloudAccess?.(),
      expect.objectContaining({ pathname: '/(auth)/login' }),
    ],
    [
      'Study',
      () => {
        mockSheetProps.onStartComposerRoundTrip?.();
        mockPush('/(app)/study');
      },
      '/(app)/study',
    ],
    [
      'Connectors',
      () => {
        mockSheetProps.onStartComposerRoundTrip?.();
        mockPush('/(app)/connectors');
      },
      '/(app)/connectors',
    ],
    ['the usage limit action', () => mockUsageBannerAction?.(), '/(app)/settings/cloud-billing'],
  ];

  it.each(cloudRoundTrips)(
    'keeps the project after a trip to %s that starts in the composer',
    (_name, open, route) => {
      enterCloudProject();
      const screen = render(<ChatTabScreen />);
      expect(screen.getByText('In Kite')).toBeTruthy();

      act(() => open());
      expect(mockPush).toHaveBeenCalledWith(route);
      blurScreen();

      expect(useCloudProjectStore.getState().activeProjectId).toBeNull();

      focusScreen();

      expect(useCloudProjectStore.getState().activeProjectId).toBe('project-kite');
      expect(screen.getByText('In Kite')).toBeTruthy();
    },
  );

  it('keeps a local project after a trip to the Download model banner', () => {
    enterLocalProject();
    const screen = render(<ChatTabScreen />);
    expect(screen.getByText('In Garden')).toBeTruthy();

    fireEvent.press(screen.getByTestId('download-model-banner'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/models');
    blurScreen();
    expect(useProjectStore.getState().activeProjectId).toBeNull();
    focusScreen();

    expect(useProjectStore.getState().activeProjectId).toBe('project-garden');
    expect(screen.getByText('In Garden')).toBeTruthy();
  });

  it('sends the first message into the project after a trip to Skills', async () => {
    enterCloudProject();
    let projectAtCreate: string | null = 'unset';
    mockCreateConversation.mockImplementationOnce(async () => {
      projectAtCreate = useCloudProjectStore.getState().activeProjectId;
      return 'conv-1';
    });
    render(<ChatTabScreen />);

    act(() => mockSheetProps.onOpenSkills?.());
    blurScreen();
    focusScreen();
    await act(async () => {
      await mockChatInputProps.onSend?.('plan the spring beds');
    });

    expect(projectAtCreate).toBe('project-kite');
  });

  it('clears the project when the person leaves for a screen the composer did not open', () => {
    enterCloudProject();
    const screen = render(<ChatTabScreen />);

    blurScreen();
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    focusScreen();

    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    expect(screen.queryByTestId('chat.new-chat.project')).toBeNull();
  });

  it('clears the project when the first message opens the new chat', async () => {
    enterCloudProject();
    const screen = render(<ChatTabScreen />);

    await act(async () => {
      await mockChatInputProps.onSend?.('plan the spring beds');
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
    blurScreen();
    focusScreen();

    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    expect(screen.queryByTestId('chat.new-chat.project')).toBeNull();
  });

  it('does not bring the project back after New chat or an open chat ends the trip', () => {
    enterCloudProject();
    const screen = render(<ChatTabScreen />);

    act(() => mockSheetProps.onOpenSkills?.());
    blurScreen();
    act(() => clearNewChatProjectScope());
    focusScreen();

    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    expect(screen.queryByTestId('chat.new-chat.project')).toBeNull();
  });

  it('keeps the project chosen during the trip instead of the one it left', () => {
    enterCloudProject();
    const screen = render(<ChatTabScreen />);

    act(() => mockSheetProps.onOpenSkills?.());
    blurScreen();
    act(() => useCloudProjectStore.getState().setActiveCloudProject('project-reef'));
    focusScreen();

    expect(useCloudProjectStore.getState().activeProjectId).toBe('project-reef');
    expect(screen.getByText('In Reef')).toBeTruthy();
  });

  it('does not bring a Cloud project back after the account changed during the trip', () => {
    enterCloudProject();
    const screen = render(<ChatTabScreen />);

    act(() => mockSheetProps.onOpenCloudAccess?.());
    blurScreen();
    act(() => {
      activateCloudAccount('another-owner');
    });
    focusScreen();

    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    expect(screen.queryByTestId('chat.new-chat.project')).toBeNull();
  });

  it('clears the project when the screen goes away', () => {
    enterCloudProject();
    const screen = render(<ChatTabScreen />);

    act(() => mockSheetProps.onOpenSkills?.());
    screen.unmount();

    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    const next = render(<ChatTabScreen />);
    expect(next.queryByTestId('chat.new-chat.project')).toBeNull();
  });
});

describe('Model of a new chat started in a Cloud project', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModelPickerProps = {};
    mockSheetProps = {};
    __resetCloudAccountSessionForTests();
    activateCloudAccount(OWNER);
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro', grantedCapabilities: [] });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: OWNER });
    useModelStore.setState({
      selectedModel: OWN_MODEL_ID,
      selectedProvider: 'cloud_managed',
      newChatModels: { local: DEFAULT_LOCAL_MODEL_ID, cloud: OWN_MODEL_ID },
      newChatModelOwner: OWNER,
      conversationModelShown: false,
      recentModels: [],
      favorites: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},
    });
    useProjectStore.setState({ projects: [], activeProjectId: null });
    useCloudProjectStore.setState({ projects: [], details: {}, activeProjectId: null });
  });

  afterEach(() => {
    clearNewChatProjectScope();
  });

  it('uses the project model in the project and gives the person their own model back after leaving', () => {
    enterCloudProject(PROJECT_MODEL_ID);
    render(<ChatTabScreen />);

    expect(useModelStore.getState().selectedModel).toBe(PROJECT_MODEL_ID);
    expect(useModelStore.getState().newChatModels.cloud).toBe(OWN_MODEL_ID);

    blurScreen();
    focusScreen();

    expect(useModelStore.getState().selectedModel).toBe(OWN_MODEL_ID);
    expect(useModelStore.getState().newChatModels.cloud).toBe(OWN_MODEL_ID);
  });

  it('gives the person their own model back when they start the chat outside the project', () => {
    enterCloudProject(PROJECT_MODEL_ID);
    const screen = render(<ChatTabScreen />);
    expect(useModelStore.getState().selectedModel).toBe(PROJECT_MODEL_ID);

    fireEvent.press(screen.getByLabelText('Start this chat outside Kite'));

    expect(useModelStore.getState().selectedModel).toBe(OWN_MODEL_ID);
  });

  it('drops the project model when the person switches to a project without one', () => {
    enterCloudProject(PROJECT_MODEL_ID);
    render(<ChatTabScreen />);

    act(() => useCloudProjectStore.getState().setActiveCloudProject('project-reef'));

    expect(useModelStore.getState().selectedModel).toBe(OWN_MODEL_ID);
  });

  it('keeps a model picked inside the project to the project and across a composer trip', () => {
    enterCloudProject(PROJECT_MODEL_ID);
    render(<ChatTabScreen />);

    act(() => mockModelPickerProps.onSelect?.(PICKED_MODEL_ID));
    expect(useModelStore.getState().selectedModel).toBe(PICKED_MODEL_ID);
    expect(useModelStore.getState().newChatModels.cloud).toBe(OWN_MODEL_ID);

    act(() => mockSheetProps.onOpenSkills?.());
    blurScreen();
    focusScreen();
    expect(useModelStore.getState().selectedModel).toBe(PICKED_MODEL_ID);

    blurScreen();
    focusScreen();
    expect(useModelStore.getState().selectedModel).toBe(OWN_MODEL_ID);
  });

  it('remembers a model picked outside a project for later new chats', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    render(<ChatTabScreen />);

    act(() => mockModelPickerProps.onSelect?.(PICKED_MODEL_ID));

    expect(useModelStore.getState().selectedModel).toBe(PICKED_MODEL_ID);
    expect(useModelStore.getState().newChatModels.cloud).toBe(PICKED_MODEL_ID);
  });
});
