/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

let mockClerkUser: { firstName?: string | null; fullName?: string | null } | null = null;
let mockParams: Record<string, string> = {};
let mockDrawerCanGoBack = false;
const mockBack = jest.fn();
const mockDrawerBack = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockOnSend: ((text: string) => unknown) | undefined;
const mockStopSpeaking = jest.fn(async () => undefined);
const mockOpenDrawer = jest.fn();
let mockOnMultilineChange: ((multiline: boolean) => void) | undefined;

jest.mock('@clerk/expo', () => ({
  useSession: () => ({ session: null }),
  useUser: () => ({ user: mockClerkUser }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
    setParams: mockSetParams,
  }),
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({
    getParent: () => ({ canGoBack: () => mockDrawerCanGoBack, goBack: mockDrawerBack }),
  }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
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

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: (...args: unknown[]) => mockOpenDrawer(...args),
}));

jest.mock('@/src/features/voice/hooks/useVoiceOutputOwner', () => ({
  useVoiceOutputOwner: () => ({ stop: mockStopSpeaking, dispose: jest.fn(async () => undefined) }),
}));

jest.mock('@/src/features/chat/components/ChatInput', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChatInput: React.forwardRef(function MockChatInput(
      props: {
        onMultilineChange?: (multiline: boolean) => void;
        onSend?: (text: string) => unknown;
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ addAttachments: jest.fn() }));
      mockOnMultilineChange = props.onMultilineChange;
      mockOnSend = props.onSend;
      return <View testID="chat-input" />;
    }),
  };
});

jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const { View } = require('react-native');
  return { AddToChatSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/ProjectSelectorBar', () => {
  const { View } = require('react-native');
  return { ProjectSelectorBar: () => <View /> };
});

jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => {
  const { View } = require('react-native');
  return { ModelPickerSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/StyleSelector', () => {
  const { View } = require('react-native');
  return { StyleSelector: () => <View /> };
});

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
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

jest.mock('@/services/llmGate', () => ({
  ...jest.requireActual('@/services/llmGate'),
  ensureCloudSendConsent: async () => undefined,
}));

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: jest.fn((cb) => cb()),
    rehydrateWhenMmkvReady: jest.fn((store) => {
      if (store?.persist?.rehydrate) store.persist.rehydrate();
    }),
    mmkvStorage: {
      getItem: jest.fn().mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
      clearAll: () => values.clear(),
    },
  };
});

import ChatTabScreen from '../app/(app)/(tabs)/chat';
import { resolveGreetingHeadline } from '@agiworkforce/utils/greeting';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { useAuthStore } from '../src/features/auth/store';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../src/features/model-picker/store';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import { getModelMetadataById } from '@agiworkforce/types';
import * as mediaModeActions from '../src/features/chat/actions/mediaMode';
import {
  requireLiveVideoModelId,
  requireMediaSlotModel,
  requireMobileCloudModel,
} from '../test-utils/modelFixtures';

const AFTERNOON = new Date(2026, 10, 16, 14, 0, 0);
const EVENING = new Date(2026, 10, 16, 20, 0, 0);

function setClock(now: Date): void {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
}

const personalization = (partial: Record<string, unknown>) => ({
  fullName: '',
  nickname: '',
  nameOptedOut: false,
  ...partial,
});

function seedPersonalization(mode: 'local' | 'cloud', partial: Record<string, unknown>): void {
  const store = mode === 'cloud' ? useCloudSettingsStore : useLocalSettingsStore;
  act(() => {
    store.setState({
      personalization: { ...store.getState().personalization, ...personalization(partial) },
    } as never);
  });
}

const greetingText = () => {
  const node = screen.getByTestId('chat.new-chat.greeting');
  return [node.props.children].flat().join('');
};

