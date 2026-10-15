import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeFreeModelProviderNotice } from '@agiworkforce/compliance';
import { getProviderOfferings } from '@agiworkforce/types';
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
) => unknown;

const mocks = vi.hoisted(() => ({
  composerOnSend: null as ComposerOnSend | null,
  composerClearSignal: undefined as number | undefined,
  routeParams: {} as Record<string, string>,
  regenerate: null as ((id: string) => Promise<void>) | null,
  sendMessage: vi.fn(
    async (_content: string, options?: { ensureConversationId?: () => Promise<unknown> }) => {
      await options?.ensureConversationId?.();
      return true;
    },
  ),
  createConversation: vi.fn(async (..._args: unknown[]) => ({
    id: '00000000-0000-4000-8000-000000000901',
    title: 'New Chat',
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    isTemporary: false,
  })),
  updateConversation: vi.fn(async () => true),
  toastError: vi.fn(),
  storedConsent: {} as Record<string, unknown>,
  savePreference: vi.fn(async (..._args: unknown[]) => ({ version: null })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => mocks.routeParams,
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
  getCsrfToken: async () => 'fixture-csrf-token',
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  fetchPreferenceNamespace: async (namespace: string) =>
    namespace === 'provider_consent' ? mocks.storedConsent : { browserReplyReady: true },
  savePreferenceNamespace: mocks.savePreference,
  readAutonomousToolApprovalsAllowed: async () => false,
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, dismiss: vi.fn() } }));

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ...(await importOriginal()),
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      listError: null,
      getConversationLoadError: () => null,
      createConversation: mocks.createConversation,
      loadConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: mocks.updateConversation,
      setActiveConversation: (id: string | null) =>
        useChatStore.getState().setActiveConversation(id),
    }),
  };
});

