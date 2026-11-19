import { createWebChatWorkspaceFixture } from './WebChatWorkspaceFixture';
import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('@agiworkforce/ui');
type ScanModule4 = typeof import('@agiworkforce/unified-chat');
type ScanModule5 = typeof import('../../components/ConversationTitleMenu');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/chat',
}));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } =
    await import('@/lib/identity/__tests__/clerk-session-fixture');
  const session = createClerkSessionFixture(
    () => ({
      getToken: async () => 'fixture-token',
      isLoaded: true,
      userId: 'fixture-user',
      isSignedIn: true,
      sessionId: 'fixture-session',
    }),
    { signOut: vi.fn() },
  );
  return {
    ...session,
    useUser: () => ({ user: null }),
  };
});

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
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
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
      loadConversation: vi.fn(),
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
  ChatComposerNew: () => <div data-testid="chat-composer" />,
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatMessageList: () => <div data-testid="message-list" />,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => <div data-testid="greeting" />,
}));
vi.mock('../../components/NewChat/NewChatConnectorSuggestions', () => ({
  NewChatConnectorSuggestions: ({ show }: { show: boolean }) =>
    show ? <div data-testid="connector-suggestions" /> : null,
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
  useShareConversation: () => ({
    share: vi.fn(),
    isSharing: false,
    view: null,
    isViewCurrent: () => false,
    workspacePending: false,
    workspaceUnavailable: false,
    inventoryIncomplete: false,
  }),
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
  ...(await importOriginal<Record<string, unknown>>()),
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
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
    ...(await importOriginal<Record<string, unknown>>()),
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

import WebChatPage from '../WebChatPage';
import { useChatStore } from '@shared/stores/web-chat-store';

const workspaceFixture = createWebChatWorkspaceFixture();
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

function setViewport({ width, height }: { width: number; height: number }): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function follows(earlier: HTMLElement, later: HTMLElement): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('WebChatPage empty state on a new account', () => {
  const initialWidth = window.innerWidth;
  const initialHeight = window.innerHeight;

  beforeEach(() => {
    useChatStore.getState().reset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setViewport({ width: initialWidth, height: initialHeight });
  });

  it('puts the connector suggestions between the greeting and the composer on a phone, so the composer stays last', async () => {
    setViewport(PHONE);
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    const greeting = await screen.findByTestId('greeting');
    const suggestions = await screen.findByTestId('connector-suggestions');
    const composer = screen.getByTestId('chat-composer');
    expect(follows(greeting, suggestions)).toBe(true);
    expect(follows(suggestions, composer)).toBe(true);
  });

  it('keeps the connector suggestions under the composer on a wide screen', async () => {
    setViewport(DESKTOP);
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    const suggestions = await screen.findByTestId('connector-suggestions');
    const composer = screen.getByTestId('chat-composer');
    expect(follows(composer, suggestions)).toBe(true);
  });
});
