import React from 'react';
import { Alert, SectionList, StyleSheet } from 'react-native';
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams: { id?: string } = {};
const mockListAgents = jest.fn();
const mockGetAgent = jest.fn();
const mockCreateAgent = jest.fn();
const mockUpdateAgent = jest.fn();
const mockStartConversation = jest.fn();
const mockStartCatalogConversation = jest.fn();
const mockPublishAgent = jest.fn();
const mockSetAgentStatus = jest.fn();
const mockRestoreAgentVersion = jest.fn();
const mockListAgentVersions = jest.fn();
const mockStorage = new Map<string, string>();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: mockReplace,
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn() }));
jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: () => null,
}));
jest.mock('@/src/features/model-picker/service', () => ({ getDisplayName: (id: string) => id }));
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: jest.fn(async () => ({ connectors: [] })),
}));
jest.mock('@/src/features/skills/service', () => ({
  fetchManagedSkills: jest.fn(async () => []),
}));
jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  listAgents: (...args: unknown[]) => mockListAgents(...args),
  getAgent: (...args: unknown[]) => mockGetAgent(...args),
  createAgent: (...args: unknown[]) => mockCreateAgent(...args),
  updateAgent: (...args: unknown[]) => mockUpdateAgent(...args),
  startAgentConversation: (...args: unknown[]) => mockStartConversation(...args),
  startCatalogAgentConversation: (...args: unknown[]) => mockStartCatalogConversation(...args),
  publishAgent: (...args: unknown[]) => mockPublishAgent(...args),
  listAgentFiles: jest.fn(async () => []),
  setAgentStatus: (...args: unknown[]) => mockSetAgentStatus(...args),
  restoreAgentVersion: (...args: unknown[]) => mockRestoreAgentVersion(...args),
  listAgentVersions: (...args: unknown[]) => mockListAgentVersions(...args),
  getAgentShare: jest.fn(async () => ({ visibility: 'private', workspaceName: null, members: [] })),
  getAgentUsage: jest.fn(async () => ({ windowDays: 30, conversations: 3, people: 1, turns: 9 })),
  getAgentActivity: jest.fn(async () => ({ conversations: [], routines: [] })),
}));

