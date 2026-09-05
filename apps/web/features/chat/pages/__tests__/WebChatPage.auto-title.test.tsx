import type { ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  temporaryConversation: false,
  updateConversation: vi.fn(async () => true),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000801';
const FIRST_USER_PROMPT =
  'Explain in detail how the two-stage conversation titler is supposed to behave end to end';
const CLIENT_TRUNCATION = FIRST_USER_PROMPT.slice(0, 60);
const STAGE_ONE_TITLE = `${FIRST_USER_PROMPT.slice(0, 50)}...`;
const GENERATED_TITLE = 'Two-stage titler behaviour';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ sessionId: CONVERSATION_ID }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/chat/${CONVERSATION_ID}`,
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
  const actual = await importOriginal<typeof import('react-i18next')>();
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
}));
vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

// The real hook projects the store's conversation map, which is exactly what this
// suite asserts against: an adopted title must land there without a network write.
vi.mock('@/lib/hooks/useConversations', async () => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      createConversation: vi.fn(),
      loadConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: mocks.updateConversation,
      setActiveConversation: vi.fn(),
    }),
  };
});

vi.mock('@/lib/hooks/useManagedUsageSummary', () => ({
  getWorstUsagePercent: () => 0,
  readManagedUsageBuckets: () => [],
  useManagedUsageSummary: () => ({ usage: null }),
}));

vi.mock('@/lib/hooks/useMediaGeneration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hooks/useMediaGeneration')>();
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

vi.mock('../../components/Composer/ChatComposerNew', () => ({
  ChatComposerNew: () => null,
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', () => ({
  ChatMessageList: () => <div data-testid="message-list" />,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', () => ({
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
vi.mock('../../hooks/use-keyboard-shortcuts', () => ({
  KEYBOARD_SHORTCUT_DOCS: [],
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', () => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    useToolPermissionsStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@features/projects', () => {
  const projectState = {
    projects: [],
    activeProjectId: null,
    setActiveProject: vi.fn(),
    updateProject: vi.fn(),
    removeProject: vi.fn(),
    setProjects: vi.fn(),
  };
  return {
    useManagedCloudProjects: () => ({ projects: [], isReady: true }),
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
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  return { ...actual, Sidebar: () => null };
});
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    LocalByokHandoffDialog: () => null,
    UsageWarningBanner: () => null,
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
  UpgradePlanDialog: () => null,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', () => ({
  UpgradeConfirmDialog: () => null,
}));
vi.mock('@/features/time-focus/TimeFocusReminder', () => ({ TimeFocusReminder: () => null }));
vi.mock('../../components/ConversationTitleMenu', () => ({ ConversationTitleMenu: () => null }));
vi.mock('../../components/approvals/ApprovalInbox', () => ({ ApprovalInbox: () => null }));
vi.mock('../../components/work-session/WorkSessionPanel', () => ({
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', () => ({
  ArtifactsPanel: () => null,
  ArtifactsToggleButton: () => null,
}));
vi.mock('../../components/research/ResearchPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ResearchPanel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', () => ({ SidebarWordmark: () => null }));

import WebChatPage from '../WebChatPage';
import { useChatStore } from '@shared/stores/web-chat-store';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function seedFirstTurn(options: { title: string; isTemporary?: boolean }): void {
  useChatStore.getState().reset();
  useChatStore.getState().setConversations([
    {
      id: CONVERSATION_ID,
      title: options.title,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
      ...(options.isTemporary ? { isTemporary: true } : {}),
    },
  ]);
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: '00000000-0000-4000-8000-0000000008a1',
      role: 'user',
      content: FIRST_USER_PROMPT,
      createdAt: '2026-08-15T00:00:01.000Z',
    },
    {
      id: '00000000-0000-4000-8000-0000000008a2',
      role: 'assistant',
      content: 'Sure.',
      createdAt: '2026-08-15T00:00:02.000Z',
    },
  ]);
}

function conversationTitleReads(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes(`/api/chat/conversations/${CONVERSATION_ID}`));
}

function storeTitle(): string | undefined {
  return useChatStore.getState().conversations.find((c) => c.id === CONVERSATION_ID)?.title;
}

describe('WebChatPage auto-title (WEB-85)', () => {
  beforeEach(() => {
    mocks.temporaryConversation = false;
    mocks.updateConversation.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adopts the server title instead of writing its own truncation', async () => {
    seedFirstTurn({ title: 'New Chat' });
    const fetchMock = vi.fn(async () =>
      jsonResponse({ conversation: { id: CONVERSATION_ID, title: GENERATED_TITLE } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<WebChatPage />);

    await waitFor(() => expect(storeTitle()).toBe(GENERATED_TITLE));
    expect(conversationTitleReads(fetchMock).length).toBeGreaterThan(0);
    expect(mocks.updateConversation).not.toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ title: expect.anything() }),
    );
  });

  it('lets the background LLM title replace the stage-1 truncation it first read', async () => {
    seedFirstTurn({ title: 'Image generation' });
    let reads = 0;
    const fetchMock = vi.fn(async () => {
      reads += 1;
      return jsonResponse({
        conversation: {
          id: CONVERSATION_ID,
          title: reads === 1 ? STAGE_ONE_TITLE : GENERATED_TITLE,
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WebChatPage />);

    await waitFor(() => expect(storeTitle()).toBe(STAGE_ONE_TITLE));
    await waitFor(() => expect(storeTitle()).toBe(GENERATED_TITLE), { timeout: 6000 });
    expect(mocks.updateConversation).not.toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ title: expect.anything() }),
    );
  }, 15000);

  it('falls back to a local truncation for a temporary chat the server never titles', async () => {
    seedFirstTurn({ title: 'New Chat', isTemporary: true });
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    render(<WebChatPage />);

    await waitFor(() =>
      expect(mocks.updateConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
        title: CLIENT_TRUNCATION,
      }),
    );
    expect(conversationTitleReads(fetchMock)).toEqual([]);
  });
});
