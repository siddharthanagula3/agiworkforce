import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBrowse = jest.fn();
const mockDirectory = jest.fn();
const mockCatalog = jest.fn();
const mockInstalledNames = jest.fn();
const mockInstall = jest.fn();
let mockCapability = true;

jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock();
  return {
    ...actual,
    useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: jest.fn(() => true) }),
  };
});
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
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
jest.mock('@/src/lib/Capabilities', () => ({ useCapability: () => mockCapability }));
jest.mock('@/services/connectors', () => ({
  browseConnectorListings: (...args: unknown[]) => mockBrowse(...args),
  fetchConnectorDirectory: (...args: unknown[]) => mockDirectory(...args),
}));
jest.mock('@/src/features/skills/service', () => ({
  ...jest.requireActual('@/src/features/skills/service'),
  fetchSkillCatalog: (...args: unknown[]) => mockCatalog(...args),
  fetchInstalledSkillNames: (...args: unknown[]) => mockInstalledNames(...args),
  installSkill: (...args: unknown[]) => mockInstall(...args),
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { DiscoverSection } from '../DiscoverSection';

const RELEASED = ['notion', 'linear', 'jira', 'airtable', 'canva', 'clickup', 'monday'];

function listing(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `${id} app`,
    description: `Works with ${id}`,
    categories: ['Productivity'],
    connectable: 'connect',
    ...overrides,
  };
}

function skill(name: string, installs?: number, overrides: Record<string, unknown> = {}) {
  return {
    name,
    description: `${name} skill`,
    source: 'bundled',
    lifecycle: 'included',
    downloadable: true,
    ...(installs ? { installs } : {}),
    ...overrides,
  };
}

function serve({
  listings = [],
  connections = [],
  skills = [],
  installed = [],
}: {
  listings?: unknown[];
  connections?: unknown[];
  skills?: unknown[];
  installed?: string[];
} = {}) {
  mockBrowse.mockResolvedValue({
    entries: listings,
    nextCursor: null,
    categories: ['Productivity', 'Data', 'Code'],
  });
  mockDirectory.mockResolvedValue({ connectors: connections, available: [] });
  mockCatalog.mockResolvedValue(skills);
  mockInstalledNames.mockResolvedValue(new Set(installed));
}

function signIn(mode: 'cloud' | 'local' = 'cloud', signedIn = true) {
  activateCloudAccount('user-1');
  useAuthStore.setState({
    isClerkLoaded: true,
    isClerkSignedIn: signedIn,
    clerkUserId: signedIn ? 'user-1' : null,
  });
  useChatAppModeStore.setState({ appMode: mode });
}

describe('discover section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapability = true;
    __resetCloudAccountSessionForTests();
    signIn();
    serve();
  });

  it('shows the heading, the muted line and both groups with their rows', async () => {
    serve({
      listings: [listing('notion', { featured: true }), listing('linear')],
      skills: [skill('writer', 4)],
    });
    const screen = render(<DiscoverSection />);
    expect(await screen.findByText('Everyday tools')).toBeTruthy();
    expect(screen.getByText('Customize your chats')).toBeTruthy();
    expect(screen.getByText('Add tools and skills that fit how you work')).toBeTruthy();
    expect(screen.getByText('Business essentials')).toBeTruthy();
    expect(screen.getByText('notion app')).toBeTruthy();
    expect(screen.getByText('Works with notion')).toBeTruthy();
    expect(screen.getByText('writer')).toBeTruthy();
    expect(screen.getByText('linear app')).toBeTruthy();
  });

  it('truncates a long description to one line', async () => {
    serve({ listings: [listing('notion', { featured: true })] });
    const screen = render(<DiscoverSection />);
    const description = await screen.findByText('Works with notion');
    expect(description.props.numberOfLines).toBe(1);
    expect(description.props.ellipsizeMode).toBe('tail');
  });

  it('shows three loading rows until the suggestions arrive', async () => {
    mockBrowse.mockReturnValue(new Promise(() => undefined));
    const screen = render(<DiscoverSection />);
    const loading = await screen.findByLabelText('Loading suggestions');
    expect(loading.props.accessible).toBe(true);
    expect(loading.props.accessibilityState).toEqual({ busy: true });
    expect(screen.queryByText('Everyday tools')).toBeNull();
  });

  it('hides a group that has no rows', async () => {
    serve({ listings: [listing('notion', { featured: true })] });
    const screen = render(<DiscoverSection />);
    await screen.findByText('Everyday tools');
    expect(screen.queryByText('Business essentials')).toBeNull();
  });

  it('hides the whole section when there is nothing to suggest', async () => {
    const screen = render(<DiscoverSection />);
    await waitFor(() => expect(mockBrowse).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('Loading suggestions')).toBeNull());
    expect(screen.queryByText('Customize your chats')).toBeNull();
  });

  it('says it could not load, and loads again on Retry', async () => {
    mockBrowse.mockRejectedValueOnce(new Error('offline'));
    mockCatalog.mockRejectedValueOnce(new Error('offline'));
    const screen = render(<DiscoverSection />);
    expect(await screen.findByText('Could not load suggestions')).toBeTruthy();

    serve({ listings: [listing('notion', { featured: true })] });
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('notion app')).toBeTruthy();
    expect(screen.queryByText('Could not load suggestions')).toBeNull();
  });

  it('keeps the skills and hides Business essentials when the directory fails', async () => {
    serve({ skills: [skill('writer', 4)] });
    mockBrowse.mockRejectedValue(new Error('offline'));
    const screen = render(<DiscoverSection />);
    expect(await screen.findByText('writer')).toBeTruthy();
    expect(screen.queryByText('Business essentials')).toBeNull();
    expect(screen.queryByText('Could not load suggestions')).toBeNull();
  });

  it('keeps the connectors when the skills catalog fails', async () => {
    serve({ listings: [listing('notion', { featured: true })] });
    mockCatalog.mockRejectedValue(new Error('offline'));
    const screen = render(<DiscoverSection />);
    expect(await screen.findByText('notion app')).toBeTruthy();
  });

  it('shows no more than five rows in a group', async () => {
    serve({ listings: RELEASED.map((id) => listing(id)) });
    const screen = render(<DiscoverSection />);
    await screen.findByText('Business essentials');
    expect(screen.getAllByLabelText(/^Connect /)).toHaveLength(5);
  });

  it('opens the connectors page from both headings', async () => {
    serve({
      listings: [listing('notion', { featured: true }), listing('linear')],
    });
    const screen = render(<DiscoverSection />);
    fireEvent.press(await screen.findByLabelText('Everyday tools'));
    fireEvent.press(screen.getByLabelText('Business essentials'));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/connectors');
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/connectors',
      params: { category: 'Productivity' },
    });
  });

  it('opens Business essentials on the work category of its first row, not on a category it does not list', async () => {
    serve({
      listings: [
        listing('notion', { featured: true }),
        listing('linear', { categories: ['Code', 'Data'] }),
        listing('jira', { categories: ['Productivity'] }),
      ],
    });
    const screen = render(<DiscoverSection />);
    fireEvent.press(await screen.findByLabelText('Business essentials'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors',
      params: { category: 'Data' },
    });
  });

  it('shows the Everyday tools heading without a link when connectors are off', async () => {
    mockCapability = false;
    serve({ skills: [skill('writer', 4)] });
    const screen = render(<DiscoverSection />);
    expect(await screen.findByText('writer')).toBeTruthy();
    expect(screen.queryByLabelText('Everyday tools')).toBeNull();
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  describe('adding a skill', () => {
    it('goes from plus to a spinner to a check', async () => {
      serve({ skills: [skill('writer', 4)] });
      let finish: (value: Set<string>) => void = () => undefined;
      mockInstall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const screen = render(<DiscoverSection />);
      fireEvent.press(await screen.findByLabelText('Add writer'));
      expect(mockInstall).toHaveBeenCalledWith('writer');
      expect(await screen.findByLabelText('Adding writer')).toBeTruthy();
      expect(screen.queryByLabelText('Add writer')).toBeNull();

      await act(async () => finish(new Set(['writer'])));
      expect(await screen.findByLabelText('writer, added')).toBeTruthy();
      expect(screen.queryByLabelText('Adding writer')).toBeNull();
    });

    it('opens the skill page from the check and from the row', async () => {
      serve({ skills: [skill('writer', 4)], installed: ['writer'] });
      const screen = render(<DiscoverSection />);
      fireEvent.press(await screen.findByLabelText('writer, added'));
      fireEvent.press(screen.getByLabelText('writer. writer skill'));
      expect(mockInstall).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/skills/[name]',
        params: { name: 'writer' },
      });
    });

    it('returns to the plus with a line under the row when adding fails, then clears it', async () => {
      serve({ skills: [skill('writer', 4)] });
      mockInstall.mockRejectedValueOnce(new Error('server'));
      const screen = render(<DiscoverSection />);
      fireEvent.press(await screen.findByLabelText('Add writer'));
      expect(await screen.findByText('Could not add. Try again.')).toBeTruthy();
      expect(screen.getByLabelText('Add writer')).toBeTruthy();

      mockInstall.mockResolvedValueOnce(new Set(['writer']));
      fireEvent.press(screen.getByLabelText('Add writer'));
      expect(await screen.findByLabelText('writer, added')).toBeTruthy();
      expect(screen.queryByText('Could not add. Try again.')).toBeNull();
    });

    it('lets only one skill be added at a time', async () => {
      serve({ skills: [skill('writer', 4), skill('coder', 3)] });
      mockInstall.mockReturnValue(new Promise(() => undefined));
      const screen = render(<DiscoverSection />);
      fireEvent.press(await screen.findByLabelText('Add writer'));
      fireEvent.press(screen.getByLabelText('Add coder'));
      expect(mockInstall).toHaveBeenCalledTimes(1);
    });

    it('lets a skill be added again after the account changes while an add was running', async () => {
      serve({ skills: [skill('writer', 4), skill('coder', 3)] });
      mockInstall.mockReturnValue(new Promise(() => undefined));
      const screen = render(<DiscoverSection />);
      fireEvent.press(await screen.findByLabelText('Add writer'));
      expect(await screen.findByLabelText('Adding writer')).toBeTruthy();

      act(() => {
        activateCloudAccount('user-2');
        useAuthStore.setState({ clerkUserId: 'user-2' });
      });
      await waitFor(() => expect(screen.queryByLabelText('Adding writer')).toBeNull());
      fireEvent.press(await screen.findByLabelText('Add coder'));
      expect(mockInstall).toHaveBeenLastCalledWith('coder');
      expect(mockInstall).toHaveBeenCalledTimes(2);
    });

    it('does not suggest a skill the server gave no install count for', async () => {
      serve({ skills: [skill('writer')] });
      const screen = render(<DiscoverSection />);
      await waitFor(() => expect(mockCatalog).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByLabelText('Loading suggestions')).toBeNull());
      expect(screen.queryByText('writer')).toBeNull();
    });
  });

  describe('adding a connector', () => {
    it('opens the connect page from the plus', async () => {
      serve({ listings: [listing('notion', { featured: true })] });
      const screen = render(<DiscoverSection />);
      fireEvent.press(await screen.findByLabelText('Connect notion app'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/connectors/[id]',
        params: { id: 'notion' },
      });
    });

    it('shows a check for a connected connector that opens its page', async () => {
      serve({
        listings: [listing('notion', { featured: true })],
        connections: [{ id: 'c1', connectorId: 'notion', source: 'managed' }],
      });
      const screen = render(<DiscoverSection />);
      fireEvent.press(await screen.findByLabelText('notion app, connected'));
      expect(screen.queryByLabelText('Connect notion app')).toBeNull();
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/connectors/[id]',
        params: { id: 'notion' },
      });
    });

    it('never offers a plus for a connector that is not released or cannot be connected', async () => {
      serve({
        listings: [
          listing('gmail', { featured: true }),
          listing('linear', { connectable: 'needs-setup' }),
        ],
      });
      const screen = render(<DiscoverSection />);
      await waitFor(() => expect(mockBrowse).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByLabelText('Loading suggestions')).toBeNull());
      expect(screen.queryByLabelText(/^Connect /)).toBeNull();
      expect(screen.queryByText('gmail app')).toBeNull();
    });
  });

  describe('without cloud access', () => {
    it('asks a person in Local Mode to switch and fetches nothing', () => {
      signIn('local');
      const screen = render(<DiscoverSection />);
      expect(screen.getByText('Switch to AGI Cloud')).toBeTruthy();
      expect(screen.queryByText('Everyday tools')).toBeNull();
      expect(mockBrowse).not.toHaveBeenCalled();
      expect(mockCatalog).not.toHaveBeenCalled();
    });

    it('switches to Cloud from the card and then loads the suggestions', async () => {
      signIn('local');
      serve({ listings: [listing('notion', { featured: true })] });
      const screen = render(<DiscoverSection />);
      fireEvent.press(screen.getByText('Switch to AGI Cloud'));
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');
      expect(await screen.findByText('notion app')).toBeTruthy();
    });

    it('asks a signed out person to sign in', () => {
      signIn('cloud', false);
      const screen = render(<DiscoverSection />);
      fireEvent.press(screen.getByText('Sign in to AGI Cloud'));
      expect(mockPush).toHaveBeenCalled();
      expect(mockBrowse).not.toHaveBeenCalled();
    });
  });
});