import {
  AGENT_CATALOG,
  NEW_AGENT_DRAFT,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';
import { PROJECT_ACCENTS, PROJECT_ICONS } from '@/src/features/projects/projectAppearance';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { AgentEditorScreen } from '../AgentEditorScreen';
import {
  AgentsScreen,
  __resetAgentsSegmentForTests,
  agentListSections,
  agentsSegments,
  groupAgents,
} from '../AgentsScreen';

const AGENT: ManagedCloudAgent = {
  ...NEW_AGENT_DRAFT,
  name: 'Planner',
  description: 'Plans the week',
  id: '7d1b5c1e-0b3f-4a43-9a43-6b1d0f2b5f11',
  isOwner: true,
  ownerName: null,
  organizationId: null,
  status: 'active',
  visibility: 'private',
  publishedVersion: null,
  hasUnpublishedChanges: false,
  pausedAt: null,
  retiredAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const SHARED: ManagedCloudAgent = {
  ...AGENT,
  id: '8d1b5c1e-0b3f-4a43-9a43-6b1d0f2b5f12',
  name: 'Reviewer',
  isOwner: false,
  ownerName: 'Ana',
  ownerUserId: 'user-ana',
  publishedVersion: 1,
};

type AlertButton = { text: string; onPress?: () => void };
const pressAlertButton = (alert: jest.SpyInstance, text: string) =>
  (alert.mock.calls.at(-1)?.[2] as AlertButton[])
    .find((button) => button.text === text)
    ?.onPress?.();

describe('mobile agents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
    delete mockParams.id;
    __resetAgentsSegmentForTests();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockListAgents.mockResolvedValue([AGENT, SHARED]);
    mockListAgentVersions.mockResolvedValue([]);
  });

  it('groups owned, shared and retired agents', () => {
    const retired = { ...AGENT, id: 'r', name: 'Old', status: 'retired' as const };
    expect(groupAgents([SHARED, retired, AGENT]).map((section) => section.title)).toEqual([
      'Your agents',
      'Shared with you',
      'Retired',
    ]);
  });

  it('draws every built-in agent with an icon and accent the app knows', () => {
    for (const entry of AGENT_CATALOG) {
      expect(PROJECT_ICONS.map((icon) => icon.id)).toContain(entry.icon);
      expect(PROJECT_ACCENTS.map((accent) => accent.id)).toContain(entry.accentColor);
    }
  });

  it('puts By AGI after Your agents and offers Shared only when agents are shared', () => {
    const titles = (agents: ManagedCloudAgent[]) =>
      agentListSections(agents, 'all').map((section) => section.title);
    expect(titles([AGENT, SHARED])).toEqual(['Your agents', 'By AGI', 'Shared with you']);
    expect(titles([])).toEqual(['By AGI']);
    expect(agentsSegments([AGENT])).toEqual(['all', 'yours', 'by-agi']);
    expect(agentsSegments([AGENT, SHARED])).toEqual(['all', 'yours', 'by-agi', 'shared']);
    expect(agentListSections([AGENT, SHARED], 'yours').map((section) => section.title)).toEqual([
      'Your agents',
    ]);
    expect(agentListSections([AGENT, SHARED], 'shared').map((section) => section.title)).toEqual([
      'Shared with you',
    ]);
  });

  it('gates Local Mode without reading Cloud agents', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByText } = render(<AgentsScreen />);
    expect(getByText('Agents are available in AGI Cloud')).toBeTruthy();
    expect(mockListAgents).not.toHaveBeenCalled();
  });

  it('holds the segment bar and the list to the reading column on a wide pane', async () => {
    const { getByText, getByTestId, UNSAFE_getByType } = render(<AgentsScreen />);
    await waitFor(() => expect(getByText('Planner')).toBeTruthy());

    expect(StyleSheet.flatten(getByTestId('agents.segments.column').props.style)).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
    expect(
      StyleSheet.flatten(UNSAFE_getByType(SectionList).props.contentContainerStyle),
    ).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 16,
    });
  });

  it('lists agents with their state and starts a chat with one', async () => {
    mockStartConversation.mockResolvedValue('conv-1');
    const { getByText, getByLabelText } = render(<AgentsScreen />);
    await waitFor(() => expect(getByText('Planner')).toBeTruthy());
    expect(getByText('Draft')).toBeTruthy();
    fireEvent.press(getByLabelText('Shared'));
    expect(getByText('Shared by Ana')).toBeTruthy();
    fireEvent.press(getByLabelText('All'));

    fireEvent.press(getByLabelText('Chat with Planner'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'conv-1' },
      }),
    );
    expect(mockStartConversation).toHaveBeenCalledWith(AGENT.id);
  });

  it('lists the built-in agents after Your agents and starts one chat from a row', async () => {
    mockStartCatalogConversation.mockResolvedValue({
      agent: { ...AGENT, id: 'copy-1', name: 'Brainstormer' },
      conversationId: 'conv-9',
    });
    const { findByText, getByLabelText, getByText } = render(<AgentsScreen />);
    await findByText('Planner');
    expect(getByText('BY AGI')).toBeTruthy();
    for (const entry of AGENT_CATALOG) {
      expect(getByText(entry.name)).toBeTruthy();
      expect(getByLabelText(`Chat with ${entry.name}`)).toBeTruthy();
    }

    fireEvent.press(getByLabelText('Chat with Brainstormer'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'conv-9' },
      }),
    );
    expect(mockStartCatalogConversation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Brainstormer' }),
    );
    expect(mockStartConversation).not.toHaveBeenCalled();
  });

  it('starts a built-in chat from the row itself', async () => {
    mockStartCatalogConversation.mockResolvedValue({ agent: AGENT, conversationId: 'conv-2' });
    const { findByLabelText } = render(<AgentsScreen />);
    fireEvent.press(await findByLabelText(/^Coding partner\./));
    await waitFor(() => expect(mockStartCatalogConversation).toHaveBeenCalledTimes(1));
  });

  it('says which built-in agent could not be started', async () => {
    mockStartCatalogConversation.mockRejectedValue(new Error('down'));
    const { findByLabelText, findByText } = render(<AgentsScreen />);
    fireEvent.press(await findByLabelText('Chat with Brainstormer'));
    expect(await findByText('Could not start Brainstormer.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('filters by segment, remembers the choice and shows Shared only when shared', async () => {
    const first = render(<AgentsScreen />);
    fireEvent.press(await first.findByLabelText('Yours'));
    expect(first.getByText('Planner')).toBeTruthy();
    expect(first.queryByText('Reviewer')).toBeNull();
    expect(first.queryByText('Brainstormer')).toBeNull();

    fireEvent.press(first.getByLabelText('Shared'));
    expect(first.getByText('Reviewer')).toBeTruthy();
    expect(first.queryByText('Planner')).toBeNull();

    fireEvent.press(first.getByLabelText('By AGI'));
    expect(first.getByText('Brainstormer')).toBeTruthy();
    expect(first.queryByText('Planner')).toBeNull();
    first.unmount();

    const second = render(<AgentsScreen />);
    await waitFor(() =>
      expect(second.getByLabelText('By AGI').props.accessibilityState).toEqual({ selected: true }),
    );
    expect(second.queryByText('Planner')).toBeNull();
    second.unmount();

    mockListAgents.mockResolvedValue([AGENT]);
    const third = render(<AgentsScreen />);
    await waitFor(() => expect(third.getByLabelText('Yours')).toBeTruthy());
    expect(third.queryByLabelText('Shared')).toBeNull();
  });

  it('says there is nothing in Yours and offers to create an agent', async () => {
    mockListAgents.mockResolvedValue([SHARED]);
    const { findByLabelText, getByText, getAllByLabelText } = render(<AgentsScreen />);
    fireEvent.press(await findByLabelText('Yours'));
    expect(getByText('No agents here yet')).toBeTruthy();
    expect(getByText('Create an agent')).toBeTruthy();
    expect(getAllByLabelText('Create an agent')).toHaveLength(2);
  });

  it('creates an agent from the editor with the instructions and tools set', async () => {
    mockParams.id = 'new';
    mockCreateAgent.mockResolvedValue(AGENT);
    const { getByLabelText } = render(<AgentEditorScreen />);

    fireEvent.changeText(getByLabelText('Name'), 'Planner');
    fireEvent.changeText(getByLabelText('Instructions'), 'Plan my week from my calendar.');
    fireEvent(getByLabelText('Code execution'), 'valueChange', false);
    fireEvent.press(getByLabelText('Create the agent'));

    await waitFor(() => expect(mockCreateAgent).toHaveBeenCalled());
    expect(mockCreateAgent.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: 'Planner',
        instructions: 'Plan my week from my calendar.',
        codeExecution: false,
        webSearch: true,
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/agents/[id]',
        params: { id: AGENT.id },
      }),
    );
  });

  it('publishes a saved draft and shows usage for an owned agent', async () => {
    mockParams.id = AGENT.id;
    mockGetAgent.mockResolvedValue(AGENT);
    mockPublishAgent.mockResolvedValue({ ...AGENT, publishedVersion: 1 });
    const { getByText, findByText, findByLabelText } = render(<AgentEditorScreen />);

    fireEvent.press(await findByLabelText('Publish this agent'));
    await waitFor(() => expect(mockPublishAgent).toHaveBeenCalledWith(AGENT.id, ''));
    expect(await findByText('Last 30 days: 3 chats, 1 people, 9 messages')).toBeTruthy();
    expect(getByText('Delete agent')).toBeTruthy();
  });

  it('keeps unsaved instruction edits when the agent is paused and resumed', async () => {
    mockParams.id = AGENT.id;
    mockGetAgent.mockResolvedValue({ ...AGENT, instructions: 'Saved instructions' });
    mockSetAgentStatus
      .mockResolvedValueOnce({ ...AGENT, instructions: 'Saved instructions', status: 'paused' })
      .mockResolvedValueOnce({ ...AGENT, instructions: 'Saved instructions', status: 'active' });
    const { findByLabelText, findByText, getByLabelText, getByText } = render(
      <AgentEditorScreen />,
    );

    fireEvent.changeText(await findByLabelText('Instructions'), 'Unsaved instructions');
    fireEvent.press(getByText('Pause agent'));

    expect(await findByText('Resume agent')).toBeTruthy();
    expect(mockSetAgentStatus).toHaveBeenLastCalledWith(AGENT.id, 'paused');
    expect(getByLabelText('Instructions').props.value).toBe('Unsaved instructions');

    fireEvent.press(getByText('Resume agent'));

    expect(await findByText('Pause agent')).toBeTruthy();
    expect(getByLabelText('Instructions').props.value).toBe('Unsaved instructions');

    mockUpdateAgent.mockResolvedValue({ ...AGENT, instructions: 'Unsaved instructions' });
    fireEvent.press(getByLabelText('Save changes as a draft'));
    await waitFor(() =>
      expect(mockUpdateAgent).toHaveBeenCalledWith(
        AGENT.id,
        expect.objectContaining({ instructions: 'Unsaved instructions' }),
      ),
    );
  });

  it('replaces the draft when a saved version is restored', async () => {
    mockParams.id = AGENT.id;
    mockGetAgent.mockResolvedValue({ ...AGENT, instructions: 'Saved instructions' });
    mockListAgentVersions.mockResolvedValue([
      {
        version: 1,
        note: '',
        publishedAt: '2026-10-02T00:00:00.000Z',
        publishedByName: 'Ana',
      },
    ]);
    mockRestoreAgentVersion.mockResolvedValue({ ...AGENT, instructions: 'Older instructions' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByLabelText, getByLabelText } = render(<AgentEditorScreen />);

    fireEvent.changeText(await findByLabelText('Instructions'), 'Unsaved instructions');
    fireEvent.press(await findByLabelText('Restore version 1 as the draft'));

    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0]?.[0]).toBe('Replace your unsaved changes?');
    expect(mockRestoreAgentVersion).not.toHaveBeenCalled();

    pressAlertButton(alert, 'Restore');

    await waitFor(() =>
      expect(getByLabelText('Instructions').props.value).toBe('Older instructions'),
    );
    alert.mockRestore();
  });

  it('keeps unsaved edits when the person declines to restore over them', async () => {
    mockParams.id = AGENT.id;
    mockGetAgent.mockResolvedValue({ ...AGENT, instructions: 'Saved instructions' });
    mockListAgentVersions.mockResolvedValue([
      { version: 1, note: '', publishedAt: '2026-10-02T00:00:00.000Z', publishedByName: 'Ana' },
    ]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByLabelText, getByLabelText } = render(<AgentEditorScreen />);

    fireEvent.changeText(await findByLabelText('Instructions'), 'Unsaved instructions');
    fireEvent.press(await findByLabelText('Restore version 1 as the draft'));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    pressAlertButton(alert, 'Cancel');

    expect(mockRestoreAgentVersion).not.toHaveBeenCalled();
    expect(getByLabelText('Instructions').props.value).toBe('Unsaved instructions');
    alert.mockRestore();
  });

  it('says when sharing, files and version history could not be read, and retries each', async () => {
    mockParams.id = AGENT.id;
    mockGetAgent.mockResolvedValue(AGENT);
    const service = jest.requireMock('../service');
    service.getAgentShare.mockRejectedValueOnce(new Error('share down'));
    service.listAgentFiles.mockRejectedValueOnce(new Error('files down'));
    mockListAgentVersions.mockRejectedValueOnce(new Error('versions down'));
    const { findByText, queryByText, getAllByLabelText, getByText } = render(<AgentEditorScreen />);

    expect(await findByText('Could not load who can use this agent.')).toBeTruthy();
    expect(getByText('Could not load the files.')).toBeTruthy();
    expect(getByText('Could not load the version history.')).toBeTruthy();
    expect(queryByText('Loading sharing…')).toBeNull();
    expect(queryByText('No files yet.')).toBeNull();

    mockListAgentVersions.mockResolvedValue([
      { version: 1, note: '', publishedAt: '2026-10-02T00:00:00.000Z', publishedByName: 'Ana' },
    ]);
    for (const banner of getAllByLabelText('Try again')) fireEvent.press(banner);

    expect(await findByText('Version 1')).toBeTruthy();
    expect(queryByText('Could not load who can use this agent.')).toBeNull();
    expect(queryByText('Could not load the files.')).toBeNull();
    expect(getByText('No files yet.')).toBeTruthy();
  });

  it('keeps a recipient read only', async () => {
    mockParams.id = SHARED.id;
    mockGetAgent.mockResolvedValue(SHARED);
    const { findByText, queryByText } = render(<AgentEditorScreen />);
    expect(await findByText('Only the owner can change this agent.')).toBeTruthy();
    expect(queryByText('Save')).toBeNull();
    expect(queryByText('Delete agent')).toBeNull();
  });

  it('reports a shared agent from its row', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { findByLabelText, getByText, queryByLabelText } = render(<AgentsScreen />);
    expect(queryByLabelText('Report or hide Planner')).toBeNull();

    fireEvent.press(await findByLabelText('Shared'));
    fireEvent.press(await findByLabelText('Report or hide Reviewer'));
    pressAlertButton(alert, 'Report');

    await waitFor(() => expect(getByText('Report this item')).toBeTruthy());
  });

  it('hides every agent from a sharer after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { findByLabelText, queryByText, getByText } = render(<AgentsScreen />);

    fireEvent.press(await findByLabelText('Shared'));
    fireEvent.press(await findByLabelText('Report or hide Reviewer'));
    pressAlertButton(alert, 'Hide Ana');
    expect(alert.mock.calls.at(-1)?.[0]).toBe('Hide Ana?');
    pressAlertButton(alert, 'Hide');

    await waitFor(() => expect(queryByText('Reviewer')).toBeNull());
    expect(getByText('Planner')).toBeTruthy();
    expect(JSON.parse(mockStorage.get('shared-with-you:hidden-sharers:v1:user-1') ?? '[]')).toEqual(
      [{ id: 'user-ana', name: 'Ana' }],
    );
  });

  it('offers Report and Hide on a shared agent and hides it once hidden', async () => {
    mockParams.id = SHARED.id;
    mockGetAgent.mockResolvedValue(SHARED);
    const view = render(<AgentEditorScreen />);
    expect(await view.findByLabelText('Report')).toBeTruthy();
    expect(view.getByLabelText('Hide Ana')).toBeTruthy();

    mockStorage.set('shared-with-you:hidden-sharers:v1:user-1', JSON.stringify(['user-ana']));
    view.unmount();
    const hidden = render(<AgentEditorScreen />);
    expect(await hidden.findByText('You hid this sharer.')).toBeTruthy();
  });
});
