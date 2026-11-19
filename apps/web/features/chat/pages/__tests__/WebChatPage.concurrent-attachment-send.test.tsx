import { createWebChatWorkspaceFixture } from './WebChatWorkspaceFixture';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('@agiworkforce/ui');
type ScanModule4 = typeof import('@agiworkforce/unified-chat');
type ScanModule5 = typeof import('../../components/ConversationTitleMenu');

type ComposerOnSend = (
  content: string,
  attachments?: File[],
  skillId?: string,
  meta?: Record<string, unknown>,
) => false | void | typeof SEND_GUARD_BLOCKED | Promise<false | void | typeof SEND_GUARD_BLOCKED>;

type UploadAttempt = {
  id: string;
  content: string;
  files: File[];
  statuses: Array<{ phase: string; error?: string }>;
};

const mocks = vi.hoisted(() => ({
  sdk: {
    loaded: true,
    user: { id: 'fixture-user' },
    session: { id: 'fixture-session', user: { id: 'fixture-user' } },
    signOut: vi.fn(),
  },
  composerOnSend: null as ComposerOnSend | null,
  composerDroppedFiles: null as File[] | null,
  composerConversationId: null as string | null,
  composerPrefillText: undefined as string | undefined,
  composerUploadAttempt: null as UploadAttempt | null,
  retryAttachmentUpload: null as ((index: number) => void) | null,
  removeAttachmentUpload: null as ((index: number) => void) | null,
  sendMessage: vi.fn(async (_content: string, ..._rest: unknown[]) => true),
  createConversation: vi.fn(async () => ({
    id: 'real-conversation-id',
    title: 'New Chat',
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  })),
  uploadChatAttachments: vi.fn(),
  keptSettle: vi.fn(),
  keptDiscard: vi.fn(async (_authority: unknown) => undefined),
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
    sessionId: 'fixture-session',
    isSignedIn: true,
  }),
  useClerk: () => mocks.sdk,
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

vi.mock('@/lib/client/csrf', () => ({
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
    onRemoveAttachmentUpload?: (index: number) => void;
  }) => {
    mocks.composerOnSend = props.onSend;
    mocks.composerDroppedFiles = props.droppedFiles;
    mocks.composerConversationId = props.conversationId ?? null;
    mocks.composerPrefillText = props.prefillText;
    mocks.composerUploadAttempt = props.attachmentUploadAttempt ?? null;
    mocks.retryAttachmentUpload = props.onRetryAttachmentUpload ?? null;
    mocks.removeAttachmentUpload = props.onRemoveAttachmentUpload ?? null;
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
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
vi.mock('../../hooks/use-keyboard-shortcuts', () => ({
  findShortcutDoc: vi.fn(() => undefined),
  formatShortcutKeys: vi.fn(() => []),
  KEYBOARD_SHORTCUT_DOCS: [],
  useKeyboardShortcuts: vi.fn(),
  checkShortcutBinding: vi.fn(),
  chordFromKeyboardEvent: vi.fn(),
  isRebindableShortcut: vi.fn(() => false),
  withShortcutBindings: vi.fn((docs: unknown) => docs),
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
  ...(await importOriginal<ScanModule5>()),
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
import { useKeyboardShortcuts } from '../../hooks/use-keyboard-shortcuts';
import {
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  type ChatAttachmentLimits,
} from '@agiworkforce/cloud-contracts';

const workspaceFixture = createWebChatWorkspaceFixture();
import { classifyTaskLocally } from '@agiworkforce/routing';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
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
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    act(() => {
      mocks.composerOnSend!(FIRST_MESSAGE, [file], undefined, {});
    });

    await waitFor(() => expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.composerConversationId).not.toBeNull());

    const secondFile = new File(['other'], 'other.txt', { type: 'text/plain' });
    let secondSendResult: ReturnType<ComposerOnSend> = undefined;
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
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
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
    const sendOptions = mocks.sendMessage.mock.calls[0]![1] as { authority: unknown };
    expect(sendOptions.authority).toBe(mocks.uploadChatAttachments.mock.calls[0]![2]);
  });

  it('does not send or recover an old payload when the SDK switches during upload', async () => {
    const originalSession = mocks.sdk.session;
    const originalUser = mocks.sdk.user;
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
    act(() => {
      mocks.composerOnSend!(FIRST_MESSAGE, [
        new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      ]);
    });
    await waitFor(() => expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(1));
    const authority = mocks.uploadChatAttachments.mock.calls[0]![2] as { isCurrent: () => boolean };
    try {
      mocks.sdk.user = { id: 'other-user' };
      mocks.sdk.session = { id: 'other-session', user: { id: 'other-user' } };
      await act(async () => {
        mocks.uploadResolvers[0]!([]);
      });
      expect(authority.isCurrent()).toBe(false);
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.createConversation).not.toHaveBeenCalled();
      expect(mocks.toastError).not.toHaveBeenCalled();
      expect(firstParkedSend(selectParkedSends(useChatStore.getState()))).toBeNull();
    } finally {
      mocks.sdk.session = originalSession;
      mocks.sdk.user = originalUser;
    }
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
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
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
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
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

const KEPT_INTAKE_ID = '0b1c2d3e-4f50-4a6b-8c7d-000000000001';
const KEPT_ASSET_ID = '7a5d0c1e-2b3f-4c4d-8e5f-6a7b8c9d0e1f';
const KEPT_REFUSAL = 'report.pdf was not attached because it contains malware.';

function keptReport(): File {
  return new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });
}

function keptAsset(file: File) {
  return {
    id: KEPT_ASSET_ID,
    assetId: KEPT_ASSET_ID,
    type: 'file' as const,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    url: `/api/files/${KEPT_ASSET_ID}`,
  };
}

type KeptUploadOptions = {
  signal?: AbortSignal;
  onKeptAfterCancel?: (
    kept: readonly {
      file: File;
      intakeId: string;
      attachment?: ReturnType<typeof keptAsset>;
      settle: typeof mocks.keptSettle;
      discard: typeof mocks.keptDiscard;
    }[],
  ) => void;
};

/** The upload the person cancels, answering the way the service does when the server kept the file. */
function uploadTheServerKeeps(
  attachment: 'ready' | 'checking' | 'none',
  {
    keptIndex = 0,
    settled = Promise.resolve(),
  }: { keptIndex?: number; settled?: Promise<void> } = {},
) {
  mocks.uploadChatAttachments.mockImplementationOnce(
    (files: File[], options: KeptUploadOptions) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', async () => {
          await Promise.resolve();
          const file = files[keptIndex];
          if (file && attachment !== 'none') {
            options.onKeptAfterCancel?.([
              {
                file,
                intakeId: KEPT_INTAKE_ID,
                ...(attachment === 'ready' ? { attachment: keptAsset(file) } : {}),
                settle: mocks.keptSettle,
                discard: mocks.keptDiscard,
              },
            ]);
          }
          await settled;
          reject(Object.assign(new Error('The upload was cancelled.'), { name: 'AbortError' }));
        });
      }),
  );
}

