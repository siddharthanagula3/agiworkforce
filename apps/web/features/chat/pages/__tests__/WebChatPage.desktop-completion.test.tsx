import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeFreeModelProviderNotice } from '@agiworkforce/compliance';
import { getProviderOfferings } from '@agiworkforce/types';
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
  composerClearSignal: undefined as number | undefined,
  routeParams: {} as Record<string, string>,
  regenerate: null as ((id: string) => Promise<void>) | null,
  sendMessage: vi.fn(
    async (_content: string, options?: { ensureConversationId?: () => Promise<unknown> }) => {
      await options?.ensureConversationId?.();
      return true;
    },
  ),
  createConversation: vi.fn(async (..._args: unknown[]) => ({
    id: '00000000-0000-4000-8000-000000000901',
    title: 'New Chat',
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    isTemporary: false,
  })),
  updateConversation: vi.fn(async () => true),
  toastError: vi.fn(),
  storedConsent: {} as Record<string, unknown>,
  savePreference: vi.fn(async (..._args: unknown[]) => ({ version: null })),
  notifyJobComplete: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifyJobComplete: mocks.notifyJobComplete,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => mocks.routeParams,
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
  fetchPreferenceNamespace: async (namespace: string) =>
    namespace === 'provider_consent' ? mocks.storedConsent : { browserReplyReady: true },
  savePreferenceNamespace: mocks.savePreference,
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
  ...(await importOriginal()),
  ChatComposerNew: (props: { onSend: ComposerOnSend; clearSignal?: number }) => {
    mocks.composerOnSend = props.onSend;
    mocks.composerClearSignal = props.clearSignal;
    return null;
  },
  SEND_GUARD_BLOCKED: 'guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal()),
  ChatMessageList: (props: { onRegenerate?: (id: string) => Promise<void> }) => {
    mocks.regenerate = props.onRegenerate ?? null;
    return null;
  },
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
vi.mock('../../hooks/use-keyboard-shortcuts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findShortcutDoc: vi.fn(() => undefined),
  formatShortcutKeys: vi.fn(() => []),
  KEYBOARD_SHORTCUT_DOCS: [],
  useKeyboardShortcuts: vi.fn(),
  checkShortcutBinding: vi.fn(),
  chordFromKeyboardEvent: vi.fn(),
  isRebindableShortcut: vi.fn(() => false),
  withShortcutBindings: vi.fn((docs: unknown) => docs),
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
    UsageWarningBanner: () => null,
  };
});

vi.mock('../../components/dialogs/GlobalSearchDialog', () => ({ GlobalSearchDialog: () => null }));
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
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';

const [FREE_MODEL] = Object.entries(getProviderOfferings()).find(
  ([, offering]) =>
    offering.provider === 'qwen' &&
    offering.quotaProbeProtocol === 'chat' &&
    offering.identityStatus === 'exact' &&
    offering.quotaChatImageInput !== true,
)!;
const notice = composeFreeModelProviderNotice('qwen');
const AGREED = {
  qwen: {
    providerId: 'qwen',
    accepted: true,
    acceptedAt: '2026-10-05T09:00:00.000Z',
    disclosureVersion: notice.version,
    surface: 'web',
  },
};
const FREE_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'free',
  display_name: 'Free',
  status: 'active',
  current_period_end: null,
  plan_name: 'Free',
};
const QUESTION = 'Which planet has the most moons?';

async function renderChat() {
  render(<WebChatPage />);
  await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
  await act(async () => {
    await Promise.resolve();
  });
}

function send(meta: Record<string, unknown> = {}): unknown {
  let outcome: unknown;
  act(() => {
    outcome = mocks.composerOnSend!(QUESTION, undefined, undefined, meta);
  });
  return outcome;
}

describe('the desktop notification for a finished reply', () => {
  let originalModelId: string;
  let originalSubscription: ReturnType<typeof useBillingStore.getState>['subscription'];

  beforeEach(() => {
    useChatStore.getState().reset();
    mocks.composerOnSend = null;
    mocks.routeParams = {};
    mocks.regenerate = null;
    mocks.sendMessage.mockClear();
    mocks.notifyJobComplete.mockClear();
    mocks.createConversation.mockClear();
    mocks.updateConversation.mockClear();
    mocks.toastError.mockClear();
    mocks.storedConsent = {};
    mocks.savePreference.mockReset().mockImplementation(async (_namespace, value) => {
      mocks.storedConsent = { ...mocks.storedConsent, ...(value as Record<string, unknown>) };
      return { version: null };
    });
    originalModelId = useModelStore.getState().selectedModelId;
    originalSubscription = useBillingStore.getState().subscription;
    useBillingStore.setState({ subscription: FREE_SUBSCRIPTION });
    useModelStore.getState().setSelectedModelId(FREE_MODEL);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
  });

  afterEach(() => {
    useModelStore.getState().setSelectedModelId(originalModelId);
    useBillingStore.setState({ subscription: originalSubscription });
    vi.unstubAllGlobals();
  });

  it('announces a reply that finished in a new chat under the conversation the server created', async () => {
    mocks.storedConsent = AGREED;
    const created = '00000000-0000-4000-8000-000000000901';
    mocks.sendMessage.mockImplementationOnce(async (_content, options) => {
      await options?.ensureConversationId?.();
      useChatStore.setState((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [created]: [
            {
              id: 'user-1',
              role: 'user',
              content: QUESTION,
              createdAt: '2026-10-19T00:00:00.000Z',
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: 'Saturn.',
              createdAt: '2026-10-19T00:00:01.000Z',
            },
          ],
        },
      }));
      return true;
    });
    await renderChat();

    send();

    await waitFor(() => expect(mocks.notifyJobComplete).toHaveBeenCalledTimes(1));
    expect(mocks.notifyJobComplete).toHaveBeenCalledWith({
      title: 'Your reply is ready',
      body: 'Saturn.',
      conversationId: created,
    });
  });
});
