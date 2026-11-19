import React from 'react';
import { BackHandler } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockInstallations = jest.fn();
const mockCatalog = jest.fn();
const mockAgents = jest.fn();
const mockBrowse = jest.fn();
const mockDirectory = jest.fn();
const mockPluginDirectory = jest.fn();

jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock();
  return {
    ...actual,
    useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: jest.fn(() => true) }),
  };
});
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
jest.mock('@/src/lib/Capabilities', () => ({
  ...jest.requireActual('@/src/lib/Capabilities'),
  useCapability: () => true,
}));
jest.mock('@/services/connectors', () => ({
  ...jest.requireActual('@/services/connectors'),
  browseConnectorListings: (...args: unknown[]) => mockBrowse(...args),
  fetchConnectorDirectory: (...args: unknown[]) => mockDirectory(...args),
}));
jest.mock('@/src/features/skills/service', () => ({
  ...jest.requireActual('@/src/features/skills/service'),
  fetchSkillCatalog: (...args: unknown[]) => mockCatalog(...args),
}));
jest.mock('@/src/features/agents/service', () => ({
  ...jest.requireActual('@/src/features/agents/service'),
  listAgents: (...args: unknown[]) => mockAgents(...args),
}));
jest.mock('@/src/features/plugins/service', () => ({
  ...jest.requireActual('@/src/features/plugins/service'),
  fetchPluginInstallations: (...args: unknown[]) => mockInstallations(...args),
  fetchPluginDirectory: (...args: unknown[]) => mockPluginDirectory(...args),
}));
jest.mock('../PersonalSourceRows', () => ({ PersonalSourceRows: () => null }));
jest.mock('../DiscoverSection', () => {
  const { Text } = jest.requireActual('react-native');
  const { createElement } = jest.requireActual('react');
  return { DiscoverSection: () => createElement(Text, null, 'discover-section') };
});

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CustomizeScreen } from '../CustomizeScreen';

const NOTE = 'Skills, connectors and agents need AGI Cloud';

function skill(name: string, description: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    description,
    source: 'built-in',
    lifecycle: 'included',
    downloadable: false,
    ...overrides,
  };
}

function agent(id: string, name: string, description: string) {
  return { id, name, description };
}

function listing(id: string, name: string, description: string) {
  return { id, name, description, categories: [], connectable: 'connect' };
}

function plugin(id: string, name: string, description: string) {
  return { id, name, description };
}

function seedCloud() {
  mockInstallations.mockResolvedValue([]);
  mockCatalog.mockResolvedValue([
    skill('calendar-planner', 'Plans your calendar around focus time'),
    skill('budget-review', 'Reviews a budget'),
    skill('calendar-later', 'Calendar skill that is not out yet', { lifecycle: 'planned' }),
  ]);
  mockAgents.mockResolvedValue([
    agent('11111111-1111-4111-8111-111111111111', 'Scheduler', 'Keeps your calendar clear'),
    agent('22222222-2222-4222-8222-222222222222', 'Editor', 'Edits drafts'),
  ]);
  mockBrowse.mockResolvedValue({
    entries: [listing('notion', 'Notion Calendar', 'Calendar inside Notion')],
    nextCursor: null,
    categories: [],
  });
  mockDirectory.mockResolvedValue({ connectors: [] });
  mockPluginDirectory.mockResolvedValue({
    entries: [plugin('team-calendar', 'Team Calendar', 'Shared calendars for a team')],
    total: 1,
    nextCursor: null,
  });
}

async function openSearch(utils: ReturnType<typeof render>) {
  fireEvent.press(utils.getByLabelText('Search Customize'));
  return utils.findByLabelText('Search Customize');
}

