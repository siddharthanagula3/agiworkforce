import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsDialogStore } from '../../../stores/settings/dialog';
import { useUnifiedAuthStore } from '../../../stores/auth';
import { useAppModeStore } from '../../../stores/appModeStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useChatStore, useSidecarStore } from '../../../stores/chat';
import { DesktopShellV3 } from '../DesktopShellV3';

const unifiedChatMock = vi.hoisted(() => {
  const state = {
    draftContent: '',
    chatInterfaceProps: [] as Array<Record<string, unknown>>,
    autoSend: vi.fn(),
    budgetState: {
      budget: {
        enabled: false,
      },
      percentage: 0,
    },
  };
  return {
    ...state,
    setDraftContent: vi.fn((content: string) => {
      state.draftContent = content;
    }),
    appendDraftContent: vi.fn((content: string) => {
      state.draftContent = state.draftContent ? `${state.draftContent}\n\n${content}` : content;
    }),
    getDraftContent: () => state.draftContent,
    resetDraft: () => {
      state.draftContent = '';
    },
  };
});

const nativeHandoffMock = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  listen: vi.fn(),
  invoke: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  isTauri: true,
  isCloudWeb: false,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isTauriContext: () => true,
  listen: nativeHandoffMock.listen,
  invoke: nativeHandoffMock.invoke,
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {}),
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
        'sidebar.mode.local': 'Local',
        'sidebar.mode.cloud': 'Cloud',
        'sidebar.mode.aria': 'Switch between Local and Cloud',
        'sidebar.mode.switchTo': `Switch to ${params?.['mode'] ?? ''}`,
        'sidebar.mode.soon': 'Soon',
        'sidebar.mode.cloudUnavailable': 'Cloud coming soon to desktop',
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

vi.mock('../../updates', () => ({
  UpdatePill: () => null,
}));

vi.mock('@agiworkforce/unified-chat', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const sharedStoreState = {
    setDraftContent: unifiedChatMock.setDraftContent,
    appendDraftContent: unifiedChatMock.appendDraftContent,
  };
  const useChatStore = (selector: (state: typeof sharedStoreState) => unknown) =>
    selector(sharedStoreState);
  useChatStore.getState = () => ({
    setDraftContent: unifiedChatMock.setDraftContent,
    appendDraftContent: unifiedChatMock.appendDraftContent,
  });
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
        React.createElement('textarea', {
          'aria-label': 'Shared composer draft',
          onChange: (event: { target: { value: string } }) =>
            unifiedChatMock.setDraftContent(event.target.value),
        }),
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
    useChatStore,
    selectBudget: (state: typeof unifiedChatMock.budgetState) => state.budget,
    selectBudgetPercentage: (state: typeof unifiedChatMock.budgetState) => state.percentage,
    useBudgetStore: (selector: (state: typeof unifiedChatMock.budgetState) => unknown) =>
      selector(unifiedChatMock.budgetState),
  };
});

