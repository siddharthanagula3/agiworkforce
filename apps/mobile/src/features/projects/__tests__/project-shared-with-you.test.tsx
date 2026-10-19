jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn().mockResolvedValue(true),
}));

const mockCreateConversation = jest.fn();
const mockLoadMessages = jest.fn().mockResolvedValue(undefined);
const mockDeleteConversation = jest.fn().mockResolvedValue(undefined);
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      createConversation: mockCreateConversation,
      loadMessages: mockLoadMessages,
      deleteConversation: mockDeleteConversation,
    }),
}));

jest.mock('@/services/managedCloudProjects', () => ({
  managedCloudProjects: { getProject: jest.fn() },
}));

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import { managedCloudProjects } from '@/services/managedCloudProjects';
import { SharedWithYouSection } from '@/src/features/projects/components/SharedWithYouSection';
import { SharedProjectScreen } from '@/src/features/projects/components/SharedProjectScreen';
import { SharedWithYouScreen } from '@/src/features/projects/components/SharedWithYouScreen';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import {
  projectsSharedWithMe,
  type ProjectSharingOverview,
} from '@/src/features/projects/projectSharing';

const ME = 'member-1';
const OWNER = 'owner-1';

function overview(): ProjectSharingOverview {
  return {
    currentUserId: ME,
    canManageSharing: false,
    canShareOwnProjects: true,
    members: [
      { userId: OWNER, role: 'owner', displayName: 'Dana', email: null, canEditProjects: true },
      { userId: ME, role: 'member', displayName: 'Me', email: null, canEditProjects: true },
    ],
    sharedProjects: [
      {
        projectId: 'p-open',
        name: 'Brand book',
        ownerUserId: OWNER,
        defaultAccess: 'read',
        memberGrants: [],
      },
      {
        projectId: 'p-closed',
        name: 'Board pack',
        ownerUserId: OWNER,
        defaultAccess: 'none',
        memberGrants: [],
      },
      {
        projectId: 'p-edit',
        name: 'Roadmap',
        ownerUserId: OWNER,
        defaultAccess: 'none',
        memberGrants: [{ userId: ME, access: 'write' }],
      },
      {
        projectId: 'p-mine',
        name: 'My own',
        ownerUserId: ME,
        defaultAccess: 'read',
        memberGrants: [],
      },
    ],
    sharedConversations: [
      {
        sharedSessionId: 's-1',
        token: 'tok-chat',
        title: 'Launch retro',
        ownerUserId: OWNER,
      },
      { sharedSessionId: 's-2', token: 'tok-mine', title: 'My share', ownerUserId: ME },
    ],
    sharedArtifacts: [
      {
        publishedArtifactId: 'pa-1',
        token: 'tok-art',
        title: 'Pricing calculator',
        kind: 'react',
        ownerUserId: OWNER,
      },
    ],
    sharedConnectors: [{ connectorRowId: 'cr-1', name: 'Team Notion', ownerUserId: OWNER }],
  };
}

beforeEach(() => jest.clearAllMocks());