describe('customize search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    seedCloud();
  });

  it('puts a magnifier in the header that opens a focused field with Cancel', async () => {
    const utils = render(<CustomizeScreen />);
    const field = await openSearch(utils);
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.maxFontSizeMultiplier).toBe(2);
    expect(utils.getByLabelText('Cancel search')).toBeTruthy();
    expect(utils.queryByLabelText('Go back')).toBeNull();
  });

  it('shows the normal page while the query is empty and again after Cancel', async () => {
    const utils = render(<CustomizeScreen />);
    const field = await openSearch(utils);
    expect(utils.getByText('discover-section')).toBeTruthy();
    fireEvent.changeText(field, '   ');
    expect(utils.getByText('discover-section')).toBeTruthy();
    expect(utils.queryByText(/^Nothing matches/)).toBeNull();

    fireEvent.changeText(field, 'calendar');
    await utils.findByText('Skills');
    fireEvent.press(utils.getByLabelText('Cancel search'));
    expect(utils.getByLabelText('Search Customize')).toBeTruthy();
    expect(utils.getByText('discover-section')).toBeTruthy();
    expect(utils.queryByText('calendar-planner')).toBeNull();
  });

  it('groups results under Skills, Connectors, Agents and Plugins', async () => {
    const utils = render(<CustomizeScreen />);
    const field = await openSearch(utils);
    fireEvent.changeText(field, 'calendar');

    expect(await utils.findByText('Team Calendar')).toBeTruthy();
    const headings = utils.getAllByRole('header').map((node) => node.props.children);
    expect(headings).toEqual(['Skills', 'Connectors', 'Agents', 'Plugins']);
    expect(utils.getByText('calendar-planner')).toBeTruthy();
    expect(utils.getByText('Notion Calendar')).toBeTruthy();
    expect(utils.getByText('Scheduler')).toBeTruthy();
    expect(utils.queryByText('budget-review')).toBeNull();
    expect(utils.queryByText('Editor')).toBeNull();
    expect(utils.queryByText('calendar-later')).toBeNull();
    expect(utils.queryByText('discover-section')).toBeNull();
  });

  it('asks the server for connectors and plugins with the query', async () => {
    const utils = render(<CustomizeScreen />);
    fireEvent.changeText(await openSearch(utils), ' calendar ');
    await utils.findByText('Team Calendar');
    expect(mockBrowse).toHaveBeenCalledWith({ search: 'calendar' });
    expect(mockPluginDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'calendar' }),
      expect.anything(),
    );
  });

  it('opens each result on its own page', async () => {
    const utils = render(<CustomizeScreen />);
    fireEvent.changeText(await openSearch(utils), 'calendar');
    await utils.findByText('Team Calendar');

    fireEvent.press(
      utils.getByLabelText('calendar-planner. Plans your calendar around focus time'),
    );
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/skills/[name]',
      params: { name: 'calendar-planner' },
    });
    fireEvent.press(utils.getByLabelText('Notion Calendar. Calendar inside Notion'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'notion' },
    });
    fireEvent.press(utils.getByLabelText('Scheduler. Keeps your calendar clear'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/agents/[id]',
      params: { id: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.press(utils.getByLabelText('Team Calendar. Shared calendars for a team'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/plugins/[id]',
      params: { id: 'team-calendar' },
    });
  });

  it('shows five rows per group and the rest on request', async () => {
    mockCatalog.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => skill(`mail-skill-${index}`, 'Handles mail')),
    );
    const utils = render(<CustomizeScreen />);
    fireEvent.changeText(await openSearch(utils), 'mail');
    await utils.findByText('mail-skill-0');
    expect(utils.queryByText('mail-skill-5')).toBeNull();
    fireEvent.press(utils.getByLabelText('Show all 7 skills'));
    expect(utils.getByText('mail-skill-6')).toBeTruthy();
  });

  it('says nothing matches and clears the query', async () => {
    mockBrowse.mockResolvedValue({ entries: [], nextCursor: null, categories: [] });
    mockPluginDirectory.mockResolvedValue({ entries: [], total: 0, nextCursor: null });
    const utils = render(<CustomizeScreen />);
    const field = await openSearch(utils);
    fireEvent.changeText(field, 'zzzz');
    expect(await utils.findByText('Nothing matches "zzzz"')).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Clear'));
    expect(utils.queryByText(/^Nothing matches/)).toBeNull();
    expect(utils.getByText('discover-section')).toBeTruthy();
  });

  it('does not claim nothing matches while results are still loading', async () => {
    mockBrowse.mockReturnValue(new Promise(() => undefined));
    mockPluginDirectory.mockReturnValue(new Promise(() => undefined));
    const utils = render(<CustomizeScreen />);
    fireEvent.changeText(await openSearch(utils), 'zzzz');
    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalled();
      expect(mockPluginDirectory).toHaveBeenCalled();
      expect(mockCatalog).toHaveBeenCalled();
      expect(mockAgents).toHaveBeenCalled();
    });
    await act(async () => {});
    expect(utils.queryByText(/^Nothing matches/)).toBeNull();
    expect(utils.queryByText('Scheduler')).toBeNull();
  });

  it('does not list rows from the previous query while the new one loads', async () => {
    const utils = render(<CustomizeScreen />);
    const field = await openSearch(utils);
    fireEvent.changeText(field, 'calendar');
    expect(await utils.findByText('Team Calendar')).toBeTruthy();
    expect(utils.getByText('Notion Calendar')).toBeTruthy();

    mockBrowse.mockReturnValue(new Promise(() => undefined));
    mockPluginDirectory.mockReturnValue(new Promise(() => undefined));
    fireEvent.changeText(field, 'zzzz');
    expect(utils.queryByText('Team Calendar')).toBeNull();
    expect(utils.queryByText('Notion Calendar')).toBeNull();

    await waitFor(() => expect(mockPluginDirectory).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(utils.queryByText('Team Calendar')).toBeNull();
    expect(utils.queryByText('Notion Calendar')).toBeNull();
    expect(utils.queryByText(/^Nothing matches/)).toBeNull();
  });

  it('closes the search on the hardware back button instead of leaving the screen', async () => {
    const remove = jest.fn();
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
    const utils = render(<CustomizeScreen />);
    expect(add).not.toHaveBeenCalled();
    await openSearch(utils);
    const handler = add.mock.calls.at(-1)?.[1] as () => boolean;
    expect(add).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));

    let handled = false;
    act(() => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(utils.queryByLabelText('Cancel search')).toBeNull();
    expect(utils.getByLabelText('Search Customize')).toBeTruthy();
    expect(utils.getByText('discover-section')).toBeTruthy();
    expect(remove).toHaveBeenCalled();
    add.mockRestore();
  });

  it('offers a retry instead of saying nothing matches when a source fails', async () => {
    mockPluginDirectory.mockRejectedValueOnce(new Error('offline'));
    const utils = render(<CustomizeScreen />);
    fireEvent.changeText(await openSearch(utils), 'calendar');
    expect(await utils.findByText('Could not load all results')).toBeTruthy();
    expect(utils.getByText('Scheduler')).toBeTruthy();
    expect(utils.queryByText(/^Nothing matches/)).toBeNull();

    await act(async () => {
      fireEvent.press(utils.getByLabelText('Try again'));
    });
    expect(await utils.findByText('Team Calendar')).toBeTruthy();
    expect(utils.queryByText('Could not load all results')).toBeNull();
  });

  it('only searches locally in Local mode and says what needs AGI Cloud', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const utils = render(<CustomizeScreen />);
    const field = await openSearch(utils);
    expect(utils.getByText(NOTE)).toBeTruthy();

    fireEvent.changeText(field, 'skills');
    expect(await utils.findByLabelText('Skills')).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Skills'));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/skills');

    fireEvent.changeText(field, 'calendar');
    expect(utils.getByText('Nothing matches "calendar"')).toBeTruthy();
    expect(utils.getByText(NOTE)).toBeTruthy();

    expect(mockCatalog).not.toHaveBeenCalled();
    expect(mockAgents).not.toHaveBeenCalled();
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(mockPluginDirectory).not.toHaveBeenCalled();
  });

  it('does not show the Local line in AGI Cloud', async () => {
    const utils = render(<CustomizeScreen />);
    await openSearch(utils);
    expect(utils.queryByText(NOTE)).toBeNull();
  });
});
