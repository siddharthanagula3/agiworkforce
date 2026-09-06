import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  highlightParam: null as string | null,
  routerReplace: vi.fn(),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000911';
const FIRST_MESSAGE_ID = '00000000-0000-4000-8000-0000000009b1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace, push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ sessionId: CONVERSATION_ID }),
  useSearchParams: () =>
    new URLSearchParams(
      mocks.highlightParam === null ? '' : [['highlightMessage', mocks.highlightParam]],
    ),
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

vi.mock('@/lib/hooks/useConversations', async () => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      createConversation: vi.fn(),
      loadConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(async () => true),
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
vi.mock('../../components/messages/ChatMessageList', async () => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ChatMessageList: () => {
      const messages = useChatStore((state) => state.messages);
      return (
        <div data-testid="message-list">
          {messages.map((message) => (
            <div key={message.id} data-message-id={message.id}>
              {message.content}
            </div>
          ))}
        </div>
      );
    },
  };
});
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

function openConversationWithMessages(): void {
  useChatStore.getState().reset();
  useChatStore.getState().setConversations([
    {
      id: CONVERSATION_ID,
      title: 'Searched chat',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
  ]);
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: FIRST_MESSAGE_ID,
      role: 'user',
      content: 'Find this later',
      createdAt: '2026-08-20T00:00:01.000Z',
    },
    {
      id: '00000000-0000-4000-8000-0000000009b2',
      role: 'assistant',
      content: 'Noted.',
      createdAt: '2026-08-20T00:00:02.000Z',
    },
  ]);
}

describe('WebChatPage highlightMessage query parameter (F15)', () => {
  beforeEach(() => {
    mocks.highlightParam = null;
    mocks.routerReplace.mockClear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls to the message named by a well-formed highlightMessage id', async () => {
    mocks.highlightParam = FIRST_MESSAGE_ID;
    openConversationWithMessages();

    render(<WebChatPage />);

    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>(`[data-message-id="${FIRST_MESSAGE_ID}"]`)?.style
          .outline,
      ).toBe('2px solid var(--chat-accent-primary)'),
    );
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('keeps rendering the conversation when highlightMessage carries selector metacharacters', async () => {
    mocks.highlightParam = '"],*{x:1},[x="';
    openConversationWithMessages();

    render(<WebChatPage />);

    expect(await screen.findByTestId('message-list')).toBeTruthy();
    expect(screen.getByText('Find this later')).toBeTruthy();
    expect(
      document.querySelector<HTMLElement>(`[data-message-id="${FIRST_MESSAGE_ID}"]`)?.style.outline,
    ).toBe('');
  });
});
