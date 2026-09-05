import type { ReactNode } from 'react';
import type { ImageAspectRatio } from '../../components/ImageGenerationCard';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  modelId: '',
  temporaryConversation: false,
  generateImage: vi.fn(),
  startVideoGeneration: vi.fn(),
  watchVideoGeneration: vi.fn(),
  regenerateImage: undefined as
    | undefined
    | ((
        messageId: string,
        options: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
      ) => Promise<string>),
  deleteMessage: undefined as undefined | ((messageId: string) => void),
  routerReplace: vi.fn(),
  openSettings: vi.fn(),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000401';
const GENERATED_ASSET_URL = '/api/files/00000000-0000-4000-8000-000000000402';
const CONVERSATION = {
  id: CONVERSATION_ID,
  title: 'Image persistence fixture',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  isTemporary: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.routerReplace,
    push: vi.fn(),
    back: vi.fn(),
  }),
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

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));
vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('@/lib/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [{ ...CONVERSATION, isTemporary: mocks.temporaryConversation }],
    isLoading: false,
    createConversation: vi.fn(),
    loadConversation: vi.fn(),
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    setActiveConversation: vi.fn(),
  }),
}));

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
      generateImage: mocks.generateImage,
      generateVideo: vi.fn(),
      startVideoGeneration: mocks.startVideoGeneration,
      watchVideoGeneration: mocks.watchVideoGeneration,
    }),
  };
});

