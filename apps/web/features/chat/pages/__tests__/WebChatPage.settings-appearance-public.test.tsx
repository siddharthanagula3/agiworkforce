import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  MANAGED_CLOUD_WORKSPACES_PATH,
} from '@agiworkforce/cloud-contracts';
import { CapabilityProvider } from '@agiworkforce/unified-chat/capabilities';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { QueryProvider } from '@shared/stores/query-client';
import { SettingsModalProvider } from '@/features/settings/components/SettingsModalProvider';
import { invalidatePreferencesSnapshot } from '@/app/settings/_lib/preferences-client';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';

type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('@agiworkforce/ui');
type ScanModule4 = typeof import('@agiworkforce/unified-chat');
type ScanModule5 = typeof import('../../components/ConversationTitleMenu');

const mocks = vi.hoisted(() => {
  const memoryClerk = {
    signOut: () => undefined,
    loaded: true,
    user: { id: 'fixture-user' },
    session: {
      id: 'fixture-session',
      user: { id: 'fixture-user' },
      getToken: async () => 'fixture-token',
    },
    addListener: () => () => undefined,
  };
  return {
    queryString: '',
    sessionId: null as string | null,
    routerReplace: vi.fn(),
    admitCloudSession: false,
    memoryClerk,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace, push: vi.fn(), back: vi.fn() }),
  useParams: () => (mocks.sessionId ? { sessionId: mocks.sessionId } : {}),
  useSearchParams: () => new URLSearchParams(mocks.queryString),
  usePathname: () => (mocks.sessionId ? `/chat/${mocks.sessionId}` : '/chat'),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: async () => 'fixture-token',
    isLoaded: true,
    isSignedIn: true,
    userId: 'fixture-user',
    ...(mocks.admitCloudSession ? { sessionId: 'fixture-session' } : {}),
  }),
  useClerk: () => (mocks.admitCloudSession ? mocks.memoryClerk : { signOut: vi.fn() }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string } | string) =>
        typeof options === 'string' ? options : (options?.defaultValue ?? key),
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
  getCsrfToken: async () => 'csrf-token',
}));

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  fetchStoredPreferenceNamespace: async () => ({}),
  readAutonomousToolApprovalsAllowed: async () => false,
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      createConversation: vi.fn(),
      loadConversation: vi.fn(async () => true),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(async () => true),
      setActiveConversation: vi.fn(),
    }),
  };
});

vi.mock('@/lib/hooks/useManagedUsageSummary', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getWorstUsagePercent: () => 0,
  readManagedUsageBuckets: () => [],
  useManagedUsageSummary: () => ({ usage: null }),
}));

vi.mock('@/lib/hooks/useMediaGeneration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return {
    ...actual,
    useMediaGeneration: () => ({
      generateImage: vi.fn(),
      generateVideo: vi.fn(),
      startVideoGeneration: vi.fn(),
      watchVideoGeneration: vi.fn(),
    }),
  };
});

vi.mock('../../components/Composer/ChatComposerNew', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatComposerNew: () => null,
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatMessageList: () => null,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useChatStreamRuntime: () => ({
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    continueGeneration: vi.fn(),
    resolveToolApproval: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-artifact-cloud-sync', () => ({ useArtifactCloudSync: vi.fn() }));
vi.mock('../../hooks/use-share-conversation', () => ({
  useShareConversation: () => ({ share: vi.fn(), isSharing: false }),
}));
vi.mock('../../hooks/use-conversation-branches', () => ({
  useConversationBranches: () => ({
    groupsByMessageId: {},
    branchingMessageId: null,
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-keyboard-shortcuts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findShortcutDoc: vi.fn(() => undefined),
  formatShortcutKeys: vi.fn(() => []),
  useKeyboardShortcuts: vi.fn(),
  checkShortcutBinding: vi.fn(),
  chordFromKeyboardEvent: vi.fn(),
  isRebindableShortcut: vi.fn(() => false),
  withShortcutBindings: vi.fn((docs: unknown) => docs),
}));

vi.mock('@/features/connectors/components/ToolPermissionsPanel', () => ({
  ToolPermissionsPanel: () => null,
}));
vi.mock('@features/skills/components/SkillEditorDialog', () => ({
  SkillEditorDialog: () => null,
}));

vi.mock('@features/projects', async (importOriginal) => {
  const projectState = {
    projects: [],
    activeProjectId: null,
    setActiveProject: vi.fn(),
    updateProject: vi.fn(),
    removeProject: vi.fn(),
    setProjects: vi.fn(),
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useManagedCloudProjects: () => ({ projects: [], isReady: true, retry: vi.fn() }),
    useProjectStore: (selector: (value: typeof projectState) => unknown) => selector(projectState),
    ProjectSettingsDialog: () => null,
  };
});
vi.mock('@features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: {
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    createProject: vi.fn(),
  },
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, Sidebar: () => null };
});
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return {
    ...actual,
    LocalByokHandoffDialog: () => null,
    UsageWarningBanner: () => null,
  };
});

