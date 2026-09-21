import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRowActionFailureMessage } from '@shared/components/layout/sidebar-session-actions';

const mocks = vi.hoisted(() => ({
  useKeyboardShortcuts: vi.fn(),
  writeText: vi.fn(async () => true),
  updateConversation: vi.fn(async (_id: string, _updates: unknown) => true),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000931';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>();
  return { ...actual, toast: Object.assign(vi.fn(), actual.toast, { error: toastError }) };
});

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ sessionId: CONVERSATION_ID }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/chat/${CONVERSATION_ID}`,
}));

vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/nextjs')>()),
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
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/settings/_lib/preferences-client')>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ...(await importOriginal<typeof import('@/lib/hooks/useConversations')>()),
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
  ...(await importOriginal<typeof import('@/lib/hooks/useManagedUsageSummary')>()),
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

vi.mock('../../components/Composer/ChatComposerNew', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/Composer/ChatComposerNew')>()),
  ChatComposerNew: () => null,
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/messages/ChatMessageList')>()),
  ChatMessageList: () => <div data-testid="message-list" />,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/GreetingBanner/GreetingBanner')>()),
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ChatStreamRuntimeProvider')>()),
  useChatStreamRuntime: () => ({
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    continueGeneration: vi.fn(),
    resolveToolApproval: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-artifact-cloud-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/use-artifact-cloud-sync')>()),
  useArtifactCloudSync: vi.fn(),
}));
vi.mock('../../hooks/use-share-conversation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/use-share-conversation')>()),
  useShareConversation: () => ({ share: vi.fn(), isSharing: false }),
}));
vi.mock('../../hooks/use-conversation-branches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/use-conversation-branches')>()),
  useConversationBranches: () => ({
    groupsByMessageId: {},
    branchingMessageId: null,
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-keyboard-shortcuts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/use-keyboard-shortcuts')>();
  return { ...actual, useKeyboardShortcuts: mocks.useKeyboardShortcuts };
});
vi.mock('@shared/utils/browser-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/utils/browser-utils')>();
  return { ...actual, safeClipboard: { ...actual.safeClipboard, writeText: mocks.writeText } };
});

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/settings/components/SettingsModalProvider')
  >()),
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    ...(await importOriginal<
      typeof import('@/features/connectors/stores/tool-permissions-store')
    >()),
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
    ...(await importOriginal<typeof import('@features/projects')>()),
    useManagedCloudProjects: () => ({ projects: [], isReady: true }),
    useProjectStore: (selector: (value: typeof projectState) => unknown) => selector(projectState),
    ProjectSettingsDialog: () => null,
  };
});
vi.mock('@features/projects/services/managed-cloud-projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/projects/services/managed-cloud-projects')>()),
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

vi.mock('../../components/dialogs/GlobalSearchDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/dialogs/GlobalSearchDialog')>()),
  GlobalSearchDialog: () => null,
}));
vi.mock('../../components/dialogs/KeyboardShortcutsDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/dialogs/KeyboardShortcutsDialog')>()),
  KeyboardShortcutsDialog: () => null,
}));
vi.mock('../../components/dialogs/CreateProjectDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/dialogs/CreateProjectDialog')>()),
  CreateProjectDialog: () => null,
}));
vi.mock('../../components/dialogs/UpgradePlanDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/dialogs/UpgradePlanDialog')>()),
  UpgradePlanDialog: () => null,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/billing/components/UpgradeConfirmDialog')>()),
  UpgradeConfirmDialog: () => null,
}));
vi.mock('@/features/time-focus/TimeFocusReminder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/time-focus/TimeFocusReminder')>()),
  TimeFocusReminder: () => null,
}));
vi.mock('../../components/approvals/ApprovalInbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/approvals/ApprovalInbox')>()),
  ApprovalInbox: () => null,
}));
vi.mock('../../components/work-session/WorkSessionPanel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/work-session/WorkSessionPanel')>()),
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/artifacts/ArtifactsPanel')>()),
  ArtifactsPanel: () => null,
  ArtifactsToggleButton: () => null,
}));
vi.mock('../../components/research/ResearchPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ResearchPanel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/components/agi/SidebarWordmark')>()),
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
});