vi.mock('@/lib/hooks/useManagedUsageSummary', async (importOriginal) => ({
  ...(await importOriginal()),
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
  ...(await importOriginal()),
  ChatComposerNew: (props: { onSend: ComposerOnSend; clearSignal?: number }) => {
    mocks.composerOnSend = props.onSend;
    mocks.composerClearSignal = props.clearSignal;
    return null;
  },
  SEND_GUARD_BLOCKED: 'guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal()),
  ChatMessageList: (props: { onRegenerate?: (id: string) => Promise<void> }) => {
    mocks.regenerate = props.onRegenerate ?? null;
    return null;
  },
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal()),
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

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsModal: () => ({ openSettings: vi.fn() }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    ...(await importOriginal()),
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
    ...(await importOriginal()),
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
vi.mock('@/features/time-focus/TimeFocusReminder', async (importOriginal) => ({
  ...(await importOriginal()),
  TimeFocusReminder: () => null,
}));
vi.mock('../../components/ConversationTitleMenu', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  ConversationTitleMenu: () => null,
}));
vi.mock('../../components/approvals/ApprovalInbox', async (importOriginal) => ({
  ...(await importOriginal()),
  ApprovalInbox: () => null,
}));
vi.mock('../../components/work-session/WorkSessionPanel', () => ({
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', async (importOriginal) => ({
  ...(await importOriginal()),
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
import { getBestAutoModeForTier } from '@shared/config/llm';
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  announceNamedProviderConsentRequired,
  saveNamedProviderConsent,
} from '@/features/models/lib/named-provider-consent-client';

const [FREE_MODEL] = Object.entries(getProviderOfferings()).find(
  ([, offering]) =>
    offering.provider === 'qwen' &&
    offering.quotaProbeProtocol === 'chat' &&
    offering.identityStatus === 'exact' &&
    offering.quotaChatImageInput !== true,
)!;
const [FREE_VISION_MODEL] = Object.entries(getProviderOfferings()).find(
  ([, offering]) =>
    offering.provider === 'qwen' &&
    offering.quotaProbeProtocol === 'chat' &&
    offering.identityStatus === 'exact' &&
    offering.quotaChatImageInput === true,
)!;
const [FREE_IMAGE_MODEL] = Object.entries(getProviderOfferings()).find(
  ([, offering]) =>
    offering.provider === 'qwen' &&
    offering.quotaProbeProtocol === 'image-sync' &&
    offering.identityStatus === 'exact',
)!;
const FREE_AUTO = getBestAutoModeForTier('free');
const notice = composeFreeModelProviderNotice('qwen');
const AGREED = {
  qwen: {
    providerId: 'qwen',
    accepted: true,
    acceptedAt: '2026-10-05T09:00:00.000Z',
    disclosureVersion: notice.version,
    surface: 'web',
  },
};
const FREE_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'free',
  display_name: 'Free',
  status: 'active',
  current_period_end: null,
  plan_name: 'Free',
};
const QUESTION = 'Which planet has the most moons?';

async function renderChat() {
  render(<WebChatPage />);
  await waitFor(() => expect(mocks.composerOnSend).not.toBeNull());
  await act(async () => {
    await Promise.resolve();
  });
}

function send(meta: Record<string, unknown> = {}): unknown {
  let outcome: unknown;
  act(() => {
    outcome = mocks.composerOnSend!(QUESTION, undefined, undefined, meta);
  });
  return outcome;
}

describe('the notice before a free model run by a named provider answers', () => {
  let originalModelId: string;
  let originalSubscription: ReturnType<typeof useBillingStore.getState>['subscription'];

  beforeEach(() => {
    useChatStore.getState().reset();
    mocks.composerOnSend = null;
    mocks.routeParams = {};
    mocks.regenerate = null;
    mocks.sendMessage.mockClear();
    mocks.createConversation.mockClear();
    mocks.updateConversation.mockClear();
    mocks.toastError.mockClear();
    mocks.storedConsent = {};
    mocks.savePreference.mockReset().mockImplementation(async (_namespace, value) => {
      mocks.storedConsent = { ...mocks.storedConsent, ...(value as Record<string, unknown>) };
      return { version: null };
    });
    originalModelId = useModelStore.getState().selectedModelId;
    originalSubscription = useBillingStore.getState().subscription;
    useBillingStore.setState({ subscription: FREE_SUBSCRIPTION });
    useModelStore.getState().setSelectedModelId(FREE_MODEL);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
  });

  afterEach(() => {
    useModelStore.getState().setSelectedModelId(originalModelId);
    useBillingStore.setState({ subscription: originalSubscription });
    vi.unstubAllGlobals();
  });

  it('holds the first message, shows what is true, and sends only after the account agrees', async () => {
    await renderChat();

    expect(send()).toBe(false);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(notice.title)).toBeInTheDocument();
    for (const statement of notice.statements) {
      expect(within(dialog).getByText(statement)).toBeInTheDocument();
    }
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.savePreference).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: notice.acceptLabel }));

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.savePreference).toHaveBeenCalledWith(
      'provider_consent',
      { qwen: expect.objectContaining({ accepted: true, disclosureVersion: notice.version }) },
      { merge: true },
    );
    expect(mocks.savePreference.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.sendMessage.mock.invocationCallOrder[0]!,
    );
    const [content, options] = mocks.sendMessage.mock.calls[0]! as unknown as [
      string,
      { model: string },
    ];
    expect(content).toBe(QUESTION);
    expect(options.model).toBe(FREE_MODEL);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends nothing and keeps asking when the agreement cannot be saved', async () => {
    mocks.savePreference.mockRejectedValueOnce(new Error('Unavailable'));
    await renderChat();
    send();
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: notice.acceptLabel }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Your choice could not be saved, so nothing was sent.',
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('does not ask an account that has already agreed', async () => {
    mocks.storedConsent = AGREED;
    await renderChat();

    expect(send()).not.toBe(false);

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.savePreference).not.toHaveBeenCalled();
  });

  it('moves to Auto instead, without recording an agreement or sending to the provider', async () => {
    await renderChat();
    send();
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: /^Use .+ instead$/ }));

    await waitFor(() => expect(useModelStore.getState().selectedModelId).toBe(FREE_AUTO));
    expect(mocks.savePreference).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends nothing when the notice is closed without an answer', async () => {
    await renderChat();
    send();
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.savePreference).not.toHaveBeenCalled();
    expect(useModelStore.getState().selectedModelId).toBe(FREE_MODEL);
  });

  it.each([
    ['closed', async () => userEvent.keyboard('{Escape}')],
    [
      'answered with Auto instead',
      async () => userEvent.click(screen.getByRole('button', { name: /^Use .+ instead$/ })),
    ],
  ])(
    'hands a queued message back to the message box when the notice is %s, because the composer no longer holds it',
    async (_label, decline) => {
      await renderChat();
      send({ queuedFollowUp: true });
      await screen.findByRole('dialog');

      await decline();

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(useChatStore.getState().getDraftContent(null)).toBe(QUESTION);
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Your queued message was not sent. Its text is back in the message box.',
      );
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('says a queued message lost its attachments when the notice is closed', async () => {
    useModelStore.getState().setSelectedModelId(FREE_VISION_MODEL);
    await renderChat();
    act(() => {
      mocks.composerOnSend!(
        QUESTION,
        [new File(['png'], 'diagram.png', { type: 'image/png' })],
        undefined,
        { queuedFollowUp: true },
      );
    });
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useChatStore.getState().getDraftContent(null)).toBe(QUESTION);
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Your queued message was not sent. Its text is back in the message box, and its attachments were not kept: attach them again to send it.',
    );
  });

  it('leaves the message box alone when a message still in it is held and the notice is closed', async () => {
    await renderChat();
    send();
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useChatStore.getState().getDraftContent(null)).toBe('');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('sends a queued message after Agree without clearing what was typed since', async () => {
    await renderChat();
    send({ queuedFollowUp: true });
    const dialog = await screen.findByRole('dialog');
    const clearSignal = mocks.composerClearSignal;

    await userEvent.click(within(dialog).getByRole('button', { name: notice.acceptLabel }));

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0]![0]).toBe(QUESTION);
    expect(mocks.composerClearSignal).toBe(clearSignal);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('clears the message box after Agree when the held message is the one still in it', async () => {
    await renderChat();
    send();
    const dialog = await screen.findByRole('dialog');
    const clearSignal = mocks.composerClearSignal ?? 0;

    await userEvent.click(within(dialog).getByRole('button', { name: notice.acceptLabel }));

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.composerClearSignal).toBe(clearSignal + 1);
  });

  it.each([
    [
      'a requested search that Auto answered',
      { freeModelHandoff: 'free_model_web_search' as const },
      true,
    ],
    ['a plain question the free model answered', {}, undefined],
  ])(
    'regenerates %s with the search request it was first sent with',
    async (_label, handoff, searchRequested) => {
      mocks.storedConsent = AGREED;
      const conversationId = '00000000-0000-4000-8000-000000000902';
      mocks.routeParams = { sessionId: conversationId };
      const messages = [
        {
          id: 'asked',
          role: 'user' as const,
          content: QUESTION,
          createdAt: '2026-10-05T09:00:00.000Z',
          metadata: { sendReplay: { webSearchEnabled: true }, ...handoff },
        },
        {
          id: 'answered',
          role: 'assistant' as const,
          content: 'Saturn.',
          createdAt: '2026-10-05T09:00:01.000Z',
          parentId: 'asked',
        },
      ];
      useChatStore.setState({
        activeConversationId: conversationId,
        conversations: [
          {
            id: conversationId,
            title: 'Saved chat',
            createdAt: '2026-10-05T09:00:00.000Z',
            updatedAt: '2026-10-05T09:00:01.000Z',
            isTemporary: false,
            model: FREE_MODEL,
          },
        ],
        messages,
        messagesByConversation: { [conversationId]: messages },
      });
      await renderChat();
      await waitFor(() => expect(mocks.regenerate).not.toBeNull());

      await act(async () => {
        await mocks.regenerate!('answered');
      });

      await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
      const [content, options] = mocks.sendMessage.mock.calls[0]! as unknown as [
        string,
        { model: string; webSearch?: boolean; searchRequested?: boolean },
      ];
      expect(content).toBe(QUESTION);
      expect(options.model).toBe(FREE_MODEL);
      expect(options.webSearch).toBe(true);
      expect(options.searchRequested).toBe(searchRequested);
    },
  );

  it('offers no Auto stand-in when the server refuses an image or video request', async () => {
    mocks.storedConsent = AGREED;
    await renderChat();

    act(() => announceNamedProviderConsentRequired('qwen', FREE_IMAGE_MODEL));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /^Use .+ instead$/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('does not ask for a message that Auto answers, since nothing goes to the provider', async () => {
    await renderChat();

    expect(send({ searchRequested: true })).not.toBe(false);

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks again before the next message once the agreement is withdrawn', async () => {
    mocks.storedConsent = AGREED;
    await renderChat();

    await act(async () => {
      await saveNamedProviderConsent(notice, false);
    });

    expect(send()).toBe(false);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('opens the notice when the server refuses a turn for want of the agreement', async () => {
    mocks.storedConsent = AGREED;
    await renderChat();

    act(() => announceNamedProviderConsentRequired('qwen', FREE_MODEL));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(notice.title)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Use .+ instead$/ })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: notice.acceptLabel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.savePreference).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
