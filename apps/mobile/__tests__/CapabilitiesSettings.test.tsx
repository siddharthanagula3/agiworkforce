/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockApprovalFetch = jest.fn();
const mockFetchPreference = jest.fn();
const mockPatchPreference = jest.fn();
jest.mock('@/services/preferences', () => ({
  fetchToolApprovalNamespace: (...args: unknown[]) => mockApprovalFetch(...args),
  savePreferenceNamespace: jest.fn(async () => undefined),
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchPreference(...args),
  patchPreferenceNamespace: (...args: unknown[]) => mockPatchPreference(...args),
}));

const mockFetchArtifactVisual = jest.fn();
jest.mock('../src/features/settings/capabilities/artifactVisualPreferencesService', () => ({
  ...jest.requireActual('../src/features/settings/capabilities/artifactVisualPreferencesService'),
  fetchArtifactVisualPreferences: (...args: unknown[]) => mockFetchArtifactVisual(...args),
}));

const mockFetchToolAccess = jest.fn();
jest.mock('../src/features/settings/capabilities/toolAccessPreferenceService', () => ({
  ...jest.requireActual('../src/features/settings/capabilities/toolAccessPreferenceService'),
  fetchToolAccessPreference: (...args: unknown[]) => mockFetchToolAccess(...args),
}));

const mockFetchConnectorDirectory = jest.fn();
jest.mock('@/services/connectors', () => ({
  ...jest.requireActual('@/services/connectors'),
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchConnectorDirectory(...args),
}));

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    ArrowLeft: Icon,
    BarChart3: Icon,
    Brain: Icon,
    Camera: Icon,
    Check: Icon,
    ChevronRight: Icon,
    Cloud: Icon,
    FileCode: Icon,
    FolderOpen: Icon,
    Globe: Icon,
    Layout: Icon,
    LockKeyhole: Icon,
    Mic: Icon,
    RefreshCw: Icon,
    ShieldCheck: Icon,
    Telescope: Icon,
    Wrench: Icon,
  };
});

jest.mock('@/lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
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

jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return { FEATURES: { ...actual.FEATURES } };
});

let mockPairingCode: string | null = null;
jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: (selector: (state: { pairingCode: string | null }) => unknown) =>
    selector({ pairingCode: mockPairingCode }),
}));

const mockMemoryEntries: Array<{
  id: string;
  fact: string;
  source_conversation_id: string | null;
  pinned: boolean;
  created_at: number;
}> = [];
const mockFetchMemories = jest.fn(async () => undefined);

jest.mock('../src/features/memory/store', () => {
  const useMemoryStore = (
    selector: (state: { entries: unknown[]; fetchMemories: () => Promise<void> }) => unknown,
  ) => selector({ entries: mockMemoryEntries, fetchMemories: mockFetchMemories });
  return { useMemoryStore };
});

import {
  activateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '../src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '../src/features/auth/store';
import { ApprovalPolicySummary } from '../src/features/settings/cloud-connectors/ApprovalPolicySummary';
import { TOOL_APPROVAL_POLICY_OPTIONS } from '@agiworkforce/types';
import CapabilitiesScreen from '../src/features/settings/capabilities';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatStore } from '../stores/chatStore';
import { useTierStore } from '../src/features/billing/store';
import { useSettingsStore } from '../stores/settingsStore';
import { ROW_LABEL_TEXT_SCALE_LIMIT } from '../src/ui/theme/tokens';
import { useReportedArtifactVisualSwitches } from '../src/features/settings/capabilities/useArtifactVisualPreferences';
import { useReportedToolAccess } from '../src/features/settings/capabilities/useToolAccessPreference';

const setRemoteFeatures = (enabled: boolean) => {
  const { FEATURES } = jest.requireMock('@/lib/v1FeatureFlags');
  FEATURES.companion = enabled;
  FEATURES.dispatch = enabled;
};

