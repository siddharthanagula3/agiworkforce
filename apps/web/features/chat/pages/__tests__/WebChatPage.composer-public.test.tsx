import { CONNECTORS } from '@/features/connectors/data/connectors';
import { connectorReleased } from '@agiworkforce/types';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { CapabilityProvider } from '@agiworkforce/unified-chat/capabilities';
import { createWebChatWorkspaceFixture } from './WebChatWorkspaceFixture';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('../../hooks/use-keyboard-shortcuts');
type ScanModule4 = typeof import('@shared/utils/browser-utils');
type ScanModule5 = typeof import('@agiworkforce/ui');
type ScanModule6 = typeof import('@agiworkforce/unified-chat');
type ScanModule7 = typeof import('../../components/ConversationTitleMenu');
type ScanModule8 = typeof import('@features/chat/hooks/use-voice-session');

const mocks = vi.hoisted(() => ({
  useKeyboardShortcuts: vi.fn(),
  writeText: vi.fn(async () => true),
  deleteConversation: vi.fn(async () => true),
  openSettings: vi.fn(),
  openModelPicker: vi.fn(() => true),
  exitVoiceSession: vi.fn(),
  enterVoiceSession: vi.fn(),
  sendMessage: vi.fn(),
  connectors: {
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
    connectedAtMap: {},
    grantedScopes: {},
    needsReauthorizationIds: new Set<string>(),
    notRespondingIds: new Set<string>(),
    availableIds: new Set<string>(),
    setupRequirements: {},
    mutatingIds: new Set<string>(),
    connect: vi.fn(),
    reconnect: vi.fn(),
    disconnect: vi.fn(),
    retry: vi.fn(),
    loading: false,
    error: null as string | null,
  },
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000911';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ sessionId: CONVERSATION_ID }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/chat/${CONVERSATION_ID}`,
}));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } =
    await import('@/lib/identity/__tests__/clerk-session-fixture');
  return {
    ...createClerkSessionFixture(
      () => ({
        getToken: async () => 'fixture-token',
        isLoaded: true,
        isSignedIn: true,
        userId: 'fixture-user',
        sessionId: 'fixture-session',
      }),
      { signOut: vi.fn() },
    ),
    useUser: () => ({ user: null }),
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
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
      deleteConversation: mocks.deleteConversation,
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
    sendMessage: mocks.sendMessage,
    stopGeneration: vi.fn(),
    continueGeneration: vi.fn(),
    resolveToolApproval: vi.fn(),
  }),
}));
vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: (modelId: string) => ({
      model_id: modelId,
      name: modelId,
      kind: 'image',
      provider: 'fixture',
      state: 'enabled',
    }),
    retry: () => undefined,
  }),
}));
vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));
vi.mock('@features/chat/hooks/use-promotional-media-models', () => ({
  usePromotionalMediaModels: () => ({
    models: [],
    issuer: 'QwenCloud',
    limited: { image: null, video: null },
    availability: { image: 'not_offered', video: 'not_offered' },
    status: 'ready',
    refresh: () => undefined,
    retry: () => undefined,
  }),
}));
vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => mocks.connectors,
}));
vi.mock('../../hooks/use-artifact-cloud-sync', () => ({ useArtifactCloudSync: vi.fn() }));
vi.mock('../../hooks/use-share-conversation', () => ({
  useShareConversation: () => ({ share: vi.fn(), isSharing: false, isViewCurrent: () => true }),
}));
vi.mock('../../hooks/use-conversation-branches', () => ({
  useConversationBranches: () => ({
    groupsByMessageId: {},
    branchingMessageId: null,
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
  }),
}));
vi.mock('../../lib/model-picker-trigger', () => ({
  MODEL_SELECTOR_TRIGGER_ID: 'model-selector',
  openModelPicker: mocks.openModelPicker,
}));
vi.mock('@features/chat/hooks/use-voice-session', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  exitVoiceSession: mocks.exitVoiceSession,
}));
vi.mock('../../hooks/use-keyboard-shortcuts', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, useKeyboardShortcuts: mocks.useKeyboardShortcuts };
});
vi.mock('@shared/utils/browser-utils', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return { ...actual, safeClipboard: { ...actual.safeClipboard, writeText: mocks.writeText } };
});

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSettingsModal: () => ({ openSettings: mocks.openSettings }),
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
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useManagedCloudProjects: () => ({ projects: [], isReady: true }),
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
  const actual = await importOriginal<ScanModule5>();
  return { ...actual, Sidebar: () => null };
});
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule6>();
  return {
    ...actual,
    LocalByokHandoffDialog: () => null,
    UsageWarningBanner: () => null,
  };
});

