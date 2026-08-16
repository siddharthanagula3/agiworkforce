import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useAppModeStore } from '../../../stores/appModeStore';
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
        'sidebar.nav.code': 'Code',
        'sidebar.nav.design': 'Design',
        'sidebar.nav.research': 'Research',
        'canvas.sessionOnlyNotice':
          'Sketches are session-only for now — closing the app clears the board.',
        'sidebar.nav.tasks': 'Tasks',
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
    useAppModeStore.setState({ mode: 'cloud' });
  });

  it('renders the mounted desktop shell without the app error boundary', () => {
    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    expect(screen.getByText('New chat')).toBeInTheDocument();
    expect(screen.queryByText('Dispatch')).not.toBeInTheDocument();
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

  describe('AGI Code panel is Local-only', () => {
    beforeAll(async () => {
      await import('@/features/code/CodeWorkspace');
    });

    it('shows the Code nav entry in Local mode and opens the workspace', async () => {
      act(() => {
        useAppModeStore.setState({ mode: 'local' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      const codeNav = container.querySelector('[data-nav-id="code"]');
      expect(codeNav).not.toBeNull();

      fireEvent.click(codeNav as Element);

      expect(await screen.findByTestId('code-workspace')).toBeInTheDocument();
    });

    it('hides the Code nav entry in Managed Cloud mode', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'cloud' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      expect(container.querySelector('[data-nav-id="code"]')).toBeNull();
      expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    });

    it('evicts an open code workspace when the session switches to Managed Cloud', async () => {
      act(() => {
        useAppModeStore.setState({ mode: 'local' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      fireEvent.click(container.querySelector('[data-nav-id="code"]') as Element);
      expect(await screen.findByTestId('code-workspace')).toBeInTheDocument();

      act(() => {
        useAppModeStore.setState({ mode: 'cloud' });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
      });
    });
  });

  describe('Design panel is Local-only and honest about persistence', () => {
    it('opens the board from the Local nav with the session-only notice', async () => {
      act(() => {
        useAppModeStore.setState({ mode: 'local' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      const designNav = container.querySelector('[data-nav-id="design"]');
      expect(designNav).not.toBeNull();

      fireEvent.click(designNav as Element);

      expect(await screen.findByTestId('design-workspace')).toBeInTheDocument();
      expect(
        screen.getByText('Sketches are session-only for now — closing the app clears the board.'),
      ).toBeInTheDocument();
    });

    it('hides the Design nav entry in Managed Cloud mode', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'cloud' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      expect(container.querySelector('[data-nav-id="design"]')).toBeNull();
      expect(screen.queryByTestId('design-workspace')).not.toBeInTheDocument();
    });

    it('evicts an open design board when the session switches to Managed Cloud', async () => {
      act(() => {
        useAppModeStore.setState({ mode: 'local' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      fireEvent.click(container.querySelector('[data-nav-id="design"]') as Element);
      expect(await screen.findByTestId('design-workspace')).toBeInTheDocument();

      act(() => {
        useAppModeStore.setState({ mode: 'cloud' });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('design-workspace')).not.toBeInTheDocument();
      });
    });
  });

  describe('Deep research panel is Local-only', () => {
    it('opens deep research from the Local nav', async () => {
      act(() => {
        useAppModeStore.setState({ mode: 'local' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      const researchNav = container.querySelector('[data-nav-id="research"]');
      expect(researchNav).not.toBeNull();

      fireEvent.click(researchNav as Element);

      expect(await screen.findByTestId('research-workspace')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start research/i })).toBeInTheDocument();
    });

    it('hides the Research nav entry in Managed Cloud mode', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'cloud' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      expect(container.querySelector('[data-nav-id="research"]')).toBeNull();
      expect(screen.queryByTestId('research-workspace')).not.toBeInTheDocument();
    });

    it('evicts an open research panel when the session switches to Managed Cloud', async () => {
      act(() => {
        useAppModeStore.setState({ mode: 'local' });
      });
      const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

      fireEvent.click(container.querySelector('[data-nav-id="research"]') as Element);
      expect(await screen.findByTestId('research-workspace')).toBeInTheDocument();

      act(() => {
        useAppModeStore.setState({ mode: 'cloud' });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('research-workspace')).not.toBeInTheDocument();
      });
    });
  });
});
