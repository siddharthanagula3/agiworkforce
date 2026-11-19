/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));
import React from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet } from 'react-native';
import { act, render, fireEvent, within } from '@testing-library/react-native';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockCloseDrawer = jest.fn();
let mockPathname = '/chat';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  usePathname: () => mockPathname,
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

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

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaView: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : icon),
    },
  );
});

let mockCloudAccount: { ownerId: string; epoch: number } | null | undefined;
jest.mock('../src/features/auth/services/cloudAccountSession', () => {
  const actual = jest.requireActual('../src/features/auth/services/cloudAccountSession');
  return {
    ...actual,
    captureCloudAccountEpoch: () =>
      mockCloudAccount === undefined ? actual.captureCloudAccountEpoch() : mockCloudAccount,
  };
});

jest.mock('../src/features/chat/components/ModeSwitchModal', () => {
  const { View, Pressable } = require('react-native');
  return {
    ModeSwitchModal: ({
      visible,
      onConfirm,
      onCancel,
    }: {
      visible: boolean;
      onConfirm?: () => void;
      onCancel?: () => void;
    }) =>
      visible ? (
        <View testID="mode-switch-modal">
          <Pressable testID="mode-switch-confirm" onPress={onConfirm} />
          <Pressable testID="mode-switch-cancel" onPress={onCancel} />
        </View>
      ) : null,
  };
});

import { resources } from '@agiworkforce/i18n';
import i18n from '../src/i18n';
import { DrawerContent } from '../src/features/drawer/components/DrawerContent';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/features/chat/components/WorkModeSwitch';
import { useChatStore } from '../stores/chatStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useAuthStore } from '../src/features/auth/store';
import { useProjectStore } from '../src/features/projects/store';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '../src/features/model-picker/service';
import { useSettingsStore } from '../stores/settingsStore';
import { useTierStore } from '../src/features/billing/store';
import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';
import { useFreeQuotaCatalogueStore } from '../src/features/model-picker/freeQuotaCatalogue';
import { listMediaModels } from '../src/features/chat/actions/mediaMode';
import {
  clearPostAuthIntent,
  CLOUD_CHAT_POST_AUTH_INTENT,
  POST_AUTH_INTENT_PARAM,
} from '../src/features/auth/services/postAuthIntent';

function signInForImages(tier: 'pro' | 'free') {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'images-owner' });
  mockCloudAccount = { ownerId: 'images-owner', epoch: 1 };
  useTierStore.setState(
    tier === 'pro'
      ? { tier: 'pro', grantedCapabilities: ['canUseImages'] }
      : { tier: 'free', grantedCapabilities: [] },
  );
}

function freeImagesLeft(remainingToday: number) {
  const key = listMediaModels('image')[0]!;
  useFreeQuotaCatalogueStore.setState({
    account: { ownerId: 'images-owner', epoch: 1 },
    catalogue: {
      issuer: 'provider',
      observedOn: '2026-11-16',
      evidenceUrl: 'https://example.com/free',
      reportedEligible: 1,
      reportedUnavailable: 0,
      models: [
        {
          key,
          displayName: 'Free image model',
          providerModelId: key,
          category: 'image',
          limit: null,
          unit: 'images',
          consumedApproximate: null,
          expiresOn: null,
          status: 'ready',
        },
      ],
      limitedOffer: [
        { category: 'image', dailyCap: 3, remainingToday, resetsAt: '2026-11-17T00:00:00Z' },
      ],
    },
  });
}

function renderDrawer() {
  return render(<DrawerContent {...({ navigation: { closeDrawer: mockCloseDrawer } } as never)} />);
}