vi.mock('../../components/dialogs/GlobalSearchDialog', () => ({ GlobalSearchDialog: () => null }));
vi.mock('../../components/share/ShareConversationDialog', () => ({
  ShareConversationDialog: () => null,
}));
vi.mock('../../components/dialogs/KeyboardShortcutsDialog', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  KeyboardShortcutsDialog: () => null,
}));
vi.mock('../../components/dialogs/CreateProjectDialog', () => ({
  CreateProjectDialog: () => null,
}));
vi.mock('../../components/dialogs/UpgradePlanDialog', () => ({
  UpgradePlanDialog: () => null,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', () => ({
  UpgradeConfirmDialog: () => null,
}));
vi.mock('@/features/time-focus/TimeFocusReminder', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  TimeFocusReminder: () => null,
}));
vi.mock('../../components/ConversationTitleMenu', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  ConversationTitleMenu: () => null,
}));
vi.mock('../../components/approvals/ApprovalInbox', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ApprovalInbox: () => null,
}));
vi.mock('../../components/work-session/WorkSessionPanel', () => ({
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ArtifactsPanel: () => null,
  ArtifactsToggleButton: () => null,
}));
vi.mock('../../components/research/ResearchPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ResearchPanel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', () => ({ SidebarWordmark: () => null }));

import SettingsIndexPage from '@/app/settings/page';
import WebChatPage from '../WebChatPage';

function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function PublicChatWindow({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <CapabilityProvider platform="web" document={null}>
        <QueryProvider>
          <SettingsModalProvider>{children}</SettingsModalProvider>
        </QueryProvider>
      </CapabilityProvider>
    </ThemeProvider>
  );
}

let savedSettings: Record<string, Record<string, unknown>>;
let savedSettingsVersion = 0;

function settingsResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  const path = String(input);
  if (path === MANAGED_CLOUD_WORKSPACES_PATH) {
    return Response.json({
      scope: 'personal',
      activeWorkspaceId: 'personal',
      activeOrganizationId: null,
      workspaces: [],
    });
  }
  if (path === MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH) {
    const settings = savedSettings;
    if (init?.method === 'PUT' && typeof init.body === 'string') {
      const body = JSON.parse(init.body) as { namespace: string; patch: Record<string, unknown> };
      settings[body.namespace] = { ...settings[body.namespace], ...body.patch };
      savedSettingsVersion += 1;
    }
    return Response.json({ settings, version: `settings-v${savedSettingsVersion}` });
  }
  return Response.json({});
}

