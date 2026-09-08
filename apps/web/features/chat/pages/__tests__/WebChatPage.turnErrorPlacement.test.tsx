import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000931';
const USER_MESSAGE_ID = '00000000-0000-4000-8000-0000000009c1';
const SEND_FAILURE = 'Could not start the conversation.';
const EMPTY_RESPONSE = /returned no response for this turn/i;
const COMPOSER_COLUMN_CLASSES = ['mx-auto', 'w-full', 'max-w-3xl', 'px-4'];

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
  ChatComposerNew: () => <div data-testid="chat-composer" />,
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

function openStalledTurn(sentAgoMs: number): void {
  useChatStore.getState().reset();
  useChatStore.getState().setConversations([
    {
      id: CONVERSATION_ID,
      title: 'General Greeting',
      createdAt: '2026-09-07T22:40:00.000Z',
      updatedAt: '2026-09-07T22:43:00.000Z',
    },
  ]);
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: USER_MESSAGE_ID,
      role: 'user',
      content: 'hi',
      createdAt: new Date(Date.now() - sentAgoMs).toISOString(),
    },
  ]);
}

function noticeFor(text: string | RegExp): HTMLElement {
  const alert = screen.getByText(text).closest('[role="alert"]');
  if (!(alert instanceof HTMLElement)) throw new Error('turn error notice is not an alert');
  return alert;
}

describe('WebChatPage turn error notice placement', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('states a reload with no reply directly above the composer', () => {
    openStalledTurn(120_000);

    render(<WebChatPage />);

    const notice = noticeFor(EMPTY_RESPONSE);
    const composer = screen.getByTestId('chat-composer');

    expect(notice.parentElement).toBe(composer.parentElement);
    expect(
      notice.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shares the composer column, so it is never wider than the composer', () => {
    openStalledTurn(120_000);

    render(<WebChatPage />);

    const column = noticeFor(EMPTY_RESPONSE).parentElement;
    expect(column).not.toBeNull();
    for (const className of COMPOSER_COLUMN_CLASSES) {
      expect(column!.classList.contains(className)).toBe(true);
    }
  });

  it('keeps the notice out of the scrolling transcript', () => {
    openStalledTurn(120_000);

    render(<WebChatPage />);

    expect(screen.getByTestId('message-list').contains(noticeFor(EMPTY_RESPONSE))).toBe(false);
  });

  it('carries the retry control the founder used', () => {
    openStalledTurn(120_000);

    render(<WebChatPage />);

    const notice = noticeFor(EMPTY_RESPONSE);
    expect(notice.querySelector('button[aria-label="Retry this turn"]')).not.toBeNull();
  });

  it('states a reported send failure in the same place', () => {
    openStalledTurn(0);
    useChatStore.getState().setError(SEND_FAILURE, CONVERSATION_ID);

    render(<WebChatPage />);

    const notice = noticeFor(SEND_FAILURE);
    expect(notice.parentElement).toBe(screen.getByTestId('chat-composer').parentElement);
    expect(screen.queryByText(EMPTY_RESPONSE)).toBeNull();
  });

  it('stays quiet while a fresh turn is still running', () => {
    openStalledTurn(0);

    render(<WebChatPage />);

    expect(screen.queryByText(EMPTY_RESPONSE)).toBeNull();
  });
});