describe('projects shared with the member', () => {
  it('lists projects others shared with me that I can open, with my access', () => {
    expect(projectsSharedWithMe(overview())).toEqual([
      { projectId: 'p-open', name: 'Brand book', ownerName: 'Dana', access: 'read' },
      { projectId: 'p-edit', name: 'Roadmap', ownerName: 'Dana', access: 'write' },
    ]);
  });

  it('shows them on the Projects tab and opens one', async () => {
    (api.get as jest.Mock).mockResolvedValue(overview());
    render(<SharedWithYouSection />);

    fireEvent.press(await screen.findByLabelText('Roadmap, shared by Dana. Can edit'));
    expect(useRouter().push).toHaveBeenCalledWith({
      pathname: '/(app)/projects/shared/[id]',
      params: { id: 'p-edit' },
    });
    expect(screen.queryByText('Board pack')).toBeNull();
  });

  it('opens a shared project read-only with what is shared', async () => {
    (managedCloudProjects.getProject as jest.Mock).mockResolvedValue({
      id: 'p-open',
      ownerUserId: OWNER,
      name: 'Brand book',
      instructions: 'Use the brand voice.',
      sharedAccess: 'read',
      isOrgShared: true,
      defaultPrivacyMode: 'managed',
      defaultProviderMode: 'ManagedGateway',
      allowedSurfaces: ['web'],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    (api.get as jest.Mock).mockImplementation(async (path: string) =>
      path.includes('knowledge')
        ? {
            files: [],
          }
        : overview(),
    );
    render(<SharedProjectScreen projectId="p-open" />);

    expect(await screen.findByTestId('shared-project-access')).toHaveTextContent(
      'Shared with you by Dana · Can view',
    );
    expect(screen.getByText('Use the brand voice.')).toBeTruthy();
    expect(screen.getByText('No files in this project.')).toBeTruthy();
  });

  it('lists chats, artifacts and connectors others shared with me and opens them', async () => {
    (api.get as jest.Mock).mockResolvedValue(overview());
    render(<SharedWithYouScreen />);

    const alert = jest.spyOn(Alert, 'alert');
    fireEvent.press(await screen.findByLabelText('Launch retro, Shared by Dana'));
    const buttons = (alert.mock.calls.at(-1)?.[2] ?? []) as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === 'Open')?.onPress?.();
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith(
      expect.stringMatching(/\/share\/tok-chat$/),
    );
    fireEvent.press(screen.getByLabelText('Pricing calculator, react · shared by Dana'));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith(
      expect.stringMatching(/\/shared-artifact\/tok-art$/),
    );
    fireEvent.press(screen.getByLabelText('Team Notion, Shared by Dana'));
    expect(useRouter().push).toHaveBeenCalledWith('/(app)/connectors');
    expect(screen.queryByText('My share')).toBeNull();
  });

  it('says when nothing is shared, including on a personal account', async () => {
    (api.get as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<SharedWithYouScreen />);
    expect(await screen.findByTestId('shared-with-you-empty')).toBeTruthy();
  });

  it('continues a shared chat as a private copy in a new conversation', async () => {
    (api.get as jest.Mock).mockImplementation(async (path: string) =>
      path.startsWith('/api/share/')
        ? {
            title: 'Launch retro',
            messages: [
              { role: 'user', content: 'What went well?' },
              { role: 'assistant', content: 'The beta.' },
              { role: 'tool', content: 'ignored' },
            ],
          }
        : overview(),
    );
    (api.post as jest.Mock).mockResolvedValue({ messages: [] });
    mockCreateConversation.mockResolvedValue('copy-1');
    const alert = jest.spyOn(Alert, 'alert');
    render(<SharedWithYouScreen />);

    fireEvent.press(await screen.findByLabelText('Launch retro, Shared by Dana'));
    const buttons = (alert.mock.calls.at(-1)?.[2] ?? []) as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === 'Continue in a new chat')?.onPress?.();

    await waitFor(() =>
      expect(useRouter().push).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: 'copy-1' },
      }),
    );
    expect(mockCreateConversation).toHaveBeenCalledWith('Launch retro');
    expect(api.post).toHaveBeenCalledWith('/api/chat/conversations/copy-1/messages/bulk', {
      messages: [
        { role: 'user', content: 'What went well?' },
        { role: 'assistant', content: 'The beta.' },
      ],
    });
  });

  it('keeps no partial copy when the messages cannot be copied', async () => {
    (api.get as jest.Mock).mockImplementation(async (path: string) =>
      path.startsWith('/api/share/')
        ? { title: 'Launch retro', messages: [{ role: 'user', content: 'Hi' }] }
        : overview(),
    );
    (api.post as jest.Mock).mockRejectedValue(new Error('HTTP 500'));
    mockCreateConversation.mockResolvedValue('copy-2');
    const alert = jest.spyOn(Alert, 'alert');
    render(<SharedWithYouScreen />);

    fireEvent.press(await screen.findByLabelText('Launch retro, Shared by Dana'));
    (alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>)
      .find((button) => button.text === 'Continue in a new chat')
      ?.onPress?.();

    await waitFor(() => expect(mockDeleteConversation).toHaveBeenCalledWith('copy-2'));
  });
});
