import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_MODEL_PROMOTION_PATH } from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_CAPABILITY_TIERS,
  canUseBillingPlanCapability,
  getBillingPlanPricing,
  MODEL_FAMILY_REGISTRY,
  normalizeBillingPlanTier,
  type BillingPlanTier,
  type CloudWorkMode,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('@agiworkforce/ui');
type ScanModule4 = typeof import('@agiworkforce/unified-chat');
type ScanModule5 = typeof import('../../components/ConversationTitleMenu');

type SendMessageOptions = {
  model?: string;
  workMode?: CloudWorkMode;
  onTurnCommitted?: () => void;
};

const PROJECT_ID = '0190a000-0000-7000-8000-0000000000aa';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(async (_content: string, options?: SendMessageOptions) => {
    options?.onTurnCommitted?.();
    return true;
  }),
  toastError: vi.fn(),
  composerPrefill: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => mocks.searchParams,
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
      createConversation: vi.fn(),
      loadConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(async () => true),
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
  ChatComposerNew: ({ prefillText }: { prefillText?: string }) => {
    mocks.composerPrefill(prefillText);
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
import promotionConfig from '@/config/free-model-promotion.json';
import {
  PROJECT_CHAT_HANDOFF_KEY,
  PROJECT_CHAT_HANDOFF_SETTLE_MS,
  projectChatHandoffHref,
  saveProjectChatHandoff,
} from '@/features/projects/lib/project-chat-handoff';
import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { AVAILABLE_MODELS, useModelStore } from '@shared/stores/model-store';

const FREE_TIER = normalizeBillingPlanTier(null);
const WORK_TIER = BILLING_PLAN_CAPABILITY_TIERS.agi_work[0]!;
const PROJECT_DRAFT = 'Draft an invitation to the workshop on 15 October.';
const PROMOTED_MODEL = Object.values(MODEL_FAMILY_REGISTRY).find(
  (family) =>
    family.provider === promotionConfig.provider && family.tier === promotionConfig.modelFamilyTier,
)?.activeModelId;
const PROMOTION_ENDS_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
const TURN_NOT_STARTED = 'The project turn did not start. Your draft is ready to send again.';

function signInOnPlan(tier: BillingPlanTier) {
  const planLabel = getBillingPlanPricing(tier).label;
  useBillingStore.setState({
    user: { id: 'fixture-user' },
    subscription: {
      tier,
      display_name: planLabel,
      status: 'active',
      current_period_end: null,
      plan_name: planLabel,
    },
    initialized: true,
    isLoading: false,
    unauthenticated: false,
    error: null,
  });
}

function arriveFromProjectPage(input: Parameters<typeof saveProjectChatHandoff>[1]): string {
  const handoffId = saveProjectChatHandoff(sessionStorage, input);
  mocks.searchParams = new URL(
    projectChatHandoffHref(input.projectId, handoffId),
    'http://localhost',
  ).searchParams;
  return handoffId;
}

function sendFromProjectPage(workMode: CloudWorkMode, modelId?: string) {
  arriveFromProjectPage({
    content: PROJECT_DRAFT,
    projectId: PROJECT_ID,
    ...(modelId ? { modelId } : {}),
    meta: { workMode, projectId: PROJECT_ID, memoryEnabled: true },
  });
}

function planRequestNeverAnswers() {
  useBillingStore.setState({
    user: null,
    subscription: null,
    initialized: false,
    isLoading: true,
    unauthenticated: false,
    error: null,
  });
}

async function modeOfTheProjectTurn(): Promise<CloudWorkMode | undefined> {
  render(<WebChatPage />);
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
  const [content, options] = mocks.sendMessage.mock.calls[0]!;
  expect(content).toBe(PROJECT_DRAFT);
  return options?.workMode;
}

describe('the first message sent from a project page', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    mocks.sendMessage.mockClear();
    mocks.toastError.mockClear();
    mocks.composerPrefill.mockClear();
    mocks.searchParams = new URLSearchParams({ projectId: PROJECT_ID });
    sessionStorage.removeItem(PROJECT_CHAT_HANDOFF_KEY);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url) === FREE_MODEL_PROMOTION_PATH
          ? new Response(
              JSON.stringify({
                promotion: { modelId: PROMOTED_MODEL, endsAt: PROMOTION_ENDS_AT },
              }),
            )
          : new Response(JSON.stringify({}), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.removeItem(PROJECT_CHAT_HANDOFF_KEY);
    useBillingStore.setState({
      user: null,
      subscription: null,
      initialized: false,
      isLoading: true,
      unauthenticated: false,
      error: null,
    });
  });

  it('is sent as ordinary chat for a Free account, never as AGI Work', async () => {
    expect(canUseBillingPlanCapability(FREE_TIER, 'agi_work')).toBe(false);
    signInOnPlan(FREE_TIER);
    sendFromProjectPage('chat');

    expect(await modeOfTheProjectTurn()).toBe('chat');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('stays AGI Work for an eligible account that chose Work', async () => {
    expect(canUseBillingPlanCapability(WORK_TIER, 'agi_work')).toBe(true);
    signInOnPlan(WORK_TIER);
    sendFromProjectPage('agiwork');

    expect(await modeOfTheProjectTurn()).toBe('agiwork');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('stays ordinary chat for an eligible account that left the composer in Chat', async () => {
    signInOnPlan(WORK_TIER);
    sendFromProjectPage('chat');

    expect(await modeOfTheProjectTurn()).toBe('chat');
  });

  it('sends the promoted free model a Free account chose, after the promotion is read', async () => {
    expect(PROMOTED_MODEL).toBeDefined();
    expect(PROMOTED_MODEL).not.toBe(FREE_TRIAL_MODEL);
    signInOnPlan(FREE_TIER);
    useModelStore.getState().setSelectedModelId(PROMOTED_MODEL!);
    sendFromProjectPage('chat', PROMOTED_MODEL!);

    render(<WebChatPage />);
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    const [content, options] = mocks.sendMessage.mock.calls[0]!;
    expect(content).toBe(PROJECT_DRAFT);
    expect(options?.model).toBe(PROMOTED_MODEL);
    expect(options?.workMode).toBe('chat');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('still sends the snapshotted model when the plan request failed', async () => {
    useBillingStore.setState({
      user: null,
      subscription: null,
      initialized: true,
      isLoading: false,
      unauthenticated: false,
      error: '/api/me returned 503',
    });
    const [snapshot] = AVAILABLE_MODELS.map((model) => model.id);
    useModelStore.getState().setSelectedModelId(snapshot!);
    sendFromProjectPage('chat', snapshot!);

    render(<WebChatPage />);
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0]![1]?.model).toBe(snapshot);
  });

  it('restores the model snapshotted with the handoff', async () => {
    signInOnPlan(WORK_TIER);
    const [current, other] = AVAILABLE_MODELS.map((model) => model.id);
    useModelStore.getState().setSelectedModelId(current!);
    sendFromProjectPage('chat', other!);

    render(<WebChatPage />);
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(useModelStore.getState().selectedModelId).toBe(other);
    expect(mocks.sendMessage.mock.calls[0]![1]?.model).toBe(other);
  });

  // Each of the next three failed on eb35dd4485: the wait for the plan had no
  // way out, so a 401 or a request that never answered sent nothing, put
  // nothing back and said nothing, and a handoff with no page binding was sent
  // by whichever visit to the project's chat came first.
  it('puts the draft back with the failure toast, calling no model, when /api/me answers 401', async () => {
    useBillingStore.setState({
      user: null,
      subscription: null,
      initialized: true,
      isLoading: false,
      unauthenticated: true,
      error: null,
    });
    sendFromProjectPage('chat');

    render(<WebChatPage />);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(TURN_NOT_STARTED));
    expect(mocks.composerPrefill).toHaveBeenCalledWith(PROJECT_DRAFT);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PROJECT_CHAT_HANDOFF_KEY)).toBeNull();
  });

  it('stops waiting for a plan request that never answers and sends the snapshotted model', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    planRequestNeverAnswers();
    const [snapshot] = AVAILABLE_MODELS.map((model) => model.id);
    useModelStore.getState().setSelectedModelId(snapshot!);
    sendFromProjectPage('chat', snapshot!);

    render(<WebChatPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_CHAT_HANDOFF_SETTLE_MS - 1);
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    const [content, options] = mocks.sendMessage.mock.calls[0]!;
    expect(content).toBe(PROJECT_DRAFT);
    expect(options?.model).toBe(snapshot);
  });

  it('never sends a handoff to a later visit that the project page did not navigate to', async () => {
    signInOnPlan(WORK_TIER);
    sendFromProjectPage('chat');
    mocks.searchParams = new URLSearchParams({ projectId: PROJECT_ID });

    render(<WebChatPage />);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(TURN_NOT_STARTED));
    expect(mocks.composerPrefill).toHaveBeenCalledWith(PROJECT_DRAFT);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PROJECT_CHAT_HANDOFF_KEY)).toBeNull();
  });

  // Fails on 97f2481cc6: a second visit to the same handoff URL, such as Back
  // to a page left while it waited, sent the handoff as soon as the plan read.
  it('gives the draft back instead of sending when a page it waited on is opened again', async () => {
    planRequestNeverAnswers();
    sendFromProjectPage('chat');
    const left = render(<WebChatPage />);
    left.unmount();

    signInOnPlan(WORK_TIER);
    render(<WebChatPage />);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(TURN_NOT_STARTED));
    expect(mocks.composerPrefill).toHaveBeenCalledWith(PROJECT_DRAFT);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('sends nothing once the page is left while it is still waiting for the plan', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    planRequestNeverAnswers();
    sendFromProjectPage('chat');

    const page = render(<WebChatPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_CHAT_HANDOFF_SETTLE_MS / 2);
    });
    page.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_CHAT_HANDOFF_SETTLE_MS);
    });

    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