describe('the greeting on the new chat screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setClock(AFTERNOON);
    mockClerkUser = null;
    mockParams = {};
    mockDrawerCanGoBack = false;
    mockOnMultilineChange = undefined;
    (jest.requireMock('@/lib/mmkv') as { storage: { clearAll: () => void } }).storage.clearAll();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max', billingTier: 'max' });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'greeting-owner',
    });
    useChatViewStore.setState({ mediaMode: 'text', selectedMediaModel: {} });
    useCloudProjectStore.setState({ projects: [], activeProjectId: null });
    seedPersonalization('cloud', {});
    seedPersonalization('local', {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('with the name', () => {
    it('greets a Cloud account by its nickname', () => {
      seedPersonalization('cloud', { nickname: 'Ada', fullName: 'Ada Lovelace' });
      render(<ChatTabScreen />);
      expect(greetingText()).toBe('Afternoon, Ada');
    });

    it('greets a Cloud account by the first word of the full name when there is no nickname', () => {
      seedPersonalization('cloud', { fullName: 'Grace Hopper' });
      render(<ChatTabScreen />);
      expect(greetingText()).toBe('Afternoon, Grace');
    });

    it('greets a Cloud account by the Clerk first name when nothing else is set', () => {
      mockClerkUser = { firstName: 'Linus', fullName: 'Linus Torvalds' };
      render(<ChatTabScreen />);
      expect(greetingText()).toBe('Afternoon, Linus');
    });

    it('greets Local by the Local nickname and never by the Clerk name', () => {
      useChatAppModeStore.setState({ appMode: 'local' });
      mockClerkUser = { firstName: 'Linus', fullName: 'Linus Torvalds' };
      render(<ChatTabScreen />);
      expect(greetingText()).toBe('Afternoon');

      seedPersonalization('local', { nickname: 'Bo' });
      expect(greetingText()).toBe('Afternoon, Bo');
    });

    it('leaves the Cloud name out of a Local greeting', () => {
      useChatAppModeStore.setState({ appMode: 'local' });
      seedPersonalization('cloud', { nickname: 'Ada' });
      render(<ChatTabScreen />);
      expect(greetingText()).toBe('Afternoon');
    });
  });

  describe('without the name', () => {
    it('gives the plain time of day line when the name is empty', () => {
      render(<ChatTabScreen />);
      expect(greetingText()).toBe('Afternoon');
    });

    it('gives the plain time of day line when the person opted out of the name', () => {
      mockClerkUser = { firstName: 'Linus' };
      seedPersonalization('cloud', { nickname: 'Ada', nameOptedOut: true });
      render(<ChatTabScreen />);
      expect(greetingText()).toBe('Afternoon');
    });
  });

  it('keeps one line with a tail ellipsis and the 34 point line height for a long name', () => {
    seedPersonalization('cloud', { nickname: 'Bartholomew-Maximilian-Featherstonehaugh' });
    render(<ChatTabScreen />);
    const greeting = screen.getByTestId('chat.new-chat.greeting');
    expect(greeting.props.numberOfLines).toBe(1);
    expect(greeting.props.ellipsizeMode).toBe('tail');
    expect(greeting).toHaveStyle({ lineHeight: 34, textAlign: 'center', width: '100%' });
    expect(greetingText()).toBe('Afternoon, Bartholomew-Maximilian-Featherstonehaugh');
  });

  it('shrinks the line to fit instead of cutting a long variant at the largest text size', () => {
    render(<ChatTabScreen />);
    const greeting = screen.getByTestId('chat.new-chat.greeting');
    expect(greeting.props.adjustsFontSizeToFit).toBe(true);
    expect(greeting.props.minimumFontScale).toBeGreaterThan(0);
    expect(greeting.props.minimumFontScale).toBeLessThan(1);
  });

  describe('the time of day', () => {
    let appStateHandlers: Array<(state: string) => void>;

    beforeEach(() => {
      appStateHandlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((
        _type: string,
        handler: (state: string) => void,
      ) => {
        appStateHandlers.push(handler);
        return { remove: jest.fn() };
      }) as never);
    });

    const returnToForeground = () => {
      act(() => {
        for (const handler of appStateHandlers) handler('active');
      });
    };

    it('stays fixed while the screen is open and the person types', () => {
      render(<ChatTabScreen />);
      const afternoon = greetingText();

      act(() => {
        jest.setSystemTime(EVENING);
      });
      seedPersonalization('cloud', { nickname: 'Bo' });

      expect(greetingText()).toBe(`${afternoon}, Bo`);
    });

    it('moves to the new part of the day when the app comes back to the foreground', () => {
      render(<ChatTabScreen />);
      const afternoon = greetingText();
      expect(afternoon).toBe(resolveGreetingHeadline(AFTERNOON, ''));

      act(() => {
        jest.setSystemTime(EVENING);
      });
      returnToForeground();

      expect(greetingText()).toBe(resolveGreetingHeadline(EVENING, ''));
      expect(greetingText()).not.toBe(afternoon);
    });

    it('ignores the app going to the background', () => {
      render(<ChatTabScreen />);
      const afternoon = greetingText();

      act(() => {
        jest.setSystemTime(EVENING);
        for (const handler of appStateHandlers) handler('background');
      });

      expect(greetingText()).toBe(afternoon);
    });
  });
});