describe('public settings window appearance', () => {
  beforeAll(async () => {
    await import('@/features/settings/components/WebSettingsModal');
  });

  beforeEach(() => {
    savedSettings = {
      notifications: { browserReplyReady: true },
      privacy: { shareTelemetry: false },
    };
    savedSettingsVersion = 0;
    mocks.queryString = '';
    mocks.sessionId = null;
    mocks.admitCloudSession = true;
    mocks.memoryClerk.user = { id: 'fixture-user' };
    mocks.memoryClerk.session = { ...mocks.memoryClerk.session, user: mocks.memoryClerk.user };
    mocks.routerReplace.mockClear();
    localStorage.clear();
    installMatchMedia();
    invalidatePreferencesSnapshot();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => settingsResponse(input, init)),
    );
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', window.location.pathname);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
    invalidatePreferencesSnapshot();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'agiHost');
  });

  it('sets Light from the settings page the public window loads without sending a chat', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const light = await screen.findByRole('button', { name: 'Light theme' }, { timeout: 4_000 });
    expect(light).toHaveAttribute('aria-pressed', 'false');

    await user.click(light);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  }, 15_000);

  it('sets System from the settings page the public window loads without sending a chat', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Dark theme' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    await user.click(screen.getByRole('button', { name: 'System theme' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  it('sets Dark from the settings page the public window loads without sending a chat', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const dark = await screen.findByRole('button', { name: 'Dark theme' });
    expect(dark).toHaveAttribute('aria-pressed', 'false');

    await user.click(dark);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  it('opens Account from the settings page the public window loads', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const account = await screen.findByRole('button', { name: 'Account' });
    await user.click(account);

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeVisible();
    expect(screen.getByText('No email address on this account.')).toBeVisible();
  });

  it('shows the shortcut list when Keyboard is opened from the public settings window', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Keyboard' }));

    expect(await screen.findByRole('heading', { name: 'Keyboard' })).toBeVisible();
    expect(screen.getByText('Copy last message')).toBeVisible();
    expect(screen.getByText('Send message')).toBeVisible();
  });

  it('turns Dictation off from the Voice page of the public settings window', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ dictationEnabled: true });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Voice' }));
    const dictation = await screen.findByRole('switch', { name: 'Dictation' });
    expect(dictation).toHaveAttribute('aria-checked', 'true');

    await user.click(dictation);

    expect(useSettingsStore.getState().dictationEnabled).toBe(false);
    expect(screen.getByRole('switch', { name: 'Dictation' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('opens Connectors from the settings page the public window loads without calling one', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Connectors' }));

    expect(await screen.findByRole('heading', { name: 'Connectors' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'GitHub, Coming soon' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).toBeNull();
  });

  it('opens Plugins from the settings page the public window loads without installing one', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    expect(await screen.findByRole('heading', { name: 'Plugins' })).toBeVisible();
    expect(screen.getByPlaceholderText('Search plugins')).toBeVisible();
  });

  it('opens Skills from the settings page the public window loads without installing one', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeVisible();
    expect(screen.getByPlaceholderText('Search skills')).toBeVisible();
  });

  it('turns Reply ready off from Notifications on the public settings window', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Notifications' }));

    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeVisible();
    const reply = await screen.findByRole('combobox', { name: 'Reply ready' });
    await waitFor(() => expect(reply).toBeEnabled());
    expect(reply).toHaveValue('browserReplyReady');

    await user.selectOptions(reply, 'off');

    await waitFor(() => expect(reply).toHaveValue('off'));
    await waitFor(() => {
      const saved = vi.mocked(fetch).mock.calls.some(([input, init]) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
        const method = init?.method ?? (input instanceof Request ? input.method : '');
        const body = typeof init?.body === 'string' ? init.body : '';
        return (
          url.includes('/api/settings/preferences') &&
          method === 'PUT' &&
          body.includes('"namespace":"notifications"') &&
          body.includes('"browserReplyReady":false')
        );
      });
      expect(saved).toBe(true);
    });
  });

  it('shows the free plan from Billing on the public settings window without upgrading', async () => {
    const user = userEvent.setup();
    useBillingStore.setState({
      initialized: true,
      isLoading: false,
      unauthenticated: false,
      error: null,
      subscription: {
        tier: 'free',
        display_name: 'Free',
        status: 'active',
        current_period_end: null,
        plan_name: 'free',
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Billing' }));

    expect(await screen.findByRole('heading', { name: 'Billing' })).toBeVisible();
    expect(screen.getByText('Free plan')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Upgrade plan' })).toBeVisible();
    expect(mocks.routerReplace).not.toHaveBeenCalledWith('/upgrade');
  });

  it('turns instructions off from Personalization on the public settings window', async () => {
    const user = userEvent.setup();
    useBillingStore.setState({
      initialized: true,
      isLoading: false,
      unauthenticated: false,
      error: null,
      subscription: {
        tier: 'free',
        display_name: 'Free',
        status: 'active',
        current_period_end: null,
        plan_name: 'free',
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const personalizationNav = (
      await screen.findAllByRole('button', { name: 'Personalization' })
    ).find((button) => button.getAttribute('aria-controls') === 'settings-pane');
    expect(personalizationNav).toBeDefined();
    await user.click(personalizationNav!);

    expect(await screen.findByRole('heading', { name: 'Personalization' })).toBeVisible();
    const instructions = await screen.findByRole('switch', { name: 'Apply instructions for AGI' });
    await waitFor(() => expect(instructions).toBeEnabled());
    expect(instructions).toHaveAttribute('aria-checked', 'true');

    await user.click(instructions);

    expect(screen.getByRole('switch', { name: 'Apply instructions for AGI' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(
      screen.getByText('Off. Your instructions are kept and not sent to the model.'),
    ).toBeVisible();
  });

  it('clears saved memories from Personalization on the public settings window', async () => {
    const user = userEvent.setup();
    mocks.admitCloudSession = true;
    const rows = [
      {
        id: 'fact-1',
        content: 'Ships on Fridays.',
        category: null,
        source: 'web',
        createdAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
      },
    ];
    const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === MANAGED_CLOUD_WORKSPACES_PATH) {
        return new Response(
          JSON.stringify({
            scope: 'personal',
            activeWorkspaceId: 'personal',
            activeOrganizationId: null,
            workspaces: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (path === '/api/memory' && init?.method === 'DELETE') {
        const deleted = rows.length;
        rows.splice(0, rows.length);
        return new Response(JSON.stringify({ deleted }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (path.startsWith('/api/memory')) {
        return new Response(JSON.stringify({ memories: rows.slice(), hasMore: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return settingsResponse(input, init);
    });
    vi.stubGlobal('fetch', transport);
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const personalizationNav = (
      await screen.findAllByRole('button', { name: 'Personalization' })
    ).find((button) => button.getAttribute('aria-controls') === 'settings-pane');
    expect(personalizationNav).toBeDefined();
    await user.click(personalizationNav!);

    expect(await screen.findByRole('heading', { name: 'Personalization' })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear all memories' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Clear all memories' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(transport.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Forget everything' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear all memories' })).toBeDisabled(),
    );
    expect(transport.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
  });

  it('turns crash reports on from Privacy on the public settings window', async () => {
    const user = userEvent.setup();
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    await user.click(await screen.findByRole('button', { name: 'Privacy' }));

    expect(await screen.findByRole('heading', { name: 'Privacy' })).toBeVisible();
    const reports = await screen.findByRole('switch', { name: 'Share crash and error reports' });
    await waitFor(() => expect(reports).toBeEnabled());
    expect(reports).toHaveAttribute('aria-checked', 'false');

    await user.click(reports);

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Share crash and error reports' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    await waitFor(() => {
      const saved = vi.mocked(fetch).mock.calls.some(([input, init]) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
        const method = init?.method ?? (input instanceof Request ? input.method : '');
        const body = typeof init?.body === 'string' ? init.body : '';
        return (
          url.includes('/api/settings/preferences') &&
          method === 'PUT' &&
          body.includes('"namespace":"privacy"') &&
          body.includes('"shareTelemetry":true')
        );
      });
      expect(saved).toBe(true);
    });
  });

  it('turns keep-awake off from Desktop app settings on the public window', async () => {
    const user = userEvent.setup();
    const preferences = {
      launchAtLogin: false,
      showInMenuBar: true,
      preventSleepWhileRunning: true,
      cliPath: '',
    };
    const writePreferences = vi.fn(async (patch: Partial<typeof preferences>) => {
      Object.assign(preferences, patch);
      return { preferences, shortcutStatus: {} };
    });
    Object.assign(window, {
      agiHost: {
        platform: 'electron-darwin',
        shell: 'electron',
        appVersion: '1.2.0',
        readPreferences: async () => ({ preferences, shortcutStatus: {} }),
        writePreferences,
        checkForUpdate: async () => ({ available: false, currentVersion: '1.2.0' }),
        openUpdateInstaller: () => undefined,
        onDeepLink: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
        onRuntimeEvent: () => () => undefined,
        onHostCommand: () => () => undefined,
        invokeRuntime: async () => ({
          ok: false,
          error: { code: 'cancelled', message: 'unused in this test' },
        }),
        openExternal: async () => undefined,
        notify: () => undefined,
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const desktopGroup = (await screen.findAllByTestId('settings-nav-group-label')).find(
      (label) => label.textContent === 'Desktop app',
    )?.parentElement;
    expect(desktopGroup).toBeTruthy();
    await user.click(within(desktopGroup as HTMLElement).getByRole('button', { name: 'General' }));

    expect(await screen.findByRole('heading', { name: 'General desktop settings' })).toBeVisible();
    const awake = await screen.findByRole('switch', { name: 'Keep computer awake' });
    await waitFor(() => expect(awake).toBeEnabled());
    expect(awake).toHaveAttribute('aria-checked', 'true');

    await user.click(awake);

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Keep computer awake' })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );
    expect(writePreferences).toHaveBeenCalledWith({ preventSleepWhileRunning: false });
  });

  it('opens System Settings from Desktop app permissions on the public window', async () => {
    const user = userEvent.setup();
    const preferences = {
      launchAtLogin: false,
      showInMenuBar: true,
      preventSleepWhileRunning: true,
      cliPath: '',
    };
    const invokeRuntime = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'permission_review') {
        return {
          ok: true,
          value: {
            decisions: [],
            system: {
              'screen-recording': 'granted',
              accessibility: 'granted',
              microphone: 'denied',
            },
          },
        };
      }
      if (command === 'system_permission_open') {
        return { ok: true, value: true, args };
      }
      return { ok: false, error: { code: 'cancelled', message: 'unused in this test' } };
    });
    Object.assign(window, {
      agiHost: {
        platform: 'electron-darwin',
        shell: 'electron',
        appVersion: '1.2.0',
        readPreferences: async () => ({ preferences, shortcutStatus: {} }),
        writePreferences: async () => ({ preferences, shortcutStatus: {} }),
        checkForUpdate: async () => ({ available: false, currentVersion: '1.2.0' }),
        openUpdateInstaller: () => undefined,
        onDeepLink: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
        onRuntimeEvent: () => () => undefined,
        onHostCommand: () => () => undefined,
        invokeRuntime,
        openExternal: async () => undefined,
        notify: () => undefined,
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const desktopGroup = (await screen.findAllByTestId('settings-nav-group-label')).find(
      (label) => label.textContent === 'Desktop app',
    )?.parentElement;
    expect(desktopGroup).toBeTruthy();
    await user.click(within(desktopGroup as HTMLElement).getByRole('button', { name: 'General' }));

    const openSettings = await screen.findByRole('button', {
      name: 'Open System Settings for Microphone',
    });
    await user.click(openSettings);

    await waitFor(() => {
      expect(invokeRuntime).toHaveBeenCalledWith('system_permission_open', {
        permission: 'microphone',
      });
    });
  });

  it('turns the menu bar off from Desktop app settings on the public window', async () => {
    const user = userEvent.setup();
    const preferences = {
      launchAtLogin: false,
      showInMenuBar: true,
      cliPath: '',
    };
    const writePreferences = vi.fn(async (patch: Partial<typeof preferences>) => {
      Object.assign(preferences, patch);
      return { preferences, shortcutStatus: {} };
    });
    Object.assign(window, {
      agiHost: {
        platform: 'electron-darwin',
        shell: 'electron',
        appVersion: '1.2.0',
        readPreferences: async () => ({ preferences, shortcutStatus: {} }),
        writePreferences,
        checkForUpdate: async () => ({ available: false, currentVersion: '1.2.0' }),
        openUpdateInstaller: () => undefined,
        onDeepLink: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
        onRuntimeEvent: () => () => undefined,
        onHostCommand: () => () => undefined,
        invokeRuntime: async () => ({
          ok: false,
          error: { code: 'cancelled', message: 'unused in this test' },
        }),
        openExternal: async () => undefined,
        notify: () => undefined,
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const desktopGroup = (await screen.findAllByTestId('settings-nav-group-label')).find(
      (label) => label.textContent === 'Desktop app',
    )?.parentElement;
    expect(desktopGroup).toBeTruthy();
    await user.click(within(desktopGroup as HTMLElement).getByRole('button', { name: 'General' }));

    expect(await screen.findByRole('heading', { name: 'General desktop settings' })).toBeVisible();
    const menuBar = await screen.findByRole('switch', { name: 'Menu bar' });
    await waitFor(() => expect(menuBar).toBeEnabled());
    expect(menuBar).toHaveAttribute('aria-checked', 'true');

    await user.click(menuBar);

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Menu bar' })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );
    expect(writePreferences).toHaveBeenCalledWith({ showInMenuBar: false });
  });

  it('changes Quick Ask from Desktop app settings on the public window', async () => {
    const user = userEvent.setup();
    const preferences = {
      launchAtLogin: false,
      showInMenuBar: true,
      quickAskShortcut: 'Alt+Shift+Space',
      cliPath: '',
    };
    const writePreferences = vi.fn(async (patch: Partial<typeof preferences>) => {
      Object.assign(preferences, patch);
      return { preferences, shortcutStatus: {} };
    });
    Object.assign(window, {
      agiHost: {
        platform: 'electron-darwin',
        shell: 'electron',
        appVersion: '1.2.0',
        readPreferences: async () => ({ preferences, shortcutStatus: {} }),
        writePreferences,
        checkForUpdate: async () => ({ available: false, currentVersion: '1.2.0' }),
        openUpdateInstaller: () => undefined,
        onDeepLink: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
        onRuntimeEvent: () => () => undefined,
        onHostCommand: () => () => undefined,
        invokeRuntime: async () => ({
          ok: false,
          error: { code: 'cancelled', message: 'unused in this test' },
        }),
        openExternal: async () => undefined,
        notify: () => undefined,
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const desktopGroup = (await screen.findAllByTestId('settings-nav-group-label')).find(
      (label) => label.textContent === 'Desktop app',
    )?.parentElement;
    expect(desktopGroup).toBeTruthy();
    await user.click(within(desktopGroup as HTMLElement).getByRole('button', { name: 'General' }));

    expect(await screen.findByRole('heading', { name: 'General desktop settings' })).toBeVisible();
    const quickAsk = await screen.findByRole('combobox', { name: 'Quick Ask shortcut' });
    await waitFor(() => expect(quickAsk).toBeEnabled());
    expect(quickAsk).toHaveValue('Alt+Shift+Space');

    await user.selectOptions(quickAsk, 'CommandOrControl+Shift+Space');

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Quick Ask shortcut' })).toHaveValue(
        'CommandOrControl+Shift+Space',
      ),
    );
    expect(writePreferences).toHaveBeenCalledWith({
      quickAskShortcut: 'CommandOrControl+Shift+Space',
    });
  });

  it('changes the voice shortcut from Desktop app settings on the public window', async () => {
    const user = userEvent.setup();
    const preferences = {
      launchAtLogin: false,
      showInMenuBar: true,
      voiceShortcut: 'Alt+Shift+V',
      cliPath: '',
    };
    const writePreferences = vi.fn(async (patch: Partial<typeof preferences>) => {
      Object.assign(preferences, patch);
      return { preferences, shortcutStatus: {} };
    });
    Object.assign(window, {
      agiHost: {
        platform: 'electron-darwin',
        shell: 'electron',
        appVersion: '1.2.0',
        readPreferences: async () => ({ preferences, shortcutStatus: {} }),
        writePreferences,
        checkForUpdate: async () => ({ available: false, currentVersion: '1.2.0' }),
        openUpdateInstaller: () => undefined,
        onDeepLink: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
        onRuntimeEvent: () => () => undefined,
        onHostCommand: () => () => undefined,
        invokeRuntime: async () => ({
          ok: false,
          error: { code: 'cancelled', message: 'unused in this test' },
        }),
        openExternal: async () => undefined,
        notify: () => undefined,
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const desktopGroup = (await screen.findAllByTestId('settings-nav-group-label')).find(
      (label) => label.textContent === 'Desktop app',
    )?.parentElement;
    expect(desktopGroup).toBeTruthy();
    await user.click(within(desktopGroup as HTMLElement).getByRole('button', { name: 'General' }));

    expect(await screen.findByRole('heading', { name: 'General desktop settings' })).toBeVisible();
    const voice = await screen.findByRole('combobox', { name: 'Voice shortcut' });
    await waitFor(() => expect(voice).toBeEnabled());
    expect(voice).toHaveValue('Alt+Shift+V');

    await user.selectOptions(voice, 'CommandOrControl+Alt+V');

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Voice shortcut' })).toHaveValue(
        'CommandOrControl+Alt+V',
      ),
    );
    expect(writePreferences).toHaveBeenCalledWith({ voiceShortcut: 'CommandOrControl+Alt+V' });
  });

  it('opens Storage from Desktop app settings on the public window', async () => {
    const user = userEvent.setup();
    const preferences = {
      launchAtLogin: false,
      showInMenuBar: true,
      cliPath: '',
    };
    Object.assign(window, {
      agiHost: {
        platform: 'electron-darwin',
        shell: 'electron',
        appVersion: '1.2.0',
        readPreferences: async () => ({ preferences, shortcutStatus: {} }),
        writePreferences: async (patch: Partial<typeof preferences>) => {
          Object.assign(preferences, patch);
          return { preferences, shortcutStatus: {} };
        },
        checkForUpdate: async () => ({ available: false, currentVersion: '1.2.0' }),
        openUpdateInstaller: () => undefined,
        onDeepLink: () => () => undefined,
        onVoiceHotkey: () => () => undefined,
        onRuntimeEvent: () => () => undefined,
        onHostCommand: () => () => undefined,
        invokeRuntime: async () => ({
          ok: false,
          error: { code: 'cancelled', message: 'unused in this test' },
        }),
        openExternal: async () => undefined,
        notify: () => undefined,
      },
    });
    render(<SettingsIndexPage />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/chat?settings=general');
    });

    cleanup();
    mocks.queryString = 'settings=general';
    mocks.routerReplace.mockClear();

    render(
      <PublicChatWindow>
        <WebChatPage />
      </PublicChatWindow>,
    );

    const desktopGroup = (await screen.findAllByTestId('settings-nav-group-label')).find(
      (label) => label.textContent === 'Desktop app',
    )?.parentElement;
    expect(desktopGroup).toBeTruthy();
    await user.click(within(desktopGroup as HTMLElement).getByRole('button', { name: 'General' }));

    expect(await screen.findByRole('heading', { name: 'General desktop settings' })).toBeVisible();
    expect(
      within(desktopGroup as HTMLElement).getByRole('button', { name: 'Storage' }),
    ).toBeVisible();
    const general = screen.getByRole('region', { name: 'General desktop settings' });
    expect(within(general).getByText('Storage')).toBeVisible();
    await user.click(within(general).getByRole('button', { name: 'Manage storage' }));
    expect(
      await screen.findByText('Chats stay on this computer. Nothing was removed.'),
    ).toBeVisible();
  });
});
