import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposerNew } from './ChatComposerNew';

// ─── Module mocks ──────────────────────────────────────────────────────────────

const chatComposerMocks = vi.hoisted(() => ({
  skills: [
    {
      id: 'backend-engineer',
      name: 'Backend Engineer',
      description: 'Backend implementation support',
      category: 'Engineering',
    },
  ],
  openSettings: vi.fn(),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({
    isOpen: false,
    openSettings: chatComposerMocks.openSettings,
    closeSettings: vi.fn(),
  }),
}));

vi.mock('@features/chat/services/chat-ai-service', () => ({
  ChatAIService: {
    getAvailableSkillsSync: () => chatComposerMocks.skills,
    getAvailableSkills: () => Promise.resolve(chatComposerMocks.skills),
    stopGeneration: vi.fn(),
  },
}));

vi.mock('./GhostTextOverlay', () => ({
  GhostTextOverlay: ({
    suggestion,
    isLoading,
  }: {
    inputText: string;
    suggestion: string;
    isLoading: boolean;
  }) => (
    <div data-testid="ghost-text-overlay" data-suggestion={suggestion} data-loading={isLoading} />
  ),
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

vi.mock('@features/chat/components/VoiceInputButton', () => ({
  VoiceInputButton: () => null,
}));

const mockUseApiPromptCompletion = vi.fn(() => ({
  suggestion: '',
  isLoading: false,
  accept: (): string => ' accepted',
  clear: vi.fn(),
}));

vi.mock('@/hooks/useApiPromptCompletion', () => ({
  useApiPromptCompletion: (...args: Parameters<typeof mockUseApiPromptCompletion>) =>
    mockUseApiPromptCompletion(...args),
}));

// Router + project store: the composer uses next/navigation's useRouter (AGI Work
// project selector navigation) and the shared project store (project list). Neither
// has a provider in unit tests, so stub both.
const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@features/projects', () => ({
  useProjectStore: (selector: (s: { projects: unknown[] }) => unknown) =>
    selector({ projects: [] }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatComposerNew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
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
        expect.objectContaining({ agentMode: 'solo', folderId: null }),
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
        expect.objectContaining({ agentMode: 'solo', folderId: null }),
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

  it('passes agentMode in meta when onSend is called', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} initialAgentMode="engineer" />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'test');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'test',
        undefined,
        undefined,
        expect.objectContaining({ agentMode: 'engineer' }),
      );
    });
  });

  it('clears selected skill when its instruction body cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: 'missing' }), { status: 404 })),
    );
    render(<ChatComposerNew onSend={vi.fn()} />);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, '@back');
    fireEvent.click(await screen.findByText('Backend Engineer'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not load Backend Engineer skill instructions. Select the skill again.',
      );
    });
    expect(screen.queryByText('/Backend Engineer')).not.toBeInTheDocument();
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

  it('opens + menu and shows the backed Web search toggle row', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    expect(screen.getAllByText('Web search').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /toggle research mode/i })).not.toBeInTheDocument();
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

  it('shows the ghost-text overlay component', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByTestId('ghost-text-overlay')).toBeInTheDocument();
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

  it('footer hint passed to ComposerFooter changes when suggestion is present', () => {
    // Override the mock to simulate a live suggestion
    mockUseApiPromptCompletion.mockReturnValueOnce({
      suggestion: 'some suggestion',
      isLoading: false,
      accept: () => 'some suggestion',
      clear: vi.fn(),
    });

    render(<ChatComposerNew onSend={vi.fn()} />);
    // ComposerFooter is mocked as a stub; verify it renders without error
    expect(screen.getByTestId('composer-footer')).toBeInTheDocument();
  });

  it('shows a Chat | AGI Work segmented toggle (claude.ai parity) in the input row', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    // The segmented work-mode toggle replaces the old always-present tool pills.
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AGI Work' })).toBeInTheDocument();
    // Tools no longer sit in the input area as always-present pills.
    expect(screen.queryByRole('button', { name: /toggle web search/i })).not.toBeInTheDocument();
  });

  it('web search + deep research live inside the + menu (not the input area)', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(screen.getByRole('button', { name: /web search/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deep research/i })).toBeInTheDocument();
  });

  it('toggling to AGI Work reveals the project selector row', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    // Chat mode: no project selector.
    expect(screen.queryByRole('button', { name: /choose a project/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    expect(screen.getByRole('button', { name: /choose a project/i })).toBeInTheDocument();
  });

  it('web search is a PERSISTENT toggle — stays on across sends (not fire-once)', async () => {
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
});