describe('DesktopShellV3 duplication ownership', () => {
  beforeEach(() => {
    unifiedChatMock.chatInterfaceProps.length = 0;
    unifiedChatMock.resetDraft();
    unifiedChatMock.setDraftContent.mockClear();
    unifiedChatMock.appendDraftContent.mockClear();
    unifiedChatMock.autoSend.mockClear();
    nativeHandoffMock.listeners.clear();
    nativeHandoffMock.listen.mockReset();
    nativeHandoffMock.invoke.mockReset();
    nativeHandoffMock.unlisten.mockReset();
    nativeHandoffMock.listen.mockImplementation(
      async (eventName: string, callback: (event: { payload: unknown }) => void) => {
        nativeHandoffMock.listeners.set(eventName, callback);
        return nativeHandoffMock.unlisten;
      },
    );
    nativeHandoffMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_clear_selected_context_handoff') return true;
      if (command.includes('project')) return [];
      return undefined;
    });
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
    useAppModeStore.setState({ mode: 'local' });
    useSidecarStore.setState({ sidebarCollapsed: false });
    useProjectStore.setState({
      projects: [],
      activeProjectId: null,
      loadProjects: async () => {},
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

  it('routes the live shared composer into the native skill recorder', () => {
    render(<DesktopShellV3 runtime={null} hostBridge={null} />);
    const onRecordSkill = unifiedChatMock.chatInterfaceProps[0]?.['onRecordSkill'];
    expect(onRecordSkill).toBeTypeOf('function');

    act(() => {
      (onRecordSkill as () => void)();
    });

    expect(screen.getByRole('heading', { name: 'Record a skill' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close skill recorder' }));
    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
  });

  it('requires an explicit review before adding authenticated Chrome context to the composer', async () => {
    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Shared composer draft' }), {
      target: { value: 'Keep my typed request' },
    });
    expect(unifiedChatMock.getDraftContent()).toBe('Keep my typed request');

    await waitFor(() => {
      expect(nativeHandoffMock.listeners.has('extension:selected_text_query')).toBe(true);
    });

    await act(async () => {
      nativeHandoffMock.listeners.get('extension:selected_text_query')?.({
        payload: {
          text: 'The reviewed selection',
          context_url: 'https://example.com/private',
          tab_id: 17,
          selected_at: Date.now(),
        },
      });
    });

    expect(screen.getByRole('dialog', { name: 'Review browser context' })).toBeInTheDocument();
    expect(screen.getByText('The reviewed selection')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/private')).toBeInTheDocument();
    expect(screen.getByText('Authenticated Chrome handoff')).toBeInTheDocument();
    expect(screen.getByText('Local Desktop only')).toBeInTheDocument();
    expect(unifiedChatMock.appendDraftContent).not.toHaveBeenCalled();
    expect(unifiedChatMock.autoSend).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept context' }));

    await waitFor(() => {
      expect(unifiedChatMock.appendDraftContent).toHaveBeenCalledTimes(1);
    });
    const insertedDraft = String(unifiedChatMock.appendDraftContent.mock.calls[0]?.[0]);
    expect(insertedDraft).toContain('The reviewed selection');
    expect(insertedDraft).toContain('https://example.com/private');
    expect(unifiedChatMock.getDraftContent()).toBe(`Keep my typed request\n\n${insertedDraft}`);
    expect(unifiedChatMock.autoSend).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Review browser context' }),
    ).not.toBeInTheDocument();
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

  it('names collapsed mode and account controls by the action they perform', () => {
    useSidecarStore.setState({ sidebarCollapsed: true });

    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    // Desktop cloud is open (DCL-4): the collapsed toggle is a live "Switch to
    // Cloud" affordance, not a disabled "coming soon" control.
    const cloudToggle = screen.getByRole('button', { name: 'Switch to Cloud' });
    expect(cloudToggle).toBeInTheDocument();
    expect(cloudToggle).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the expanded Cloud mode as a live, selectable tab on desktop', () => {
    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    // Local tab is the default selected mode; Cloud is now a normal selectable
    // tab (DCL-4 opened desktop cloud) — no disabled "Soon" affordance.
    const localTab = screen.getByRole('tab', { name: 'Local' });
    expect(localTab).toHaveAttribute('aria-selected', 'true');

    const cloudTab = screen.getByRole('tab', { name: /Cloud/ });
    expect(cloudTab).not.toHaveAttribute('aria-disabled', 'true');
    expect(cloudTab).not.toHaveTextContent('Soon');

    fireEvent.click(cloudTab);

    expect(useAppModeStore.getState().mode).toBe('cloud');
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

  // ── Composer work scope (Chat | AGI Work toggle + project/folder picker) ──

  function seedPickerProject(id: string, name: string, isArchived = false) {
    return {
      id,
      name,
      description: '',
      customInstructions: '',
      files: [],
      conversationIds: [],
      isArchived,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
  }

  it('feeds the composer picker with non-archived projects and the folder seam in Local mode', () => {
    useProjectStore.setState({
      projects: [seedPickerProject('p1', 'Apollo'), seedPickerProject('p2', 'Retired', true)],
    });

    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    const props = unifiedChatMock.chatInterfaceProps[0];
    expect(typeof props?.['onSelectFolder']).toBe('function');
    expect(typeof props?.['onClearFolder']).toBe('function');
    const picker = props?.['projectPicker'] as {
      projects: Array<{ id: string; name: string }>;
      activeProjectId: string | null;
    };
    expect(picker.projects).toEqual([{ id: 'p1', name: 'Apollo' }]);
    expect(picker.activeProjectId).toBeNull();
  });

  it('offers the folder seam in Cloud mode, but as a scan root rather than a capability grant', () => {
    // SUPERSEDED CONTRACT: this used to assert Cloud withheld the folder seam
    // entirely. Cloud now offers it, because the desktop is the local-private
    // compute host and folder selection is the differentiator over web.
    //
    // The safety property moved rather than disappearing: useFolderSelection is
    // constructed in 'cloud' mode, where it performs no `invoke` at all — see
    // useFolderSelection.test.ts, which asserts the backend folder-scope command
    // is never called. That command persists allowed_directories to settings.json
    // and repoints the MCP filesystem root, so calling it from Cloud would widen
    // filesystem permissions with no consent step.
    useAppModeStore.setState({ mode: 'cloud' });

    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    const props = unifiedChatMock.chatInterfaceProps[0];
    expect(props?.['onSelectFolder']).toBeTypeOf('function');
    expect(props?.['onClearFolder']).toBeTypeOf('function');
    // Record-a-skill stays Local-only: it captures the screen, which Cloud has
    // no consent surface for.
    expect(props?.['onRecordSkill']).toBeUndefined();
    expect(screen.queryByText('Artifacts')).not.toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
    expect(props?.['projectPicker']).toBeTruthy();
  });

  it('keeps the folder seam a capability grant in Local mode', () => {
    useAppModeStore.setState({ mode: 'local' });

    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    const props = unifiedChatMock.chatInterfaceProps[0];
    expect(props?.['onSelectFolder']).toBeTypeOf('function');
    expect(props?.['onRecordSkill']).toBeTypeOf('function');
  });

  it('projects Cloud AGI Work and image affordances from the hydrated account tier', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    useUnifiedAuthStore.setState({
      plan: 'basic',
      planDisplayName: 'Basic',
    });

    const view = render(<DesktopShellV3 runtime={null} hostBridge={null} />);
    expect(unifiedChatMock.chatInterfaceProps.at(-1)?.['canUseAgiWork']).toBe(false);
    expect(
      (
        unifiedChatMock.chatInterfaceProps.at(-1)?.['quickChipAvailability'] as
          | { image?: boolean }
          | undefined
      )?.image,
    ).toBe(false);

    act(() => {
      useUnifiedAuthStore.setState({
        plan: 'pro',
        planDisplayName: 'Pro',
      });
    });
    view.rerender(<DesktopShellV3 runtime={null} hostBridge={null} />);

    expect(unifiedChatMock.chatInterfaceProps.at(-1)?.['canUseAgiWork']).toBe(true);
    expect(
      (
        unifiedChatMock.chatInterfaceProps.at(-1)?.['quickChipAvailability'] as
          | { image?: boolean }
          | undefined
      )?.image,
    ).toBe(true);
  });

  it('scopes the active conversation through the existing project seam when the picker selects', async () => {
    useProjectStore.setState({
      projects: [seedPickerProject('p1', 'Apollo')],
    });
    useChatStore.setState({
      activeConversationId: 'conv-1',
      conversations: [
        {
          id: 'conv-1',
          title: 'Existing chat',
          pinned: false,
          lastMessage: '',
          updatedAt: new Date(),
          executionMode: 'local_only' as const,
        },
      ],
    });

    render(<DesktopShellV3 runtime={null} hostBridge={null} />);

    const picker = unifiedChatMock.chatInterfaceProps[0]?.['projectPicker'] as {
      onSelectProject: (projectId: string | null) => void;
    };
    await act(async () => {
      picker.onSelectProject('p1');
    });

    expect(useChatStore.getState().conversations.find((c) => c.id === 'conv-1')?.projectId).toBe(
      'p1',
    );
    await waitFor(() => {
      expect(
        useProjectStore.getState().projects.find((p) => p.id === 'p1')?.conversationIds,
      ).toContain('conv-1');
    });

    // Clearing unwinds both sides of the seam.
    await act(async () => {
      picker.onSelectProject(null);
    });
    expect(
      useChatStore.getState().conversations.find((c) => c.id === 'conv-1')?.projectId,
    ).toBeUndefined();
    await waitFor(() => {
      expect(
        useProjectStore.getState().projects.find((p) => p.id === 'p1')?.conversationIds,
      ).not.toContain('conv-1');
    });
  });
});
