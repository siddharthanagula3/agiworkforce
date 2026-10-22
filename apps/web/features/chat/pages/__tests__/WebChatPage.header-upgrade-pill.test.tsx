import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_MODEL_PROMOTION_PATH } from '@agiworkforce/cloud-contracts';
import { MODEL_FAMILY_REGISTRY } from '@agiworkforce/types';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('@agiworkforce/ui');
type ScanModule4 = typeof import('@agiworkforce/unified-chat');
type ScanModule5 = typeof import('../../components/ConversationTitleMenu');

type ComposerOnSend = (
  content: string,
  attachments?: File[],
  skillId?: string,
  meta?: Record<string, unknown>,
) => unknown;

const mocks = vi.hoisted(() => ({
  composerOnSend: null as ComposerOnSend | null,
  sendMessage: vi.fn(
    async (_content: string, options?: { ensureConversationId?: () => Promise<unknown> }) => {
      await options?.ensureConversationId?.();
      return true;
    },
  ),
  createConversation: vi.fn(async (..._args: unknown[]) => ({
    id: '00000000-0000-4000-8000-000000000901',
    title: 'New Chat',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    isTemporary: true,
  })),
  updateConversation: vi.fn(async () => true),
  toastError: vi.fn(),
  usage: null as null | { plan_tier: string },
  usageBuckets: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/chat',
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: async () => 'fixture-token',
    isLoaded: true,
    userId: 'fixture-user',
  }),
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ user: null }),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
  getCsrfToken: async () => 'fixture-csrf-token',
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  readAutonomousToolApprovalsAllowed: async () => false,
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, dismiss: vi.fn() } }));

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ...(await importOriginal()),
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      listError: null,
      getConversationLoadError: () => null,
      createConversation: mocks.createConversation,
      loadConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: mocks.updateConversation,
      setActiveConversation: (id: string | null) =>
        useChatStore.getState().setActiveConversation(id),
    }),
  };
});

vi.mock('@/lib/hooks/useManagedUsageSummary', async (importOriginal) => ({
  ...(await importOriginal()),
  getWorstUsagePercent: () => 0,
  readManagedUsageBuckets: () => mocks.usageBuckets,
  useManagedUsageSummary: () => ({ usage: mocks.usage, refresh: vi.fn() }),
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
  ...(await importOriginal()),
  ChatComposerNew: (props: { onSend: ComposerOnSend }) => {
    mocks.composerOnSend = props.onSend;
    return null;
  },
  SEND_GUARD_BLOCKED: 'guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal()),
  ChatMessageList: () => null,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal()),
  useChatStreamRuntime: () => ({
    sendMessage: mocks.sendMessage,
    stopGeneration: vi.fn(),
    continueGeneration: vi.fn(),
    resumeInteractiveCardTurn: vi.fn(),
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
vi.mock('../../hooks/use-keyboard-shortcuts', () => ({
  findShortcutDoc: vi.fn(() => undefined),
  formatShortcutKeys: vi.fn(() => []),
  KEYBOARD_SHORTCUT_DOCS: [],
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    ...(await importOriginal()),
    useToolPermissionsStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

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
    ...(await importOriginal()),
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
    UsageWarningBanner: ({
      warning,
      upgradeLabel,
    }: {
      warning: { headline: string; resetLabel: string | null } | null;
      upgradeLabel?: string;
    }) =>
      warning ? (
        <p data-testid="usage-warning">
          {[warning.headline, warning.resetLabel, upgradeLabel].filter(Boolean).join(' | ')}
        </p>
      ) : null,
  };
});

vi.mock('../../components/dialogs/GlobalSearchDialog', () => ({ GlobalSearchDialog: () => null }));
vi.mock('../../components/dialogs/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: () => null,
}));
vi.mock('../../components/dialogs/CreateProjectDialog', () => ({
  CreateProjectDialog: () => null,
}));
vi.mock('../../components/dialogs/UpgradePlanDialog', () => ({
  UpgradePlanDialog: ({ open }: { open?: boolean }) =>
    open ? <div data-testid="upgrade-dialog" /> : null,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', () => ({
  UpgradeConfirmDialog: () => null,
}));
vi.mock('@/features/time-focus/TimeFocusReminder', async (importOriginal) => ({
  ...(await importOriginal()),
  TimeFocusReminder: () => null,
}));
vi.mock('../../components/ConversationTitleMenu', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  ConversationTitleMenu: () => null,
}));
vi.mock('../../components/approvals/ApprovalInbox', async (importOriginal) => ({
  ...(await importOriginal()),
  ApprovalInbox: () => null,
}));
vi.mock('../../components/work-session/WorkSessionPanel', () => ({
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ArtifactsPanel: () => null,
  ArtifactsToggleButton: () => null,
}));
vi.mock('../../components/research/ResearchPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ResearchPanel: () => null,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', () => ({ SidebarWordmark: () => null }));

import WebChatPage from '../WebChatPage';
import promotionConfig from '@/config/free-model-promotion.json';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';

const PROMOTED_MODEL = Object.values(MODEL_FAMILY_REGISTRY).find(
  (family) =>
    family.provider === promotionConfig.provider && family.tier === promotionConfig.modelFamilyTier,
)?.activeModelId;
const ENDS_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url) === FREE_MODEL_PROMOTION_PATH
        ? new Response(JSON.stringify({ promotion: { modelId: PROMOTED_MODEL, endsAt: ENDS_AT } }))
        : new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
    ),
  );
}

function setTier(tier: string) {
  useBillingStore.setState({
    user: { id: 'fixture-user' },
    subscription: {
      tier: tier as never,
      display_name: tier,
      status: 'active',
      current_period_end: null,
      plan_name: tier,
    },
    initialized: true,
    isLoading: false,
    unauthenticated: false,
    error: null,
  });
}

describe('the chat header upgrade pill', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useBillingStore.setState({
      user: null,
      subscription: null,
      initialized: false,
      isLoading: true,
    });
  });

  it('shows on the Free plan and opens the upgrade flow', async () => {
    setTier('free');
    render(<WebChatPage />);

    const pill = await screen.findByTestId('header-upgrade-pill');
    expect(pill.textContent).toBe('Upgrade');
    fireEvent.click(pill);

    expect(await screen.findByTestId('upgrade-dialog')).toBeTruthy();
  });

  it('is absent on a paid plan', async () => {
    setTier('pro');
    const { container } = render(<WebChatPage />);

    await waitFor(() => expect(container.querySelector('[data-app-header]')).not.toBeNull());
    expect(screen.queryByTestId('header-upgrade-pill')).toBeNull();
  });
});