describe('DrawerContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/chat';
    mockCloudAccount = undefined;
    useTierStore.setState({ grantedCapabilities: [] });
    useFreeQuotaCatalogueStore.setState({
      account: null,
      catalogue: null,
      loading: false,
      error: null,
      refresh: jest.fn(async () => undefined),
    });

    useChatCloudMessageStore.setState({
      conversations: [
        {
          id: 'conv-cloud',
          title: 'Cloud Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 2,
          pinned: false,
          model: DEFAULT_CLOUD_MODEL_ID,
          provider: 'cloud_managed',
          executionMode: 'cloud',
        },
      ],
    } as never);

    useChatStore.setState({
      conversations: [
        {
          id: 'conv-1',
          title: 'First Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 3,
          pinned: false,
        },
        {
          id: 'conv-2',
          title: 'Second Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 1,
          pinned: false,
          executionMode: 'local',
        },
      ],
      messages: {},
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      isLoadingConversations: false,
      isLoadingMessages: false,
      error: null,
    });

    useProjectStore.setState({
      projects: [
        {
          id: 'proj-1',
          name: 'Launch demo',
          description: '',
          instructions: '',
          sources: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      activeProjectId: null,
    });

    useAuthStore.setState({
      isLoading: false,
      isInitialized: true,
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
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      recentModels: [],
      favorites: [],
    } as never);
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({
      listArrangement: 'by-project',
      sidePanelMoreOpen: false,
      sidePanelProjectsFolded: false,
    });
    useCloudUsageStore.getState().clear();
    clearPostAuthIntent();
  });

  it('carries the Local/Cloud toggle at the top of the sidebar', () => {
    const { getByTestId } = renderDrawer();

    expect(getByTestId('chat.mode-toggle')).toBeTruthy();
    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(false);
  });

  it('switches to Cloud from the sidebar and opens a new Cloud chat', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'pro' });
    const { getByTestId } = renderDrawer();

    fireEvent.press(getByTestId('chat.mode-toggle.cloud'));

    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(useModelStore.getState().selectedModel).toBe(
      getDefaultCloudModelIdForTier('pro') ?? DEFAULT_CLOUD_MODEL_ID,
    );
    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/chat' });
  });

  it('sends a signed-out Cloud tap to sign-in and stays in Local Mode', () => {
    const { getByTestId } = renderDrawer();

    fireEvent.press(getByTestId('chat.mode-toggle.cloud'));

    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT },
    });
    expect(mockPush).not.toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/chat' });
  });

  it('switches back to Local from the sidebar and drops Work', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useChatStore.getState().setWorkMode('agiwork');
    const { getByTestId } = renderDrawer();

    fireEvent.press(getByTestId('chat.mode-toggle.local'));

    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useChatStore.getState().workMode).toBe('chat');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/chat' });
  });

  it('puts the symbol above the Local and Cloud switch', () => {
    const { toJSON } = renderDrawer();

    const tree = JSON.stringify(toJSON());
    const symbolAt = tree.indexOf('drawer.brand-symbol');
    const switchAt = tree.indexOf('chat.mode-toggle');
    expect(symbolAt).toBeGreaterThan(-1);
    expect(switchAt).toBeGreaterThan(symbolAt);
  });

  it('renders the AGI mobile drawer structure', () => {
    const { getByText, getByTestId, getAllByText, queryByLabelText, queryByText } = renderDrawer();

    expect(getByTestId('drawer.brand-symbol')).toBeTruthy();
    expect(queryByText('AGI')).toBeNull();
    expect(getAllByText('Projects').length).toBeGreaterThan(0);
    expect(queryByText('Chats')).toBeNull();
    expect(getByText('Library')).toBeTruthy();
    expect(queryByText('Remote')).toBeNull();
    expect(queryByText('Artifacts')).toBeNull();
    expect(queryByText('AGI Agent')).toBeNull();
    expect(getByText('Recents')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('New chat')).toBeTruthy();
    expect(queryByLabelText('Open profile')).toBeNull();
    expect(queryByText('Voice')).toBeNull();
    expect(queryByText('Camera')).toBeNull();
    expect(queryByText('Scan')).toBeNull();
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('shows a short list in Cloud and folds the rest under More', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
    const { toJSON, getByLabelText, queryByLabelText } = renderDrawer();
    const order = (labels: string[]) => {
      const tree = JSON.stringify(toJSON());
      return labels.map((label) => tree.indexOf(`"accessibilityLabel":"${label}"`));
    };
    const ascending = (positions: number[]) =>
      positions.every((position) => position >= 0) &&
      [...positions].sort((a, b) => a - b).join() === positions.join();

    expect(
      ascending(order(['New chat', 'Projects', 'Library', 'AGI Code', 'Schedules', 'More'])),
    ).toBe(true);
    for (const hidden of ['Remote', 'AGI Work', 'Sites', 'Agents', 'Reports']) {
      expect(queryByLabelText(hidden)).toBeNull();
    }
    expect(getByLabelText('More').props.accessibilityState.expanded).toBe(false);

    fireEvent.press(getByLabelText('More'));

    expect(ascending(order(['Schedules', 'Less', 'AGI Work', 'Sites', 'Agents', 'Reports']))).toBe(
      true,
    );
    expect(getByLabelText('Less').props.accessibilityState.expanded).toBe(true);
    expect(useSettingsStore.getState().sidePanelMoreOpen).toBe(true);

    fireEvent.press(getByLabelText('Less'));

    expect(queryByLabelText('AGI Work')).toBeNull();
    expect(getByLabelText('More')).toBeTruthy();
  });

  it('marks More as the current place while the open screen is folded inside it', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockPathname = '/reports';
    const { getByLabelText } = renderDrawer();

    expect(getByLabelText('More').props.accessibilityState.selected).toBe(true);

    fireEvent.press(getByLabelText('More'));

    expect(getByLabelText('Less').props.accessibilityState.selected).toBe(false);
    expect(getByLabelText('Reports').props.accessibilityState.selected).toBe(true);
  });

  it('shows only what lives on the phone in Local, with no Remote and no More row', () => {
    const { getByLabelText, queryByLabelText } = renderDrawer();

    expect(getByLabelText('Projects')).toBeTruthy();
    expect(getByLabelText('Library')).toBeTruthy();
    expect(queryByLabelText('Remote')).toBeNull();
    expect(queryByLabelText('More')).toBeNull();
  });

  it('folds and unfolds the Projects section', () => {
    const { getByLabelText, getByText, queryByText } = renderDrawer();

    expect(getByText('Launch demo')).toBeTruthy();
    fireEvent.press(getByLabelText('Collapse projects'));

    expect(queryByText('Launch demo')).toBeNull();
    expect(useSettingsStore.getState().sidePanelProjectsFolded).toBe(true);

    fireEvent.press(getByLabelText('Expand projects'));

    expect(getByText('Launch demo')).toBeTruthy();
  });

  it.each(['local', 'cloud'] as const)(
    'starts a project from a New project row above the list in %s',
    (mode) => {
      useChatAppModeStore.setState({ appMode: mode });
      const { toJSON, getByLabelText } = renderDrawer();
      const tree = JSON.stringify(toJSON());

      const rowAt = tree.indexOf('"accessibilityLabel":"New project"');
      expect(rowAt).toBeGreaterThan(-1);
      if (mode === 'local') {
        expect(tree.indexOf('"accessibilityLabel":"Open project: Launch demo"')).toBeGreaterThan(
          rowAt,
        );
      }

      fireEvent.press(getByLabelText('New project'));

      expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: '/(app)/(tabs)/projects',
        params: { create: '1' },
      });
    },
  );

  it.each(['local', 'cloud'] as const)(
    'shows only the heading and the New project row with no projects in %s',
    (mode) => {
      useChatAppModeStore.setState({ appMode: mode });
      useProjectStore.setState({ projects: [] });
      useCloudProjectStore.setState({ projects: [] });
      const { getByLabelText, queryAllByLabelText } = renderDrawer();

      expect(getByLabelText('Collapse projects')).toBeTruthy();
      expect(getByLabelText('New project')).toBeTruthy();
      expect(queryAllByLabelText(/^Open project: /)).toHaveLength(0);
    },
  );

  it('folds the New project row away with the section and unfolds it again', () => {
    useProjectStore.setState({ projects: [] });
    const { getByLabelText, queryByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Collapse projects'));
    expect(queryByLabelText('New project')).toBeNull();

    fireEvent.press(getByLabelText('Expand projects'));
    expect(getByLabelText('New project')).toBeTruthy();
  });

  it('keeps the New project row when chats are listed in one list', () => {
    useSettingsStore.setState({ listArrangement: 'one-list' });
    const { getByLabelText, queryByLabelText } = renderDrawer();

    expect(getByLabelText('New project')).toBeTruthy();
    expect(queryByLabelText('Open project: Launch demo')).toBeNull();
  });

  it('lists pinned chats under their own heading, apart from Recents', () => {
    useChatStore.setState({
      conversations: [
        {
          id: 'pinned-1',
          title: 'Pinned chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 1,
          pinned: true,
          executionMode: 'local',
        },
        {
          id: 'plain-1',
          title: 'Plain chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 1,
          pinned: false,
          executionMode: 'local',
        },
      ],
    });
    const { toJSON, getByText } = renderDrawer();
    const tree = JSON.stringify(toJSON());
    const at = (text: string) => tree.indexOf(`"${text}"`);

    expect(getByText('Pinned')).toBeTruthy();
    expect(at('Pinned')).toBeLessThan(at('Pinned chat'));
    expect(at('Pinned chat')).toBeLessThan(at('Recents'));
    expect(at('Recents')).toBeLessThan(at('Plain chat'));
  });

  it('keeps account and help rows out of the panel, leaving Settings as the way in', () => {
    useTierStore.setState({ tier: 'pro' });
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText, queryByLabelText, queryByText } = renderDrawer();

    expect(queryByLabelText('Notifications')).toBeNull();
    expect(queryByLabelText('Help & About')).toBeNull();
    expect(queryByText(/Usage remaining/)).toBeNull();
    expect(queryByText(/Workspace/)).toBeNull();
    fireEvent.press(getByLabelText('Settings'));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/settings');
  });

  it('organizes chats by project by default and in one list on request', () => {
    useChatStore.setState({
      conversations: [
        {
          id: 'conv-in-project',
          title: 'Project Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 1,
          pinned: false,
          projectId: 'proj-1',
        },
      ],
    } as never);
    const { getByLabelText, getByText, queryByText, UNSAFE_getAllByType } = renderDrawer();

    expect(getByText('Launch demo')).toBeTruthy();
    expect(queryByText('Project Chat')).toBeNull();

    fireEvent.press(getByLabelText('Organize chats'));
    fireEvent.press(getByText('In one list'));
    act(() => {
      UNSAFE_getAllByType(Modal).forEach((node) =>
        (node.props.onDismiss as (() => void) | undefined)?.(),
      );
    });

    expect(useSettingsStore.getState().listArrangement).toBe('one-list');
    expect(queryByText('Launch demo')).toBeNull();
    expect(getByText('Project Chat')).toBeTruthy();
  });

  it('shows cloud-only drawer items (AGI Work, Schedules, Projects) while in Cloud mode', () => {
    const local = renderDrawer();
    expect(local.queryByText('Schedules')).toBeNull();
    expect(local.queryByText('AGI Work')).toBeNull();
    expect(local.queryByText('Customize')).toBeNull();
    expect(local.queryByText('Agents')).toBeNull();
    local.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max' });
    const ungranted = renderDrawer();
    expect(ungranted.queryByText('AGI Work')).toBeNull();
    ungranted.unmount();

    useTierStore.setState({ tier: 'free', grantedCapabilities: ['canUseAgiWork'] });
    const freePlan = renderDrawer();
    expect(freePlan.queryByText('AGI Work')).toBeNull();
    freePlan.unmount();

    useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
    const cloud = renderDrawer();

    fireEvent.press(cloud.getByLabelText('More'));
    expect(cloud.getByLabelText('AGI Work')).toBeTruthy();
    expect(cloud.getByLabelText('Schedules')).toBeTruthy();
    expect(cloud.queryByText('Customize')).toBeNull();
    expect(cloud.getByLabelText('Agents')).toBeTruthy();
    expect(cloud.getByLabelText('Sites')).toBeTruthy();
    expect(cloud.queryByLabelText('Published sites')).toBeNull();
    expect(cloud.getByLabelText('Projects')).toBeTruthy();
    expect(cloud.queryByLabelText(/\. Cloud$/)).toBeNull();
    expect(cloud.queryByText('Launch demo')).toBeNull();
  });

  it('shows no usage in the panel for a paid account, whatever the usage store holds', () => {
    useTierStore.setState({ tier: 'pro' });
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useCloudUsageStore.setState({
      ownerId: 'user-1',
      snapshot: {
        planTier: 'pro',
        usagePercentage: 20,
        usageResetAt: '2026-10-01T00:00:00Z',
        hasUsageRemaining: true,
        periodStart: null,
        periodEnd: null,
        subscriptionStatus: 'active',
        sessionUsagePercentage: 0,
        sessionResetAt: null,
        weeklyUsagePercentage: 65,
        weeklyResetAt: '2026-09-29T00:00:00Z',
        flagshipWeeklyUsagePercentage: 0,
        flagshipWeeklyResetAt: null,
        credits: null,
      },
    });

    const drawer = renderDrawer();

    expect(drawer.queryByLabelText(/Usage remaining/)).toBeNull();
    expect(drawer.queryByText(/This week \d+%/)).toBeNull();
    expect(drawer.queryByLabelText(resources.en.common.navUpgrade)).toBeNull();
  });

  it('shows a Free plan an Upgrade row to Billing instead of a usage meter', () => {
    useTierStore.setState({ tier: 'pro' });
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useCloudUsageStore.setState({
      ownerId: 'user-1',
      error: null,
      snapshot: {
        planTier: 'free',
        usagePercentage: 40,
        usageResetAt: '2026-10-01T00:00:00Z',
        hasUsageRemaining: true,
        periodStart: null,
        periodEnd: null,
        subscriptionStatus: 'none',
        sessionUsagePercentage: 0,
        sessionResetAt: null,
        weeklyUsagePercentage: 65,
        weeklyResetAt: '2026-09-29T00:00:00Z',
        flagshipWeeklyUsagePercentage: 0,
        flagshipWeeklyResetAt: null,
        credits: null,
      },
    });

    const upgradeLabel = resources.en.common.navUpgrade;
    expect(i18n.t('navUpgrade', { lng: 'en' })).toBe(upgradeLabel);
    const drawer = renderDrawer();
    expect(drawer.queryByText(/Usage remaining/)).toBeNull();
    expect(drawer.queryByText(/(This week|Current session|This billing period) \d+%/)).toBeNull();
    fireEvent.press(drawer.getByLabelText(upgradeLabel));
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
    drawer.unmount();

    useCloudUsageStore.setState({ ownerId: 'another-user' });
    useTierStore.setState({ tier: 'free' });
    const beforeUsageLoads = renderDrawer();
    expect(beforeUsageLoads.queryByText(/Usage remaining/)).toBeNull();
    expect(beforeUsageLoads.getByLabelText(upgradeLabel)).toBeTruthy();
  });

  it('opens Cloud schedules from the drawer', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('Schedules'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/schedules');
  });

  it('lists Images directly under Library in Cloud and opens the Images page', () => {
    signInForImages('pro');
    const { toJSON, getByLabelText } = renderDrawer();
    const tree = JSON.stringify(toJSON());
    const at = (label: string) => tree.indexOf(`"accessibilityLabel":"${label}"`);

    expect(at('Images')).toBeGreaterThan(at('Library'));
    expect(at('AGI Code')).toBeGreaterThan(at('Images'));

    fireEvent.press(getByLabelText('Images'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/images');
  });

  it('marks Images as the current place while the Images page is open', () => {
    signInForImages('pro');
    mockPathname = '/images';
    const { getByLabelText } = renderDrawer();

    expect(getByLabelText('Images').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Library').props.accessibilityState.selected).toBe(false);
  });

  it('leaves Images out in Local and when no image model can run', () => {
    signInForImages('pro');
    useChatAppModeStore.setState({ appMode: 'local' });
    const local = renderDrawer();
    expect(local.queryByLabelText('Images')).toBeNull();
    local.unmount();

    useChatAppModeStore.setState({ appMode: 'cloud' });
    const mediaMode = require('../src/features/chat/actions/mediaMode');
    const unavailable = jest.spyOn(mediaMode, 'canCreateImages').mockReturnValue(false);
    try {
      const cloud = renderDrawer();
      expect(cloud.getByLabelText('Library')).toBeTruthy();
      expect(cloud.queryByLabelText('Images')).toBeNull();
    } finally {
      unavailable.mockRestore();
    }
  });

  it('leaves Images out for a Free account with no free image offer, after asking for one', () => {
    signInForImages('free');

    const { getByLabelText, queryByLabelText } = renderDrawer();

    expect(getByLabelText('Library')).toBeTruthy();
    expect(queryByLabelText('Images')).toBeNull();
    expect(useFreeQuotaCatalogueStore.getState().refresh).toHaveBeenCalledTimes(1);

    act(() => {
      useFreeQuotaCatalogueStore.setState({
        account: { ownerId: 'images-owner', epoch: 1 },
        catalogue: {
          issuer: 'provider',
          observedOn: '2026-11-16',
          evidenceUrl: 'https://example.com/free',
          reportedEligible: 0,
          reportedUnavailable: 0,
          models: [],
        },
      });
    });
    expect(queryByLabelText('Images')).toBeNull();
  });

  it('lists Images for a Free account only while free images are left today', () => {
    signInForImages('free');
    freeImagesLeft(1);

    const { getByLabelText, queryByLabelText } = renderDrawer();
    expect(getByLabelText('Images')).toBeTruthy();

    act(() => freeImagesLeft(0));
    expect(queryByLabelText('Images')).toBeNull();
  });

  it('leaves Images out for a signed-out Cloud visitor', () => {
    signInForImages('pro');
    useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });

    const { queryByLabelText } = renderDrawer();

    expect(queryByLabelText('Images')).toBeNull();
  });

  it('has no Remote row in Cloud, folded or not, because computers live in AGI Code', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
    const { getByLabelText, queryByLabelText } = renderDrawer();

    expect(queryByLabelText('Remote')).toBeNull();
    fireEvent.press(getByLabelText('More'));
    expect(queryByLabelText('Remote')).toBeNull();
    expect(getByLabelText('AGI Work')).toBeTruthy();
  });

  it('marks AGI Code as the current place while a computer page is open', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockPathname = '/companion';
    const { getByLabelText } = renderDrawer();

    expect(getByLabelText('AGI Code').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('More').props.accessibilityState.selected).toBe(false);
  });

  it('opens the durable agent-run list from AGI Work', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('More'));
    fireEvent.press(getByLabelText('AGI Work'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/tasks');
  });

  it('renders projects and recents', () => {
    const { getByText, queryByText } = renderDrawer();

    expect(getByText('Launch demo')).toBeTruthy();
    expect(getByText('First Chat')).toBeTruthy();
    expect(getByText('Second Chat')).toBeTruthy();
    expect(queryByText('Cloud Chat')).toBeNull();
  });

  it('lists pinned projects first in Local mode', () => {
    const now = new Date().toISOString();
    const project = (id: string, name: string, pinned?: boolean) => ({
      id,
      name,
      description: '',
      instructions: '',
      sources: [],
      pinned,
      createdAt: now,
      updatedAt: now,
    });
    useProjectStore.setState({
      projects: [
        project('proj-a', 'Alpha'),
        project('proj-b', 'Bravo'),
        project('proj-c', 'Charlie', true),
      ],
    });

    const { getAllByLabelText } = renderDrawer();

    expect(
      getAllByLabelText(/^Open project: /).map((node) =>
        (node.props.accessibilityLabel as string).replace('Open project: ', ''),
      ),
    ).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('lists pinned Cloud projects first and leaves archived ones out', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const base = {
      description: null,
      instructions: null,
      color: null,
      source: 'web' as const,
      createdAt: '2026-07-01T10:00:00.000Z',
      deletedAt: null,
    };
    useCloudProjectStore.setState({
      projects: [
        {
          ...base,
          id: 'c-new',
          name: 'Newest',
          updatedAt: '2026-07-20T10:00:00.000Z',
          isArchived: false,
          metadata: null,
        },
        {
          ...base,
          id: 'c-pinned',
          name: 'Pinned old',
          updatedAt: '2026-07-02T10:00:00.000Z',
          isArchived: false,
          metadata: { starred: true },
        },
        {
          ...base,
          id: 'c-archived',
          name: 'Archived',
          updatedAt: '2026-07-21T10:00:00.000Z',
          isArchived: true,
          metadata: { starred: true },
        },
      ],
    });

    const { getAllByLabelText } = renderDrawer();

    expect(
      getAllByLabelText(/^Open project: /).map((node) =>
        (node.props.accessibilityLabel as string).replace('Open project: ', ''),
      ),
    ).toEqual(['Pinned old', 'Newest']);
    useCloudProjectStore.setState({ projects: [] });
  });

  it('lifts pinned chats above the rest and keeps them when the list is capped', () => {
    useChatStore.setState({
      conversations: Array.from({ length: 10 }, (_, index) => ({
        id: `local-${index + 1}`,
        title: `Local recent ${index + 1}`,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        messageCount: 1,
        pinned: index === 9,
        executionMode: 'local',
      })),
    });

    const { getByText, getAllByLabelText } = renderDrawer();
    const titles = getAllByLabelText(/^Open conversation: /).map((node) =>
      (node.props.accessibilityLabel as string).replace('Open conversation: ', ''),
    );

    expect(titles[0]).toBe('Local recent 10');
    expect(getByText('Local recent 10')).toBeTruthy();
  });

  it('puts the navigation rows and the recent chats in one scrolling column above the pinned footer', () => {
    useChatStore.setState({
      conversations: Array.from({ length: 12 }, (_, index) => ({
        id: `local-${index + 1}`,
        title: `Local recent ${index + 1}`,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        messageCount: 1,
        pinned: false,
        executionMode: 'local',
      })),
    });

    const { getByTestId, getByLabelText, UNSAFE_getAllByType } = renderDrawer();
    const column = within(getByTestId('drawer.scroll'));

    expect(UNSAFE_getAllByType(ScrollView)).toHaveLength(1);
    expect(column.getByLabelText('New chat')).toBeTruthy();
    expect(column.getByText('Recents')).toBeTruthy();
    expect(column.getByText('Local recent 1')).toBeTruthy();
    expect(column.getByText('Local recent 12')).toBeTruthy();
    expect(column.getByLabelText('See all chats')).toBeTruthy();
    expect(column.queryByLabelText('Settings')).toBeNull();
    expect(within(getByTestId('drawer.body')).queryByLabelText('Settings')).toBeNull();
    expect(StyleSheet.flatten(getByTestId('drawer.scroll').props.style)).toEqual({ flex: 1 });
    expect(StyleSheet.flatten(getByTestId('drawer.body').props.style)).toEqual(
      expect.objectContaining({ flex: 1, overflow: 'hidden' }),
    );
    fireEvent.press(getByLabelText('See all chats'));
    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/chats');
  });

  it('keeps the header and the Local and Cloud switch outside the scrolling column', () => {
    const { getByTestId, getByLabelText } = renderDrawer();
    const column = within(getByTestId('drawer.scroll'));

    expect(column.queryByTestId('drawer.brand-symbol')).toBeNull();
    expect(column.queryByLabelText('Search')).toBeNull();
    expect(within(getByTestId('drawer.body')).getByLabelText('Search')).toBeTruthy();
    expect(getByLabelText('Settings')).toBeTruthy();
  });

  it('unfolds the More rows in the same column, between the navigation rows and Recents', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
    const { getByTestId, getByLabelText, toJSON } = renderDrawer();

    fireEvent.press(getByLabelText('More'));

    const column = within(getByTestId('drawer.scroll'));
    const navigation = within(getByTestId('drawer.navigation'));
    expect(navigation.getByLabelText('Less')).toBeTruthy();
    for (const folded of ['AGI Work', 'Sites', 'Agents', 'Reports']) {
      expect(navigation.getByLabelText(folded)).toBeTruthy();
      expect(column.getByLabelText(folded)).toBeTruthy();
    }
    const order = JSON.stringify(toJSON());
    expect(order.indexOf('drawer.navigation')).toBeGreaterThan(-1);
    expect(order.indexOf('Reports')).toBeLessThan(order.indexOf('Recents'));
    expect(column.getByText('Recents')).toBeTruthy();
  });

  it('lists every navigation row, the Projects section and Recents in the one column with every More row open', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
    const { getByTestId, getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('More'));

    const column = within(getByTestId('drawer.scroll'));
    for (const label of [
      'New chat',
      'Projects',
      'Library',
      'AGI Code',
      'Schedules',
      'Less',
      'AGI Work',
      'Sites',
      'Agents',
      'Reports',
      'New project',
    ]) {
      expect(column.getByLabelText(label)).toBeTruthy();
    }
    expect(column.getByText('Recents')).toBeTruthy();
    expect(column.getByLabelText('See all chats')).toBeTruthy();
  });

  it('does not scroll by itself when More opens or closes', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
    const scrollToEnd = jest
      .spyOn(ScrollView.prototype, 'scrollToEnd')
      .mockImplementation(() => {});
    try {
      const { getByTestId, getByLabelText } = renderDrawer();

      fireEvent.press(getByLabelText('More'));
      fireEvent(getByTestId('drawer.scroll'), 'contentSizeChange', 300, 700);
      fireEvent.press(getByLabelText('Less'));
      fireEvent(getByTestId('drawer.scroll'), 'contentSizeChange', 300, 400);

      expect(scrollToEnd).not.toHaveBeenCalled();
    } finally {
      scrollToEnd.mockRestore();
    }
  });

  it('wires the one column to the remembered drawer scroll position', () => {
    const { getByTestId } = renderDrawer();

    expect(getByTestId('drawer.scroll').props.onScroll).toEqual(expect.any(Function));
    expect(getByTestId('drawer.scroll').props.scrollEventThrottle).toBe(16);
  });

  it('caps the Recents heading and chat rows like the navigation rows so the floor holds at the largest text', () => {
    const startingScale = Dimensions.get('window').fontScale;
    try {
      setTextScale(LARGEST_IOS_TEXT_SCALE);
      const { getByText } = renderDrawer();

      expect(getByText('Recents').props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(getByText('First Chat').props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(getByText('See all chats').props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    } finally {
      setTextScale(startingScale);
    }
  });

  it('keeps every row label readable at the largest text size: capped like header text, wrapping to two lines', () => {
    const startingScale = Dimensions.get('window').fontScale;
    const startingMode = useChatAppModeStore.getState().appMode;
    const startingTier = useTierStore.getState();
    try {
      setTextScale(LARGEST_IOS_TEXT_SCALE);
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
      const { getByLabelText } = renderDrawer();
      fireEvent.press(getByLabelText('More'));

      for (const label of ['New chat', 'Projects', 'Schedules', 'AGI Work', 'Sites']) {
        const row = within(getByLabelText(label)).getByText(label);
        expect(row.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
        expect(row.props.numberOfLines).toBe(2);
      }
      const newProject = within(getByLabelText('New project')).getByText('New project');
      expect(newProject.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(newProject.props.numberOfLines).toBe(2);
    } finally {
      setTextScale(startingScale);
      useChatAppModeStore.setState({ appMode: startingMode });
      useTierStore.setState({
        tier: startingTier.tier,
        grantedCapabilities: startingTier.grantedCapabilities,
      });
    }
  });

  it('bounds the recents so a long history does not render every chat', () => {
    useChatStore.setState({
      conversations: Array.from({ length: 40 }, (_, index) => ({
        id: `local-${index + 1}`,
        title: `Local recent ${index + 1}`,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        messageCount: 1,
        pinned: false,
        executionMode: 'local',
      })),
    });

    const { getByText, queryByText } = renderDrawer();

    expect(getByText('Local recent 30')).toBeTruthy();
    expect(queryByText('Local recent 31')).toBeNull();
  });

  it('opens the full global-search and chat-history surface', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('See all chats'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/chats');
  });

  it('keeps Cloud recents separate from Local recents', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    if (DEFAULT_CLOUD_MODEL_ID) {
      useModelStore.getState().setModel(DEFAULT_CLOUD_MODEL_ID);
    }

    const { getByText, queryByText } = renderDrawer();

    expect(getByText('Cloud Chat')).toBeTruthy();
    expect(queryByText('First Chat')).toBeNull();
    expect(queryByText('Second Chat')).toBeNull();
  });

  it('highlights active projects and settings rows', () => {
    mockPathname = '/projects';
    const projects = renderDrawer();
    expect(projects.getByLabelText('Projects').props.accessibilityState.selected).toBe(true);
    projects.unmount();

    mockPathname = '/settings';
    const settings = renderDrawer();
    expect(settings.getByLabelText('Settings').props.accessibilityState.selected).toBe(true);
  });

  it('opens the new chat composer from the compose pill', () => {
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('New chat'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/chat',
    });
  });

  it('clears the project scope of both stores when the new chat row is pressed', () => {
    useProjectStore.setState({ activeProjectId: 'proj-1' });
    useCloudProjectStore.setState({ activeProjectId: 'cloud-proj-1' });
    const { getByLabelText } = renderDrawer();

    fireEvent.press(getByLabelText('New chat'));

    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/chat' });
  });

  it('opens the dedicated search screen from the icon-only search button', () => {
    const { getByLabelText, queryByPlaceholderText } = renderDrawer();

    expect(queryByPlaceholderText(/search/i)).toBeNull();

    fireEvent.press(getByLabelText('Search'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/search');
  });

  describe('with Spanish selected', () => {
    beforeEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('es');
      });
    });

    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('renders every drawer label from the Spanish catalog', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'max', grantedCapabilities: ['canUseAgiWork'] });
      const { getByLabelText, queryByLabelText, getByText } = renderDrawer();
      const es = resources.es;

      expect(getByLabelText(es.common.navProjects)).toBeTruthy();
      expect(getByLabelText(es.common.navLibrary)).toBeTruthy();
      expect(getByLabelText(es.common.drawer.schedules)).toBeTruthy();
      fireEvent.press(getByLabelText(es.common.more));
      expect(getByLabelText(es.common.less)).toBeTruthy();
      expect(getByLabelText(es.common.navAgents)).toBeTruthy();
      expect(getByLabelText(es.common.drawer.reports)).toBeTruthy();
      expect(getByLabelText(es.common.navSites)).toBeTruthy();
      expect(getByLabelText(es.common.settings)).toBeTruthy();
      expect(getByLabelText(es.common.drawer.organizeChats)).toBeTruthy();
      expect(getByLabelText(es.common.search)).toBeTruthy();
      expect(getByLabelText(es.common.drawer.newChat)).toBeTruthy();
      expect(getByLabelText(es.common.drawer.seeAllChats)).toBeTruthy();
      expect(getByText(es.common.drawer.recents)).toBeTruthy();

      expect(es.common.navAgents).toBe('Agentes');
      expect(es.common.drawer.schedules).toBe('Programaciones');
      expect(queryByLabelText('Schedules')).toBeNull();
      expect(queryByLabelText('Agents')).toBeNull();
      expect(queryByLabelText('More')).toBeNull();
      expect(queryByLabelText('Organize chats')).toBeNull();
    });
  });
});