function largeFile(name: string): File {
  const file = new File(['%PDF-1.7'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: MAX_CHAT_ATTACHMENT_BYTES + 1 });
  return file;
}

const LARGE_FILE_OFFER: ChatAttachmentLimits = {
  maxFileBytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
  maxImageBytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  maxMessageBytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxMessageBytes,
  maxFilesPerMessage: CHAT_LARGE_FILE_POLICY.largeFiles.maxCount,
  largeFilesAvailable: true,
  storageRemainingBytes: null,
  inlineMessageBytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
};

async function keptRowReady(file: File) {
  uploadTheServerKeeps('ready');
  await sendAndCancel(file);
  await waitFor(() =>
    expect(mocks.composerUploadAttempt).toMatchObject({
      files: [file],
      statuses: [{ phase: 'ready' }],
    }),
  );
}

async function sendAndCancel(file: File) {
  render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
  await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
  act(() => {
    mocks.composerOnSend!(FIRST_MESSAGE, [file], undefined, {});
  });
  await waitFor(() => expect(mocks.composerUploadAttempt?.files).toEqual([file]));
  await waitFor(() => expect(mocks.removeAttachmentUpload).not.toBeNull());
  act(() => {
    mocks.removeAttachmentUpload!(0);
  });
}

describe('WebChatPage file the cancel came too late for', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    mocks.composerOnSend = null;
    mocks.composerDroppedFiles = null;
    mocks.composerUploadAttempt = null;
    mocks.removeAttachmentUpload = null;
    mocks.uploadResolvers = [];
    mocks.sendMessage.mockClear();
    mocks.createConversation.mockClear();
    mocks.toastError.mockClear();
    mocks.uploadChatAttachments.mockReset();
    mocks.keptSettle.mockReset();
    mocks.keptDiscard.mockClear();
  });

  afterEach(() => {
    useBillingStore.setState({ attachmentLimits: null });
  });

  it('shows a kept file that is ready as an attachment and sends it with the next message', async () => {
    const file = keptReport();
    uploadTheServerKeeps('ready');

    await sendAndCancel(file);

    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [file],
        statuses: [{ phase: 'ready' }],
      }),
    );
    expect(mocks.keptSettle).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.composerDroppedFiles).toBeNull();

    mocks.uploadChatAttachments.mockResolvedValueOnce([keptAsset(file)]);
    act(() => {
      mocks.composerOnSend!('Now summarize it', [], undefined, {});
    });

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(2);
    expect(mocks.uploadChatAttachments.mock.calls[1]![0]).toEqual([file]);
    expect(mocks.sendMessage.mock.calls[0]![1]).toMatchObject({
      attachments: [expect.objectContaining({ assetId: KEPT_ASSET_ID })],
    });
    expect(mocks.composerUploadAttempt).toBeNull();
    expect(mocks.keptDiscard).not.toHaveBeenCalled();
  });

  it('shows a kept file still being checked as verifying, then as ready', async () => {
    const file = keptReport();
    let settle!: (outcome: unknown) => void;
    mocks.keptSettle.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    uploadTheServerKeeps('checking');

    await sendAndCancel(file);

    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [file],
        statuses: [{ phase: 'verifying' }],
      }),
    );
    expect(mocks.keptSettle).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle({ state: 'ready', attachment: keptAsset(file) });
    });

    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [file],
        statuses: [{ phase: 'ready' }],
      }),
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(1);
  });

  it('shows a kept file the check refuses as refused, without a retry', async () => {
    const file = keptReport();
    mocks.keptSettle.mockResolvedValueOnce({ state: 'refused', message: KEPT_REFUSAL });
    uploadTheServerKeeps('checking');

    await sendAndCancel(file);

    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [file],
        statuses: [{ phase: 'failed', error: KEPT_REFUSAL, retryable: false }],
      }),
    );
    expect(mocks.toastError).toHaveBeenCalledWith(KEPT_REFUSAL);

    act(() => {
      mocks.composerOnSend!('Now summarize it', [], undefined, {});
    });
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(1);
  });

  it('deletes a kept file the person removes, and leaves it out of the next message', async () => {
    const file = keptReport();
    uploadTheServerKeeps('ready');

    await sendAndCancel(file);
    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({ statuses: [{ phase: 'ready' }] }),
    );

    expect(mocks.keptDiscard).not.toHaveBeenCalled();
    act(() => {
      mocks.removeAttachmentUpload!(0);
    });

    expect(mocks.keptDiscard).toHaveBeenCalledTimes(1);
    expect(mocks.keptDiscard.mock.calls[0]![0]).toMatchObject({ isCurrent: expect.any(Function) });
    await waitFor(() => expect(mocks.composerUploadAttempt).toBeNull());

    act(() => {
      mocks.composerOnSend!('Now summarize it', [], undefined, {});
    });
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.uploadChatAttachments).toHaveBeenCalledTimes(1);
  });

  it('shows nothing and reads nothing when the cancel stopped the file', async () => {
    const file = keptReport();
    uploadTheServerKeeps('none');

    await sendAndCancel(file);

    await waitFor(() => expect(mocks.composerUploadAttempt).toBeNull());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.composerUploadAttempt).toBeNull();
    expect(mocks.keptSettle).not.toHaveBeenCalled();
  });

  it('shows a kept file as its own attachment when the person cancels by removing another file, and deletes it when removed', async () => {
    useBillingStore.setState({ attachmentLimits: LARGE_FILE_OFFER });
    const kept = largeFile('report.pdf');
    const removed = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const small = new File(['todo'], 'todo.txt', { type: 'text/plain' });
    uploadTheServerKeeps('ready');
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
    act(() => {
      mocks.composerOnSend!(FIRST_MESSAGE, [kept, removed, small], undefined, {});
    });
    await waitFor(() => expect(mocks.composerUploadAttempt?.files).toEqual([kept, removed, small]));

    act(() => {
      mocks.removeAttachmentUpload!(1);
    });
    expect(mocks.composerDroppedFiles).toEqual([small]);

    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [kept],
        statuses: [{ phase: 'ready' }],
      }),
    );
    expect(mocks.composerDroppedFiles).toEqual([small]);

    act(() => {
      mocks.removeAttachmentUpload!(0);
    });
    expect(mocks.keptDiscard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.composerUploadAttempt).toBeNull());
  });

  it('puts a large file the cancel stopped back in the message box once the cancel settles', async () => {
    useBillingStore.setState({ attachmentLimits: LARGE_FILE_OFFER });
    const large = largeFile('report.pdf');
    const removed = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    uploadTheServerKeeps('none');
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
    act(() => {
      mocks.composerOnSend!(FIRST_MESSAGE, [large, removed], undefined, {});
    });
    await waitFor(() => expect(mocks.composerUploadAttempt?.files).toEqual([large, removed]));

    act(() => {
      mocks.removeAttachmentUpload!(1);
    });

    await waitFor(() => expect(mocks.composerDroppedFiles).toEqual([large]));
    expect(mocks.composerUploadAttempt).toBeNull();
    expect(mocks.keptSettle).not.toHaveBeenCalled();
  });

  it('deletes a kept file removed from a message whose other file failed', async () => {
    const kept = keptReport();
    await keptRowReady(kept);
    const fresh = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    mocks.uploadChatAttachments.mockImplementationOnce(
      async (
        _files: File[],
        options?: { onStatus?: (status: Record<string, unknown>) => void },
      ) => {
        options?.onStatus?.({ index: 0, fileName: kept.name, phase: 'complete' });
        options?.onStatus?.({
          index: 1,
          fileName: fresh.name,
          phase: 'failed',
          error: 'Storage unavailable',
        });
        throw new Error('Storage unavailable');
      },
    );
    act(() => {
      mocks.composerOnSend!('Now summarize it', [fresh], undefined, {});
    });
    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [kept, fresh],
        statuses: [{ phase: 'complete' }, { phase: 'failed', error: 'Storage unavailable' }],
      }),
    );

    act(() => {
      mocks.removeAttachmentUpload!(0);
    });

    expect(mocks.keptDiscard).toHaveBeenCalledTimes(1);
    expect(mocks.composerDroppedFiles).toEqual([fresh]);
    await waitFor(() => expect(mocks.composerUploadAttempt).toBeNull());
  });

  it('keeps a kept file as its own attachment, out of the message box, when a send is refused while another is in flight', async () => {
    const kept = keptReport();
    let release!: () => void;
    uploadTheServerKeeps('ready', {
      settled: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });
    await sendAndCancel(kept);
    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [kept],
        statuses: [{ phase: 'ready' }],
      }),
    );

    let outcome: ReturnType<ComposerOnSend> = undefined;
    act(() => {
      outcome = mocks.composerOnSend!(SECOND_MESSAGE, [], undefined, {});
    });

    expect(outcome).toBe(GUARD_BLOCKED);
    expect(mocks.composerDroppedFiles).toBeNull();
    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [kept],
        statuses: [{ phase: 'ready' }],
      }),
    );
    await act(async () => {
      release();
    });
    expect(mocks.composerUploadAttempt).toMatchObject({ files: [kept] });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('shows a kept file as its own attachment again when the message it went with is not sent', async () => {
    const kept = keptReport();
    await keptRowReady(kept);
    mocks.uploadChatAttachments.mockResolvedValueOnce([keptAsset(kept)]);
    mocks.sendMessage.mockResolvedValueOnce(false);

    act(() => {
      mocks.composerOnSend!('Now summarize it', [], undefined, {});
    });
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(mocks.composerUploadAttempt).toMatchObject({
        files: [kept],
        statuses: [{ phase: 'ready' }],
      }),
    );
    expect(mocks.composerDroppedFiles).toBeNull();

    act(() => {
      mocks.removeAttachmentUpload!(0);
    });
    expect(mocks.keptDiscard).toHaveBeenCalledTimes(1);
  });

  it('keeps a kept file where it was when the person starts a new chat, and deletes nothing', async () => {
    const kept = keptReport();
    await keptRowReady(kept);
    const shortcuts = vi.mocked(useKeyboardShortcuts).mock.calls.at(-1)![0] as {
      onNewChat: () => void;
    };

    act(() => {
      shortcuts.onNewChat();
    });

    expect(mocks.keptDiscard).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.composerUploadAttempt).toMatchObject({
      files: [kept],
      statuses: [{ phase: 'ready' }],
    });
  });
});

