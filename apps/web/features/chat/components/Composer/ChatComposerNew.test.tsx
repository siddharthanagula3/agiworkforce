import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposerNew } from './ChatComposerNew';

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@features/chat/services/chat-ai-service', () => ({
  ChatAIService: {
    getAvailableSkillsSync: () => [],
    getAvailableSkills: () => Promise.resolve([]),
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

vi.mock('./AgentModeSwitcher', () => ({
  AgentModeSwitcher: ({
    mode,
    onChange,
  }: {
    mode: string;
    onChange: (m: string) => void;
    disabled?: boolean;
  }) => (
    <button data-testid="agent-mode-switcher" onClick={() => onChange('engineer')}>
      {mode}
    </button>
  ),
}));

vi.mock('./FolderContextSelector', () => ({
  FolderContextSelector: ({
    selectedFolderId,
    onChange,
  }: {
    selectedFolderId: string | null;
    onChange: (id: string | null) => void;
    disabled?: boolean;
  }) => (
    <button
      data-testid="folder-context-selector"
      data-selected={selectedFolderId ?? 'none'}
      onClick={() => onChange('folder-1')}
    >
      Folder
    </button>
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

vi.mock('./FocusModeButtons', () => ({
  FocusModeButtons: () => null,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatComposerNew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the message textarea', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeInTheDocument();
  });

  it('calls onSend with typed message on Enter', async () => {
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
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'test',
        undefined,
        undefined,
        expect.objectContaining({ agentMode: 'engineer' }),
      );
    });
  });

  it('updates agentMode when AgentModeSwitcher calls onChange', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    // Open the overflow menu first to reveal AgentModeSwitcher
    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    // Click our mocked AgentModeSwitcher which calls onChange('engineer')
    const switcher = screen.getByTestId('agent-mode-switcher');
    fireEvent.click(switcher);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'hi');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'hi',
        undefined,
        undefined,
        expect.objectContaining({ agentMode: 'engineer' }),
      );
    });
  });

  it('passes selected folderId in meta when FolderContextSelector sets one', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    // Open the overflow menu first to reveal FolderContextSelector
    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    // Click mocked FolderContextSelector which calls onChange('folder-1')
    const folderSelector = screen.getByTestId('folder-context-selector');
    fireEvent.click(folderSelector);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'msg');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'msg',
        undefined,
        undefined,
        expect.objectContaining({ folderId: 'folder-1' }),
      );
    });
  });

  it('clears the textarea after sending', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'hello');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('shows the ghost-text overlay component', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByTestId('ghost-text-overlay')).toBeInTheDocument();
  });

  it('renders the agent mode switcher and folder context selector in overflow menu', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    // Open the overflow menu to reveal sub-components
    const moreBtn = screen.getByRole('button', { name: /more options/i });
    fireEvent.click(moreBtn);

    expect(screen.getByTestId('agent-mode-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('folder-context-selector')).toBeInTheDocument();
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

  it('footer hint shows Tab suggestion text when a suggestion is present', () => {
    // Override the mock to simulate a live suggestion
    mockUseApiPromptCompletion.mockReturnValueOnce({
      suggestion: 'some suggestion',
      isLoading: false,
      accept: () => 'some suggestion',
      clear: vi.fn(),
    });

    render(<ChatComposerNew onSend={vi.fn()} />);
    const footer = screen.getByTestId('input-footer');
    expect(footer.getAttribute('data-hint')).toContain('Tab to accept');
  });

  it('renders the thinking toggle button', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /toggle extended thinking/i })).toBeInTheDocument();
  });

  it('thinking toggle starts off (aria-pressed=false)', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /toggle extended thinking/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking thinking toggle sets aria-pressed=true', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /toggle extended thinking/i });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('passes thinkingEnabled=true in meta when toggle is on and message is sent', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    const thinkingBtn = screen.getByRole('button', { name: /toggle extended thinking/i });
    fireEvent.click(thinkingBtn);

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'think hard');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSendMock).toHaveBeenCalledWith(
        'think hard',
        undefined,
        undefined,
        expect.objectContaining({ thinkingEnabled: true }),
      );
    });
  });

  it('resets thinkingEnabled to false after send', async () => {
    const onSendMock = vi.fn();
    render(<ChatComposerNew onSend={onSendMock} />);

    const thinkingBtn = screen.getByRole('button', { name: /toggle extended thinking/i });
    fireEvent.click(thinkingBtn);
    expect(thinkingBtn).toHaveAttribute('aria-pressed', 'true');

    const textarea = screen.getByRole('textbox', { name: /message input/i });
    await userEvent.type(textarea, 'hello');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(thinkingBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
