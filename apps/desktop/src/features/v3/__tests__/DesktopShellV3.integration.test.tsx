import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesktopShellV3 } from '../DesktopShellV3';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'sidebar.expand': 'Expand sidebar',
        'sidebar.collapse': 'Collapse sidebar',
        'sidebar.newChat': 'New chat',
        'sidebar.searchKbd': 'Search (⌘K)',
        'sidebar.recents': 'Recents',
        'sidebar.groups.lastHour': 'Last hour',
        'sidebar.groups.today': 'Today',
        'sidebar.groups.yesterday': 'Yesterday',
        'sidebar.groups.pastWeek': 'Past week',
        'sidebar.groups.pastMonth': 'Past month',
        'sidebar.modes.chat': 'Chat',
        'sidebar.nav.projects': 'Projects',
        'sidebar.nav.artifacts': 'Artifacts',
        'sidebar.nav.scheduled': 'Scheduled',
        'sidebar.nav.customize': 'Customize',
        'sidebar.nav.liveArtifacts': 'Live artifacts',
        'sidebar.nav.dispatch': 'Dispatch',
        'sidebar.signIn': 'Sign in',
        'sidebar.cloudSync': 'Cloud sync',
        'common.search': 'Search',
        'common.settings': 'Settings',
        'common.beta': 'Beta',
        'emptyChat.fallbackName': 'there',
        'emptyChat.greetMorning': `Good morning, ${params?.['name'] ?? 'there'}`,
        'emptyChat.greetDay': `What can I help with, ${params?.['name'] ?? 'there'}?`,
        'emptyChat.greetNight': `It's late-night, ${params?.['name'] ?? 'there'}`,
        'emptyChat.modeLabel': 'Local Mode',
        'emptyChat.cloudSyncAction': 'Cloud Sync',
        'emptyChat.cloudSyncAria': 'Set up Cloud Managed sync',
        'capModal.title': 'Usage limit reached',
        'capModal.subtitle': 'Switch model or wait for reset.',
        'capModal.dismiss': 'Dismiss',
        'capModal.switchModel': 'Switch model',
        'capModal.buyTopUp': 'Buy top-up',
        'capModal.waitReset': 'Wait for reset',
      };
      return labels[key] ?? key;
    },
  }),
}));

describe('DesktopShellV3 real render', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the mounted desktop shell without the app error boundary', () => {
    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    expect(screen.getByText('New chat')).toBeInTheDocument();
    expect(screen.queryByText('Dispatch')).not.toBeInTheDocument();
    // EmptyChat is composer-only as of the 2026-06-13 greeting removal (it renders
    // null), so the mode badge no longer appears in the empty state. The shell
    // still mounting (New chat present) is what proves no error boundary fired.
    expect(screen.queryByText('Cloud Sync')).not.toBeInTheDocument();
  });

  it('renders with an active host-bridge conversation', async () => {
    const hostBridge = {
      getSnapshot: () => ({
        activeConversationId: 'conv-1',
        conversations: [
          {
            id: 'conv-1',
            title: 'New chat',
            updatedAt: new Date('2026-06-03T20:00:00Z'),
            lastMessage: '',
          },
        ],
      }),
      subscribe: () => () => {},
      createConversation: () => 'conv-2',
      selectConversation: () => {},
    };

    render(<DesktopShellV3 runtime={null} hostBridge={hostBridge} />);

    expect(screen.getByLabelText('Select model')).toBeInTheDocument();
    expect(screen.getByText('New chat')).toBeInTheDocument();
  });
});
