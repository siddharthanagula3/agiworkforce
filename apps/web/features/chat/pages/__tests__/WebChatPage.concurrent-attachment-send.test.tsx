import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ComposerOnSend = (
  content: string,
  attachments?: File[],
  skillId?: string,
  meta?: Record<string, unknown>,
) => false | void | typeof SEND_GUARD_BLOCKED;

type UploadAttempt = {
  id: string;
  content: string;
  files: File[];
  statuses: Array<{ phase: string; error?: string }>;
};

const mocks = vi.hoisted(() => ({
  composerOnSend: null as ComposerOnSend | null,
  composerDroppedFiles: null as File[] | null,
  composerConversationId: null as string | null,
  composerPrefillText: undefined as string | undefined,
  composerUploadAttempt: null as UploadAttempt | null,
  retryAttachmentUpload: null as ((index: number) => void) | null,
  sendMessage: vi.fn(async (_content: string, ..._rest: unknown[]) => true),
  createConversation: vi.fn(async () => ({
    id: 'real-conversation-id',
    title: 'New Chat',
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  })),
  uploadChatAttachments: vi.fn(),
  toastError: vi.fn(),
  uploadResolvers: [] as Array<(value: unknown[]) => void>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
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
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
  getCsrfToken: async () => 'fixture-csrf-token',
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/settings/_lib/preferences-client')>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  readAutonomousToolApprovalsAllowed: async () => false,
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, dismiss: vi.fn() } }));

