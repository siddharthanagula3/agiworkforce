import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('@agiworkforce/ui');
type ScanModule4 = typeof import('@agiworkforce/unified-chat');
type ScanModule5 = typeof import('../../components/ConversationTitleMenu');

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000931';
const USER_MESSAGE_ID = '00000000-0000-4000-8000-0000000009c1';
const SEND_FAILURE = 'Could not start the conversation.';
const EMPTY_RESPONSE = /returned no response for this turn/i;
const COMPOSER_COLUMN_CLASSES = ['mx-auto', 'w-full', 'max-w-3xl', 'px-gutter-compact'];

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
  GreetingBanner: () => null,
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

const ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-0000000009c2';
const IMAGE_FAILURE = /Image generation did not finish/;

function openFailedImageTurn(metadata: Record<string, unknown> = {}): void {
  openStalledTurn(120_000);
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: USER_MESSAGE_ID,
      role: 'user',
      content: 'draw a lighthouse at dusk',
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      id: ASSISTANT_MESSAGE_ID,
      role: 'assistant',
      content: 'Image generation failed: The provider is unavailable.',
      createdAt: new Date().toISOString(),
      metadata: {
        toolType: 'image-generation',
        imageGenPrompt: 'a lighthouse at dusk',
        imageGenAspect: '1:1',
        errorCode: 'image_generation_failed',
        ...metadata,
      },
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

  it('names an image generation failure and links to the status page beside retry', () => {
    openFailedImageTurn();

    render(<WebChatPage />);

    const notice = noticeFor(IMAGE_FAILURE);
    const status = notice.querySelector('a');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent('Status');
    expect(status).toHaveAttribute('href', '/status');
    expect(notice.querySelector('button[aria-label="Retry this image"]')).not.toBeNull();
    expect(notice.querySelector('button[aria-label="Retry this turn"]')).toBeNull();
  });

  it('keeps the status link but holds retry while the provider asked to wait', () => {
    openFailedImageTurn({ imageRetryAt: new Date(Date.now() + 60_000).toISOString() });

    render(<WebChatPage />);

    const notice = noticeFor(IMAGE_FAILURE);
    expect(notice.querySelector('a[href="/status"]')).not.toBeNull();
    expect(notice.querySelector('button[aria-label="Retry this image"]')).toBeNull();
  });
});
