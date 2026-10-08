import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRowActionFailureMessage } from '@shared/components/layout/sidebar-session-actions';
type ScanModule0 = typeof import('sonner');
type ScanModule1 = typeof import('next/navigation');
type ScanModule2 = typeof import('react-i18next');
type ScanModule3 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule4 = typeof import('@/lib/hooks/useConversations');
type ScanModule5 = typeof import('@/lib/hooks/useManagedUsageSummary');
type ScanModule6 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule7 = typeof import('../../components/Composer/ChatComposerNew');
type ScanModule8 = typeof import('../../components/messages/ChatMessageList');
type ScanModule9 = typeof import('../../components/GreetingBanner/GreetingBanner');
type ScanModule10 = typeof import('../../components/ChatStreamRuntimeProvider');
type ScanModule11 = typeof import('../../hooks/use-artifact-cloud-sync');
type ScanModule12 = typeof import('../../hooks/use-share-conversation');
type ScanModule13 = typeof import('../../hooks/use-conversation-branches');
type ScanModule14 = typeof import('../../hooks/use-keyboard-shortcuts');
type ScanModule15 = typeof import('@shared/utils/browser-utils');
type ScanModule16 = typeof import('@/features/settings/components/SettingsModalProvider');
type ScanModule17 = typeof import('@/features/connectors/stores/tool-permissions-store');
type ScanModule18 = typeof import('@features/projects');
type ScanModule19 = typeof import('@features/projects/services/managed-cloud-projects');
type ScanModule20 = typeof import('@agiworkforce/ui');
type ScanModule21 = typeof import('@agiworkforce/unified-chat');
type ScanModule22 = typeof import('../../components/dialogs/GlobalSearchDialog');
type ScanModule23 = typeof import('../../components/dialogs/KeyboardShortcutsDialog');
type ScanModule24 = typeof import('../../components/dialogs/CreateProjectDialog');
type ScanModule25 = typeof import('../../components/dialogs/UpgradePlanDialog');
type ScanModule26 = typeof import('@features/billing/components/UpgradeConfirmDialog');
type ScanModule27 = typeof import('@/features/time-focus/TimeFocusReminder');
type ScanModule28 = typeof import('../../components/approvals/ApprovalInbox');
type ScanModule29 = typeof import('../../components/work-session/WorkSessionPanel');
type ScanModule30 = typeof import('../../components/artifacts/ArtifactsPanel');
type ScanModule31 = typeof import('@shared/components/agi/SidebarWordmark');

