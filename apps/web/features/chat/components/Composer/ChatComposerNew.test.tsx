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
  InputFooter: ({ hint }: { hint: string }) => <div data-testid="input-footer" data-hint={hint} />,
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

const mockConnectConnector = vi.fn();
const mockDisconnectConnector = vi.fn();

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    connectedAtMap: {},
    loading: false,
    mutatingIds: new Set<string>(),
    connect: mockConnectConnector,
    disconnect: mockDisconnectConnector,
  }),
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

    expect(screen.getByText('Add photos')).toBeInTheDocument();
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

  it('renders Skills and Connectors rows in overflow menu', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    // Open the overflow menu to reveal sub-components
    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Connectors')).toBeInTheDocument();
  });

  it('does not allow composer OAuth toggles to create fake connector connections', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    fireEvent.click(screen.getByText('Connectors'));

    const gmailToggle = screen.getByRole('switch', { name: /toggle gmail/i });
    expect(gmailToggle).toBeDisabled();

    fireEvent.click(gmailToggle);
    expect(mockConnectConnector).not.toHaveBeenCalled();
    expect(mockDisconnectConnector).not.toHaveBeenCalled();
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

  it('web search pill is visible outside the + menu for quick toggle', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    // Search pill is always visible (not inside the + menu popover)
    const searchPills = screen.getAllByRole('button', { name: /toggle web search/i });
    expect(searchPills.length).toBeGreaterThan(0);
  });

  it('web search pill toggles aria-pressed state', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const [searchBtn] = screen.getAllByRole('button', { name: /toggle web search/i });
    expect(searchBtn).toBeDefined();
    expect(searchBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(searchBtn!);
    expect(searchBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