vi.mock('../../components/dialogs/GlobalSearchDialog', () => ({ GlobalSearchDialog: () => null }));
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
  ...(await importOriginal<ScanModule7>()),
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

import { __resetComposerDraftStorageForTests } from '../../components/Composer/composer-draft-storage';
import WebChatPage from '../WebChatPage';
import { useChatStore } from '@shared/stores/web-chat-store';
import { AVAILABLE_MODELS, useModelStore } from '@shared/stores/model-store';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import { useVoiceSessionStore } from '../../stores/voice-session-store';
import { VOICE_SESSION_EVENT } from '@agiworkforce/unified-chat';

const LAST_ASSISTANT_CONTENT = 'The answer the viewer would copy.';
function openConversation(assistantContent: string = LAST_ASSISTANT_CONTENT): void {
  useChatStore.getState().reset();
  useChatStore.getState().setConversations([
    {
      id: CONVERSATION_ID,
      title: 'Shortcut chat',
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
  ]);
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: '00000000-0000-4000-8000-0000000009b1',
      role: 'user',
      content: 'Ask something',
      createdAt: '2026-08-15T00:00:01.000Z',
    },
    {
      id: '00000000-0000-4000-8000-0000000009b2',
      role: 'assistant',
      content: assistantContent,
      createdAt: '2026-08-15T00:00:02.000Z',
    },
  ]);
}

const workspaceFixture = createWebChatWorkspaceFixture();

function PublicComposer({ children }: { children: ReactNode }) {
  return (
    <CapabilityProvider platform="web" document={null}>
      <workspaceFixture.wrapper>{children}</workspaceFixture.wrapper>
    </CapabilityProvider>
  );
}

