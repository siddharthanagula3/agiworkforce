import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams: { id?: string } = {};
const mockListAgents = jest.fn();
const mockGetAgent = jest.fn();
const mockCreateAgent = jest.fn();
const mockUpdateAgent = jest.fn();
const mockStartConversation = jest.fn();
const mockPublishAgent = jest.fn();

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
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
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
  publishAgent: (...args: unknown[]) => mockPublishAgent(...args),
  listAgentFiles: jest.fn(async () => []),
  listAgentVersions: jest.fn(async () => []),
  getAgentShare: jest.fn(async () => ({ visibility: 'private', workspaceName: null, members: [] })),
  getAgentUsage: jest.fn(async () => ({ windowDays: 30, conversations: 3, people: 1, turns: 9 })),
  getAgentActivity: jest.fn(async () => ({ conversations: [], routines: [] })),
}));

import { NEW_AGENT_DRAFT, type ManagedCloudAgent } from '@agiworkforce/cloud-contracts';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { AgentEditorScreen } from '../AgentEditorScreen';
import { AgentsScreen, groupAgents } from '../AgentsScreen';

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
  publishedVersion: 1,
};

describe('mobile agents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.id;
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockListAgents.mockResolvedValue([AGENT, SHARED]);
  });

  it('groups owned, shared and retired agents', () => {
    const retired = { ...AGENT, id: 'r', name: 'Old', status: 'retired' as const };
    expect(groupAgents([SHARED, retired, AGENT]).map((section) => section.title)).toEqual([
      'Your agents',
      'Shared with you',
      'Retired',
    ]);
  });

  it('gates Local Mode without reading Cloud agents', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByText } = render(<AgentsScreen />);
    expect(getByText('Agents are available in AGI Cloud')).toBeTruthy();
    expect(mockListAgents).not.toHaveBeenCalled();
  });

  it('lists agents with their state and starts a chat with one', async () => {
    mockStartConversation.mockResolvedValue('conv-1');
    const { getByText, getByLabelText } = render(<AgentsScreen />);
    await waitFor(() => expect(getByText('Planner')).toBeTruthy());
    expect(getByText('Draft')).toBeTruthy();
    expect(getByText('Shared by Ana')).toBeTruthy();

    fireEvent.press(getByLabelText('Chat with Planner'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'conv-1' },
      }),
    );
    expect(mockStartConversation).toHaveBeenCalledWith(AGENT.id);
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

  it('keeps a recipient read only', async () => {
    mockParams.id = SHARED.id;
    mockGetAgent.mockResolvedValue(SHARED);
    const { findByText, queryByText } = render(<AgentEditorScreen />);
    expect(await findByText('Only the owner can change this agent.')).toBeTruthy();
    expect(queryByText('Save')).toBeNull();
    expect(queryByText('Delete agent')).toBeNull();
  });
});