vi.mock('../../components/Composer/ChatComposerNew', () => ({
  ChatComposerNew: ({
    onGenerateImage,
    onGenerateVideo,
  }: {
    onGenerateImage?: (prompt: string, options: { aspectRatio: 'auto'; modelId: string }) => void;
    onGenerateVideo?: (
      prompt: string,
      options: {
        modelId: string;
        aspectRatio: string;
        resolution: string;
        durationSecs: number;
      },
    ) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onGenerateImage?.('synthetic page image prompt', {
            aspectRatio: 'auto',
            modelId: mocks.modelId,
          })
        }
      >
        Trigger image generation
      </button>
      <button
        type="button"
        onClick={() =>
          onGenerateVideo?.('synthetic page video prompt', {
            modelId: mocks.modelId,
            aspectRatio: '9:16',
            resolution: '1080p',
            durationSecs: 8,
          })
        }
      >
        Trigger video generation
      </button>
    </>
  ),
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));

vi.mock('../../components/messages/ChatMessageList', async () => {
  const { ImageGenerationCard } = await import('../../components/ImageGenerationCard');
  return {
    ChatMessageList: ({
      messages,
      onRegenerateImage,
      onDelete,
    }: {
      messages?: Array<{
        id: string;
        role: string;
        content?: string;
        isStreaming?: boolean;
        metadata?: Record<string, unknown>;
      }>;
      onRegenerateImage?: typeof mocks.regenerateImage;
      onDelete?: typeof mocks.deleteMessage;
    }) => {
      mocks.regenerateImage = onRegenerateImage;
      mocks.deleteMessage = onDelete;
      return (
        <div data-testid="message-list">
          {messages?.map((message) => {
            const metadata = message.metadata;
            if (message.role !== 'assistant' || metadata?.['toolType'] !== 'image-generation') {
              return null;
            }
            const imageUrl =
              typeof metadata['imageUrl'] === 'string' ? metadata['imageUrl'] : undefined;
            const prompt =
              typeof metadata['imageGenPrompt'] === 'string'
                ? metadata['imageGenPrompt']
                : undefined;
            const aspectRatio = metadata['imageGenAspect'] as
              | Parameters<typeof ImageGenerationCard>[0]['aspectRatio']
              | undefined;
            const modelId =
              typeof metadata['imageGenModel'] === 'string' ? metadata['imageGenModel'] : undefined;
            const retryAt =
              typeof metadata['imageRetryAt'] === 'string' ? metadata['imageRetryAt'] : undefined;
            return (
              <div key={message.id}>
                {message.content && message.content !== '\u200b' ? <p>{message.content}</p> : null}
                <ImageGenerationCard
                  imageUrl={imageUrl}
                  isGenerating={Boolean(message.isStreaming)}
                  prompt={prompt}
                  aspectRatio={aspectRatio}
                  modelId={modelId}
                  retryAt={retryAt}
                  onRegenerate={
                    onRegenerateImage
                      ? (options) => onRegenerateImage(message.id, options)
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      );
    },
  };
});
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
  useSettingsModal: () => ({ openSettings: mocks.openSettings }),
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
vi.mock('../../components/research/ResearchPanel', () => ({
  ResearchPanel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', () => ({ SidebarWordmark: () => null }));

import WebChatPage from '../WebChatPage';
import { IMAGE_MODELS } from '../../lib/imageGenerationOptions';
import { useImageTranscriptRecoveryStore } from '../../stores/image-transcript-recovery-store';
import { CHAT_MESSAGE_PERSISTENCE_TIMEOUT_MS } from '@shared/config/network';
import { useChatStore } from '@shared/stores/web-chat-store';
import { MediaGenerationApiError } from '@/lib/hooks/useMediaGeneration';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function capturedDeleteMessage(): (messageId: string) => void {
  const handler = mocks.deleteMessage;
  if (!handler) throw new Error('ChatMessageList delete handler was not captured');
  return handler;
}

function generatedImageResult(imageUrl = GENERATED_ASSET_URL, modelId = mocks.modelId) {
  const model = IMAGE_MODELS.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error('Canonical image result fixture is missing');
  return { imageUrl, provider: model.provider, model: model.id };
}

describe('WebChatPage paid image transcript recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    const executableModel = IMAGE_MODELS[0];
    if (!executableModel) throw new Error('Canonical image catalog fixture is missing');
    mocks.modelId = executableModel.id;
    mocks.temporaryConversation = false;
    mocks.generateImage.mockReset();
    mocks.startVideoGeneration.mockReset();
    mocks.watchVideoGeneration.mockReset();
    mocks.regenerateImage = undefined;
    mocks.deleteMessage = undefined;
    mocks.routerReplace.mockReset();

    useImageTranscriptRecoveryStore.getState().reset();
    useChatStore.getState().reset();
    useChatStore.getState().setConversations([CONVERSATION]);
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, []);
  });

  it('persists a definite video-start HTTP failure after both transcript rows and before reload', async () => {
    const events: string[] = [];
    const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push({ url, method, body });
      if (method === 'PATCH') {
        events.push('failure-cas');
        return jsonResponse(200, {
          ok: true,
          applied: true,
          message: {
            content: 'Video generation failed: Provider unavailable',
            model: null,
            provider: null,
            metadata: {
              toolType: 'video-generation',
              videoStatus: 'failed',
              videoError: 'Provider unavailable',
            },
          },
        });
      }
      events.push(body['role'] === 'user' ? 'prompt-persisted' : 'placeholder-persisted');
      return jsonResponse(200, { message: { id: body['id'] } });
    });
    vi.stubGlobal('fetch', fetchMock);
    mocks.startVideoGeneration.mockImplementation(async () => {
      events.push('provider-start-attempt');
      throw new MediaGenerationApiError('Provider unavailable', {
        status: 503,
        code: 'service_unavailable',
      });
    });
    render(<WebChatPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger video generation' }));

    await waitFor(() => expect(events).toContain('failure-cas'));
    expect(mocks.startVideoGeneration).toHaveBeenCalledWith(
      'synthetic page video prompt',
      expect.objectContaining({
        modelId: mocks.modelId,
        aspectRatio: '9:16',
        resolution: '1080p',
        durationSecs: 8,
      }),
    );
    expect(events).toEqual([
      'prompt-persisted',
      'placeholder-persisted',
      'provider-start-attempt',
      'failure-cas',
    ]);
    expect(mocks.watchVideoGeneration).not.toHaveBeenCalled();
    const casRequest = requests.find((request) => request.method === 'PATCH');
    expect(casRequest).toMatchObject({
      url: expect.stringMatching(/\/messages\/[0-9a-f-]+$/i),
      body: { videoStartFailure: { publicError: 'Provider unavailable' } },
    });
    const assistant = useChatStore
      .getState()
      .messagesByConversation[CONVERSATION_ID]?.find((message) => message.role === 'assistant');
    expect(assistant).toMatchObject({
      content: 'Video generation failed: Provider unavailable',
      isStreaming: false,
      metadata: {
        toolType: 'video-generation',
        videoStatus: 'failed',
        videoError: 'Provider unavailable',
      },
    });
  });

  it('keeps temporary image turns local-only and lets both rows be dismissed', async () => {
    mocks.temporaryConversation = true;
    const temporaryConversation = { ...CONVERSATION, isTemporary: true };
    useChatStore.getState().setConversations([temporaryConversation]);
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, []);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.generateImage.mockResolvedValue(generatedImageResult());
    render(<WebChatPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger image generation' }));

    await waitFor(() => {
      const messages = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
      expect(messages).toHaveLength(2);
      expect(messages.find((message) => message.role === 'assistant')?.metadata?.imageUrl).toBe(
        GENERATED_ASSET_URL,
      );
    });
    await waitFor(() => expect(mocks.deleteMessage).toBeTypeOf('function'));
    expect(fetchMock).not.toHaveBeenCalled();

    const generatedMessages = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
    const assistantMessage = generatedMessages.find((message) => message.role === 'assistant');
    const userMessage = generatedMessages.find((message) => message.role === 'user');
    expect(assistantMessage).toBeDefined();
    expect(userMessage).toBeDefined();

    mocks.deleteMessage?.(assistantMessage!.id);
    await waitFor(() => {
      expect(
        useChatStore
          .getState()
          .messagesByConversation[
            CONVERSATION_ID
          ]?.some((message) => message.id === assistantMessage!.id),
      ).toBe(false);
    });
    mocks.deleteMessage?.(userMessage!.id);
    await waitFor(() => {
      expect(useChatStore.getState().messagesByConversation[CONVERSATION_ID]).toEqual([]);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('persists server-returned catalog provenance instead of a retired requested model', async () => {
    const executableModel = IMAGE_MODELS[0];
    if (!executableModel) throw new Error('Canonical image result fixture is missing');
    mocks.modelId = 'fixture-retired-image-model';
    mocks.generateImage.mockResolvedValue(
      generatedImageResult(GENERATED_ASSET_URL, executableModel.id),
    );
    const savedBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        savedBodies.push(body);
        return jsonResponse(200, { message: { id: body['id'] } });
      }),
    );
    render(<WebChatPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger image generation' }));

    await waitFor(() => expect(savedBodies).toHaveLength(2));
    const assistantBody = savedBodies.find((body) => body['role'] === 'assistant');
    expect(assistantBody).toMatchObject({
      model: executableModel.id,
      metadata: {
        imageUrl: GENERATED_ASSET_URL,
        imageGenModel: executableModel.id,
      },
    });
    expect(mocks.generateImage).toHaveBeenCalledWith(
      'synthetic page image prompt',
      expect.any(Object),
    );
    const requestOptions = mocks.generateImage.mock.calls[0]?.[1];
    expect(requestOptions).not.toHaveProperty('model');
    expect(requestOptions).not.toHaveProperty('provider');
    const assistant = useChatStore
      .getState()
      .messagesByConversation[CONVERSATION_ID]?.find((message) => message.role === 'assistant');
    expect(assistant?.metadata?.imageGenModel).toBe(executableModel.id);
  });

  it('renders a retryable no-egress notice when an intercepted prompt save fails', async () => {
    let releasePromptSave: (() => void) | undefined;
    const promptSaveGate = new Promise<void>((resolve) => {
      releasePromptSave = resolve;
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      await promptSaveGate;
      return jsonResponse(403, { error: { message: 'intercepted prompt save refusal' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const initialPage = render(<WebChatPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger image generation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    initialPage.unmount();
    mocks.deleteMessage = undefined;
    render(<WebChatPage />);
    await waitFor(() => expect(mocks.deleteMessage).toBeTypeOf('function'));
    const pendingUserMessage = useChatStore
      .getState()
      .messagesByConversation[CONVERSATION_ID]?.find((message) => message.role === 'user');
    expect(pendingUserMessage).toBeDefined();
    capturedDeleteMessage()(pendingUserMessage!.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      useChatStore
        .getState()
        .messagesByConversation[
          CONVERSATION_ID
        ]?.some((message) => message.id === pendingUserMessage!.id),
    ).toBe(true);
    expect(mocks.generateImage).not.toHaveBeenCalled();

    await act(async () => {
      releasePromptSave?.();
      await promptSaveGate;
    });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      `/api/chat/conversations/${CONVERSATION_ID}/messages`,
    ]);
    expect(await screen.findByText('Image request was not sent')).toBeVisible();
    expect(
      screen.getByText(/no credits were used and no image provider was called/i),
    ).toBeVisible();
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out a half-open prompt save into explicit recovery without provider egress', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            const rejectAbort = () =>
              reject(
                signal?.reason instanceof Error
                  ? signal.reason
                  : new DOMException('Request aborted', 'AbortError'),
              );
            if (signal?.aborted) rejectAbort();
            else signal?.addEventListener('abort', rejectAbort, { once: true });
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      render(<WebChatPage />);

      fireEvent.click(screen.getByRole('button', { name: 'Trigger image generation' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CHAT_MESSAGE_PERSISTENCE_TIMEOUT_MS);
      });
      vi.useRealTimers();

      expect(await screen.findByText('Image request was not sent')).toBeVisible();
      expect(mocks.generateImage).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the asset visible for a same-row retry without calling generation twice', async () => {
    const executableModel = IMAGE_MODELS[0];
    if (!executableModel) throw new Error('Canonical image result fixture is missing');
    mocks.modelId = 'fixture-retired-image-model';
    let releaseProvider: (() => void) | undefined;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    let assistantSaveAttempts = 0;
    const assistantBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      if (body['role'] === 'user') {
        return jsonResponse(200, { message: { id: body['id'] } });
      }
      assistantSaveAttempts += 1;
      assistantBodies.push(body);
      if (assistantSaveAttempts === 1) {
        return jsonResponse(403, { error: { message: 'intercepted result save refusal' } });
      }
      return jsonResponse(200, { message: { id: body['id'] } });
    });
    vi.stubGlobal('fetch', fetchMock);
    mocks.generateImage.mockImplementation(async () => {
      await providerGate;
      return generatedImageResult(GENERATED_ASSET_URL, executableModel.id);
    });
    const initialPage = render(<WebChatPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger image generation' }));

    await waitFor(() => expect(mocks.generateImage).toHaveBeenCalled());
    initialPage.unmount();
    mocks.deleteMessage = undefined;
    const pendingPage = render(<WebChatPage />);
    await waitFor(() => expect(mocks.deleteMessage).toBeTypeOf('function'));
    const pendingAssistant = useChatStore
      .getState()
      .messagesByConversation[
        CONVERSATION_ID
      ]?.find((message) => message.role === 'assistant' && message.isStreaming);
    expect(pendingAssistant).toBeDefined();
    capturedDeleteMessage()(pendingAssistant!.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      useChatStore
        .getState()
        .messagesByConversation[
          CONVERSATION_ID
        ]?.some((message) => message.id === pendingAssistant!.id),
    ).toBe(true);

    pendingPage.unmount();
    mocks.deleteMessage = undefined;

    await act(async () => {
      releaseProvider?.();
      await providerGate;
    });
    await waitFor(() => {
      expect(Object.values(useImageTranscriptRecoveryStore.getState().recoveries)).toHaveLength(1);
    });
    render(<WebChatPage />);
    expect(await screen.findByText('Image saved, chat card not saved')).toBeVisible();
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    const assistantMessageId = String(assistantBodies[0]?.['id']);
    const storedAssistant = useChatStore
      .getState()
      .messagesByConversation[
        CONVERSATION_ID
      ]?.find((message) => message.id === assistantMessageId);
    expect(storedAssistant?.metadata?.imageUrl).toBe(GENERATED_ASSET_URL);
    expect(storedAssistant?.isStreaming).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving chat card' }));

    await waitFor(() => {
      expect(screen.queryByText('Image saved, chat card not saved')).toBeNull();
    });
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(assistantBodies).toHaveLength(2);
    expect(assistantBodies[0]?.['id']).toBe(assistantBodies[1]?.['id']);
    expect(assistantBodies[0]?.['metadata']).toEqual(assistantBodies[1]?.['metadata']);
    expect(assistantBodies[1]).toMatchObject({
      model: executableModel.id,
      metadata: {
        imageUrl: GENERATED_ASSET_URL,
        imageGenModel: executableModel.id,
      },
    });
  });

  it('awaits regeneration persistence and retries the existing assistant id only', async () => {
    const executableModel = IMAGE_MODELS[0];
    if (!executableModel) throw new Error('Canonical image result fixture is missing');
    const retiredRequestedModel = 'fixture-retired-image-model';
    const assistantMessageId = '00000000-0000-4000-8000-000000000403';
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '\u200b',
        createdAt: '2026-08-10T00:01:00.000Z',
        metadata: {
          toolType: 'image-generation',
          imageUrl: '/api/files/00000000-0000-4000-8000-000000000404',
          imageGenPrompt: 'synthetic original prompt',
          imageGenAspect: 'auto',
          imageGenModel: mocks.modelId,
        },
      },
    ]);
    let saveAttempts = 0;
    let releaseRetrySave: (() => void) | undefined;
    const retrySaveGate = new Promise<void>((resolve) => {
      releaseRetrySave = resolve;
    });
    const assistantBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        assistantBodies.push(body);
        saveAttempts += 1;
        if (saveAttempts === 1) {
          return jsonResponse(403, {
            error: { message: 'intercepted regeneration save refusal' },
          });
        }
        await retrySaveGate;
        return jsonResponse(200, { message: { id: body['id'] } });
      }),
    );
    mocks.generateImage.mockResolvedValue(generatedImageResult());
    render(<WebChatPage />);
    const regenerateImage = mocks.regenerateImage;
    expect(regenerateImage).toBeTypeOf('function');

    await act(async () => {
      await expect(
        regenerateImage!(assistantMessageId, {
          prompt: 'synthetic regenerated prompt',
          aspectRatio: 'auto',
          modelId: retiredRequestedModel,
        }),
      ).resolves.toBe(GENERATED_ASSET_URL);
    });

    expect(await screen.findByText('Image saved, chat card not saved')).toBeVisible();
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving chat card' }));

    await waitFor(() => expect(saveAttempts).toBe(2));
    mocks.deleteMessage?.(assistantMessageId);
    expect(saveAttempts).toBe(2);
    expect(
      useChatStore
        .getState()
        .messagesByConversation[
          CONVERSATION_ID
        ]?.some((message) => message.id === assistantMessageId),
    ).toBe(true);
    await expect(
      regenerateImage!(assistantMessageId, {
        prompt: 'synthetic concurrent regeneration prompt',
        aspectRatio: 'auto',
        modelId: mocks.modelId,
      }),
    ).rejects.toThrow(/finish saving before generating a new version/i);
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseRetrySave?.();
      await retrySaveGate;
    });
    await waitFor(() => expect(screen.queryByText('Image saved, chat card not saved')).toBeNull());

    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(assistantBodies).toHaveLength(2);
    expect(assistantBodies[0]?.['id']).toBe(assistantMessageId);
    expect(assistantBodies[1]?.['id']).toBe(assistantMessageId);
    expect(assistantBodies[0]?.['metadata']).toEqual(assistantBodies[1]?.['metadata']);
    expect(assistantBodies[1]).toMatchObject({
      model: executableModel.id,
      metadata: {
        imageUrl: GENERATED_ASSET_URL,
        imageGenModel: executableModel.id,
      },
    });
  });

  it('persists a regeneration Retry-After across reload and blocks new provider work until an explicit post-expiry click', async () => {
    const assistantMessageId = '00000000-0000-4000-8000-000000000405';
    const originalImageUrl = '/api/files/00000000-0000-4000-8000-000000000406';
    const regeneratedImageUrl = '/api/files/00000000-0000-4000-8000-000000000407';
    const retryAt = '2026-08-10T12:00:03.000Z';
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '\u200b',
        createdAt: '2026-08-10T00:01:00.000Z',
        metadata: {
          toolType: 'image-generation',
          imageUrl: originalImageUrl,
          imageGenPrompt: 'synthetic original prompt',
          imageGenAspect: 'auto',
          imageGenModel: mocks.modelId,
        },
      },
    ]);
    const assistantBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        assistantBodies.push(body);
        return jsonResponse(200, { message: { id: body['id'] } });
      }),
    );
    mocks.generateImage
      .mockRejectedValueOnce(
        new MediaGenerationApiError('The image generation service is temporarily busy.', {
          status: 429,
          resetAt: retryAt,
        }),
      )
      .mockResolvedValueOnce(generatedImageResult(regeneratedImageUrl));
    const initialPage = render(<WebChatPage />);
    const regenerateImage = mocks.regenerateImage;
    expect(regenerateImage).toBeTypeOf('function');

    await act(async () => {
      await expect(
        regenerateImage!(assistantMessageId, {
          prompt: 'synthetic regenerated prompt',
          aspectRatio: 'auto',
          modelId: mocks.modelId,
        }),
      ).rejects.toMatchObject({ status: 429, resetAt: retryAt });
    });

    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(assistantBodies).toHaveLength(1);
    expect(assistantBodies[0]).toMatchObject({
      id: assistantMessageId,
      content: expect.stringContaining('temporarily busy'),
      metadata: {
        imageUrl: originalImageUrl,
        imageRetryAt: retryAt,
      },
    });

    initialPage.unmount();
    useImageTranscriptRecoveryStore.getState().reset();
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
      {
        id: String(assistantBodies[0]?.['id']),
        role: 'assistant',
        content: String(assistantBodies[0]?.['content']),
        createdAt: '2026-08-10T00:02:00.000Z',
        metadata: assistantBodies[0]?.['metadata'] as Record<string, unknown>,
      },
    ]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
    render(<WebChatPage />);

    expect(screen.getByText(/Image generation failed:.*temporarily busy/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /new version/i }));
    expect(screen.getByText('Try again in 3s before generating another version.')).toBeVisible();
    const editInput = screen.getByPlaceholderText('Describe a change to generate a new version...');
    expect(editInput).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /generate a new version/i }));
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(editInput).toBeEnabled();
    fireEvent.change(editInput, { target: { value: 'add a moon' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate a new version/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.generateImage).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Image generation failed:.*temporarily busy/i)).toBeNull();
    expect(screen.getByRole('img', { name: 'Generated image' })).toHaveAttribute(
      'src',
      regeneratedImageUrl,
    );
    expect(
      useChatStore
        .getState()
        .messagesByConversation[
          CONVERSATION_ID
        ]?.find((message) => message.id === assistantMessageId)?.content,
    ).toBe('');
  });

  it('routes an unsaved regeneration failure into transcript recovery without another provider call', async () => {
    const assistantMessageId = '00000000-0000-4000-8000-000000000408';
    const originalImageUrl = '/api/files/00000000-0000-4000-8000-000000000409';
    const retryAt = new Date(Date.now() + 3_000).toISOString();
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '\u200b',
        createdAt: '2026-08-10T00:03:00.000Z',
        metadata: {
          toolType: 'image-generation',
          imageUrl: originalImageUrl,
          imageGenPrompt: 'synthetic original prompt',
          imageGenAspect: 'auto',
          imageGenModel: mocks.modelId,
        },
      },
    ]);
    let allowRecoverySave = false;
    const assistantBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        assistantBodies.push(body);
        return allowRecoverySave
          ? jsonResponse(200, { message: { id: body['id'] } })
          : jsonResponse(403, { error: { message: 'intercepted regeneration save refusal' } });
      }),
    );
    mocks.generateImage.mockRejectedValue(
      new MediaGenerationApiError('The image generation service is temporarily busy.', {
        status: 429,
        resetAt: retryAt,
      }),
    );
    render(<WebChatPage />);
    const regenerateImage = mocks.regenerateImage;
    expect(regenerateImage).toBeTypeOf('function');

    await act(async () => {
      await expect(
        regenerateImage!(assistantMessageId, {
          prompt: 'synthetic regenerated prompt',
          aspectRatio: 'auto',
          modelId: mocks.modelId,
        }),
      ).rejects.toMatchObject({ status: 429, resetAt: retryAt });
    });

    expect(await screen.findByText('Image failure state not saved')).toBeVisible();
    expect(Object.values(useImageTranscriptRecoveryStore.getState().recoveries)[0]).toMatchObject({
      phase: 'result',
      kind: 'generation-failure',
      assistantMessageId,
      metadata: { imageUrl: originalImageUrl, imageRetryAt: retryAt },
    });
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(assistantBodies).toHaveLength(1);

    allowRecoverySave = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving failure state' }));
    await waitFor(() => expect(screen.queryByText('Image failure state not saved')).toBeNull());
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(assistantBodies).toHaveLength(2);
    expect(assistantBodies[1]?.['metadata']).toEqual(assistantBodies[0]?.['metadata']);
  });

  it('surfaces transcript recovery when an initial generation failure state cannot be saved', async () => {
    let allowRecoverySave = false;
    const assistantBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).includes('/messages')) {
          return jsonResponse(200, {});
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        if (body['role'] === 'user') {
          return jsonResponse(200, { message: { id: body['id'] } });
        }
        assistantBodies.push(body);
        if (!allowRecoverySave) {
          return jsonResponse(503, { error: { message: 'intercepted failure save outage' } });
        }
        return jsonResponse(200, { message: { id: body['id'] } });
      }),
    );
    const retryAt = new Date(Date.now() + 3_000).toISOString();
    mocks.generateImage.mockRejectedValue(
      new MediaGenerationApiError('The image generation service is temporarily busy.', {
        status: 429,
        resetAt: retryAt,
      }),
    );
    render(<WebChatPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger image generation' }));

    await waitFor(
      () => {
        expect(Object.values(useImageTranscriptRecoveryStore.getState().recoveries)).toHaveLength(
          1,
        );
      },
      { timeout: 3_000 },
    );
    expect(await screen.findByText('Image failure state not saved')).toBeVisible();
    const recovery = Object.values(useImageTranscriptRecoveryStore.getState().recoveries)[0];
    expect(recovery).toMatchObject({
      phase: 'result',
      kind: 'generation-failure',
      metadata: { imageRetryAt: retryAt },
      content: expect.stringContaining('temporarily busy'),
    });
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    const failedSaveAttempts = assistantBodies.length;
    expect(failedSaveAttempts).toBeGreaterThan(0);

    allowRecoverySave = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving failure state' }));
    await waitFor(() => expect(screen.queryByText('Image failure state not saved')).toBeNull());
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(assistantBodies).toHaveLength(failedSaveAttempts + 1);
    expect(assistantBodies.at(-1)?.['metadata']).toEqual(assistantBodies[0]?.['metadata']);
  });
});