const mocks = vi.hoisted(() => ({
  useKeyboardShortcuts: vi.fn(),
  writeText: vi.fn(async () => true),
  updateConversation: vi.fn(async (_id: string, _updates: unknown) => true),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000931';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, toast: Object.assign(vi.fn(), actual.toast, { error: toastError }) };
});

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ sessionId: CONVERSATION_ID }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/chat/${CONVERSATION_ID}`,
}));

vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAuth: () => ({
    getToken: async () => 'fixture-token',
    isLoaded: true,
    userId: 'fixture-user',
  }),
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ user: null }),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
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
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ...(await importOriginal<ScanModule4>()),
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      createConversation: vi.fn(),
      loadConversation: vi.fn(async () => true),
      deleteConversation: vi.fn(),
      updateConversation: mocks.updateConversation,
      setActiveConversation: vi.fn(),
    }),
  };
});

vi.mock('@/lib/hooks/useManagedUsageSummary', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  getWorstUsagePercent: () => 0,
  readManagedUsageBuckets: () => [],
  useManagedUsageSummary: () => ({ usage: null }),
}));

vi.mock('@/lib/hooks/useMediaGeneration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule6>();
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
  ...(await importOriginal<ScanModule7>()),
  ChatComposerNew: () => null,
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  ChatMessageList: () => <div data-testid="message-list" />,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule10>()),
  useChatStreamRuntime: () => ({
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    continueGeneration: vi.fn(),
    resolveToolApproval: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-artifact-cloud-sync', async (importOriginal) => ({
  ...(await importOriginal<ScanModule11>()),
  useArtifactCloudSync: vi.fn(),
}));
vi.mock('../../hooks/use-share-conversation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule12>()),
  useShareConversation: () => ({ share: vi.fn(), isSharing: false }),
}));
vi.mock('../../hooks/use-conversation-branches', async (importOriginal) => ({
  ...(await importOriginal<ScanModule13>()),
  useConversationBranches: () => ({
    groupsByMessageId: {},
    branchingMessageId: null,
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-keyboard-shortcuts', async (importOriginal) => {
  const actual = await importOriginal<ScanModule14>();
  return { ...actual, useKeyboardShortcuts: mocks.useKeyboardShortcuts };
});
vi.mock('@shared/utils/browser-utils', async (importOriginal) => {
  const actual = await importOriginal<ScanModule15>();
  return { ...actual, safeClipboard: { ...actual.safeClipboard, writeText: mocks.writeText } };
});

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule16>()),
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    ...(await importOriginal<ScanModule17>()),
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
    ...(await importOriginal<ScanModule18>()),
    useManagedCloudProjects: () => ({ projects: [], isReady: true }),
    useProjectStore: (selector: (value: typeof projectState) => unknown) => selector(projectState),
    ProjectSettingsDialog: () => null,
  };
});
vi.mock('@features/projects/services/managed-cloud-projects', async (importOriginal) => ({
  ...(await importOriginal<ScanModule19>()),
  webManagedCloudProjects: {
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    createProject: vi.fn(),
  },
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<ScanModule20>();
  return { ...actual, Sidebar: () => <nav data-testid="chat-sidebar" /> };
});
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule21>();
  return {
    ...actual,
    LocalByokHandoffDialog: () => null,
    UsageWarningBanner: () => null,
  };
});

vi.mock('../../components/dialogs/GlobalSearchDialog', async (importOriginal) => ({
  ...(await importOriginal<ScanModule22>()),
  GlobalSearchDialog: () => null,
}));
vi.mock('../../components/dialogs/KeyboardShortcutsDialog', async (importOriginal) => ({
  ...(await importOriginal<ScanModule23>()),
  KeyboardShortcutsDialog: () => null,
}));
vi.mock('../../components/dialogs/CreateProjectDialog', async (importOriginal) => ({
  ...(await importOriginal<ScanModule24>()),
  CreateProjectDialog: () => null,
}));
vi.mock('../../components/dialogs/UpgradePlanDialog', async (importOriginal) => ({
  ...(await importOriginal<ScanModule25>()),
  UpgradePlanDialog: () => null,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', async (importOriginal) => ({
  ...(await importOriginal<ScanModule26>()),
  UpgradeConfirmDialog: () => null,
}));
vi.mock('@/features/time-focus/TimeFocusReminder', async (importOriginal) => ({
  ...(await importOriginal<ScanModule27>()),
  TimeFocusReminder: () => null,
}));
vi.mock('../../components/approvals/ApprovalInbox', async (importOriginal) => ({
  ...(await importOriginal<ScanModule28>()),
  ApprovalInbox: () => null,
}));
vi.mock('../../components/work-session/WorkSessionPanel', async (importOriginal) => ({
  ...(await importOriginal<ScanModule29>()),
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', async (importOriginal) => ({
  ...(await importOriginal<ScanModule30>()),
  ArtifactsPanel: () => <aside data-testid="artifacts-panel" />,
  ArtifactsToggleButton: () => null,
}));
vi.mock('../../components/research/ResearchPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ResearchPanel: ({ children }: { children?: ReactNode }) => (
    <aside data-testid="research-panel">{children}</aside>
  ),
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', async (importOriginal) => ({
  ...(await importOriginal<ScanModule31>()),
  SidebarWordmark: () => null,
}));

import WebChatPage from '../WebChatPage';
import { useChatStore } from '@shared/stores/web-chat-store';

const TITLE = 'Quarterly forecast';

function listConversationOnly(): void {
  useChatStore.getState().reset();
  useChatStore.getState().setConversations([
    {
      id: CONVERSATION_ID,
      title: TITLE,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
  ]);
}

function openConversation(): void {
  listConversationOnly();
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: '00000000-0000-4000-8000-0000000009c1',
      role: 'user',
      content: 'Ask something',
      createdAt: '2026-08-15T00:00:01.000Z',
    },
    {
      id: '00000000-0000-4000-8000-0000000009c2',
      role: 'assistant',
      content: 'An answer.',
      createdAt: '2026-08-15T00:00:02.000Z',
    },
  ]);
}

describe('WebChatPage conversation title slot', () => {
  beforeEach(() => {
    mocks.updateConversation.mockClear();
    mocks.updateConversation.mockImplementation(async () => true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds the header title slot while the routed conversation is still loading', async () => {
    listConversationOnly();

    render(<WebChatPage />);

    const slot = await screen.findByRole('status', { name: /loading conversation title/i });
    expect(slot).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: /conversation options/i })).toBeNull();
  });

  it('replaces the placeholder with the title menu once the transcript arrives', async () => {
    openConversation();

    render(<WebChatPage />);
    await screen.findByTestId('message-list');

    const trigger = await screen.findByRole('button', { name: /conversation options/i });
    expect(trigger.textContent).toContain(TITLE);
    expect(screen.queryByRole('status', { name: /loading conversation title/i })).toBeNull();
  });

  it('shows a rename before the server confirms it and puts the old title back when it fails', async () => {
    const user = userEvent.setup();
    mocks.updateConversation.mockImplementation(async () => false);
    openConversation();

    render(<WebChatPage />);
    await screen.findByTestId('message-list');

    await user.click(await screen.findByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.clear(input);
    await user.type(input, 'Renamed forecast{Enter}');

    expect(mocks.updateConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
      title: 'Renamed forecast',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conversation options/i }).textContent).toContain(
        TITLE,
      ),
    );
    // A title that quietly goes back tells the reader nothing: the same
    // sentence the sidebar uses for a failed rename is shown here too.
    expect(toastError).toHaveBeenCalledWith(sessionRowActionFailureMessage('rename'));
  });

  it('removes full-shell chrome from the compact Quick Ask surface', async () => {
    openConversation();

    const { container } = render(<WebChatPage compact />);
    await screen.findByTestId('message-list');

    expect(container.firstElementChild).toHaveAttribute('data-chat-surface', 'quick-ask');
    expect(container.querySelector('[data-app-header]')).toBeNull();
    expect(screen.queryByTestId('chat-sidebar')).toBeNull();
    expect(screen.queryByTestId('research-panel')).toBeNull();
    expect(screen.queryByTestId('artifacts-panel')).toBeNull();
  });
});

function studyFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/study/sessions')) {
      return new Response(
        JSON.stringify({
          sessions: [
            {
              id: 'study-1',
              conversationId: CONVERSATION_ID,
              topic: 'Eigenvalues',
              mode: 'learn',
              level: 'beginner',
              startedAt: '2026-08-15T00:00:00.000Z',
              endedAt: null,
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  });
}

function studyReads(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith('/api/study/sessions'));
}

describe('WebChatPage study mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the running study session above the composer with a way out', async () => {
    const fetchMock = studyFetch();
    vi.stubGlobal('fetch', fetchMock);
    openConversation();

    render(<WebChatPage />);

    expect(await screen.findByText('Studying: Eigenvalues')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Leave study mode' })).toBeVisible();
    expect(studyReads(fetchMock)).toEqual([
      `/api/study/sessions?conversationId=${CONVERSATION_ID}`,
    ]);
  });

  it('never asks about study mode for a temporary chat', async () => {
    const fetchMock = studyFetch();
    vi.stubGlobal('fetch', fetchMock);
    openConversation();
    useChatStore.getState().updateConversation(CONVERSATION_ID, { isTemporary: true });

    render(<WebChatPage />);
    await screen.findByTestId('message-list');

    expect(studyReads(fetchMock)).toEqual([]);
    expect(screen.queryByTestId('study-mode-indicator')).toBeNull();
  });
});

describe('WebChatPage tab title', () => {
  const SERVER_TITLE = 'Pineapple identity check · AGI';
  let titleBefore: string;

  beforeEach(() => {
    titleBefore = document.title;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    document.title = titleBefore;
    vi.unstubAllGlobals();
  });

  it('keeps the server title until the routed conversation is known, then follows it', async () => {
    useChatStore.getState().reset();
    document.title = SERVER_TITLE;

    render(<WebChatPage />);
    await screen.findByTestId('chat-sidebar');

    expect(document.title).toBe(SERVER_TITLE);

    act(() => listConversationOnly());

    await waitFor(() => expect(document.title).toBe(`${TITLE} · AGI`));
  });
});