vi.mock('@/lib/hooks/useConversations', async () => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    useConversations: () => ({
      conversations: [],
      isLoading: false,
      listError: null,
      getConversationLoadError: () => null,
      createConversation: mocks.createConversation,
      loadConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(async () => true),
      // Delegates to the real store, matching production: this hook's
      // `setActiveConversation` IS what keeps `activeConversationId` in step
      // with the id `sendContent` just claimed. A no-op mock here made the
      // page believe a route change was still pending and stopped rendering
      // any composer at all for the rest of the test.
      setActiveConversation: (id: string | null) =>
        useChatStore.getState().setActiveConversation(id),
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

vi.mock('../../services/chat-attachment-upload', () => ({
  uploadChatAttachments: mocks.uploadChatAttachments,
}));

vi.mock('../../components/Composer/ChatComposerNew', () => ({
  ChatComposerNew: (props: {
    onSend: ComposerOnSend;
    droppedFiles: File[] | null;
    conversationId?: string | null;
    prefillText?: string;
    attachmentUploadAttempt?: UploadAttempt | null;
    onRetryAttachmentUpload?: (index: number) => void;
  }) => {
    mocks.composerOnSend = props.onSend;
    mocks.composerDroppedFiles = props.droppedFiles;
    mocks.composerConversationId = props.conversationId ?? null;
    mocks.composerPrefillText = props.prefillText;
    mocks.composerUploadAttempt = props.attachmentUploadAttempt ?? null;
    mocks.retryAttachmentUpload = props.onRetryAttachmentUpload ?? null;
    return null;
  },
  SEND_GUARD_BLOCKED: 'guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', () => ({
  ChatMessageList: () => null,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', () => ({
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
vi.mock('../../components/ConversationTitleMenu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ConversationTitleMenu')>()),
  ConversationTitleMenu: () => null,
}));
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
  ResearchPanel: () => null,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', () => ({ SidebarWordmark: () => null }));

import WebChatPage from '../WebChatPage';
import { firstParkedSend, selectParkedSends, useChatStore } from '@shared/stores/web-chat-store';
import type { SEND_GUARD_BLOCKED } from '../../components/Composer/ChatComposerNew';

// Type-checked against the real export so this drifts loudly, not silently,
// if the sentinel's literal value ever changes: the composer module itself is
// mocked below, so the runtime value cannot be imported directly.
const GUARD_BLOCKED = 'guard-blocked' satisfies typeof SEND_GUARD_BLOCKED;

const FIRST_MESSAGE = 'Summarize the attached notes for me please';
const SECOND_MESSAGE = 'Actually, forget the file, just say hi';

function pendingUpload(): Promise<unknown[]> {
  return new Promise((resolve) => {
    mocks.uploadResolvers.push(resolve);
  });
}

describe('WebChatPage concurrent send during attachment upload', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    mocks.composerOnSend = null;
    mocks.composerDroppedFiles = null;
    mocks.composerConversationId = null;
    mocks.composerPrefillText = undefined;
    mocks.composerUploadAttempt = null;
    mocks.retryAttachmentUpload = null;
    mocks.uploadResolvers = [];
    mocks.sendMessage.mockClear();
    mocks.createConversation.mockClear();
    mocks.toastError.mockClear();
    mocks.uploadChatAttachments.mockReset();
    mocks.uploadChatAttachments.mockImplementation(() => pendingUpload());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks a second, different send while the first attachment upload is in flight and parks it where a remount can still find it', async () => {
    render(<WebChatPage />);
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    act(() => {
      mocks.composerOnSend!(FIRST_MESSAGE, [file], undefined, {});
    });

    await waitFor(() => expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.composerConversationId).not.toBeNull());

    const secondFile = new File(['other'], 'other.txt', { type: 'text/plain' });
    let secondSendResult: false | void | typeof SEND_GUARD_BLOCKED = undefined;
    act(() => {
      secondSendResult = mocks.composerOnSend!(SECOND_MESSAGE, [secondFile], undefined, {});
    });

    // The composer's own `handleSubmit` clears its text and attachments
    // unless `onSend` returns exactly this sentinel -- a plain `false` (or
    // `undefined`, `void sendContent(...)` discarded silently) both clear it,
    // which is what stranded the second message's text (files-1). Distinct
    // from `false` because the composer must ALSO skip resetting the shared
    // send-pending flag: the first send is still genuinely in flight and
    // still owns it.
    expect(secondSendResult).toBe(GUARD_BLOCKED);

    // The second send must never reach the model while the first is still
    // resolving its upload -- that is the corruption this guards against.
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('saved here'));
    // Parked immediately, under the send's own fingerprint rather than under
    // the placeholder conversation. A prop handoff, whenever it fired, was on
    // the wrong side of the rename and the empty-state-to-conversation swap.
    const parked = firstParkedSend(selectParkedSends(useChatStore.getState()));
    expect(parked?.content).toBe(SECOND_MESSAGE);
    expect(mocks.composerDroppedFiles).toEqual([secondFile]);

    mocks.uploadResolvers[0]!([]);
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0]![0]).toBe(FIRST_MESSAGE);

    // Still parked once the first send's turn is durable: only a composer that
    // actually hands the text back releases the slot, so no remount and no
    // rename in this window can strand it.
    expect(firstParkedSend(selectParkedSends(useChatStore.getState()))?.content).toBe(
      SECOND_MESSAGE,
    );
  });

  it('lets the first send proceed normally once its upload settles', async () => {
    render(<WebChatPage />);
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    act(() => {
      mocks.composerOnSend!(FIRST_MESSAGE, [file], undefined, {});
    });

    await waitFor(() => expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(1));
    mocks.uploadResolvers[0]!([]);

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0]![0]).toBe(FIRST_MESSAGE);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('keeps a failed file visible with its phase and retries the original turn', async () => {
    mocks.uploadChatAttachments.mockImplementationOnce(
      async (
        _files: File[],
        options?: { onStatus?: (status: Record<string, unknown>) => void },
      ) => {
        options?.onStatus?.({
          index: 0,
          fileName: 'notes.txt',
          phase: 'uploading',
        });
        options?.onStatus?.({
          index: 0,
          fileName: 'notes.txt',
          phase: 'failed',
          error: 'Storage unavailable',
        });
        throw new Error('Storage unavailable');
      },
    );
    render(<WebChatPage />);
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    act(() => {
      mocks.composerOnSend!(FIRST_MESSAGE, [file], undefined, {});
    });

    await waitFor(() =>
      expect(mocks.composerUploadAttempt?.statuses[0]).toEqual({
        phase: 'failed',
        error: 'Storage unavailable',
      }),
    );
    expect(mocks.composerDroppedFiles).toBeNull();
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    mocks.uploadChatAttachments.mockResolvedValueOnce([]);
    act(() => {
      mocks.retryAttachmentUpload?.(0);
    });

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0]![0]).toBe(FIRST_MESSAGE);
    expect(mocks.composerUploadAttempt).toBeNull();
  });

  it('forwards the composer connector state to sendMessage', async () => {
    render(<WebChatPage />);
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());

    act(() => {
      mocks.composerOnSend!('Check my calendar', undefined, undefined, {
        disabledConnectorIds: ['gmail', 'notion'],
        connectorToolsEnabled: false,
      });
    });

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0]![1]).toMatchObject({
      disabledConnectorIds: ['gmail', 'notion'],
      connectorToolsEnabled: false,
    });
  });
});