describe('the public chat window composer', () => {
  beforeEach(() => {
    mocks.sendMessage.mockReset();
    mocks.connectors.connectedIds = new Set();
    mocks.connectors.sources = {};
    mocks.connectors.customNames = {};
    mocks.connectors.toolConnectorIds = {};
    Reflect.deleteProperty(window, 'agiHost');
    useBillingStore.setState({
      subscription: {
        tier: 'pro',
        display_name: 'Pro',
        status: 'active',
        current_period_end: null,
        plan_name: 'Pro',
      },
      initialized: true,
      isLoading: false,
      error: null,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    __resetComposerDraftStorageForTests();
    useChatStore.setState({
      composerTogglesByConversation: {},
      disabledConnectorIdsByConversation: {},
      memoryDisabledByConversation: {},
      draftsByConversation: {},
      draftContent: '',
    });
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
    vi.unstubAllGlobals();
  });

  it('keeps the typed draft when Chat and AGI Work switch on the public chat page', () => {
    openConversation();
    render(<WebChatPage />, { wrapper: PublicComposer });

    const draft = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(draft, { target: { value: 'Keep this draft' } });

    fireEvent.click(screen.getByRole('button', { name: PRODUCT_NAMES.work }));

    expect(screen.getByRole('button', { name: PRODUCT_NAMES.work })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('textbox', { name: /message input/i })).toHaveValue('Keep this draft');

    fireEvent.click(screen.getByRole('button', { name: PRODUCT_NAMES.chat }));

    expect(screen.getByRole('button', { name: PRODUCT_NAMES.chat })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('textbox', { name: /message input/i })).toHaveValue('Keep this draft');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('sends the typed draft from the public chat page', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: PublicComposer });

    const draft = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(draft, { target: { value: 'Send this draft' } });
    fireEvent.keyDown(draft, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalled();
    });
    expect(mocks.sendMessage.mock.calls[0]?.[0]).toBe('Send this draft');
  });

  it('switches the model on the public chat page without sending the draft', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    openConversation();
    const before = useModelStore.getState().selectedModelId;
    render(<WebChatPage />, { wrapper: PublicComposer });

    const draft = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(draft, { target: { value: 'Keep this draft' } });

    await user.click(screen.getByRole('button', { name: /, change model$/ }));
    await screen.findByRole('button', { name: /All models/ });

    const rows = Array.from(document.querySelectorAll<HTMLElement>('button[data-picker-row]'));
    const next = AVAILABLE_MODELS.find(
      (model) =>
        model.id !== before && rows.some((row) => (row.textContent ?? '').includes(model.name)),
    );
    expect(next).toBeDefined();
    const row = rows.find((element) => (element.textContent ?? '').includes(next!.name));
    await user.click(row!);

    await waitFor(() => {
      expect(useModelStore.getState().selectedModelId).toBe(next!.id);
    });
    expect(screen.getByRole('button', { name: /, change model$/ })).toHaveTextContent(next!.name);
    expect(screen.getByRole('textbox', { name: /message input/i })).toHaveValue('Keep this draft');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('turns a connected connector off for this chat without sending the draft', () => {
    Object.defineProperty(window, 'agiHost', {
      value: hostBridgeStub(),
      configurable: true,
      writable: true,
    });
    const connected = CONNECTORS.find((connector) => connectorReleased(connector.id));
    expect(connected).toBeDefined();
    mocks.connectors.connectedIds = new Set([connected!.id]);
    openConversation();
    render(<WebChatPage />, { wrapper: PublicComposer });

    const draft = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(draft, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    fireEvent.click(screen.getByText('Connectors'));

    const checkbox = screen.getByRole('menuitemcheckbox', { name: connected!.name });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(checkbox);

    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(useChatStore.getState().getDisabledConnectorIds(CONVERSATION_ID)).toEqual([
      connected!.id,
    ]);
    expect(draft).toHaveValue('Keep this draft');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a chosen file on the draft of the public chat page', () => {
    openConversation();
    render(<WebChatPage />, { wrapper: PublicComposer });

    const draft = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(draft, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    const fileInput = screen.getByLabelText('File upload') as HTMLInputElement;
    const openPicker = vi.spyOn(fileInput, 'click');
    fireEvent.click(screen.getByRole('button', { name: /Add photos & files/ }));

    expect(openPicker).toHaveBeenCalledTimes(1);

    const file = new File(['hello notes'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByRole('button', { name: 'Remove notes.txt' })).toBeInTheDocument();
    expect(draft).toHaveValue('Keep this draft');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('turns computer use off and back on from the public chat page without starting a run', () => {
    const host = hostBridgeStub();
    const invokeRuntime = vi.spyOn(host, 'invokeRuntime');
    Object.defineProperty(window, 'agiHost', {
      value: host,
      configurable: true,
      writable: true,
    });
    openConversation();
    render(<WebChatPage />, { wrapper: PublicComposer });

    const draft = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(draft, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    invokeRuntime.mockClear();

    const computerUse = screen.getByRole('button', { name: 'Use this computer' });
    expect(computerUse).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(computerUse);
    expect(computerUse).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(computerUse);
    expect(computerUse).toHaveAttribute('aria-pressed', 'true');
    expect(invokeRuntime).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(draft).toHaveValue('Keep this draft');
  });

  it('puts a dictation result in the public chat composer without sending it', async () => {
    class FakeMediaRecorder {
      state = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported(): boolean {
        return false;
      }
      start(): void {
        this.state = 'recording';
      }
      stop(): void {
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
        this.state = 'inactive';
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: () => undefined }],
        })),
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/voice/transcribe')) {
          return new Response(JSON.stringify({ text: 'Noted from dictation' }), { status: 200 });
        }
        if (url.includes('/api/csrf')) {
          return new Response(JSON.stringify({ token: 'test-token', expiresIn: 3_600_000 }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      }),
    );
    useSettingsStore.setState({ dictationEnabled: true });
    useVoiceInputStore.getState().cancelListening();
    openConversation();
    render(<WebChatPage />, { wrapper: PublicComposer });

    const draft = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(draft, { target: { value: 'Keep this draft' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Start voice input' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Stop recording and edit the transcript' }),
    );

    expect(await screen.findByDisplayValue('Keep this draft Noted from dictation')).toBeTruthy();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('starts voice mode from the public chat page without sending the draft', () => {
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
    openConversation();
    render(<WebChatPage />, { wrapper: PublicComposer });

    const voiceMode = screen.getByRole('button', { name: 'Start voice mode' });
    expect(voiceMode).not.toBeDisabled();
    fireEvent.click(voiceMode);

    expect(useVoiceSessionStore.getState().session.status).toBe('entering');
    expect(document.querySelector('[data-voice-mode="true"]')).toBeTruthy();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
