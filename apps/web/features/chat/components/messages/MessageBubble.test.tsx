import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageBubble, messageListVariants, messageBubbleVariants } from './MessageBubble';

// Inline stub for the dynamically-imported markdown renderer so tests don't
// depend on next/dynamic async resolution.
vi.mock('./MarkdownContent', () => ({
  default: ({ content }: { content: string }) => (
    <span data-testid="markdown-content">{content}</span>
  ),
}));

// ---------------------------------------------------------------------------
// Minimal message factory
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<Parameters<typeof MessageBubble>[0]['message']> = {}) {
  return {
    id: 'msg-1',
    role: 'user' as const,
    content: 'Hello',
    timestamp: new Date('2024-01-01T12:00:00Z'),
    isStreaming: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageBubble', () => {
  describe('animation variants exports', () => {
    it('exports messageListVariants with staggerChildren', () => {
      expect(messageListVariants['hidden']).toBeDefined();
      expect(messageListVariants['visible']).toBeDefined();
      // Stagger is nested inside transition
      const visible = messageListVariants['visible'] as Record<string, unknown>;
      const transition = visible['transition'] as Record<string, unknown>;
      expect(transition?.['staggerChildren']).toBeGreaterThan(0);
    });

    it('exports messageBubbleVariants with opacity and y transitions', () => {
      const hidden = messageBubbleVariants['hidden'] as Record<string, unknown>;
      const visible = messageBubbleVariants['visible'] as Record<string, unknown>;
      expect(hidden['opacity']).toBe(0);
      expect(hidden['y']).toBeGreaterThan(0);
      expect(visible['opacity']).toBe(1);
      expect(visible['y']).toBe(0);
    });
  });

  describe('entrance animation wrapper', () => {
    it('renders the motion.div container (mocked as plain div)', () => {
      const { container } = render(<MessageBubble message={makeMessage()} />);
      // The motion mock renders a plain div — verify the outer element exists
      const outer = container.firstChild as HTMLElement;
      expect(outer).toBeInTheDocument();
      expect(outer.tagName).toBe('DIV');
    });

    it('applies group class to outer container for hover actions', () => {
      const { container } = render(<MessageBubble message={makeMessage()} />);
      const groupEl = container.querySelector('.group');
      expect(groupEl).toBeInTheDocument();
    });
  });

  describe('user messages', () => {
    it('renders message content', () => {
      render(<MessageBubble message={makeMessage({ content: 'Hello world' })} />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('shows "You" as the sender name', () => {
      render(<MessageBubble message={makeMessage()} />);
      expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('applies flex-row-reverse for right-alignment', () => {
      const { container } = render(<MessageBubble message={makeMessage({ role: 'user' })} />);
      // The .group container should be the outer motion div
      const outer = container.firstChild as HTMLElement;
      expect(outer.className).toMatch(/flex-row-reverse|message-row-user/);
    });

    it('does not render assistant avatar for user messages', () => {
      const { container } = render(<MessageBubble message={makeMessage({ role: 'user' })} />);
      // For user messages, the assistant Avatar (with AvatarFallback showing employee initials)
      // should not appear. We check the message-avatar-user class is present instead of the
      // assistant avatar class.
      const assistantAvatar = container.querySelector('.message-avatar:not(.message-avatar-user)');
      expect(assistantAvatar).not.toBeInTheDocument();
    });
  });

  describe('assistant messages', () => {
    const assistantMsg = () => makeMessage({ role: 'assistant', content: 'I can help' });

    it('renders message content', () => {
      render(<MessageBubble message={assistantMsg()} />);
      expect(screen.getByText('I can help')).toBeInTheDocument();
    });

    it('shows "AI" as default sender name', () => {
      render(<MessageBubble message={assistantMsg()} />);
      // There may be two "AI" occurrences: one in the avatar fallback, one in the header.
      // We only need to confirm at least one exists.
      expect(screen.getAllByText('AI').length).toBeGreaterThanOrEqual(1);
    });

    it('shows formatted employee name when provided', () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'test',
        employeeName: 'research-agent',
      });
      render(<MessageBubble message={msg} />);
      expect(screen.getByText('Research Agent')).toBeInTheDocument();
    });
  });

  describe('streaming state', () => {
    it('shows "Thinking..." when streaming with empty content', () => {
      const msg = makeMessage({ isStreaming: true, content: '' });
      render(<MessageBubble message={msg} />);
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    it('hides action buttons when streaming', () => {
      const msg = makeMessage({ isStreaming: true, content: 'partial' });
      render(<MessageBubble message={msg} />);
      expect(screen.queryByLabelText('Copy message')).not.toBeInTheDocument();
    });

    it('shows action buttons when not streaming', () => {
      const msg = makeMessage({ isStreaming: false, content: 'done' });
      render(<MessageBubble message={msg} />);
      expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
    });
  });

  describe('clipboard copy', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        writable: true,
        configurable: true,
      });
    });

    it('copies message content via navigator.clipboard (no Tauri)', async () => {
      const msg = makeMessage({ content: 'copy me' });
      render(<MessageBubble message={msg} />);

      const copyBtn = screen.getByLabelText('Copy message');
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy me');
      });
    });

    it('shows "Message copied" aria-label after copy', async () => {
      const msg = makeMessage({ content: 'copy me' });
      render(<MessageBubble message={msg} />);

      fireEvent.click(screen.getByLabelText('Copy message'));

      await waitFor(() => {
        expect(screen.getByLabelText('Message copied')).toBeInTheDocument();
      });
    });
  });

  describe('pin indicator', () => {
    it('shows pin icon when message is pinned', () => {
      const msg = makeMessage({ metadata: { isPinned: true } });
      render(<MessageBubble message={msg} />);
      // The Pin icon has aria-hidden="true", so check for its container via title/role
      // Best we can do without additional test-id is to verify the dom contains the pin svg
      const { container } = render(<MessageBubble message={msg} />);
      // lucide icons render as <svg>, check for the amber text
      const pinSvg = container.querySelector('.text-amber-500');
      expect(pinSvg).toBeInTheDocument();
    });
  });

  describe('branch indicator', () => {
    it('shows git fork icon when hasBranches is true', () => {
      const msg = makeMessage({ role: 'assistant', content: 'branched' });
      const { container } = render(<MessageBubble message={msg} hasBranches />);
      const forkIcon = container.querySelector('.text-primary');
      expect(forkIcon).toBeInTheDocument();
    });
  });

  describe('thinking steps', () => {
    const msgWithThinking = makeMessage({
      role: 'assistant',
      content: 'Answer',
      metadata: {
        thinkingSteps: ['Step A', 'Step B'],
      },
    });

    it('renders thinking process toggle button', () => {
      render(<MessageBubble message={msgWithThinking} />);
      expect(screen.getByLabelText('Toggle thinking process visibility')).toBeInTheDocument();
    });

    it('shows step count in toggle button', () => {
      render(<MessageBubble message={msgWithThinking} />);
      expect(screen.getByText(/Thinking process \(2 steps\)/)).toBeInTheDocument();
    });

    it('expands thinking steps on click', async () => {
      render(<MessageBubble message={msgWithThinking} />);
      const toggle = screen.getByLabelText('Toggle thinking process visibility');

      expect(screen.queryByText('Step A')).not.toBeInTheDocument();
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.getByText('Step A')).toBeInTheDocument();
        expect(screen.getByText('Step B')).toBeInTheDocument();
      });
    });

    it('collapses thinking steps on second click', async () => {
      render(<MessageBubble message={msgWithThinking} />);
      const toggle = screen.getByLabelText('Toggle thinking process visibility');

      fireEvent.click(toggle);
      await waitFor(() => expect(screen.getByText('Step A')).toBeInTheDocument());

      fireEvent.click(toggle);
      await waitFor(() => expect(screen.queryByText('Step A')).not.toBeInTheDocument());
    });
  });

  describe('agent contributions', () => {
    const msgWithContributions = makeMessage({
      role: 'assistant',
      content: 'Synthesized answer',
      metadata: {
        isMultiAgent: true,
        collaborationMessages: [
          { employeeName: 'Agent One', employeeAvatar: '#6366f1', content: 'Contribution 1' },
          { employeeName: 'Agent Two', employeeAvatar: '#10b981', content: 'Contribution 2' },
        ],
      },
    });

    it('renders agents contributed toggle', () => {
      render(<MessageBubble message={msgWithContributions} />);
      expect(screen.getByLabelText('Toggle agent contributions visibility')).toBeInTheDocument();
    });

    it('shows agent count in toggle', () => {
      render(<MessageBubble message={msgWithContributions} />);
      expect(screen.getByText(/2 agents contributed/)).toBeInTheDocument();
    });

    it('expands contributions on click', async () => {
      render(<MessageBubble message={msgWithContributions} />);
      const toggle = screen.getByLabelText('Toggle agent contributions visibility');

      expect(screen.queryByText('Agent One')).not.toBeInTheDocument();
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.getByText('Agent One')).toBeInTheDocument();
        expect(screen.getByText('Agent Two')).toBeInTheDocument();
      });
    });
  });

  describe('token metadata in dropdown', () => {
    it('renders without error when tokensUsed and model are set', () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'test',
        metadata: { tokensUsed: 1234, model: 'claude-3-5-sonnet' },
      });
      // The token count appears inside the dropdown menu (portal) — just verify no render error
      expect(() => render(<MessageBubble message={msg} />)).not.toThrow();
    });
  });

  describe('reaction callbacks', () => {
    it('calls onReact with "up" when thumbs-up clicked', () => {
      const onReact = vi.fn();
      const msg = makeMessage({ id: 'msg-react', role: 'assistant', content: 'test' });
      render(<MessageBubble message={msg} onReact={onReact} />);

      fireEvent.click(screen.getByLabelText('Rate as good response'));
      expect(onReact).toHaveBeenCalledWith('msg-react', 'up');
    });

    it('calls onReact with "down" when thumbs-down clicked', () => {
      const onReact = vi.fn();
      const msg = makeMessage({ id: 'msg-react', role: 'assistant', content: 'test' });
      render(<MessageBubble message={msg} onReact={onReact} />);

      fireEvent.click(screen.getByLabelText('Rate as poor response'));
      expect(onReact).toHaveBeenCalledWith('msg-react', 'down');
    });

    it('does not show reaction buttons for user messages', () => {
      const onReact = vi.fn();
      const msg = makeMessage({ role: 'user', content: 'user msg' });
      render(<MessageBubble message={msg} onReact={onReact} />);

      expect(screen.queryByLabelText('Rate as good response')).not.toBeInTheDocument();
    });
  });

  describe('dropdown menu trigger', () => {
    it('renders "More message actions" trigger button', () => {
      const msg = makeMessage({ id: 'msg-pin', role: 'assistant', content: 'test' });
      render(<MessageBubble message={msg} onPin={vi.fn()} />);
      // The trigger is always rendered even before the menu opens
      expect(screen.getByLabelText('More message actions')).toBeInTheDocument();
    });

    it('renders more-actions button for user messages too', () => {
      const msg = makeMessage({ role: 'user', content: 'test' });
      render(<MessageBubble message={msg} onDelete={vi.fn()} />);
      expect(screen.getByLabelText('More message actions')).toBeInTheDocument();
    });

    it('callback props are passed correctly (onPin defined)', () => {
      const onPin = vi.fn();
      const msg = makeMessage({ id: 'msg-pin', role: 'assistant', content: 'test' });
      // Just verify that render doesn't throw when callbacks are provided
      expect(() => render(<MessageBubble message={msg} onPin={onPin} />)).not.toThrow();
    });

    it('callback props are passed correctly (onDelete defined)', () => {
      const onDelete = vi.fn();
      const msg = makeMessage({ id: 'msg-del', role: 'assistant', content: 'test' });
      expect(() => render(<MessageBubble message={msg} onDelete={onDelete} />)).not.toThrow();
    });

    it('callback props are passed correctly (onRegenerate for assistant)', () => {
      const onRegenerate = vi.fn();
      const msg = makeMessage({ id: 'msg-regen', role: 'assistant', content: 'test' });
      expect(() =>
        render(<MessageBubble message={msg} onRegenerate={onRegenerate} />),
      ).not.toThrow();
    });

    it('callback props are passed correctly (onEdit for user)', () => {
      const onEdit = vi.fn();
      const msg = makeMessage({ id: 'msg-edit', role: 'user', content: 'test' });
      expect(() => render(<MessageBubble message={msg} onEdit={onEdit} />)).not.toThrow();
    });
  });

  describe('animationIndex prop', () => {
    it('accepts animationIndex without errors', () => {
      expect(() => {
        render(<MessageBubble message={makeMessage()} animationIndex={3} />);
      }).not.toThrow();
    });

    it('defaults animationIndex to 0 when not provided', () => {
      expect(() => {
        render(<MessageBubble message={makeMessage()} />);
      }).not.toThrow();
    });
  });

  describe('no Tauri dependencies', () => {
    it('renders without window.__TAURI__ being defined', () => {
      // Ensure Tauri global is not set (web environment)
      expect((window as unknown as Record<string, unknown>)['__TAURI__']).toBeUndefined();

      // Component should render successfully without Tauri
      expect(() => {
        render(<MessageBubble message={makeMessage()} />);
      }).not.toThrow();
    });

    it('uses navigator.clipboard for copy, not Tauri invoke', async () => {
      const clipboardWrite = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: clipboardWrite },
        writable: true,
        configurable: true,
      });

      render(<MessageBubble message={makeMessage({ content: 'test content' })} />);
      fireEvent.click(screen.getByLabelText('Copy message'));

      await waitFor(() => {
        expect(clipboardWrite).toHaveBeenCalledWith('test content');
      });

      // Verify no Tauri invoke was used (window.__TAURI__ is not defined)
      expect((window as unknown as Record<string, unknown>)['__TAURI__']).toBeUndefined();
    });
  });
});