describe('the image and video empty state on the new chat screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setClock(AFTERNOON);
    mockClerkUser = null;
    mockParams = {};
    mockDrawerCanGoBack = false;
    mockOnMultilineChange = undefined;
    (jest.requireMock('@/lib/mmkv') as { storage: { clearAll: () => void } }).storage.clearAll();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max', billingTier: 'max' });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'greeting-owner',
    });
    useChatViewStore.setState({ mediaMode: 'text', selectedMediaModel: {} });
    useCloudProjectStore.setState({ projects: [], activeProjectId: null });
    seedPersonalization('cloud', { nickname: 'Ada' });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('names the image model under a Create an image heading', () => {
    useChatViewStore.setState({ mediaMode: 'image' });
    render(<ChatTabScreen />);

    expect(greetingText()).toBe('Create an image');
    expect(screen.getByTestId('chat.new-chat.media-model').props.children).toBe(
      `with ${requireMediaSlotModel('image').name}`,
    );
    expect(screen.queryByText(/Afternoon/)).toBeNull();
  });

  it('follows the image model picked in the sheet', () => {
    useChatViewStore.setState({ mediaMode: 'image' });
    render(<ChatTabScreen />);
    const imageModelIds = mediaModeActions.listMediaModels('image');
    const other = imageModelIds.find((id) => id !== mediaModeActions.resolveMediaModelId('image'));
    if (!other) throw new Error('Catalog has a single executable image model');

    act(() => {
      useChatViewStore.setState({ selectedMediaModel: { image: other } });
    });

    expect(screen.getByTestId('chat.new-chat.media-model').props.children).toBe(
      `with ${getModelMetadataById(other)?.name}`,
    );
  });

  it('shows Create a video with the video model for video mode', () => {
    const videoModelId = requireLiveVideoModelId();
    useChatViewStore.setState({
      mediaMode: 'video',
      selectedMediaModel: { video: videoModelId },
    });
    render(<ChatTabScreen />);

    expect(greetingText()).toBe('Create a video');
    expect(screen.getByTestId('chat.new-chat.media-model').props.children).toBe(
      `with ${getModelMetadataById(videoModelId)?.name}`,
    );
  });

  it('shows the heading alone when the model has no metadata', () => {
    jest.spyOn(mediaModeActions, 'resolveMediaModelId').mockReturnValue('unlisted-model-id');
    useChatViewStore.setState({ mediaMode: 'image' });
    render(<ChatTabScreen />);

    expect(greetingText()).toBe('Create an image');
    expect(screen.queryByTestId('chat.new-chat.media-model')).toBeNull();
    expect(screen.queryByText(/unlisted-model-id/)).toBeNull();
  });

  it('brings the greeting back when the mode returns to text', () => {
    useChatViewStore.setState({ mediaMode: 'image' });
    render(<ChatTabScreen />);
    expect(greetingText()).toBe('Create an image');

    act(() => {
      useChatViewStore.setState({ mediaMode: 'text' });
    });

    expect(greetingText()).toBe('Afternoon, Ada');
    expect(screen.queryByTestId('chat.new-chat.media-model')).toBeNull();
  });

  it('shows neither while the composer is multiline', () => {
    useChatViewStore.setState({ mediaMode: 'image' });
    render(<ChatTabScreen />);

    act(() => mockOnMultilineChange?.(true));

    expect(screen.queryByTestId('chat.new-chat.greeting')).toBeNull();
    expect(screen.queryByTestId('chat.new-chat.media-model')).toBeNull();
  });
});

