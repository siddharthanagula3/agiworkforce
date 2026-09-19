import type { ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  takeStagedLibraryAttachments: vi.fn((): File[] | null => null),
  composerDroppedFiles: vi.fn(),
  params: {} as Record<string, string>,
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000901';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => mocks.params,
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
  fetchPreferenceNamespace: async () => ({ browserReplyReady: false }),
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
  ChatComposerNew: (props: { droppedFiles?: File[] | null }) => {
    mocks.composerDroppedFiles(props.droppedFiles ?? null);
    return null;
  },
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
  findShortcutDoc: vi.fn(() => undefined),
  formatShortcutKeys: vi.fn(() => []),
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

vi.mock('../../components/ConversationTitleMenu', () => ({
  ConversationTitleMenu: ({ onExport }: { onExport?: () => void }) =>
    onExport ? (
      <button type="button" data-testid="conversation-export" onClick={onExport}>
        Export…
      </button>
    ) : null,
}));

vi.mock('@features/library/lib/library-chat-handoff', () => ({
  takeStagedLibraryAttachments: mocks.takeStagedLibraryAttachments,
}));

import WebChatPage from '../WebChatPage';
import { useChatStore } from '@shared/stores/web-chat-store';

function lastDroppedFiles(): File[] | null {
  const calls = mocks.composerDroppedFiles.mock.calls;
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const value = calls[index]?.[0] as File[] | null;
    if (value) return value;
  }
  return null;
}

describe('WebChatPage library hand-off', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    mocks.composerDroppedFiles.mockClear();
    mocks.takeStagedLibraryAttachments.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mocks.params = {};
  });

  it('hands a file staged from the library to the new-chat composer as an attachment', async () => {
    const file = new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' });
    mocks.takeStagedLibraryAttachments.mockReturnValueOnce([file]);
    mocks.params = {};

    render(<WebChatPage />);

    await waitFor(() => expect(lastDroppedFiles()).toEqual([file]));
  });

  it('leaves a staged file alone while an existing conversation is open', async () => {
    mocks.params = { sessionId: CONVERSATION_ID };
    useChatStore.getState().setConversations([
      {
        id: CONVERSATION_ID,
        title: 'Open conversation',
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:05.000Z',
      },
    ]);
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
      {
        id: '00000000-0000-4000-8000-0000000009b1',
        role: 'user',
        content: 'hello',
        createdAt: '2026-08-15T00:00:01.000Z',
      },
    ]);

    render(<WebChatPage />);

    await waitFor(() => expect(mocks.composerDroppedFiles).toHaveBeenCalled());
    expect(mocks.takeStagedLibraryAttachments).not.toHaveBeenCalled();
    expect(lastDroppedFiles()).toBeNull();
  });
});
