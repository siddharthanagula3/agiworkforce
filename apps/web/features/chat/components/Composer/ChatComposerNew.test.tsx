import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposerNew, type ComposerProjectPicker } from './ChatComposerNew';
import { getSelectableModels, isAutoModeModelId } from '@shared/config/llm';
import { providerSupportsWebSearch } from '@/lib/web-search-support';
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { CapabilityProvider } from '@agiworkforce/unified-chat';

// ─── Module mocks ──────────────────────────────────────────────────────────────

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

vi.mock('./InputFooter', () => ({
  InputFooter: () => <div data-testid="input-footer" />,
}));

vi.mock('./ActiveModeTags', () => ({
  ActiveModeTags: () => null,
}));

vi.mock('./VoiceInputButton', () => ({
  VoiceInputButton: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" aria-label="Voice input" disabled={disabled}>
      Voice
    </button>
  ),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatComposerNew', () => {
  let originalModelId: string;
  let originalFeatureFlags: ReturnType<typeof useBillingStore.getState>['featureFlags'];

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
    originalModelId = useModelStore.getState().selectedModelId;
    originalFeatureFlags = useBillingStore.getState().featureFlags;
  });

  afterEach(() => {
    useModelStore.getState().setSelectedModelId(originalModelId);
    useBillingStore.setState({ featureFlags: originalFeatureFlags });
    vi.unstubAllGlobals();
  });

  it('renders the message textarea', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeInTheDocument();
  });

  it('keeps the control cluster on one line (flex-nowrap) so Send never drops to a 2nd row', () => {
    // Bug 1: inside a conversation the sidebar narrows the composer column and the
    // Send button wrapped to a second row. The prior flex-wrap+order layout broke
    // lines on each control's CONTENT size, so min-w-0 alone couldn't stop the wrap.
    // The fix puts the controls in their own flex-nowrap row — a hard CSS guarantee
    // that they stay on one line (the footer shrinks via min-w-0 instead of wrapping).
    const { container } = render(<ChatComposerNew onSend={vi.fn()} />);
    const cluster = container.querySelector('.flex-nowrap') as HTMLElement | null;
    expect(cluster).toBeTruthy();
    expect(cluster!.className).toContain('min-w-0');

    // The leading "+" control and the trailing Send button are BOTH in that one row,
    // so flex-nowrap keeps them on the same line at any width.
    const plus = screen.getByRole('button', { name: /more options/i });
    const send = screen.getByRole('button', { name: /send message/i });
    expect(cluster!.contains(plus)).toBe(true);
    expect(cluster!.contains(send)).toBe(true);

    // The textarea is the full-width row ABOVE the controls, not inside the cluster.
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    expect(cluster!.contains(textarea)).toBe(false);
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
        projectPicker={{
          projects: [{ id: 'proj-2', name: 'Mobile App' }],
          activeProjectId: 'proj-2',
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );

    // A preselected project flips the composer into AGI Work mode by itself
    // (URL-entry path); the toggle must reflect it.
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
        expect.stringContaining('review this route'),
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

  it('opens + menu and shows Add photos option', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    expect(screen.getByText('Add photos & files')).toBeInTheDocument();
  });

  it('rejects non-image attachments before send', () => {
    const { container } = render(<ChatComposerNew onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', 'image/*');

    const unsupportedFile = new File(['binary'], 'installer.exe', {
      type: 'application/x-msdownload',
    });
    fireEvent.change(input!, { target: { files: [unsupportedFile] } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Web chat currently accepts images only. Other file types require Cloud file support.',
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
    expect(screen.getByRole('button', { name: 'Project' })).toHaveTextContent('Free Project');

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

    expect(screen.getByRole('textbox', { name: /message input/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(onSend).not.toHaveBeenCalled();
    expect(onUpgradeRequest).toHaveBeenCalledTimes(1);
  });

  it('opens + menu and shows the backed Web search toggle row', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    expect(screen.getAllByText('Web search').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /toggle research mode/i })).not.toBeInTheDocument();
  });

  it('shows Web search for a tools-capable model through the configured generic backend', () => {
    const genericSearchModel = getSelectableModels().find(
      (model) =>
        model.capabilities.tools === true && providerSupportsWebSearch(model.provider) === false,
    );
    expect(genericSearchModel, 'registry must keep a generic-search test model').toBeDefined();
    useModelStore.getState().setSelectedModelId(genericSearchModel!.id);
    useBillingStore.setState({
      featureFlags: {
        beta_features: originalFeatureFlags?.beta_features ?? false,
        advanced_model_access: originalFeatureFlags?.advanced_model_access ?? false,
        ...originalFeatureFlags,
        generic_web_search: true,
      },
    });

    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));

    expect(screen.getByRole('button', { name: /web search/i })).toBeInTheDocument();
  });

  it('hides generic Web search when the deployment backend is unavailable', () => {
    const genericSearchModel = getSelectableModels().find(
      (model) =>
        model.capabilities.tools === true && providerSupportsWebSearch(model.provider) === false,
    );
    expect(genericSearchModel, 'registry must keep a generic-search test model').toBeDefined();
    useModelStore.getState().setSelectedModelId(genericSearchModel!.id);
    useBillingStore.setState({
      featureFlags: {
        beta_features: originalFeatureFlags?.beta_features ?? false,
        advanced_model_access: originalFeatureFlags?.advanced_model_access ?? false,
        ...originalFeatureFlags,
        generic_web_search: false,
      },
    });

    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));

    expect(screen.getByRole('button', { name: /web search/i })).toBeDisabled();
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

    // Open the overflow menu to reveal sub-components
    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Connectors')).toBeInTheDocument();
    expect(screen.getByText('Plugins')).toBeInTheDocument();
  });

  it('plus-menu entries open the settings modal at their pane (no inline lists, no fake toggles)', () => {
    // Founder directive 2026-07-10: Skills/Connectors/Plugins in the plus-menu
    // are ENTRY POINTS into the settings modal — the lists live in the modal
    // panes, never inline in the composer. Also honest-UI: no connect toggles
    // implying a mid-chat capability that does not exist.
    chatComposerMocks.openSettings.mockClear();
    render(<ChatComposerNew onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    fireEvent.click(screen.getByText('Connectors'));
    expect(chatComposerMocks.openSettings).toHaveBeenLastCalledWith('connectors');

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    fireEvent.click(screen.getByText('Skills'));
    expect(chatComposerMocks.openSettings).toHaveBeenLastCalledWith('skills');

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    fireEvent.click(screen.getByText('Plugins'));
    expect(chatComposerMocks.openSettings).toHaveBeenLastCalledWith('plugins');

    // The old placements are gone: no legacy <a> routes, no inline skills
    // flyout search box, no connector toggle switches.
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(screen.getByText('Connectors').closest('a')).toBeNull();
    expect(screen.getByText('Plugins').closest('a')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /search skills/i })).toBeNull();
    expect(screen.queryByRole('switch', { name: /toggle/i })).toBeNull();
  });

  it('disables Send button when loading', () => {
    render(<ChatComposerNew onSend={vi.fn()} isLoading />);
    // When isLoading, mode='stop' and disabled={false} (stop is always clickable)
    const stopButton = screen.getByRole('button', { name: /send message/i });
    expect(stopButton).toHaveAttribute('data-mode', 'stop');
  });

  it('disables textarea when disabled prop is set', () => {
    render(<ChatComposerNew onSend={vi.fn()} disabled />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeDisabled();
  });

  it('renders the work-mode toggle ONLY when backed by host project data (never disconnected)', () => {
    // Without projectPicker there is no project backing → no Chat/AGI Work
    // toggle (a mode switch that scopes nothing would be a dead control).
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AGI Work' })).not.toBeInTheDocument();
    // Tools no longer sit in the input area as always-present pills.
    expect(screen.queryByRole('button', { name: /toggle web search/i })).not.toBeInTheDocument();
  });

  it('renders the connected Chat | AGI Work segmented toggle when project data is provided', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        projectPicker={{
          projects: [{ id: 'proj-1', name: 'Website Redesign' }],
          activeProjectId: null,
          onSelectProject: vi.fn(),
          onCreateProject: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'AGI Work' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('web search + deep research live inside the + menu (not the input area)', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(screen.getByRole('button', { name: /web search/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deep research/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create office files/i })).toBeInTheDocument();
  });

  it('sends the persistent Office file-creation selection to the server', async () => {
    const toolModel = getSelectableModels().find((model) => model.capabilities.tools === true);
    expect(toolModel, 'the canonical registry must expose a tool-capable model').toBeDefined();
    useModelStore.getState().setSelectedModelId(toolModel!.id);

    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
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

  it('web search is a PERSISTENT toggle — stays on across sends (not fire-once)', async () => {
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

    // Turn Web search on via the + menu.
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    fireEvent.click(screen.getByRole('button', { name: /web search/i }));

    const textarea = screen.getByRole('textbox', { name: /message input/i });

    // First send carries webSearchEnabled: true.
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

    // Second send must STILL carry webSearchEnabled: true (fire-once would reset it).
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
    // The picker is only rendered when the host passes REAL project data
    // (WebChatPage supplies useManagedCloudProjects rows) — the selection is
    // threaded into createConversation as projectId, so it is never cosmetic.
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

    /** The chip lives BELOW the composer and only renders in AGI Work mode. */
    function enterAgiWork() {
      fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    }

    it('is absent when the host provides no project data (no cosmetic control)', () => {
      render(<ChatComposerNew onSend={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Project or folder' })).not.toBeInTheDocument();
    });

    it('is hidden in Chat mode and appears below the composer in AGI Work mode', () => {
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={makePicker()} />);
      expect(screen.queryByRole('button', { name: 'Project or folder' })).not.toBeInTheDocument();
      enterAgiWork();
      expect(screen.getByRole('button', { name: 'Project or folder' })).toBeInTheDocument();
    });

    it('opens a searchable popover listing the real projects', () => {
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={makePicker()} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      expect(screen.getByRole('textbox', { name: /search projects/i })).toBeInTheDocument();
      expect(screen.getByText('Website Redesign')).toBeInTheDocument();
      expect(screen.getByText('Mobile App')).toBeInTheDocument();
    });

    it('filters the project list as the user searches', async () => {
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={makePicker()} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      await userEvent.type(screen.getByRole('textbox', { name: /search projects/i }), 'mobile');
      expect(screen.queryByText('Website Redesign')).not.toBeInTheDocument();
      expect(screen.getByText('Mobile App')).toBeInTheDocument();
    });

    it('selecting a project reports its projectId to the host (the value threaded into createConversation)', () => {
      const picker = makePicker();
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      fireEvent.click(screen.getByText('Mobile App'));
      expect(picker.onSelectProject).toHaveBeenCalledWith('proj-2');
    });

    it('a preselected project (URL entry) auto-enters AGI Work and shows the project on the chip', () => {
      const picker = makePicker({ activeProjectId: 'proj-1' });
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker} />);
      // No manual toggle click: the preselected project flips the mode itself.
      expect(screen.getByRole('button', { name: 'AGI Work' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Project or folder' })).toHaveTextContent(
        'Website Redesign',
      );
      fireEvent.click(screen.getByRole('button', { name: /clear project or folder selection/i }));
      expect(picker.onSelectProject).toHaveBeenCalledWith(null);
    });

    it('switching back to Chat clears the project selection (no hidden scope)', () => {
      const picker = makePicker({ activeProjectId: 'proj-1' });
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker} />);
      fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(picker.onSelectProject).toHaveBeenCalledWith(null);
      expect(screen.queryByRole('button', { name: 'Project or folder' })).not.toBeInTheDocument();
    });

    it('offers Create new project (opens the host CreateProjectDialog)', () => {
      const picker = makePicker();
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      fireEvent.click(screen.getByText('Create new project'));
      expect(picker.onCreateProject).toHaveBeenCalledTimes(1);
    });

    it('does NOT offer local-folder selection on web (working-directory is a desktop capability)', () => {
      render(<ChatComposerNew onSend={vi.fn()} projectPicker={makePicker()} />);
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      expect(screen.queryByText('Choose a different folder')).not.toBeInTheDocument();
    });

    it('offers "Choose a different folder" only on working-directory surfaces (desktop)', () => {
      render(
        <CapabilityProvider platform="desktop">
          <ChatComposerNew onSend={vi.fn()} projectPicker={makePicker()} />
        </CapabilityProvider>,
      );
      enterAgiWork();
      fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
      expect(screen.getByText('Choose a different folder')).toBeInTheDocument();
    });
  });
});
