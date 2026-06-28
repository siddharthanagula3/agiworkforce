import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsDialogStore } from '../../../stores/settings/dialog';
import { useUnifiedAuthStore } from '../../../stores/auth';
import { DesktopShellV3 } from '../DesktopShellV3';

const unifiedChatMock = vi.hoisted(() => ({
  chatInterfaceProps: [] as Array<Record<string, unknown>>,
  setDraftContent: vi.fn(),
  budgetState: {
    budget: {
      enabled: false,
    },
    percentage: 0,
  },
}));

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
        'accountMenu.accountFallback': 'Account',
        'accountMenu.settings': 'Settings',
        'accountMenu.language': 'Language',
        'accountMenu.privacySecurity': 'Privacy & security',
        'accountMenu.viewAllPlans': 'View all plans',
        'accountMenu.byokLocal': 'BYOK & local models',
        'accountMenu.appsExtensions': 'Apps & extensions',
        'accountMenu.giftAGI': 'Gift AGI',
        'accountMenu.helpSupport': 'Help & support',
        'accountMenu.logOut': 'Log out',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('@agiworkforce/unified-chat', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    // Passthrough provider — the shell wraps its tree in <CapabilityProvider
    // platform="desktop">. The mock just renders children so the shell mounts.
    CapabilityProvider: (props: { children?: ReactNode }) =>
      React.createElement(React.Fragment, null, props.children),
    ChatInterface: (props: Record<string, unknown>) => {
      unifiedChatMock.chatInterfaceProps.push(props);
      return React.createElement(
        'div',
        { 'data-testid': 'chat-interface' },
        props['emptyStateSlot'] as ReactNode,
      );
    },
    EmptyState: (props: {
      headline?: string;
      planBadgeLabel?: string;
      planBadgeActionLabel?: string;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'empty-state' },
        props.headline,
        React.createElement('span', null, props.planBadgeLabel),
        props.planBadgeActionLabel
          ? React.createElement('button', { type: 'button' }, props.planBadgeActionLabel)
          : null,
      ),
    QuickChips: () => React.createElement('div', { 'data-testid': 'quick-chips' }),
    useChatStore: (
      selector: (state: { setDraftContent: typeof unifiedChatMock.setDraftContent }) => unknown,
    ) => selector({ setDraftContent: unifiedChatMock.setDraftContent }),
    selectBudget: (state: typeof unifiedChatMock.budgetState) => state.budget,
    selectBudgetPercentage: (state: typeof unifiedChatMock.budgetState) => state.percentage,
    useBudgetStore: (selector: (state: typeof unifiedChatMock.budgetState) => unknown) =>
      selector(unifiedChatMock.budgetState),
  };
});

describe('DesktopShellV3 duplication ownership', () => {
  beforeEach(() => {
    unifiedChatMock.chatInterfaceProps.length = 0;
    unifiedChatMock.setDraftContent.mockClear();
    useSettingsDialogStore.setState({
      settingsOpen: false,
      settingsInitialTab: 'general',
      shortcutsOpen: false,
    });
    useUnifiedAuthStore.setState({
      user: null,
      isAuthenticated: false,
      planDisplayName: 'Loading...',
      plan: null,
      accessToken: null,
      refreshToken: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders one desktop sidebar and delegates the empty chat state to unified chat', () => {
    const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    expect(container.querySelectorAll('[data-v3-sidebar]')).toHaveLength(1);
    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    // EmptyChat now renders null (composer-only empty state, founder 2026-06-13);
    // delegation to unified-chat is still verified via the truthy emptyStateSlot below.
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();

    expect(unifiedChatMock.chatInterfaceProps).toHaveLength(1);
    expect(unifiedChatMock.chatInterfaceProps[0]?.['sidebarSlot']).toBeNull();
    expect(unifiedChatMock.chatInterfaceProps[0]?.['enableSearchOverlay']).toBe(false);
    expect(unifiedChatMock.chatInterfaceProps[0]?.['emptyStateSlot']).toBeTruthy();
  });

  it('creates and selects a conversation through the host bridge', () => {
    const hostBridge = {
      getSnapshot: () => ({ activeConversationId: null, conversations: [] }),
      createConversation: vi.fn(() => 'conv-new'),
      selectConversation: vi.fn(),
    };

    render(<DesktopShellV3 runtime={null} hostBridge={hostBridge} />);

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(hostBridge.createConversation).toHaveBeenCalledWith('New chat');
    expect(hostBridge.selectConversation).toHaveBeenCalledWith('conv-new');
  });

  it('opens desktop search directly instead of synthesizing package search', () => {
    const onOpenSearch = vi.fn();

    render(<DesktopShellV3 runtime={null} hostBridge={null} onOpenSearch={onOpenSearch} />);

    fireEvent.click(screen.getByText('Search'));

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('settings gear writes to the canonical SettingsPanel store', () => {
    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    fireEvent.click(screen.getByLabelText('Settings'));

    expect(useSettingsDialogStore.getState().settingsOpen).toBe(true);
    expect(useSettingsDialogStore.getState().settingsInitialTab).toBe('general');
  });

  it('treats a local storage owner as signed out in the sidebar', () => {
    useUnifiedAuthStore.setState({
      user: { id: 'local-user', email: '', name: 'Local User' },
      isAuthenticated: true,
      plan: 'local-only',
      planDisplayName: 'Local Mode',
      accessToken: null,
      refreshToken: null,
    });

    const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByText('Local User')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    expect(container.querySelectorAll('[data-v3-account-menu]')).toHaveLength(0);
  });

  it('renders the account menu inside the desktop sidebar instead of as an overlay', () => {
    useUnifiedAuthStore.setState({
      user: { id: 'cloud-user', email: 'cloud@agi.local', name: 'Cloud User' },
      isAuthenticated: true,
      plan: 'pro',
      planDisplayName: 'Pro',
      accessToken: 'cloud-token',
      refreshToken: 'cloud-refresh',
    });

    const { container } = render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Cloud User/i }));

    const sidebar = container.querySelector('[data-v3-sidebar]');
    const accountMenus = container.querySelectorAll('[data-v3-account-menu]');

    expect(accountMenus).toHaveLength(1);
    expect(sidebar).toContainElement(accountMenus[0] as HTMLElement);
    expect(screen.getByText('BYOK & local models')).toBeInTheDocument();
    expect(screen.queryByText('Gift AGI')).not.toBeInTheDocument();
  });
});