describe('Capabilities settings screen', () => {
  afterEach(() => {
    setRemoteFeatures(false);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false, clerkUserId: null });
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
    useChatStore.setState((state) => ({
      features: {
        ...state.features,
        webSearch: true,
        imageGen: true,
        codeExecution: false,
        research: false,
      },
    }));
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({ toolApprovalPolicy: 'ask_every_time' });
    mockMemoryEntries.length = 0;
    mockPairingCode = null;
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });
    mockFetchPreference.mockResolvedValue({});
    mockPatchPreference.mockResolvedValue(undefined);
    useReportedArtifactVisualSwitches.setState({ available: [] });
    mockFetchArtifactVisual.mockResolvedValue({
      values: { artifacts: true, inlineVisualizations: true },
      available: [],
    });
    useReportedToolAccess.setState({ available: false });
    mockFetchToolAccess.mockResolvedValue({ mode: 'auto', available: false });
    mockFetchConnectorDirectory.mockResolvedValue({ connectors: [], available: [] });
  });

  const WEB_SEARCH_LABEL = 'Web search. Let Cloud models search the web for current information.';
  const CODE_LABEL =
    'Code execution and file creation. Run code in a sandbox and create documents, sheets, slides and PDFs.';

  it('lets a long capability title wrap instead of truncating', () => {
    const { getByText } = render(<CapabilitiesScreen />);

    expect(getByText('Code execution and file creation').props.numberOfLines).toBeUndefined();
  });

  it('renders real Cloud preference switches and keeps automatic capabilities as status rows', () => {
    const { getByText, getByLabelText, queryAllByRole, queryByText } = render(
      <CapabilitiesScreen />,
    );

    expect(getByText('Capabilities')).toBeTruthy();
    expect(getByText('What AGI can use')).toBeTruthy();
    expect(getByText('On this device')).toBeTruthy();
    expect(getByLabelText('Local Mode. Private chat runs on this device. Active')).toBeTruthy();
    expect(getByLabelText(WEB_SEARCH_LABEL)).toBeTruthy();
    expect(getByLabelText(`${CODE_LABEL} Cloud only`)).toBeTruthy();
    expect(
      getByLabelText('Deep research. Multi-step research with citations in Cloud chats.'),
    ).toBeTruthy();
    expect(
      getByLabelText('Image generation. Allow eligible Cloud chats to create generated images.'),
    ).toBeTruthy();
    expect(
      getByLabelText('Cross-device continuity. Managed Cloud tasks across mobile, web and desktop'),
    ).toBeTruthy();
    expect(queryAllByRole('switch')).toHaveLength(3);
    expect(getByLabelText(WEB_SEARCH_LABEL)).toBeDisabled();
    expect(queryByText(/Claude/i)).toBeNull();
    expect(queryByText(/ChatGPT/i)).toBeNull();
    expect(queryByText(/future/i)).toBeNull();
  });

  it('navigates status rows to real settings surfaces', () => {
    const { getByLabelText } = render(<CapabilitiesScreen />);

    fireEvent.press(getByLabelText('Memory. Saved on this device'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/memory');

    fireEvent.press(
      getByLabelText('Cross-device continuity. Managed Cloud tasks across mobile, web and desktop'),
    );
    expect(mockPush).toHaveBeenCalledWith('/(app)/continuity');
  });

  it('tracks the stored approval policy across every policy the server accepts', () => {
    const expected = TOOL_APPROVAL_POLICY_OPTIONS.map(
      (option) => [option.policy, option.shortLabel] as const,
    );

    for (const [policy, label] of expected) {
      useSettingsStore.setState({ toolApprovalPolicy: policy });
      const { getByLabelText, unmount } = render(<CapabilitiesScreen />);
      expect(
        getByLabelText(`Action approvals. Choose how AGI asks before tool actions. ${label}`),
      ).toBeTruthy();
      unmount();
    }
  });

  it('reports Local Mode as off while the app runs in Cloud mode', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByLabelText, queryByLabelText } = render(<CapabilitiesScreen />);

    expect(getByLabelText('Local Mode. New chats run on AGI Cloud servers. Off')).toBeTruthy();
    expect(queryByLabelText('Local Mode. Private chat runs on this device. Active')).toBeNull();
  });

  it('renders no status pill on rows that only navigate', () => {
    const { getByLabelText, queryByText } = render(<CapabilitiesScreen />);

    for (const stale of ['Local', 'Available', 'Beta', 'Desktop']) {
      expect(queryByText(stale)).toBeNull();
    }
    expect(
      getByLabelText('Your artifacts. Open generated previews and files from chat'),
    ).toBeTruthy();
  });

  it('lists no Desktop control row while version 1 ships with Remote hidden', () => {
    const { queryByLabelText } = render(<CapabilitiesScreen />);

    expect(queryByLabelText(/^Desktop control/)).toBeNull();
  });

  describe('Desktop control row', () => {
    beforeEach(() => {
      setRemoteFeatures(true);
    });

    const OPEN_LABEL = 'Desktop control. Run workflows on your paired desktop';
    const LOCKED_LABEL = "Desktop control. Desktop control isn't included in your plan";

    it('is not an action for a Free plan with no paired computer', () => {
      useTierStore.setState({ tier: 'free', lastRefreshedAt: '2026-11-14T00:00:00.000Z' });

      const { getByLabelText, queryByLabelText, queryByRole } = render(<CapabilitiesScreen />);

      expect(queryByLabelText(OPEN_LABEL)).toBeNull();
      expect(getByLabelText(LOCKED_LABEL)).toBeTruthy();
      expect(queryByRole('button', { name: LOCKED_LABEL })).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('opens Remote for a paid plan', () => {
      useTierStore.setState({ tier: 'pro', lastRefreshedAt: '2026-11-14T00:00:00.000Z' });

      const { getByLabelText, queryByLabelText } = render(<CapabilitiesScreen />);
      fireEvent.press(getByLabelText(OPEN_LABEL));

      expect(mockPush).toHaveBeenCalledWith('/(app)/companion');
      expect(queryByLabelText(LOCKED_LABEL)).toBeNull();
    });

    it('keeps opening Remote for a Free plan whose computer is already paired', () => {
      useTierStore.setState({ tier: 'free', lastRefreshedAt: '2026-11-14T00:00:00.000Z' });
      mockPairingCode = 'ABCD1234';

      const { getByLabelText } = render(<CapabilitiesScreen />);
      fireEvent.press(getByLabelText(OPEN_LABEL));

      expect(mockPush).toHaveBeenCalledWith('/(app)/companion');
    });

    it('does not show the locked state while the plan is still unknown', () => {
      useTierStore.setState({ tier: 'free', lastRefreshedAt: null });

      const { getByLabelText, queryByLabelText } = render(<CapabilitiesScreen />);

      expect(getByLabelText(OPEN_LABEL)).toBeTruthy();
      expect(queryByLabelText(LOCKED_LABEL)).toBeNull();
    });
  });

  it('says on screen why a locked Cloud switch cannot be changed', () => {
    const { getAllByText } = render(<CapabilitiesScreen />);

    expect(getAllByText('Sign in to change this Managed Cloud preference.')).toHaveLength(3);
  });

  it('enables the Cloud preference switches after cloud access is unlocked', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    const { getByLabelText, queryByText } = render(<CapabilitiesScreen />);

    expect(getByLabelText(WEB_SEARCH_LABEL)).not.toBeDisabled();
    expect(queryByText('Sign in to change this Managed Cloud preference.')).toBeNull();
  });

  it('binds the Web search row to the persisted send-path preference', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    const { getByLabelText } = render(<CapabilitiesScreen />);
    const webSearchSwitch = getByLabelText(WEB_SEARCH_LABEL);
    expect(webSearchSwitch.props.value).toBe(true);

    fireEvent(webSearchSwitch, 'valueChange', false);
    expect(useChatStore.getState().features.webSearch).toBe(false);

    fireEvent(webSearchSwitch, 'valueChange', true);
    expect(useChatStore.getState().features.webSearch).toBe(true);
  });

  it('dates the Memory row from the newest stored memory and claims nothing when empty', () => {
    const { getByLabelText, unmount } = render(<CapabilitiesScreen />);
    expect(getByLabelText('Memory. Saved on this device')).toBeTruthy();
    unmount();

    mockMemoryEntries.push({
      id: 'm1',
      fact: 'prefers dark mode',
      source_conversation_id: null,
      pinned: false,
      created_at: Date.now() - 2 * 86_400_000,
    });

    const second = render(<CapabilitiesScreen />);
    expect(second.getByLabelText('Memory. Saved on this device. Updated 2 days ago')).toBeTruthy();
  });

  it('updates the persisted send-path preferences inline after Cloud unlock', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    const { getByLabelText } = render(<CapabilitiesScreen />);
    const researchSwitch = getByLabelText(
      'Deep research. Multi-step research with citations in Cloud chats.',
    );
    const imageSwitch = getByLabelText(
      'Image generation. Allow eligible Cloud chats to create generated images.',
    );

    fireEvent(researchSwitch, 'valueChange', true);
    fireEvent(imageSwitch, 'valueChange', false);

    expect(useChatStore.getState().features).toMatchObject({
      research: true,
      imageGen: false,
    });
  });

  describe('Code execution and file creation in Cloud', () => {
    const settle = () =>
      act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

    const realRefreshTier = useTierStore.getState().refreshTier;

    afterEach(() => {
      useTierStore.setState({ refreshTier: realRefreshTier });
    });

    beforeEach(() => {
      __resetCloudAccountSessionForTests();
      activateCloudAccount('code-execution-owner');
      useAuthStore.setState({
        isClerkLoaded: true,
        isClerkSignedIn: true,
        clerkUserId: 'code-execution-owner',
      });
      mockApprovalFetch.mockResolvedValue({ settings: {}, autonomousToolApprovalsAllowed: false });
      useWaitlistStore.setState({ cloudUnlocked: true });
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useChatStore.setState((state) => ({ features: { ...state.features, codeExecution: true } }));
    });

    it('shows Local Mode a Cloud only pill with no switch and no sign-in note', () => {
      useChatAppModeStore.setState({ appMode: 'local' });

      const { getByLabelText, queryByLabelText, queryByTestId } = render(<CapabilitiesScreen />);

      expect(getByLabelText(`${CODE_LABEL} Cloud only`)).toBeTruthy();
      expect(queryByLabelText(CODE_LABEL)).toBeNull();
      expect(queryByTestId('capability-locked-Code execution and file creation')).toBeNull();
      expect(mockFetchPreference).not.toHaveBeenCalledWith('capabilities', expect.anything());
    });

    it('keeps the switch disabled until the account value has loaded', async () => {
      let resolve!: (settings: unknown) => void;
      mockFetchPreference.mockReturnValueOnce(new Promise((done) => (resolve = done)));

      const { getByLabelText } = render(<CapabilitiesScreen />);
      expect(mockFetchPreference).toHaveBeenCalledWith('capabilities', expect.anything());
      expect(getByLabelText(CODE_LABEL)).toBeDisabled();

      await act(async () => {
        resolve({});
      });
      expect(getByLabelText(CODE_LABEL)).not.toBeDisabled();
    });

    it('shows Off, and mirrors it for the send path, when the account turned execution off', async () => {
      mockFetchPreference.mockResolvedValue({ cloudCodeExecution: false });

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(getByLabelText(CODE_LABEL).props.value).toBe(false);
      expect(useChatStore.getState().features.codeExecution).toBe(false);
    });

    it('treats an absent account value as On', async () => {
      useChatStore.setState((state) => ({ features: { ...state.features, codeExecution: false } }));
      mockFetchPreference.mockResolvedValue({});

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(getByLabelText(CODE_LABEL).props.value).toBe(true);
      expect(useChatStore.getState().features.codeExecution).toBe(true);
    });

    it('writes the account preference, then refreshes the plan so execution availability updates', async () => {
      const refreshTier = jest.fn(async () => true);
      useTierStore.setState({ refreshTier });

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent(getByLabelText(CODE_LABEL), 'valueChange', false);

      expect(useChatStore.getState().features.codeExecution).toBe(false);
      expect(mockPatchPreference).toHaveBeenCalledWith(
        'capabilities',
        { cloudCodeExecution: false },
        expect.anything(),
      );
      await settle();
      expect(refreshTier).toHaveBeenCalledTimes(1);
    });

    it('rolls the switch back and says so when the account write fails', async () => {
      const refreshTier = jest.fn(async () => true);
      useTierStore.setState({ refreshTier });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockPatchPreference.mockRejectedValue(new Error('offline'));

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent(getByLabelText(CODE_LABEL), 'valueChange', false);
      await settle();

      expect(getByLabelText(CODE_LABEL).props.value).toBe(true);
      expect(useChatStore.getState().features.codeExecution).toBe(true);
      expect(alert).toHaveBeenCalledWith(
        'Not saved',
        'This setting could not be saved to your account. Check your connection and try again.',
      );
      expect(refreshTier).not.toHaveBeenCalled();
      alert.mockRestore();
    });

    it('does not report a failed save when a later choice was saved', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      let rejectFirst!: (error: Error) => void;
      mockPatchPreference
        .mockReturnValueOnce(new Promise((_resolve, no) => (rejectFirst = no)))
        .mockResolvedValueOnce(undefined);

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent(getByLabelText(CODE_LABEL), 'valueChange', false);
      fireEvent(getByLabelText(CODE_LABEL), 'valueChange', true);
      await settle();
      await act(async () => {
        rejectFirst(new Error('offline'));
      });
      await settle();

      expect(alert).not.toHaveBeenCalled();
      expect(getByLabelText(CODE_LABEL).props.value).toBe(true);
      alert.mockRestore();
    });

    it('rolls back to the value the account last confirmed when the latest of two quick changes fails', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockFetchPreference.mockResolvedValue({});
      let rejectFirst!: (error: Error) => void;
      let rejectSecond!: (error: Error) => void;
      mockPatchPreference
        .mockReturnValueOnce(new Promise((_resolve, no) => (rejectFirst = no)))
        .mockReturnValueOnce(new Promise((_resolve, no) => (rejectSecond = no)));

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent(getByLabelText(CODE_LABEL), 'valueChange', false);
      fireEvent(getByLabelText(CODE_LABEL), 'valueChange', false);
      await act(async () => {
        rejectFirst(new Error('offline'));
        rejectSecond(new Error('offline'));
      });
      await settle();

      expect(getByLabelText(CODE_LABEL).props.value).toBe(true);
      expect(alert).toHaveBeenCalledTimes(1);
      alert.mockRestore();
    });

    it('waits without a failure note while the account session has not started, then reads once it has', async () => {
      __resetCloudAccountSessionForTests();
      mockFetchPreference.mockResolvedValue({ cloudCodeExecution: false });

      const { getByLabelText, queryByTestId } = render(<CapabilitiesScreen />);
      await settle();

      expect(mockFetchPreference).not.toHaveBeenCalledWith('capabilities', expect.anything());
      expect(getByLabelText(CODE_LABEL)).toBeDisabled();
      expect(queryByTestId('capability-locked-Code execution and file creation')).toBeNull();

      await act(async () => {
        activateCloudAccount('code-execution-owner');
      });
      await settle();

      expect(mockFetchPreference).toHaveBeenCalledWith('capabilities', expect.anything());
      expect(getByLabelText(CODE_LABEL)).not.toBeDisabled();
      expect(getByLabelText(CODE_LABEL).props.value).toBe(false);
    });

    it('reads the value again for the new account after an account switch', async () => {
      mockFetchPreference.mockResolvedValueOnce({ cloudCodeExecution: false });

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      expect(getByLabelText(CODE_LABEL).props.value).toBe(false);

      mockFetchPreference.mockResolvedValue({ cloudCodeExecution: true });
      act(() => {
        activateCloudAccount('code-execution-second-owner');
      });
      await settle();

      const reads = mockFetchPreference.mock.calls.filter(([name]) => name === 'capabilities');
      expect(reads).toHaveLength(2);
      expect(reads[1]?.[1]).toEqual({
        accountEpoch: expect.objectContaining({ ownerId: 'code-execution-second-owner' }),
      });
      expect(getByLabelText(CODE_LABEL).props.value).toBe(true);
    });

    it('says the account value could not be loaded instead of showing a switch it cannot trust', async () => {
      mockFetchPreference.mockRejectedValue(new Error('offline'));

      const { getByLabelText, getByTestId } = render(<CapabilitiesScreen />);
      await settle();

      expect(getByLabelText(CODE_LABEL)).toBeDisabled();
      expect(getByTestId('capability-locked-Code execution and file creation')).toBeTruthy();
    });
  });

  describe('Artifacts and Inline visualizations switches', () => {
    const ARTIFACTS_LABEL = 'Artifacts. Create apps, documents and diagrams in a side preview.';
    const VISUALS_LABEL = 'Inline visualizations. Show charts and diagrams right in the chat.';
    const GALLERY_LABEL = 'Your artifacts. Open generated previews and files from chat';
    const REPORTED = ['artifacts', 'inlineVisualizations'];

    const settle = () =>
      act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

    beforeEach(() => {
      activateCloudAccount('switch-owner');
      useAuthStore.setState({
        isClerkLoaded: true,
        isClerkSignedIn: true,
        clerkUserId: 'switch-owner',
      });
      mockApprovalFetch.mockResolvedValue({ settings: {}, autonomousToolApprovalsAllowed: false });
      useWaitlistStore.setState({ cloudUnlocked: true });
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockFetchPreference.mockResolvedValue({ cloudCodeExecution: false });
      useChatStore.setState((state) => ({ features: { ...state.features, codeExecution: false } }));
    });

    it('stays hidden while the server does not report the switches, and keeps the gallery row', async () => {
      const { queryByLabelText, getByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(mockFetchArtifactVisual).toHaveBeenCalledTimes(1);
      expect(queryByLabelText(ARTIFACTS_LABEL)).toBeNull();
      expect(queryByLabelText(VISUALS_LABEL)).toBeNull();
      fireEvent.press(getByLabelText(GALLERY_LABEL));
      expect(mockPush).toHaveBeenCalledWith('/(app)/artifacts');
    });

    it('stays hidden when the account read fails before the server ever reported them', async () => {
      mockFetchArtifactVisual.mockRejectedValue(new Error('offline'));

      const { queryByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(queryByLabelText(ARTIFACTS_LABEL)).toBeNull();
      expect(queryByLabelText(VISUALS_LABEL)).toBeNull();
    });

    it('shows both switches with the account values once the server reports them', async () => {
      mockFetchArtifactVisual.mockResolvedValue({
        values: { artifacts: false, inlineVisualizations: true },
        available: REPORTED,
      });

      const { getByLabelText, queryByText } = render(<CapabilitiesScreen />);
      await settle();

      expect(getByLabelText(ARTIFACTS_LABEL).props.value).toBe(false);
      expect(getByLabelText(ARTIFACTS_LABEL)).not.toBeDisabled();
      expect(getByLabelText(VISUALS_LABEL).props.value).toBe(true);
      expect(getByLabelText(VISUALS_LABEL)).not.toBeDisabled();
      expect(queryByText('Beta')).toBeNull();
    });

    it('reads the values again for the new account after an account switch', async () => {
      mockFetchArtifactVisual.mockResolvedValueOnce({
        values: { artifacts: false, inlineVisualizations: false },
        available: REPORTED,
      });

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      expect(getByLabelText(VISUALS_LABEL).props.value).toBe(false);

      mockFetchArtifactVisual.mockResolvedValueOnce({
        values: { artifacts: true, inlineVisualizations: true },
        available: REPORTED,
      });
      act(() => {
        activateCloudAccount('switch-second-owner');
      });
      await settle();

      expect(mockFetchArtifactVisual).toHaveBeenCalledTimes(2);
      expect(mockFetchArtifactVisual).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: 'switch-second-owner' }),
      );
      expect(getByLabelText(VISUALS_LABEL).props.value).toBe(true);
    });

    it('shows only the switch the server reports', async () => {
      mockFetchArtifactVisual.mockResolvedValue({
        values: { artifacts: true, inlineVisualizations: true },
        available: ['inlineVisualizations'],
      });

      const { getByLabelText, queryByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(queryByLabelText(ARTIFACTS_LABEL)).toBeNull();
      expect(getByLabelText(VISUALS_LABEL)).toBeTruthy();
    });

    it('holds Artifacts on and locked while code execution is on, and says why', async () => {
      mockFetchPreference.mockResolvedValue({});
      mockFetchArtifactVisual.mockResolvedValue({
        values: { artifacts: false, inlineVisualizations: true },
        available: REPORTED,
      });

      const { getByLabelText, getByTestId } = render(<CapabilitiesScreen />);
      await settle();

      const artifacts = getByLabelText(ARTIFACTS_LABEL);
      expect(artifacts.props.value).toBe(true);
      expect(artifacts).toBeDisabled();
      expect(artifacts.props.accessibilityHint).toBe('Required by code execution');
      expect(getByTestId('capability-locked-Artifacts')).toHaveTextContent(
        'Required by code execution',
      );
      expect(getByLabelText(VISUALS_LABEL)).not.toBeDisabled();
    });

    it('saves a change to the account at once', async () => {
      mockFetchArtifactVisual.mockResolvedValue({
        values: { artifacts: true, inlineVisualizations: true },
        available: REPORTED,
      });

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent(getByLabelText(VISUALS_LABEL), 'valueChange', false);

      expect(getByLabelText(VISUALS_LABEL).props.value).toBe(false);
      expect(mockPatchPreference).toHaveBeenCalledWith(
        'capabilities',
        { inlineVisualizations: false },
        expect.anything(),
      );
      fireEvent(getByLabelText(ARTIFACTS_LABEL), 'valueChange', false);
      expect(mockPatchPreference).toHaveBeenCalledWith(
        'capabilities',
        { artifacts: false },
        expect.anything(),
      );
      await settle();
      expect(getByLabelText(VISUALS_LABEL).props.value).toBe(false);
      expect(getByLabelText(ARTIFACTS_LABEL).props.value).toBe(false);
    });

    it('rolls the switch back and says Not saved when the account write fails', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockFetchArtifactVisual.mockResolvedValue({
        values: { artifacts: true, inlineVisualizations: true },
        available: REPORTED,
      });
      mockPatchPreference.mockRejectedValue(new Error('offline'));

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent(getByLabelText(VISUALS_LABEL), 'valueChange', false);
      await settle();

      expect(getByLabelText(VISUALS_LABEL).props.value).toBe(true);
      expect(alert).toHaveBeenCalledWith(
        'Not saved',
        'This setting could not be saved to your account. Check your connection and try again.',
      );
      alert.mockRestore();
    });

    it('keeps a reported switch locked with a note when a later account read fails', async () => {
      useReportedArtifactVisualSwitches.setState({ available: REPORTED });
      mockFetchArtifactVisual.mockRejectedValue(new Error('offline'));

      const { getByLabelText, getByTestId } = render(<CapabilitiesScreen />);
      await settle();

      expect(getByLabelText(VISUALS_LABEL)).toBeDisabled();
      expect(getByTestId('capability-locked-Inline visualizations')).toHaveTextContent(
        'Could not load this setting from your account. Check your connection and try again.',
      );
    });

    it('shows reported switches as Cloud only in Local Mode without reading the account', async () => {
      useReportedArtifactVisualSwitches.setState({ available: REPORTED });
      useChatAppModeStore.setState({ appMode: 'local' });

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(mockFetchArtifactVisual).not.toHaveBeenCalled();
      for (const label of [ARTIFACTS_LABEL, VISUALS_LABEL]) {
        expect(getByLabelText(label)).toBeDisabled();
        expect(getByLabelText(label).props.accessibilityHint).toBe('Cloud only');
      }
    });
  });

  describe('Tool access choice', () => {
    const AUTO_LABEL = 'Auto. AGI chooses for you';
    const ON_DEMAND_LABEL = 'On demand. Load tools when needed. More steps, lower accuracy';
    const ALWAYS_LABEL = 'Always available. Ready from the start. Fewer messages, better accuracy';
    const CONNECT_HINT = 'Applies when you connect apps.';
    const CONNECTED = { connectors: [{ connectorId: 'github' }], available: [] };

    const settle = () =>
      act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

    beforeEach(() => {
      activateCloudAccount('tool-access-owner');
      useAuthStore.setState({
        isClerkLoaded: true,
        isClerkSignedIn: true,
        clerkUserId: 'tool-access-owner',
      });
      mockApprovalFetch.mockResolvedValue({ settings: {}, autonomousToolApprovalsAllowed: false });
      useWaitlistStore.setState({ cloudUnlocked: true });
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockFetchPreference.mockResolvedValue({ cloudCodeExecution: false });
    });

    it('stays hidden while the server does not read the choice', async () => {
      mockFetchToolAccess.mockResolvedValue({ mode: 'always', available: false });

      const { queryByText, queryByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(mockFetchToolAccess).toHaveBeenCalledTimes(1);
      expect(queryByText('Tool access')).toBeNull();
      expect(queryByText(CONNECT_HINT)).toBeNull();
      expect(queryByLabelText(ALWAYS_LABEL)).toBeNull();
      expect(mockFetchConnectorDirectory).not.toHaveBeenCalled();
    });

    it('stays hidden when the account read fails before the server ever reported it', async () => {
      mockFetchToolAccess.mockRejectedValue(new Error('offline'));

      const { queryByText } = render(<CapabilitiesScreen />);
      await settle();

      expect(queryByText('Tool access')).toBeNull();
    });

    it('stays hidden in Local Mode and when signed out of Cloud, without reading the account', async () => {
      useReportedToolAccess.setState({ available: true });
      useChatAppModeStore.setState({ appMode: 'local' });

      const local = render(<CapabilitiesScreen />);
      await settle();
      expect(local.queryByText('Tool access')).toBeNull();
      local.unmount();

      useChatAppModeStore.setState({ appMode: 'cloud' });
      useWaitlistStore.setState({ cloudUnlocked: false });
      const signedOut = render(<CapabilitiesScreen />);
      await settle();
      expect(signedOut.queryByText('Tool access')).toBeNull();
      expect(mockFetchToolAccess).not.toHaveBeenCalled();
    });

    it('says it applies once apps are connected when none are', async () => {
      mockFetchToolAccess.mockResolvedValue({ mode: 'auto', available: true });

      const { getByText, queryByLabelText } = render(<CapabilitiesScreen />);
      await settle();

      expect(getByText('Tool access')).toBeTruthy();
      expect(getByText(CONNECT_HINT)).toBeTruthy();
      expect(queryByLabelText(AUTO_LABEL)).toBeNull();
    });

    it('offers three choices with the saved one checked once an app is connected', async () => {
      mockFetchToolAccess.mockResolvedValue({ mode: 'on_demand', available: true });
      mockFetchConnectorDirectory.mockResolvedValue(CONNECTED);

      const { getByText, getByLabelText, getAllByRole, queryByText } = render(
        <CapabilitiesScreen />,
      );
      await settle();

      expect(getByText('Tool access')).toBeTruthy();
      expect(queryByText(CONNECT_HINT)).toBeNull();
      expect(getAllByRole('radio')).toHaveLength(3);
      expect(getByLabelText(AUTO_LABEL).props.accessibilityState).toMatchObject({
        checked: false,
      });
      expect(getByLabelText(ON_DEMAND_LABEL).props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(getByLabelText(ALWAYS_LABEL).props.accessibilityState).toMatchObject({
        checked: false,
      });
      expect(getByLabelText(ALWAYS_LABEL)).not.toBeDisabled();
    });

    it('still offers the choices when the connected apps cannot be listed', async () => {
      mockFetchToolAccess.mockResolvedValue({ mode: 'auto', available: true });
      mockFetchConnectorDirectory.mockRejectedValue(new Error('offline'));

      const { getAllByRole, queryByText } = render(<CapabilitiesScreen />);
      await settle();

      expect(getAllByRole('radio')).toHaveLength(3);
      expect(queryByText(CONNECT_HINT)).toBeNull();
    });

    it('saves a new choice to the account at once', async () => {
      mockFetchToolAccess.mockResolvedValue({ mode: 'auto', available: true });
      mockFetchConnectorDirectory.mockResolvedValue(CONNECTED);

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent.press(getByLabelText(ALWAYS_LABEL));

      expect(getByLabelText(ALWAYS_LABEL).props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(mockPatchPreference).toHaveBeenCalledWith(
        'capabilities',
        { toolAccess: 'always' },
        expect.anything(),
      );
      await settle();
      expect(getByLabelText(ALWAYS_LABEL).props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(getByLabelText(AUTO_LABEL).props.accessibilityState).toMatchObject({
        checked: false,
      });
    });

    it('does not write again when the checked choice is tapped', async () => {
      mockFetchToolAccess.mockResolvedValue({ mode: 'auto', available: true });
      mockFetchConnectorDirectory.mockResolvedValue(CONNECTED);

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent.press(getByLabelText(AUTO_LABEL));

      expect(mockPatchPreference).not.toHaveBeenCalledWith(
        'capabilities',
        expect.objectContaining({ toolAccess: expect.anything() }),
        expect.anything(),
      );
    });

    it('goes back to the saved choice and says Not saved when the write fails', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockFetchToolAccess.mockResolvedValue({ mode: 'on_demand', available: true });
      mockFetchConnectorDirectory.mockResolvedValue(CONNECTED);
      mockPatchPreference.mockRejectedValue(new Error('offline'));

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      fireEvent.press(getByLabelText(ALWAYS_LABEL));
      await settle();

      expect(getByLabelText(ON_DEMAND_LABEL).props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(getByLabelText(ALWAYS_LABEL).props.accessibilityState).toMatchObject({
        checked: false,
      });
      expect(alert).toHaveBeenCalledWith(
        'Not saved',
        'This setting could not be saved to your account. Check your connection and try again.',
      );
      alert.mockRestore();
    });

    it('reads the choice again for the new account after an account switch', async () => {
      mockFetchToolAccess.mockResolvedValueOnce({ mode: 'always', available: true });
      mockFetchConnectorDirectory.mockResolvedValue(CONNECTED);

      const { getByLabelText } = render(<CapabilitiesScreen />);
      await settle();
      expect(getByLabelText(ALWAYS_LABEL).props.accessibilityState).toMatchObject({
        checked: true,
      });

      mockFetchToolAccess.mockResolvedValueOnce({ mode: 'on_demand', available: true });
      act(() => {
        activateCloudAccount('tool-access-second-owner');
      });
      await settle();

      expect(mockFetchToolAccess).toHaveBeenCalledTimes(2);
      expect(mockFetchToolAccess).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: 'tool-access-second-owner' }),
      );
      expect(getByLabelText(ON_DEMAND_LABEL).props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(getByLabelText(ALWAYS_LABEL).props.accessibilityState).toMatchObject({
        checked: false,
      });
    });

    it('locks the choices with a note when a later account read fails', async () => {
      useReportedToolAccess.setState({ available: true });
      mockFetchToolAccess.mockRejectedValue(new Error('offline'));

      const { getByLabelText, getByText, getAllByRole } = render(<CapabilitiesScreen />);
      await settle();

      expect(getAllByRole('radio')).toHaveLength(3);
      for (const radio of getAllByRole('radio')) {
        expect(radio.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
      }
      expect(getByLabelText(AUTO_LABEL)).toBeDisabled();
      expect(getByLabelText(AUTO_LABEL).props.accessibilityHint).toBe(
        'Could not load this setting from your account. Check your connection and try again.',
      );
      expect(
        getByText(
          'Could not load this setting from your account. Check your connection and try again.',
        ),
      ).toBeTruthy();
      fireEvent.press(getByLabelText(ALWAYS_LABEL));
      expect(mockPatchPreference).not.toHaveBeenCalled();
    });
  });

  it('shows shared loading and initial-load error in both approval summaries', async () => {
    activateCloudAccount('summary-owner');
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'summary-owner',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    let reject!: (error: Error) => void;
    mockApprovalFetch.mockReturnValueOnce(
      new Promise((_resolve, no) => {
        reject = no;
      }),
    );
    const screen = render(
      <>
        <CapabilitiesScreen />
        <ApprovalPolicySummary label="Permissions" helper="Approval summary" />
      </>,
    );
    expect(mockApprovalFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Approval summary').props.maxFontSizeMultiplier).toBe(
      ROW_LABEL_TEXT_SCALE_LIMIT,
    );
    expect(
      screen.getByLabelText('Action approvals. Choose how AGI asks before tool actions. Loading…'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Permissions. Loading…' })).toBeTruthy();
    await act(async () => {
      reject(new Error('offline'));
      await Promise.resolve();
    });
    expect(
      screen.getByLabelText(
        'Action approvals. Choose how AGI asks before tool actions. Unavailable',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Permissions. Unavailable' })).toBeTruthy();
  });
});