describe('the left header control of the new chat screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setClock(AFTERNOON);
    mockClerkUser = null;
    mockParams = {};
    mockDrawerCanGoBack = true;
    (jest.requireMock('@/lib/mmkv') as { storage: { clearAll: () => void } }).storage.clearAll();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max', billingTier: 'max' });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'greeting-owner',
    });
    useChatViewStore.setState({ mediaMode: 'text', selectedMediaModel: {} });
    useCloudProjectStore.setState({
      projects: [
        {
          id: 'project-garden',
          name: 'Garden',
          description: null,
          instructions: null,
          color: null,
          isArchived: false,
          metadata: null,
          source: 'mobile',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
          deletedAt: null,
        },
      ],
      activeProjectId: 'project-garden',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is the drawer button when the chat did not start from a project', () => {
    render(<ChatTabScreen />);

    expect(screen.queryByLabelText('Back to Garden')).toBeNull();
    fireEvent.press(screen.getByLabelText('Open navigation drawer'));
    expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('is a 44 point back chevron named for the project when the chat started from a project', () => {
    mockParams = { from: 'project' };
    render(<ChatTabScreen />);

    const back = screen.getByLabelText('Back to Garden');
    expect(back).toHaveStyle({ width: 44, height: 44 });
    expect(screen.queryByLabelText('Open navigation drawer')).toBeNull();

    fireEvent.press(back);

    expect(mockStopSpeaking).toHaveBeenCalledTimes(1);
    expect(mockDrawerBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('keeps the drawer button when there is nothing to go back to', () => {
    mockParams = { from: 'project' };
    mockDrawerCanGoBack = false;
    render(<ChatTabScreen />);

    expect(screen.queryByLabelText('Back to Garden')).toBeNull();
    expect(screen.getByLabelText('Open navigation drawer')).toBeTruthy();
  });

  describe('once the first message opens the new conversation', () => {
    const originalCreate = useChatStore.getState().createConversation;
    const originalSend = useChatStore.getState().sendMessage;

    beforeEach(() => {
      useChatStore.setState({
        createConversation: jest.fn(async () => 'conv-1'),
        sendMessage: jest.fn(async () => true),
      } as never);
      useModelStore.setState({
        selectedModel: requireMobileCloudModel().id,
        selectedProvider: 'anthropic',
      });
    });

    afterEach(() => {
      useChatStore.setState({
        createConversation: originalCreate,
        sendMessage: originalSend,
      } as never);
    });

    it('drops the project origin so a later return does not bring the back chevron back', async () => {
      mockParams = { from: 'project' };
      render(<ChatTabScreen />);

      await act(async () => {
        await mockOnSend?.('hello');
      });

      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
      expect(mockSetParams).toHaveBeenCalledWith({ from: undefined });
    });

    it('leaves the params alone when the chat did not start from a project', async () => {
      render(<ChatTabScreen />);

      await act(async () => {
        await mockOnSend?.('hello');
      });

      expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
      expect(mockSetParams).not.toHaveBeenCalled();
    });
  });

  it('still goes back when the project is gone', () => {
    mockParams = { from: 'project' };
    act(() => {
      useCloudProjectStore.setState({ projects: [], activeProjectId: null });
    });
    render(<ChatTabScreen />);

    fireEvent.press(screen.getByLabelText('Back to project'));

    expect(mockDrawerBack).toHaveBeenCalledTimes(1);
  });
});
