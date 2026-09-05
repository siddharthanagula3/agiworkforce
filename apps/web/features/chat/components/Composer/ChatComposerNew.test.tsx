import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ChatComposerNew,
  IMAGE_MODELS,
  VIDEO_MODELS,
  type ComposerProjectPicker,
} from './ChatComposerNew';
import { RESEARCH_MIN_CONTEXT_WINDOW } from '@features/chat/lib/research-capability-gate';
import {
  getModelMetadataById,
  getModels,
  getVideoQualityOptionsForModel,
  isExecutableVideoModel,
  isModelLive,
} from '@agiworkforce/types';
import { getSelectableModels, isAutoModeModelId } from '@shared/config/llm';
import { providerSupportsWebSearch } from '@/lib/web-search-support';
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { CapabilityProvider } from '@agiworkforce/unified-chat';

const chatComposerMocks = vi.hoisted(() => ({
  skillResult: {
    skills: [
      {
        name: 'backend-engineer',
        description: 'Backend implementation support',
        source: 'bundled',
      },
    ],
    loading: false,
    error: null as string | null,
  },
  openSettings: vi.fn(),
  routerPush: vi.fn(),
  mediaAvailability: {
    status: 'ready' as 'loading' | 'ready' | 'error',
    error: null as string | null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  },
  connectors: {
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
  },
  memoryCapabilityEnabled: true,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: chatComposerMocks.routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({
    isOpen: false,
    openSettings: chatComposerMocks.openSettings,
    closeSettings: vi.fn(),
  }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({
    ...chatComposerMocks.skillResult,
  }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => chatComposerMocks.mediaAvailability,
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => chatComposerMocks.connectors,
}));

vi.mock('@/lib/runtime/memory-capability', () => ({
  isMemoryCapabilityEnabled: () => Promise.resolve(chatComposerMocks.memoryCapabilityEnabled),
}));

vi.mock('./DragDropOverlay', () => ({
  DragDropOverlay: () => null,
}));

vi.mock('./SlashCommandMenu', () => ({
  SlashCommandMenu: () => null,
}));

vi.mock('./SendButton', () => ({
  SendButton: ({
    onClick,
    disabled,
    mode,
  }: {
    onClick: () => void;
    disabled: boolean;
    mode: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-mode={mode} aria-label="Send message">
      {mode === 'stop' ? 'Stop' : 'Send'}
    </button>
  ),
}));

vi.mock('./ComposerFooter', () => ({
  ComposerFooter: () => <div data-testid="composer-footer" />,
}));

vi.mock('./VoiceInputButton', () => ({
  VoiceInputButton: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" aria-label="Voice input" disabled={disabled}>
      Voice
    </button>
  ),
}));

const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

describe('ChatComposerNew', () => {
  let originalModelId: string;
  let originalFeatureFlags: ReturnType<typeof useBillingStore.getState>['featureFlags'];
  let originalSubscription: ReturnType<typeof useBillingStore.getState>['subscription'];
  let originalBillingInitialized: ReturnType<typeof useBillingStore.getState>['initialized'];
  let originalBillingLoading: ReturnType<typeof useBillingStore.getState>['isLoading'];
  let originalBillingError: ReturnType<typeof useBillingStore.getState>['error'];
  let originalRefreshUser: ReturnType<typeof useBillingStore.getState>['refreshUser'];

  beforeEach(() => {
    vi.clearAllMocks();
    chatComposerMocks.skillResult.skills = [
      {
        name: 'backend-engineer',
        description: 'Backend implementation support',
        source: 'bundled',
      },
    ];
    chatComposerMocks.skillResult.loading = false;
    chatComposerMocks.skillResult.error = null;
    chatComposerMocks.mediaAvailability.status = 'ready';
    chatComposerMocks.mediaAvailability.error = null;
    chatComposerMocks.mediaAvailability.admissionFor.mockImplementation((modelId: string) => ({
      model_id: modelId,
      name: modelId,
      kind: 'image',
      provider: 'fixture',
      state: 'enabled',
    }));
    chatComposerMocks.mediaAvailability.retry.mockReset();
    chatComposerMocks.connectors.connectedIds = new Set();
    chatComposerMocks.connectors.sources = {};
    chatComposerMocks.connectors.customNames = {};
    chatComposerMocks.memoryCapabilityEnabled = true;
    originalModelId = useModelStore.getState().selectedModelId;
    originalFeatureFlags = useBillingStore.getState().featureFlags;
    originalSubscription = useBillingStore.getState().subscription;
    originalBillingInitialized = useBillingStore.getState().initialized;
    originalBillingLoading = useBillingStore.getState().isLoading;
    originalBillingError = useBillingStore.getState().error;
    originalRefreshUser = useBillingStore.getState().refreshUser;
    useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
    // Toggles and drafts live in the chat store, so an unmounted composer's
    // parked text outlives the render and would restore into the next case.
    useChatStore.setState({
      composerTogglesByConversation: {},
      disabledConnectorIdsByConversation: {},
      memoryDisabledByConversation: {},
      draftsByConversation: {},
      draftContent: '',
    });
  });

  afterEach(() => {
    useModelStore.getState().setSelectedModelId(originalModelId);
    useBillingStore.setState({
      featureFlags: originalFeatureFlags,
      subscription: originalSubscription,
      initialized: originalBillingInitialized,
      isLoading: originalBillingLoading,
      error: originalBillingError,
      refreshUser: originalRefreshUser,
    });
    useChatStore.setState({
      composerTogglesByConversation: {},
      disabledConnectorIdsByConversation: {},
      memoryDisabledByConversation: {},
      draftsByConversation: {},
      draftContent: '',
    });
    vi.unstubAllGlobals();
  });

  it('renders the message textarea', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeInTheDocument();
  });

  it('keeps an empty first-paint composer compact when layout reports a stale large scrollHeight', () => {
    const scrollHeight = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(240);
    try {
      render(<ChatComposerNew onSend={vi.fn()} />);
      const textarea = screen.getByRole('textbox', { name: /message input/i });
      // Not the empty-state (home) instance: rest height is the one-row
      // chat target, 36px content plus the card's own 8px padding = 52px.
      expect(textarea).toHaveStyle({
        height: '36px',
      });
      expect(textarea.closest('.chat-composer-container')).toHaveClass('bg-[var(--chat-bg)]');
      expect(textarea.closest('.chat-composer-container')).not.toHaveClass('bg-background/95');
      expect(textarea.closest('#chat-composer')).toHaveClass('bg-[var(--chat-input-bg)]');
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it('keeps plus, textbox, and Send in one row container at rest', () => {
    const { container } = render(<ChatComposerNew onSend={vi.fn()} />);
    const cluster = container.querySelector('.chat-composer-row') as HTMLElement | null;
    expect(cluster).toBeTruthy();
    expect(cluster!.className).toContain('min-w-0');

    const plus = screen.getByRole('button', { name: /add attachments and tools/i });
    const send = screen.getByRole('button', { name: /send message/i });
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    // Parity target: one row at rest (plus, textbox, right cluster), not the
    // textbox on its own row above a separate control row.
    expect(cluster!.contains(plus)).toBe(true);
    expect(cluster!.contains(textarea)).toBe(true);
    expect(cluster!.contains(send)).toBe(true);
  });

  it('calls onSend with typed message on Cmd+Enter', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'hello world');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'hello world',
        undefined,
        undefined,
        expect.objectContaining({ workMode: 'chat', projectId: null }),
      );
    });
  });

  it('calls onSend with typed message on plain Enter (ChatGPT/Claude convention)', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'hello world');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'hello world',
        undefined,
        undefined,
        expect.objectContaining({ workMode: 'chat', projectId: null }),
      );
    });
  });

  it('does not send on plain Enter while IME composing', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'こんにち');
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
    expect(onSendMock).not.toHaveBeenCalled();
  });

  it('does not send when message is empty', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSendMock).not.toHaveBeenCalled();
  });

  it('does not send on Shift+Enter', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'hello');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSendMock).not.toHaveBeenCalled();
  });

  it('AGI Work send carries workMode + the selected projectId in meta (connected payload)', async () => {
    const onSendMock = vi.fn();
    render(
      <ChatComposerNew
        onSend={onSendMock}
        emptyState
        projectPicker={{
          projects: [{ id: 'proj-2', name: 'Mobile App' }],
          activeProjectId: 'proj-2',
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'AGI Work' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'test');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'test',
        undefined,
        undefined,
        expect.objectContaining({ workMode: 'agiwork', projectId: 'proj-2' }),
      );
    });
  });

  it('sends the exact selected skill name without downloading its body', async () => {
    const onSend = vi.fn();
    vi.stubGlobal('fetch', vi.fn());
    render(<ChatComposerNew onSend={onSend} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, '@back');
    fireEvent.click(await screen.findByText('backend-engineer'));
    await userEvent.type(textarea, 'review this route');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        'review this route',
        undefined,
        'backend-engineer',
        expect.objectContaining({
          skillName: 'backend-engineer',
        }),
      );
    });
    expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^\/api\/skills\//)]),
    );
    const meta = onSend.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(meta).not.toHaveProperty('skillBody');
  });

  it('shows honest loading, error, and empty states for the managed skill catalog', async () => {
    chatComposerMocks.skillResult.skills = [];
    chatComposerMocks.skillResult.loading = true;
    const { rerender } = render(<ChatComposerNew onSend={vi.fn()} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, '@design');
    expect(screen.getByText('Loading skills…')).toBeInTheDocument();

    chatComposerMocks.skillResult.loading = false;
    chatComposerMocks.skillResult.error = 'HTTP 503';
    rerender(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByText('Skills are temporarily unavailable.')).toBeInTheDocument();

    chatComposerMocks.skillResult.error = null;
    rerender(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByText('No matching skills.')).toBeInTheDocument();
  });

  it('opens + menu and shows Add photos and files option', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const moreBtn = screen.getByRole('button', { name: /add attachments and tools/i });
    fireEvent.click(moreBtn);

    expect(screen.getByText('Add photos & files')).toBeInTheDocument();
  });

  it('offers the cross-provider file types and rejects executables before send', () => {
    const onSend = vi.fn();
    const { container } = render(<ChatComposerNew onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', expect.stringContaining('application/pdf'));
    expect(input).toHaveAttribute('aria-label', 'File upload');

    const unsupportedFile = new File(['binary'], 'installer.exe', {
      type: 'application/x-msdownload',
    });
    fireEvent.change(input!, { target: { files: [unsupportedFile] } });

    expect(screen.getByRole('alert')).toHaveTextContent('unsupported file type');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('attaches a PDF and sends it without an upgrade gate', async () => {
    const onSend = vi.fn();
    const { container } = render(<ChatComposerNew onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [pdf] } });
    await userEvent.type(screen.getByRole('textbox', { name: /message input/i }), 'Summarize it');
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('Summarize it', [pdf], undefined, expect.any(Object)),
    );
  });

  it('offers explicit recovery choices when an image conflicts with the selected model', () => {
    const textOnlyModel = getSelectableModels().find(
      (model) => model.capabilities.vision === false,
    );
    expect(textOnlyModel, 'the canonical registry must expose a text-only model').toBeDefined();
    act(() => useModelStore.getState().setSelectedModelId(textOnlyModel!.id));

    const { container } = render(<ChatComposerNew onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input).not.toBeDisabled();

    fireEvent.change(input!, {
      target: { files: [new File(['image'], 'diagram.png', { type: 'image/png' })] },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("can't read the attached image");
    expect(screen.getByRole('button', { name: 'Use Auto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove attachments' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a compatible model' }));
    expect(screen.getAllByRole('button', { name: /^Use / }).length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Use Auto' }));
    expect(isAutoModeModelId(useModelStore.getState().selectedModelId)).toBe(true);
    expect(screen.queryByText(/can't read the attached image/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).not.toBeDisabled();
  });

  it('keeps free chat image upload, voice, and skills available', async () => {
    const visionModel = getSelectableModels().find((model) => model.capabilities.vision === true);
    expect(visionModel, 'the canonical registry must expose a vision model').toBeDefined();
    useModelStore.getState().setSelectedModelId(visionModel!.id);

    const { container } = render(
      <ChatComposerNew onSend={vi.fn()} freeTrial={{ enabled: true, limitReached: false }} />,
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voice input' })).not.toBeDisabled();

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, '@back');
    expect(await screen.findByText('backend-engineer')).toBeInTheDocument();
    expect(screen.queryByText(/free web chat accepts plain text/i)).not.toBeInTheDocument();
  });

  it('keeps Projects on free chat without exposing paid AGI Work mode', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposerNew
        onSend={onSend}
        freeTrial={{ enabled: true, limitReached: false }}
        projectPicker={{
          projects: [{ id: 'proj-free', name: 'Free Project' }],
          activeProjectId: 'proj-free',
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'AGI Work' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Project: Free Project' })).toHaveTextContent(
      'Free Project',
    );

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'Project chat');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        'Project chat',
        undefined,
        undefined,
        expect.objectContaining({ workMode: 'chat', projectId: 'proj-free' }),
      ),
    );
  });

  it('does not erase paid composer modes while account billing is still hydrating', async () => {
    const conversationId = 'billing-hydration-conversation';
    useBillingStore.setState({
      subscription: null,
      featureFlags: null,
      initialized: false,
      isLoading: true,
      error: null,
    });
    useChatStore.getState().setComposerToggles(
      {
        workMode: 'agiwork',
        researchEnabled: true,
        codeExecutionEnabled: true,
        officeCreationEnabled: true,
        imageMode: true,
      },
      conversationId,
    );

    render(
      <ChatComposerNew
        onSend={vi.fn()}
        onGenerateImage={vi.fn()}
        conversationId={conversationId}
      />,
    );

    await waitFor(() => {
      expect(useChatStore.getState().getComposerToggles(conversationId)).toMatchObject({
        workMode: 'agiwork',
        researchEnabled: true,
        codeExecutionEnabled: true,
        officeCreationEnabled: true,
        imageMode: true,
      });
    });
  });

  it('does not open a false media upgrade while account billing is still hydrating', async () => {
    useBillingStore.setState({
      subscription: null,
      featureFlags: null,
      initialized: false,
      isLoading: true,
      error: null,
    });
    const onUpgradeRequest = vi.fn();

    render(
      <ChatComposerNew
        onSend={vi.fn()}
        onGenerateImage={vi.fn()}
        onGenerateVideo={vi.fn()}
        onUpgradeRequest={onUpgradeRequest}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    const imageButton = screen.getByText('Create image').closest('button')!;
    const videoButton = screen.getByText('Create video').closest('button')!;
    expect(imageButton).toHaveTextContent('Checking');
    expect(videoButton).toHaveTextContent('Checking');
    expect(imageButton).not.toHaveTextContent('Upgrade');
    expect(videoButton).not.toHaveTextContent('Upgrade');

    await userEvent.click(imageButton);
    expect(onUpgradeRequest).not.toHaveBeenCalled();
    expect(screen.getByText('Checking your plan…')).toBeVisible();
  });

  it('retries a failed account lookup instead of showing a false media upgrade', async () => {
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    useBillingStore.setState({
      subscription: null,
      featureFlags: null,
      initialized: true,
      isLoading: false,
      error: '/api/me returned 500',
      refreshUser,
    });
    const onUpgradeRequest = vi.fn();

    render(
      <ChatComposerNew
        onSend={vi.fn()}
        onGenerateImage={vi.fn()}
        onGenerateVideo={vi.fn()}
        onUpgradeRequest={onUpgradeRequest}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    const imageButton = screen.getByText('Create image').closest('button')!;
    const videoButton = screen.getByText('Create video').closest('button')!;
    expect(imageButton).toHaveTextContent('Retry');
    expect(videoButton).toHaveTextContent('Retry');
    expect(imageButton).not.toHaveTextContent('Upgrade');
    expect(videoButton).not.toHaveTextContent('Upgrade');

    await userEvent.click(imageButton);
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(onUpgradeRequest).not.toHaveBeenCalled();
    expect(screen.getByText("Couldn't verify your plan. Retrying…")).toBeVisible();
  });

  it('shows a non-numeric upgrade gate only after the server reports usage exhaustion', async () => {
    const onSend = vi.fn();
    const onUpgradeRequest = vi.fn();
    render(
      <ChatComposerNew
        onSend={onSend}
        onUpgradeRequest={onUpgradeRequest}
        freeTrial={{ enabled: true, limitReached: true }}
      />,
    );

    expect(screen.getByText('Free usage limit reached. Upgrade to continue.')).toBeInTheDocument();
    expect(screen.queryByText(/\d[\d,.]*\s*(tokens?|prompts?)/i)).not.toBeInTheDocument();

    const usageAlert = screen.getByRole('alert');
    expect(usageAlert).toHaveClass('border-amber-300', 'bg-amber-50', 'text-amber-950');

    expect(screen.getByRole('textbox', { name: /message input/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(onSend).not.toHaveBeenCalled();
    expect(onUpgradeRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps automatic Web search and reasoning effort out of the + menu', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const moreBtn = screen.getByRole('button', { name: /add attachments and tools/i });
    fireEvent.click(moreBtn);

    expect(screen.queryByRole('button', { name: /web search/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/extended thinking/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /toggle research mode/i })).not.toBeInTheDocument();
  });

  it('automatically sends Web search for a tools-capable generic backend', async () => {
    const genericSearchModel = getSelectableModels().find(
      (model) =>
        model.capabilities.tools === true && providerSupportsWebSearch(model.provider) === false,
    );
    expect(genericSearchModel, 'registry must keep a generic-search test model').toBeDefined();
    useModelStore.getState().setSelectedModelId(genericSearchModel!.id);
    useBillingStore.setState({
      featureFlags: {
        advanced_model_access: originalFeatureFlags?.advanced_model_access ?? false,
        ...originalFeatureFlags,
        generic_web_search: true,
      },
    });

    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'Find the latest release');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        'Find the latest release',
        undefined,
        undefined,
        expect.objectContaining({ webSearchEnabled: true }),
      ),
    );
  });

  it('keeps ambient Web search enabled for Auto when the managed backend is available', async () => {
    useModelStore.getState().setSelectedModelId('auto');
    useBillingStore.setState({
      featureFlags: {
        advanced_model_access: originalFeatureFlags?.advanced_model_access ?? false,
        ...originalFeatureFlags,
        generic_web_search: true,
      },
    });

    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'What changed today?');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        'What changed today?',
        undefined,
        undefined,
        expect.objectContaining({ webSearchEnabled: true }),
      ),
    );
  });

  it('honestly disables ambient generic search when the backend is unavailable', async () => {
    const genericSearchModel = getSelectableModels().find(
      (model) =>
        model.capabilities.tools === true && providerSupportsWebSearch(model.provider) === false,
    );
    expect(genericSearchModel, 'registry must keep a generic-search test model').toBeDefined();
    useModelStore.getState().setSelectedModelId(genericSearchModel!.id);
    useBillingStore.setState({
      featureFlags: {
        advanced_model_access: originalFeatureFlags?.advanced_model_access ?? false,
        ...originalFeatureFlags,
        generic_web_search: false,
      },
    });

    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'Hello');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        'Hello',
        undefined,
        undefined,
        expect.objectContaining({ webSearchEnabled: false }),
      ),
    );
  });

  it('does not show incognito when no active conversation can be made temporary', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: /enable incognito mode/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle(/start an incognito conversation/i)).not.toBeInTheDocument();
  });

  it('clears the textarea after sending', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'hello');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('does not start hidden per-keystroke managed completion work', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.queryByTestId('ghost-text-overlay')).not.toBeInTheDocument();
  });

  it('renders Skills, Connectors, and Plugins entries in the overflow menu', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const moreBtn = screen.getByRole('button', { name: /add attachments and tools/i });
    fireEvent.click(moreBtn);

    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Connectors')).toBeInTheDocument();
    expect(screen.getByText('Plugins')).toBeInTheDocument();
  });

  it('plus-menu entries open the settings modal at their pane (no inline lists, no fake toggles)', () => {
    chatComposerMocks.openSettings.mockClear();
    render(<ChatComposerNew onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    fireEvent.click(screen.getByText('Skills'));
    expect(chatComposerMocks.openSettings).toHaveBeenLastCalledWith('skills');

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    fireEvent.click(screen.getByText('Plugins'));
    expect(chatComposerMocks.openSettings).toHaveBeenLastCalledWith('plugins');

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    expect(screen.getByText('Plugins').closest('a')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /search skills/i })).toBeNull();
    expect(screen.queryByRole('switch', { name: /toggle/i })).toBeNull();
  });

  it('the Connectors row expands a submenu instead of navigating straight to Settings', () => {
    chatComposerMocks.openSettings.mockClear();
    render(<ChatComposerNew onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    expect(screen.getByText('Connectors').closest('a')).toBeNull();
    fireEvent.click(screen.getByText('Connectors'));

    expect(chatComposerMocks.openSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('menu', { name: 'Connectors' })).toBeInTheDocument();
    expect(screen.getByText('No connectors connected yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage in Settings' }));
    expect(chatComposerMocks.openSettings).toHaveBeenLastCalledWith('connectors');
  });

  it('lists a connected connector with a checkbox that disables it for this conversation only', () => {
    chatComposerMocks.connectors.connectedIds = new Set(['custom-abc123']);
    chatComposerMocks.connectors.sources = { 'custom-abc123': 'custom' };
    chatComposerMocks.connectors.customNames = { 'custom-abc123': 'Internal Docs MCP' };

    render(<ChatComposerNew onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    fireEvent.click(screen.getByText('Connectors'));

    const checkbox = screen.getByRole('menuitemcheckbox', { name: 'Internal Docs MCP' });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(useChatStore.getState().getDisabledConnectorIds(null)).toEqual(['custom-abc123']);

    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(useChatStore.getState().getDisabledConnectorIds(null)).toEqual([]);
  });

  it('disables Send button when loading', () => {
    render(<ChatComposerNew onSend={vi.fn()} isLoading />);
    const stopButton = screen.getByRole('button', { name: /send message/i });
    expect(stopButton).toHaveAttribute('data-mode', 'stop');
  });

  it('keeps Stop available for an active stream after the loading phase clears', () => {
    const onStop = vi.fn();
    render(<ChatComposerNew onSend={vi.fn()} onStop={onStop} isGenerating />);

    const stopButton = screen.getByRole('button', { name: /send message/i });
    expect(stopButton).toHaveAttribute('data-mode', 'stop');
    expect(stopButton).not.toBeDisabled();

    fireEvent.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('disables textarea when disabled prop is set', () => {
    render(<ChatComposerNew onSend={vi.fn()} disabled />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeDisabled();
  });

  it('renders the work-mode toggle ONLY when backed by host project data (never disconnected)', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AGI Work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /toggle web search/i })).not.toBeInTheDocument();
  });

  it('renders the connected Chat | AGI Work segmented toggle when project data is provided', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        emptyState
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );
    const chatButton = screen.getByRole('button', { name: 'Chat' });
    expect(chatButton).toHaveAttribute('aria-pressed', 'true');
    expect(chatButton.parentElement).toHaveClass('chat-composer-mode-inline');
    expect(chatButton.closest('.chat-composer-row')).not.toBeNull();
    expect(chatButton.closest('.chat-composer-leading-end')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
      'title',
      'Chat: quick questions and conversation',
    );
    expect(screen.getByRole('button', { name: 'AGI Work' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'AGI Work' })).toHaveAttribute(
      'title',
      'AGI Work: multi-step tasks with tools, files, and reviewable deliverables',
    );

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    expect(document.querySelector('.chat-composer-mode-in-menu')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'AGI Work' })).toHaveLength(1);
  });

  it('clicking AGI Work flips both buttons pressed state and rewrites the placeholder', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        emptyState
        placeholder="How can I help you today?"
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );
    const chatButton = screen.getByRole('button', { name: 'Chat' });
    const agiWorkButton = screen.getByRole('button', { name: 'AGI Work' });
    const textarea = screen.getByRole('textbox', { name: /message input/i });

    expect(chatButton).toHaveAttribute('aria-pressed', 'true');
    expect(agiWorkButton).toHaveAttribute('aria-pressed', 'false');
    expect(textarea).toHaveAttribute('placeholder', 'How can I help you today?');

    fireEvent.click(agiWorkButton);

    expect(agiWorkButton).toHaveAttribute('aria-pressed', 'true');
    expect(chatButton).toHaveAttribute('aria-pressed', 'false');
    expect(textarea).toHaveAttribute(
      'placeholder',
      'Describe a multi-step task and what it should deliver',
    );

    fireEvent.click(chatButton);

    expect(chatButton).toHaveAttribute('aria-pressed', 'true');
    expect(agiWorkButton).toHaveAttribute('aria-pressed', 'false');
    expect(textarea).toHaveAttribute('placeholder', 'How can I help you today?');
  });

  it('puts the text field on a row of its own above the control row at every width', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        emptyState
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    const row = document.querySelector('.chat-composer-row');
    expect(row).not.toBeNull();
    expect(row).not.toHaveClass('flex-nowrap');

    const field = document.querySelector('.chat-composer-field');
    expect(field).not.toBeNull();
    expect(field?.contains(screen.getByRole('textbox', { name: /message input/i }))).toBe(true);

    const plusButton = screen.getByRole('button', { name: /add attachments and tools/i });
    const leading = plusButton.closest('.chat-composer-leading-end');
    expect(leading).not.toBeNull();
    expect(leading?.contains(screen.getByTestId('composer-work-mode'))).toBe(true);
    expect(field).not.toBeNull();
    expect(
      field!.compareDocumentPosition(leading!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps every control on one nowrap line so a phone never gets a third row', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        emptyState
        onEnterVoiceMode={vi.fn()}
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    const controls = document.querySelector('.chat-composer-controls');
    expect(controls).not.toBeNull();
    expect(controls).toHaveClass('flex-nowrap');
    expect(controls).toHaveClass('flex-row');
    expect(
      controls?.contains(screen.getByRole('button', { name: /add attachments and tools/i })),
    ).toBe(true);
    expect(controls?.contains(screen.getByRole('button', { name: /voice input/i }))).toBe(true);

    const row = document.querySelector('.chat-composer-row');
    expect(row?.children).toHaveLength(2);
  });

  it('opens the AGI Work scope panel from the "+" menu rather than a pill under the card', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        emptyState
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    expect(screen.queryByRole('button', { name: /scope/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /scope/i }));

    expect(document.querySelectorAll('input[type="text"]').length).toBeGreaterThan(0);
  });

  it('keeps the segmented control on the composer face inside an existing chat', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId="conv-1"
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    const control = screen.getByTestId('composer-work-mode');
    expect(control.className).not.toContain('hidden');
    expect(control.className).not.toContain('sm:flex');
    expect(within(control).getByRole('button', { name: 'Chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('replaces the scope pill with the attached bar once AGI Work is selected', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        emptyState
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    expect(screen.queryByTestId('composer-work-bar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));

    const bar = screen.getByTestId('composer-work-bar');
    expect(within(bar).getByRole('button', { name: /project or folder/i })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Files' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Plugins' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Open desktop app' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: /add scope/i })).not.toBeInTheDocument();
  });

  it('names the picked project on the bar and still sends it in the meta', () => {
    const onSend = vi.fn();
    render(
      <ChatComposerNew
        onSend={onSend}
        emptyState
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: 'proj-1',
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    const bar = screen.getByTestId('composer-work-bar');
    expect(within(bar).getByText('Website Redesign')).toBeInTheDocument();

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(textarea, { target: { value: 'ship the redesign' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(onSend).toHaveBeenCalledWith(
      'ship the redesign',
      undefined,
      undefined,
      expect.objectContaining({ workMode: 'agiwork', projectId: 'proj-1' }),
    );
  });

  it('keeps only explicit task modes inside the + menu', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    expect(screen.queryByRole('button', { name: /web search/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/extended thinking/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use style/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deep research/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create office files/i })).toBeInTheDocument();
  });

  it('keeps routed Auto capabilities actionable for a paid plan', () => {
    useModelStore.getState().setSelectedModelId('auto');

    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

    expect(screen.getByRole('button', { name: /deep research/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /run code/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /create office files/i })).toBeEnabled();
  });

  it('enables Deep Research for a tool-capable model the catalog marks research false', () => {
    const toolsOnlyResearchModel = useModelStore
      .getState()
      .availableModels.map((model) => getModelMetadataById(model.id))
      .filter((model): model is NonNullable<typeof model> => Boolean(model))
      .find(
        (model) =>
          model.capabilities.research !== true &&
          model.capabilities.tools === true &&
          (model.contextWindow ?? 0) >= RESEARCH_MIN_CONTEXT_WINDOW,
      );
    expect(
      toolsOnlyResearchModel,
      'catalog must expose a reachable tool-capable model',
    ).toBeDefined();
    useModelStore.getState().setSelectedModelId(toolsOnlyResearchModel!.id);

    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

    expect(screen.getByRole('button', { name: /deep research/i })).toBeEnabled();
  });

  it('shows the enabled + menu option beside the menu button', () => {
    useModelStore.getState().setSelectedModelId('auto');

    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    fireEvent.click(screen.getByRole('button', { name: /run code/i }));

    expect(screen.getByRole('status', { name: 'Active options: Run code' })).toBeVisible();
  });

  it('exposes the toggle state of + menu rows to assistive technology', () => {
    useModelStore.getState().setSelectedModelId('auto');

    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

    const runCode = screen.getByRole('button', { name: /run code/i });
    expect(runCode).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(runCode);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

    expect(screen.getByRole('button', { name: /run code/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the Memory + menu item on by default and persists turning it off for one conversation', async () => {
    const conversationId = 'memory-toggle-conversation';
    render(<ChatComposerNew onSend={vi.fn()} conversationId={conversationId} />);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /memory/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.getByRole('button', { name: /memory/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /memory/i }));

    expect(useChatStore.getState().getMemoryEnabled(conversationId)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /memory/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  it('disables the Memory + menu item with a settings hint when the account switch is off', async () => {
    chatComposerMocks.memoryCapabilityEnabled = false;
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

    const memoryRow = await screen.findByRole('button', { name: /memory/i });
    expect(memoryRow).toBeDisabled();
    expect(memoryRow).toHaveAttribute('title', expect.stringMatching(/settings/i));
  });

  it('shows a Memory off footer indicator only once Memory is turned off for the conversation', async () => {
    const conversationId = 'memory-indicator-conversation';
    render(<ChatComposerNew onSend={vi.fn()} conversationId={conversationId} />);

    await waitFor(() => {
      expect(screen.queryByTestId('memory-indicator')).not.toBeInTheDocument();
    });

    act(() => {
      useChatStore.getState().setMemoryEnabled(false, conversationId);
    });

    expect(await screen.findByTestId('memory-indicator')).toHaveTextContent('Memory off');
  });

  it('sends the persistent Office file-creation selection to the server', async () => {
    const toolModel = getSelectableModels().find((model) => model.capabilities.tools === true);
    expect(toolModel, 'the canonical registry must expose a tool-capable model').toBeDefined();
    useModelStore.getState().setSelectedModelId(toolModel!.id);

    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
    fireEvent.click(screen.getByRole('button', { name: /create office files/i }));

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'Create a release plan deck');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() =>
      expect(onSendMock).toHaveBeenLastCalledWith(
        'Create a release plan deck',
        undefined,
        undefined,
        expect.objectContaining({ officeCreationEnabled: true }),
      ),
    );
  });

  it('does not expose an inert work-project selector', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /choose a project/i })).not.toBeInTheDocument();
  });

  it('ambient web search stays on across sends', async () => {
    const searchModel = getSelectableModels().find(
      (model) =>
        model.capabilities.search === true && providerSupportsWebSearch(model.provider) === true,
    );
    expect(
      searchModel,
      'the canonical registry must expose a wired web-search model',
    ).toBeDefined();
    useModelStore.getState().setSelectedModelId(searchModel!.id);

    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });

    await userEvent.type(textarea, 'first');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(onSendMock).toHaveBeenLastCalledWith(
        'first',
        undefined,
        undefined,
        expect.objectContaining({ webSearchEnabled: true }),
      ),
    );

    await userEvent.type(textarea, 'second');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(onSendMock).toHaveBeenLastCalledWith(
        'second',
        undefined,
        undefined,
        expect.objectContaining({ webSearchEnabled: true }),
      ),
    );
  });

  describe('Project or folder picker', () => {
    const pickerProjects = [
      { id: 'proj-1', name: 'Website Redesign' },
      { id: 'proj-2', name: 'Mobile App' },
    ];

    function makePicker(overrides: Partial<ComposerProjectPicker> = {}): ComposerProjectPicker {
      return {
        projects: pickerProjects,
        activeProjectId: null,
        onSelectProject: vi.fn(),
        onCreateProject: vi.fn(),
        ...overrides,
      };
    }

    function enterAgiWork() {
      fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    }

    it('is absent when the host provides no project data (no cosmetic control)', () => {
      render(<ChatComposerNew onSend={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Project or folder' })).not.toBeInTheDocument();
    });

    it('is hidden in Chat mode and appears below the composer in AGI Work mode', () => {
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={makePicker()} />);
      expect(screen.queryByRole('button', { name: 'Project or folder' })).not.toBeInTheDocument();
      enterAgiWork();
      expect(screen.getByRole('button', { name: 'Project or folder' })).toBeInTheDocument();
    });

    it('opens a searchable popover listing the real projects', () => {
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={makePicker()} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      expect(screen.getByRole('textbox', { name: /search projects/i })).toBeInTheDocument();
      expect(screen.getByText('Website Redesign')).toBeInTheDocument();
      expect(screen.getByText('Mobile App')).toBeInTheDocument();
    });

    it('filters the project list as the user searches', async () => {
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={makePicker()} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      await userEvent.type(screen.getByRole('textbox', { name: /search projects/i }), 'mobile');
      expect(screen.queryByText('Website Redesign')).not.toBeInTheDocument();
      expect(screen.getByText('Mobile App')).toBeInTheDocument();
    });

    it('selecting a project reports its projectId to the host (the value threaded into createConversation)', () => {
      const picker = makePicker();
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={picker} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      fireEvent.click(screen.getByText('Mobile App'));
      expect(picker.onSelectProject).toHaveBeenCalledWith('proj-2');
    });

    it('a preselected project (URL entry) auto-enters AGI Work and shows the project on the chip', () => {
      const picker = makePicker({ activeProjectId: 'proj-1' });
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={picker} />);
      expect(screen.getByRole('button', { name: 'AGI Work' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // WCAG 2.5.3: the accessible name carries the visible chip text, so a
      // voice-control user can say what they can read and a screen reader
      // announces WHICH project is scoped, not just that a picker exists.
      expect(
        screen.getByRole('button', { name: 'Project or folder: Website Redesign' }),
      ).toHaveTextContent('Website Redesign');
      fireEvent.click(screen.getByRole('button', { name: /clear project or folder selection/i }));
      expect(picker.onSelectProject).toHaveBeenCalledWith(null);
    });

    it('switching back to Chat clears the project selection (no hidden scope)', () => {
      const picker = makePicker({ activeProjectId: 'proj-1' });
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={picker} />);
      fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(picker.onSelectProject).toHaveBeenCalledWith(null);
      expect(screen.queryByRole('button', { name: 'Project or folder' })).not.toBeInTheDocument();
    });

    it('offers Create new project (opens the host CreateProjectDialog)', () => {
      const picker = makePicker();
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={picker} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      fireEvent.click(screen.getByText('Create new project'));
      expect(picker.onCreateProject).toHaveBeenCalledTimes(1);
    });

    it('does NOT offer local-folder selection on web (working-directory is a desktop capability)', () => {
      render(<ChatComposerNew onSend={vi.fn()} emptyState projectPicker={makePicker()} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      expect(screen.queryByText('Choose a different folder')).not.toBeInTheDocument();
    });

    it('offers "Choose a different folder" only on working-directory surfaces (desktop)', () => {
      render(
        <CapabilityProvider platform="desktop">
          <ChatComposerNew onSend={vi.fn()} emptyState projectPicker={makePicker()} />
        </CapabilityProvider>,
      );
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      expect(screen.getByText('Choose a different folder')).toBeInTheDocument();
    });
  });

  describe('follow-up queue while streaming', () => {
    it('queues a follow-up typed during streaming and auto-sends it when the turn finishes', async () => {
      const onSendMock = vi.fn();
      const { rerender } = render(<ChatComposerNew onSend={onSendMock} isLoading isGenerating />);

      const textarea = screen.getByRole('textbox', { name: /message input/i });
      expect(textarea).not.toBeDisabled();
      await userEvent.type(textarea, 'follow up question');
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSendMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('queued-followup')).toBeInTheDocument();

      rerender(<ChatComposerNew onSend={onSendMock} isLoading={false} isGenerating={false} />);
      await waitFor(() => {
        expect(onSendMock).toHaveBeenCalledWith(
          'follow up question',
          undefined,
          undefined,
          expect.objectContaining({ workMode: expect.anything() }),
        );
      });
      expect(screen.queryByTestId('queued-followup')).not.toBeInTheDocument();
    });

    it('cancels a queued follow-up so it is not sent when the turn finishes', async () => {
      const onSendMock = vi.fn();
      const { rerender } = render(<ChatComposerNew onSend={onSendMock} isLoading isGenerating />);

      const textarea = screen.getByRole('textbox', { name: /message input/i });
      await userEvent.type(textarea, 'to cancel');
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(screen.getByTestId('queued-followup')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel queued message/i }));
      expect(screen.queryByTestId('queued-followup')).not.toBeInTheDocument();

      rerender(<ChatComposerNew onSend={onSendMock} isLoading={false} isGenerating={false} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(onSendMock).not.toHaveBeenCalled();
    });
  });

  describe('Create image model and aspect honesty', () => {
    it('renders media actions only when the host owns their generation callbacks', () => {
      const onSend = vi.fn();
      const { rerender } = render(<ChatComposerNew onSend={onSend} />);
      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      expect(screen.queryByText('Create image')).toBeNull();
      expect(screen.queryByText('Create video')).toBeNull();

      rerender(
        <ChatComposerNew onSend={onSend} onGenerateImage={vi.fn()} onGenerateVideo={vi.fn()} />,
      );
      expect(screen.getByText('Create image')).toBeInTheDocument();
      expect(screen.getByText('Create video')).toBeInTheDocument();
    });

    it('does not consume a typed /image prompt when this host has no image turn owner', async () => {
      const onSend = vi.fn();
      render(<ChatComposerNew onSend={onSend} />);
      const textarea = screen.getByRole('textbox', { name: /message input/i });

      await userEvent.type(textarea, '/image a lighthouse in a storm');
      expect(screen.queryByText(/\/image runs on send/i)).toBeNull();
      expect(screen.getByText('Image generation is not available from this chat.')).toBeVisible();
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

      expect(onSend).not.toHaveBeenCalled();
      expect(textarea).toHaveValue('/image a lighthouse in a storm');
    });

    it('offers exact Google ratios and sends the selected 3:4 value unchanged', async () => {
      const googleModel = IMAGE_MODELS.find((model) => model.provider === 'google');
      expect(googleModel).toBeDefined();
      const onGenerateImage = vi.fn();
      render(<ChatComposerNew onSend={vi.fn()} onGenerateImage={onGenerateImage} />);

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create image'));
      fireEvent.click(screen.getByRole('button', { name: /select image model/i }));
      fireEvent.click(screen.getByRole('button', { name: googleModel!.label }));
      fireEvent.click(screen.getByRole('button', { name: /select aspect ratio/i }));
      expect(screen.getByRole('button', { name: /portrait 3:4/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /landscape 4:3/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /portrait 3:4/i }));

      const textarea = screen.getByRole('textbox', { name: /message input/i });
      await userEvent.type(textarea, 'a studio portrait');
      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateImage).toHaveBeenCalledWith('a studio portrait', {
          aspectRatio: '3:4',
          modelId: googleModel!.id,
        });
      });
    });

    it('removes unsupported ratios and resets a stale choice when OpenAI is selected', () => {
      const googleModel = IMAGE_MODELS.find((model) => model.provider === 'google');
      const openAiModel = IMAGE_MODELS.find((model) => model.provider === 'openai');
      expect(googleModel).toBeDefined();
      expect(openAiModel).toBeDefined();
      render(<ChatComposerNew onSend={vi.fn()} onGenerateImage={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create image'));
      fireEvent.click(screen.getByRole('button', { name: /select image model/i }));
      fireEvent.click(screen.getByRole('button', { name: googleModel!.label }));
      fireEvent.click(screen.getByRole('button', { name: /select aspect ratio/i }));
      fireEvent.click(screen.getByRole('button', { name: /portrait 3:4/i }));

      fireEvent.click(screen.getByRole('button', { name: /select image model/i }));
      fireEvent.click(screen.getByRole('button', { name: openAiModel!.label }));

      expect(screen.getByRole('button', { name: /select aspect ratio/i })).toHaveTextContent(
        'Auto',
      );
      fireEvent.click(screen.getByRole('button', { name: /select aspect ratio/i }));
      expect(screen.queryByRole('button', { name: /portrait 3:4/i })).toBeNull();
      expect(screen.getByRole('button', { name: /portrait 2:3/i })).toBeInTheDocument();
    });

    it('projects only live, nondeprecated, capability-backed media catalog entries', () => {
      for (const imageModel of IMAGE_MODELS) {
        const metadata = getModelMetadataById(imageModel.id);
        expect(metadata).toBeDefined();
        expect(metadata?.modelType).toBe('image');
        expect(metadata?.capabilities.imageGen).toBe(true);
        expect(metadata?.deprecated).not.toBe(true);
        expect(metadata?.status).not.toBe('deprecated');
        expect(metadata && isModelLive(metadata)).toBe(true);
      }
      for (const videoModel of VIDEO_MODELS) {
        const metadata = getModelMetadataById(videoModel.id);
        expect(metadata).toBeDefined();
        expect(metadata?.modelType).toBe('video');
        expect(metadata?.capabilities.videoGen).toBe(true);
        expect(metadata?.deprecated).not.toBe(true);
        expect(metadata?.status).not.toBe('deprecated');
        expect(metadata && isModelLive(metadata)).toBe(true);
      }
    });

    it('does not offer a catalog-live image model whose provider is not configured here', () => {
      const googleModel = IMAGE_MODELS.find((model) => model.provider === 'google');
      const unavailableModel = IMAGE_MODELS.find((model) => model.provider === 'openai');
      expect(googleModel).toBeDefined();
      expect(unavailableModel).toBeDefined();
      chatComposerMocks.mediaAvailability.admissionFor.mockImplementation((modelId: string) => ({
        model_id: modelId,
        name: modelId,
        kind: 'image',
        provider: modelId === unavailableModel!.id ? 'openai' : 'google',
        state: modelId === unavailableModel!.id ? 'provider_not_configured' : 'enabled',
      }));

      render(<ChatComposerNew onSend={vi.fn()} onGenerateImage={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create image'));
      fireEvent.click(screen.getByRole('button', { name: /select image model/i }));

      expect(screen.getByRole('button', { name: googleModel!.label })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: unavailableModel!.label })).toBeNull();
    });

    it('does not upsell an image entitlement when this deployment has no executable image path', () => {
      useBillingStore.setState({
        subscription: null,
        initialized: true,
        isLoading: false,
        error: null,
      });
      chatComposerMocks.mediaAvailability.admissionFor.mockImplementation((modelId: string) => ({
        model_id: modelId,
        name: modelId,
        kind: 'image',
        provider: 'fixture',
        state: 'storage_not_configured',
      }));
      const onUpgradeRequest = vi.fn();

      render(
        <ChatComposerNew
          onSend={vi.fn()}
          onGenerateImage={vi.fn()}
          onUpgradeRequest={onUpgradeRequest}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

      const button = screen.getByText('Create image').closest('button')!;
      expect(button).toHaveTextContent('Unavailable');
      expect(button).not.toHaveTextContent('Upgrade');
      fireEvent.click(button);

      expect(onUpgradeRequest).not.toHaveBeenCalled();
      expect(screen.getByText('This deployment is not ready for image generation.')).toBeVisible();
    });
  });

  describe('Create video', () => {
    const MAX_15X_SUBSCRIPTION: SubscriptionPlan = {
      tier: 'max_15x',
      display_name: 'Max 15x',
      status: 'active',
      current_period_end: null,
      plan_name: 'Max 15x',
    };

    it('offers Create video to an entitled tier and routes the prompt to onGenerateVideo', async () => {
      useBillingStore.setState({ subscription: MAX_15X_SUBSCRIPTION });
      const onGenerateVideo = vi.fn();
      const onSend = vi.fn();
      render(<ChatComposerNew onSend={onSend} onGenerateVideo={onGenerateVideo} />);

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      const item = screen.getByText('Create video');
      expect(item).toBeInTheDocument();
      expect(item.closest('button')).not.toHaveTextContent(/upgrade/i);

      fireEvent.click(item);

      expect(
        screen.getByRole('button', { name: /exit video generation mode/i }),
      ).toBeInTheDocument();
      const textarea = screen.getByRole('textbox', { name: /message input/i });
      expect(textarea).toHaveAttribute('placeholder', 'Describe the video you want');

      await userEvent.type(textarea, 'a cat surfing');
      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateVideo).toHaveBeenCalledWith('a cat surfing', {
          modelId: VIDEO_MODELS[0]!.id,
          aspectRatio: '16:9',
          resolution: '720p',
        });
      });
      expect(onSend).not.toHaveBeenCalled();
    });

    it('explains that the deployment is not ready when the durable video schema is absent', () => {
      useBillingStore.setState({ subscription: MAX_15X_SUBSCRIPTION });
      chatComposerMocks.mediaAvailability.admissionFor.mockImplementation((modelId: string) => ({
        model_id: modelId,
        name: modelId,
        kind: 'video',
        provider: 'google',
        state: 'schema_not_configured',
      }));

      render(<ChatComposerNew onSend={vi.fn()} onGenerateVideo={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

      const button = screen.getByText('Create video').closest('button')!;
      expect(button).toHaveTextContent('Unavailable');
      expect(button).toHaveAttribute('title', 'This deployment is not ready for video generation.');

      fireEvent.click(button);

      expect(screen.getByText('This deployment is not ready for video generation.')).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /exit video generation mode/i }),
      ).not.toBeInTheDocument();
    });

    it('sends a non-entitled tier to the upgrade path instead of into video mode', () => {
      useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
      const onUpgradeRequest = vi.fn();
      const onGenerateVideo = vi.fn();
      render(
        <ChatComposerNew
          onSend={vi.fn()}
          onUpgradeRequest={onUpgradeRequest}
          onGenerateVideo={onGenerateVideo}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      const button = screen.getByText('Create video').closest('button')!;
      expect(button).toHaveTextContent(/upgrade/i);

      fireEvent.click(button);

      expect(onUpgradeRequest).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole('button', { name: /exit video generation mode/i }),
      ).not.toBeInTheDocument();
    });

    it('shows a video model picker instead of the text model selector', async () => {
      useBillingStore.setState({ subscription: MAX_15X_SUBSCRIPTION });
      render(<ChatComposerNew onSend={vi.fn()} onGenerateVideo={vi.fn()} />);

      expect(screen.getByTestId('composer-footer')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create video'));

      expect(screen.queryByTestId('composer-footer')).not.toBeInTheDocument();
      const picker = screen.getByRole('button', { name: /select video model/i });
      expect(picker).toBeInTheDocument();
      expect(picker).not.toHaveTextContent(/no video model available/i);
    });

    it('derives every executable video candidate from the catalog without a provider allowlist', () => {
      const executableCatalogIds = getModels({ modelTypes: ['video'] })
        .filter(isExecutableVideoModel)
        .map((model) => model.id);

      expect(executableCatalogIds.length).toBeGreaterThan(0);
      expect(VIDEO_MODELS.map((model) => model.id)).toEqual(executableCatalogIds);
    });

    it('sends the picked video model to the generation handler', async () => {
      useBillingStore.setState({ subscription: MAX_15X_SUBSCRIPTION });
      const onGenerateVideo = vi.fn();
      render(<ChatComposerNew onSend={vi.fn()} onGenerateVideo={onGenerateVideo} />);

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create video'));

      const textarea = screen.getByRole('textbox', { name: /message input/i });
      await userEvent.type(textarea, 'a cat surfing');
      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateVideo).toHaveBeenCalledWith('a cat surfing', {
          modelId: VIDEO_MODELS[0]!.id,
          aspectRatio: '16:9',
          resolution: '720p',
        });
      });
    });

    it('sends the visible video aspect and quality selections to the generation handler', async () => {
      useBillingStore.setState({ subscription: MAX_15X_SUBSCRIPTION });
      const onGenerateVideo = vi.fn();
      render(<ChatComposerNew onSend={vi.fn()} onGenerateVideo={onGenerateVideo} />);

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create video'));

      const textarea = screen.getByRole('textbox', { name: /message input/i });
      await userEvent.type(textarea, 'a portrait travel clip');
      fireEvent.click(screen.getByRole('button', { name: 'Select video aspect ratio' }));
      fireEvent.click(screen.getByRole('button', { name: 'Portrait 9:16' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select video quality' }));
      fireEvent.click(screen.getByRole('button', { name: '480p' }));

      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateVideo).toHaveBeenCalledWith('a portrait travel clip', {
          modelId: VIDEO_MODELS[0]!.id,
          aspectRatio: '9:16',
          resolution: '480p',
        });
      });
    });

    it('carries a catalog-required duration for a restricted video quality', async () => {
      useBillingStore.setState({ subscription: MAX_15X_SUBSCRIPTION });
      const restricted = VIDEO_MODELS.map((model) => ({
        model,
        quality: getVideoQualityOptionsForModel(model.id, '16:9').find(
          (option) => option.durationSecs?.length === 1,
        ),
      })).find((candidate) => candidate.quality);
      expect(restricted).toBeDefined();

      const onGenerateVideo = vi.fn();
      render(<ChatComposerNew onSend={vi.fn()} onGenerateVideo={onGenerateVideo} />);
      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create video'));

      const textarea = screen.getByRole('textbox', { name: /message input/i });
      await userEvent.type(textarea, 'a high resolution mountain clip');
      fireEvent.click(screen.getByRole('button', { name: /select video model/i }));
      fireEvent.click(screen.getByRole('button', { name: restricted!.model.label }));
      fireEvent.click(screen.getByRole('button', { name: 'Select video quality' }));
      fireEvent.click(screen.getByText(restricted!.quality!.label));
      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(onGenerateVideo).toHaveBeenCalledWith('a high resolution mountain clip', {
          modelId: restricted!.model.id,
          aspectRatio: '16:9',
          resolution: restricted!.quality!.id,
          durationSecs: restricted!.quality!.durationSecs![0],
        });
      });
    });

    it('leaves image mode when video mode is entered so one send path owns the prompt', () => {
      useBillingStore.setState({ subscription: MAX_15X_SUBSCRIPTION });
      render(
        <ChatComposerNew onSend={vi.fn()} onGenerateImage={vi.fn()} onGenerateVideo={vi.fn()} />,
      );

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create image'));
      expect(
        screen.getByRole('button', { name: /exit image generation mode/i }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));
      fireEvent.click(screen.getByText('Create video'));

      expect(
        screen.getByRole('button', { name: /exit video generation mode/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /exit image generation mode/i }),
      ).not.toBeInTheDocument();
    });
  });
});