const PROMPT = 'Generate an image of a red kite over a beach';
const IMAGE_TITLE = 'Image generation';

function subscription(tier: SubscriptionPlan['tier']): SubscriptionPlan {
  return {
    tier,
    display_name: tier,
    status: 'active',
    current_period_end: null,
    plan_name: tier,
  };
}

function stubFetch() {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return Response.json({});
    }),
  );
  return requests;
}

function conversationTitles(): unknown[] {
  return mocks.createConversation.mock.calls.map((call) => (call as unknown[])[0]);
}

async function sendTyped() {
  render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
  await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
  act(() => {
    mocks.composerOnSend!(PROMPT, undefined, undefined, {});
  });
}

describe('WebChatPage typed image request by plan', () => {
  let originalSubscription: ReturnType<typeof useBillingStore.getState>['subscription'];

  beforeEach(() => {
    useChatStore.getState().reset();
    mocks.composerOnSend = null;
    mocks.sendMessage.mockClear();
    mocks.createConversation.mockClear();
    mocks.toastError.mockClear();
    originalSubscription = useBillingStore.getState().subscription;
    mocks.sdk.loaded = true;
    mocks.sdk.user = { id: 'fixture-user' };
    mocks.sdk.session = { id: 'fixture-session', user: { id: 'fixture-user' } };
  });

  afterEach(() => {
    useBillingStore.setState({ subscription: originalSubscription });
    vi.unstubAllGlobals();
  });

  it('reads the request as an image request, so these cases exercise that branch', () => {
    expect(classifyTaskLocally(PROMPT, []).type).toBe('image_generation');
  });

  it.each(['pro'] as const)(
    'takes the image path on the %s plan and never sends it to a free model as a chat turn',
    async (tier) => {
      useBillingStore.setState({ subscription: subscription(tier) });
      const requests = stubFetch();

      await sendTyped();

      await waitFor(() => expect(mocks.createConversation).toHaveBeenCalled());
      expect(conversationTitles()).toEqual([IMAGE_TITLE]);
      expect(requests).not.toContain('/api/models/free-quota');
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.toastError).not.toHaveBeenCalled();
    },
  );
  it('does not dispatch a typed free image when catalogue authority is unknown', async () => {
    useBillingStore.setState({ subscription: subscription('free') });
    stubFetch();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
    let outcome: Awaited<ReturnType<ComposerOnSend>>;
    await act(async () => {
      outcome = await mocks.composerOnSend!(PROMPT);
    });
    expect(outcome!).toBe(false);
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('refuses an old prompt after the live SDK switches before React renders', async () => {
    useBillingStore.setState({ subscription: subscription('free') });
    let finishCatalogue!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input) === '/api/models/free-quota'
          ? new Promise<Response>((resolve) => {
              finishCatalogue = resolve;
            })
          : Promise.resolve(Response.json({})),
      ),
    );
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
    let pending!: ReturnType<ComposerOnSend>;
    act(() => {
      pending = mocks.composerOnSend!(PROMPT);
    });
    expect(finishCatalogue).toBeDefined();
    mocks.sdk.user = { id: 'other-account' };
    mocks.sdk.session = { id: 'other-session', user: { id: 'other-account' } };
    let outcome: Awaited<ReturnType<ComposerOnSend>>;
    await act(async () => {
      finishCatalogue(
        Response.json({
          issuer: 'Fixture provider',
          observedOn: '2026-11-04',
          evidenceUrl: 'https://provider.example/offer',
          reportedEligible: 1,
          reportedUnavailable: 0,
          models: [
            {
              key: 'fixture-image-offering',
              providerModelId: 'fixture-image',
              displayName: 'Fixture image',
              category: 'image',
              unit: 'images',
              limit: 100,
              consumedApproximate: 0,
              expiresOn: null,
              status: 'ready',
            },
          ],
          limitedOffer: [
            {
              category: 'image',
              dailyCap: 10,
              remainingToday: 10,
              resetsAt: '2026-11-05T00:00:00.000Z',
            },
          ],
          mediaAvailability: { image: 'offered', video: 'not_offered' },
        }),
      );
      outcome = await pending;
    });
    expect(outcome!).toBe(false);
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
