import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  getModelMetadataById,
  getModels,
  isExecutableImageModel,
  isModelLive,
} from '@agiworkforce/types';
import { MessageBubble, messageListVariants, messageBubbleVariants } from './MessageBubble';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useChatStore } from '@shared/stores/web-chat-store';

const IMAGE_MODEL_ID = getModels({
  modelTypes: ['image'],
  requireCapabilities: { imageGen: true },
}).find(isExecutableImageModel)?.id;
const CHAT_MODEL_ID = getModels({ requireCapabilities: { streaming: true } }).find(
  (model) => isModelLive(model) && model.modelType !== 'image' && model.modelType !== 'video',
)?.id;

if (!IMAGE_MODEL_ID || !CHAT_MODEL_ID) {
  throw new Error('The canonical model catalog must expose live chat and image fixtures');
}

// Inline stub for the dynamically-imported markdown renderer so tests don't
// depend on next/dynamic async resolution. importOriginal preserves every
// other @agiworkforce/unified-chat export this file's import graph needs.
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <span data-testid="markdown-content">{content}</span>
    ),
  };
});

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
      // The motion mock renders a plain div · verify the outer element exists
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

    it('renders the user message inside a right-aligned bubble', () => {
      const { container } = render(<MessageBubble message={makeMessage({ content: 'Hi' })} />);
      // User content lives in the .user-bubble pill (ChatGPT/Claude pattern).
      expect(container.querySelector('.user-bubble')).toBeInTheDocument();
    });

    it('applies flex-row-reverse for right-alignment', () => {
      const { container } = render(<MessageBubble message={makeMessage({ role: 'user' })} />);
      // The .group container should be the outer motion div
      const outer = container.firstChild as HTMLElement;
      expect(outer.className).toMatch(/flex-row-reverse|message-row-user/);
    });

    it('does not render any avatar (flat ChatGPT/Claude layout)', () => {
      const { container } = render(<MessageBubble message={makeMessage({ role: 'user' })} />);
      // Neither user nor assistant avatars are rendered in the redesigned bubble.
      expect(container.querySelector('.message-avatar')).not.toBeInTheDocument();
    });
  });

  describe('assistant messages', () => {
    const assistantMsg = () => makeMessage({ role: 'assistant', content: 'I can help' });

    it('renders message content', () => {
      render(<MessageBubble message={assistantMsg()} />);
      expect(screen.getByText('I can help')).toBeInTheDocument();
    });

    it('renders assistant content flat (no user bubble)', () => {
      const { container } = render(<MessageBubble message={assistantMsg()} />);
      // Assistant messages are flat left-aligned prose, never wrapped in .user-bubble.
      expect(container.querySelector('.user-bubble')).not.toBeInTheDocument();
      expect(screen.getByText('I can help')).toBeInTheDocument();
    });

    it('renders provider-managed code execution progress without a duplicate thinking state', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            isStreaming: true,
            metadata: { isExecutingCode: true },
          })}
        />,
      );

      expect(screen.getByText('Code Execution')).toBeInTheDocument();
      expect(screen.getByText('Running Python…')).toBeInTheDocument();
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    });

    it('renders persisted stdout, stderr, exit status, and plot output', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            metadata: {
              codeExecutionResult: {
                stdout: '42',
                stderr: 'warning',
                returnCode: 2,
                images: [{ mediaType: 'image/png', data: 'cG5n' }],
              },
            },
          })}
        />,
      );

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('warning')).toBeInTheDocument();
      expect(screen.getByText('Exit code: 2')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Code execution output 1' })).toHaveAttribute(
        'src',
        'data:image/png;base64,cG5n',
      );
    });

    it('does not render execution images with unsafe media types', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            metadata: {
              codeExecutionResult: {
                stdout: '',
                stderr: '',
                returnCode: 0,
                images: [{ mediaType: 'image/svg+xml', data: 'PHN2Zz48L3N2Zz4=' }],
              },
            },
          })}
        />,
      );

      expect(
        screen.queryByRole('img', { name: 'Code execution output 1' }),
      ).not.toBeInTheDocument();
    });

    it('collapses and expands execution output from its header control', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            metadata: {
              codeExecutionResult: {
                stdout: 'collapsible output',
                stderr: '',
                returnCode: 0,
              },
            },
          })}
        />,
      );

      const toggle = screen.getByRole('button', { name: /Code Execution/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('collapsible output')).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('collapsible output')).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('collapsible output')).toBeInTheDocument();
    });

    it('re-renders when execution progress becomes a result', () => {
      const { rerender } = render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            metadata: { isExecutingCode: true },
          })}
        />,
      );

      expect(screen.getByText('Running Python…')).toBeInTheDocument();

      rerender(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            metadata: {
              isExecutingCode: false,
              codeExecutionResult: {
                stdout: 'finished',
                stderr: '',
                returnCode: 0,
              },
            },
          })}
        />,
      );

      expect(screen.queryByText('Running Python…')).not.toBeInTheDocument();
      expect(screen.getByText('finished')).toBeInTheDocument();
    });

    it('does not repeat sources under the prose that the search tool box already lists', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'A sourced answer.',
            metadata: {
              citations: [
                {
                  title: 'Primary source',
                  url: 'https://example.com/research',
                  cited_text: 'Supporting detail',
                },
              ],
            },
          })}
        />,
      );

      expect(screen.getByText('A sourced answer.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Source 1: Primary source' })).toBeNull();
      expect(screen.queryByRole('link', { name: /https:\/\/example\.com\/research/ })).toBeNull();
    });

    it('uses the image provider progress card without a duplicate Thinking indicator', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            isStreaming: true,
            metadata: {
              toolType: 'image-generation',
              imageGenPrompt: 'Draw a star',
              imageGenAspect: '16:9',
              imageGenModel: IMAGE_MODEL_ID,
            },
          })}
        />,
      );

      expect(screen.getByLabelText('Generating image')).toBeInTheDocument();
      expect(screen.getByText(/waiting for the image provider/i)).toBeInTheDocument();
      expect(screen.queryByText('Thinking...')).toBeNull();
    });

    /**
     * Both video states existed in this component with nothing in the product
     * writing `toolType: 'video-generation'`, so neither was reachable. This
     * asserts the exact metadata transition the composer flow performs
     * (WebChatPage's handleGenerateVideo): the in-flight turn carries the tool
     * type and NO videoUrl, and completion adds videoUrl/thumbnailUrl. If the
     * in-flight patch ever gains a videoUrl, the shimmer is skipped and this
     * fails.
     */
    it('shows the shimmer while a video is in flight and the player once it lands', () => {
      const inFlight = makeMessage({
        role: 'assistant',
        content: '',
        isStreaming: true,
        metadata: { toolType: 'video-generation' },
      });
      const { rerender } = render(<MessageBubble message={inFlight} />);

      expect(screen.getByLabelText('Generating your video')).toBeInTheDocument();
      expect(screen.getByLabelText('Generating your video')).toHaveAttribute('role', 'status');
      expect(screen.queryByText('Your video is ready!')).toBeNull();
      expect(document.querySelector('video')).toBeNull();
      // The shimmer IS the progress indicator; a stacked "Thinking..." would
      // claim a reasoning step that is not happening (same rule as image).
      expect(screen.queryByText('Thinking...')).toBeNull();

      rerender(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            isStreaming: false,
            metadata: {
              toolType: 'video-generation',
              videoUrl: 'https://cdn.example.com/clip.mp4',
              thumbnailUrl: 'https://cdn.example.com/clip.jpg',
            },
          })}
        />,
      );

      expect(screen.queryByLabelText('Generating your video')).toBeNull();
      expect(screen.getByText('Your video is ready!')).toBeInTheDocument();
      const video = document.querySelector('video');
      expect(video).toHaveAttribute('src', 'https://cdn.example.com/clip.mp4');
      expect(video).toHaveAttribute('poster', 'https://cdn.example.com/clip.jpg');
      expect(screen.getByLabelText('Download video')).toHaveAttribute(
        'href',
        'https://cdn.example.com/clip.mp4',
      );
    });

    /**
     * Observed against the live route (503, no video provider key is
     * configured today): the failed turn kept shimmering forever directly
     * above its own failure text, because "no videoUrl" is true for a dead
     * task as well as a live one. The in-flight signal is `isStreaming`.
     */
    it('stops the shimmer once a failed video turn settles', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Video generation failed: Service temporarily unavailable',
            isStreaming: false,
            metadata: { toolType: 'video-generation' },
          })}
        />,
      );

      expect(screen.queryByLabelText('Generating your video')).toBeNull();
      expect(
        screen.getByText(/Video generation failed: Service temporarily unavailable/),
      ).toBeInTheDocument();
    });

    it('offers status resumption when a durable video outlives the client observation window', () => {
      const onResumeVideo = vi.fn();

      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            isStreaming: false,
            metadata: {
              toolType: 'video-generation',
              videoTaskId: '11111111-1111-4111-8111-111111111111',
              videoStatus: 'processing',
              videoProgress: 42,
            },
          })}
          onResumeVideo={onResumeVideo}
        />,
      );

      expect(screen.queryByLabelText('Generating your video')).toBeNull();
      expect(screen.getByText('Your video is still being generated')).toBeInTheDocument();
      expect(screen.getByText(/42% complete/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Resume checking' }));
      expect(onResumeVideo).toHaveBeenCalledOnce();
      expect(onResumeVideo).toHaveBeenCalledWith('msg-1');
    });

    it('uses a video-specific retry only for a terminally failed durable task', () => {
      const onRetryVideo = vi.fn();
      const onRegenerate = vi.fn();

      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Video generation failed: provider rejected the request',
            isStreaming: false,
            metadata: {
              toolType: 'video-generation',
              videoTaskId: '11111111-1111-4111-8111-111111111111',
              videoStatus: 'failed',
              videoRetryable: true,
            },
          })}
          onRegenerate={onRegenerate}
          onRetryVideo={onRetryVideo}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Try video again' }));
      expect(onRetryVideo).toHaveBeenCalledOnce();
      expect(onRetryVideo).toHaveBeenCalledWith('msg-1');
      expect(onRegenerate).not.toHaveBeenCalled();
    });

    it('keeps an unbound legacy video failure non-replayable', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Video start response was interrupted.',
            isStreaming: false,
            metadata: {
              toolType: 'video-generation',
              videoStatus: 'failed',
            },
          })}
          onRegenerate={vi.fn()}
          onRetryVideo={vi.fn()}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try video again' })).toBeNull();
      expect(screen.getByText(/older attempt cannot be replayed safely/i)).toBeInTheDocument();
    });

    it('does not show a persisted unbound placeholder as an endlessly queued provider task after reload', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '\u200B',
            isStreaming: false,
            metadata: {
              toolType: 'video-generation',
              videoStatus: 'queued',
            },
          })}
          onResumeVideo={vi.fn()}
        />,
      );

      expect(screen.queryByLabelText('Generating your video')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Resume checking' })).toBeNull();
      expect(screen.getByText('Video start was not confirmed')).toBeInTheDocument();
      expect(screen.getByText(/you can safely try again/i)).toBeInTheDocument();
    });

    it('renders assistant tool activity in the compact timeline', async () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'I searched the docs.',
        metadata: {
          tools: [{ id: 'tool-1', name: 'web_search', status: 'completed', durationMs: 120 }],
        },
      });

      render(<MessageBubble message={msg} />);

      // web_search maps to the "Searched the web" action phrase in the compact summary
      expect(screen.getByText(/searched the web/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /toggle tool timeline/i }));

      await waitFor(() => {
        // web_search is humanized to "Web search" (no query args on this tool entry)
        expect(screen.getByText('Web search')).toBeInTheDocument();
      });
    });

    it('prefers one canonical inline agent spine over the duplicate legacy tool timeline', () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'Verified answer.',
        metadata: {
          agentActivity: {
            schemaVersion: 1,
            sessionId: 'session-1',
            turnId: 'turn-1',
            lastSequence: 2,
            status: 'running',
            startedAtMs: 1_000,
            updatedAtMs: 1_500,
            entries: [
              {
                kind: 'tool',
                id: 'tool:search-1',
                toolCallId: 'search-1',
                name: 'web_search',
                category: 'web-search',
                summary: 'Searching official sources',
                status: 'running',
                input: { query: 'official docs' },
                startedAtMs: 1_100,
              },
            ],
          },
          tools: [{ id: 'legacy-search', name: 'web_search', status: 'completed' }],
        },
      });

      render(<MessageBubble message={msg} />);

      // The canonical agent-activity spine renders as a "…agent activity" toggle
      // (Show when collapsed, Hide when the run is live/open) inside a section.
      const activityTrigger = screen.getByRole('button', { name: /agent activity/i });
      expect(activityTrigger).toBeInTheDocument();
      // A running activity is open, so its tool entry is visible in the spine
      // (shown both in the toggle summary and the expanded entry body).
      expect(screen.getAllByText('Searching official sources').length).toBeGreaterThan(0);
      // The duplicate legacy tool timeline must NOT also render.
      expect(screen.queryByRole('button', { name: /toggle tool timeline/i })).toBeNull();
    });

    it('keeps a real legacy search action when the canonical envelope has no tool entries', () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'Verified answer.',
        metadata: {
          agentActivity: {
            schemaVersion: 1,
            sessionId: 'session-1',
            turnId: 'turn-1',
            lastSequence: 2,
            status: 'completed',
            startedAtMs: 1_000,
            updatedAtMs: 1_500,
            completedAtMs: 1_500,
            entries: [],
          },
          tools: [{ id: 'search-action', name: 'web_search', status: 'completed' }],
        },
      });

      render(<MessageBubble message={msg} />);

      expect(screen.getByText(/searched the web/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /toggle tool timeline/i })).toBeInTheDocument();
    });

    it('reads a completed assistant response aloud through the list-owned controller', async () => {
      const user = userEvent.setup();
      const onReadAloud = vi.fn();
      const msg = assistantMsg();

      render(<MessageBubble message={msg} isReadAloudSupported onReadAloud={onReadAloud} />);

      await user.click(screen.getByLabelText('More message actions'));
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Read message aloud' }));
      expect(onReadAloud).toHaveBeenCalledWith(msg.id, msg.content);
    });

    it('shows an honest stop action only for the response currently being read', async () => {
      const user = userEvent.setup();
      const onReadAloud = vi.fn();
      const msg = assistantMsg();

      render(
        <MessageBubble
          message={msg}
          isReadAloudSupported
          isReadingAloud
          onReadAloud={onReadAloud}
        />,
      );

      await user.click(screen.getByLabelText('More message actions'));
      const stopItem = screen.getByRole('menuitemcheckbox', { name: 'Stop reading message' });
      expect(stopItem).toHaveAttribute('aria-checked', 'true');
      await user.click(stopItem);
      expect(onReadAloud).toHaveBeenCalledWith(msg.id, msg.content);
    });

    it('does not offer read aloud to user messages or unsupported browsers', async () => {
      const user = userEvent.setup();
      const onReadAloud = vi.fn();
      const { rerender } = render(
        <MessageBubble
          message={makeMessage({ role: 'user' })}
          isReadAloudSupported
          onReadAloud={onReadAloud}
        />,
      );

      await user.click(screen.getByLabelText('More message actions'));
      expect(screen.queryByRole('menuitemcheckbox', { name: 'Read message aloud' })).toBeNull();
      await user.keyboard('{Escape}');

      rerender(<MessageBubble message={assistantMsg()} onReadAloud={onReadAloud} />);
      await user.click(screen.getByLabelText('More message actions'));
      expect(screen.queryByRole('menuitemcheckbox', { name: 'Read message aloud' })).toBeNull();
    });
  });

  describe('streaming state', () => {
    it('shows "Thinking..." when streaming with empty content', () => {
      const msg = makeMessage({ isStreaming: true, content: '' });
      render(<MessageBubble message={msg} />);
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    it('shows a concrete response activity instead of the generic thinking fallback', () => {
      const msg = makeMessage({
        role: 'assistant',
        isStreaming: true,
        content: '',
        metadata: {
          agentActivity: {
            schemaVersion: 1,
            sessionId: 'conversation-1',
            turnId: 'assistant-1',
            lastSequence: -1,
            status: 'running',
            startedAtMs: 1_000,
            updatedAtMs: 1_000,
            entries: [
              {
                kind: 'progress',
                id: 'progress:starting',
                progressId: 'starting',
                summary: 'Generating response',
                status: 'running',
                startedAtMs: 1_000,
              },
            ],
          },
        },
      });

      render(<MessageBubble message={msg} />);

      expect(screen.getAllByText('Generating response').length).toBeGreaterThan(0);
      expect(screen.queryByText('Thinking...')).toBeNull();
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
      const { container } = render(<MessageBubble message={msg} />);
      // lucide icons render as <svg>; the pinned badge carries the amber accent.
      expect(container.querySelector('.text-amber-500')).toBeInTheDocument();
    });
  });

  describe('action row visibility', () => {
    const HOVER_GATE = 'group-hover:opacity-100';

    it('hides the row on an earlier assistant turn until hover or focus', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', content: 'Earlier' })} />);
      const row = screen.getByTestId('message-action-row');
      expect(row).toHaveClass('opacity-0');
      expect(row).toHaveClass(HOVER_GATE);
      expect(row).toHaveClass('group-focus-within:opacity-100');
      expect(row).toHaveClass('flex-nowrap');
    });

    it('keeps the row visible on the latest assistant turn', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', content: 'Latest' })}
          isLatestTurn
        />,
      );
      const row = screen.getByTestId('message-action-row');
      expect(row).toHaveClass('opacity-100');
      expect(row).not.toHaveClass('opacity-0');
    });

    it('hover-gates the user bubble row even on the latest turn and keeps it to edit, copy and more', async () => {
      const user = userEvent.setup();
      const onBranch = vi.fn();
      render(
        <MessageBubble
          message={makeMessage({ id: 'u-1' })}
          onEdit={vi.fn()}
          onBranch={onBranch}
          onPin={vi.fn()}
          isLatestTurn
        />,
      );
      const row = screen.getByTestId('message-action-row');
      expect(row).toHaveClass('opacity-0');
      expect(row).toHaveClass(HOVER_GATE);
      const labels = Array.from(row.querySelectorAll('button')).map((button) =>
        button.getAttribute('aria-label'),
      );
      expect(labels).toEqual(['Edit message', 'Copy message', 'More message actions']);

      await user.click(screen.getByLabelText('More message actions'));
      await user.click(screen.getByRole('menuitem', { name: 'Branch conversation from here' }));
      expect(onBranch).toHaveBeenCalledWith('u-1');
    });

    it('keeps read aloud, pin and the timestamp out of the assistant row', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', content: 'Reply' })}
          onRegenerate={vi.fn()}
          onBranch={vi.fn()}
          onPin={vi.fn()}
          onReadAloud={vi.fn()}
          isReadAloudSupported
          isLatestTurn
        />,
      );
      const row = screen.getByTestId('message-action-row');
      const labels = Array.from(row.querySelectorAll('button')).map((button) =>
        button.getAttribute('aria-label'),
      );
      expect(labels).toEqual([
        'Copy message',
        'Good response',
        'Bad response',
        'Regenerate response',
        'Branch conversation from here',
        'More message actions',
      ]);
      expect(row.querySelector('time')).toBeNull();
    });
  });

  describe('regenerate model choice', () => {
    const options = [
      { id: 'model-a', name: 'Model A' },
      { id: 'model-b', name: 'Model B' },
    ];

    it('regenerates directly when the page offers no model choice', () => {
      const onRegenerate = vi.fn();
      render(
        <MessageBubble
          message={makeMessage({ id: 'msg-9', role: 'assistant', content: 'Reply' })}
          onRegenerate={onRegenerate}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate response' }));
      expect(onRegenerate).toHaveBeenCalledWith('msg-9');
    });

    it('opens a menu with try again and the offered models, marking the current one', async () => {
      const user = userEvent.setup();
      const onRegenerate = vi.fn();
      const onRegenerateWithModel = vi.fn();
      render(
        <MessageBubble
          message={makeMessage({
            id: 'msg-9',
            role: 'assistant',
            content: 'Reply',
            model: 'model-b',
          })}
          onRegenerate={onRegenerate}
          onRegenerateWithModel={onRegenerateWithModel}
          regenerateModelOptions={options}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Regenerate response' }));
      expect(onRegenerate).not.toHaveBeenCalled();
      const current = screen.getByRole('menuitem', { name: 'Model B' });
      expect(current.querySelector('svg')).not.toBeNull();
      expect(screen.getByRole('menuitem', { name: 'Model A' }).querySelector('svg')).toBeNull();

      await user.click(screen.getByRole('menuitem', { name: 'Model A' }));
      expect(onRegenerateWithModel).toHaveBeenCalledWith('msg-9', 'model-a');

      await user.click(screen.getByRole('button', { name: 'Regenerate response' }));
      await user.click(screen.getByRole('menuitem', { name: 'Try again' }));
      expect(onRegenerate).toHaveBeenCalledWith('msg-9');
    });
  });

  describe('streaming marker', () => {
    it('flags the assistant body while it streams so the caret can attach to the last block', () => {
      const { rerender } = render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', content: 'Partial', isStreaming: true })}
        />,
      );
      expect(document.querySelector('.message-text')?.getAttribute('data-streaming')).toBe('true');

      rerender(
        <MessageBubble
          message={makeMessage({ role: 'assistant', content: 'Partial', isStreaming: false })}
        />,
      );
      expect(document.querySelector('.message-text')?.hasAttribute('data-streaming')).toBe(false);
    });

    it('never flags the user bubble', () => {
      render(<MessageBubble message={makeMessage({ isStreaming: true })} />);
      expect(document.querySelector('.message-text')?.hasAttribute('data-streaming')).toBe(false);
    });
  });

  describe('pin toggle button', () => {
    it('renders the pin action only when onPin is provided', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<MessageBubble message={makeMessage()} />);
      await user.click(screen.getByLabelText('More message actions'));
      expect(screen.queryByRole('menuitemcheckbox', { name: 'Pin message' })).toBeNull();
      await user.keyboard('{Escape}');

      rerender(<MessageBubble message={makeMessage()} onPin={vi.fn()} />);
      await user.click(screen.getByLabelText('More message actions'));
      expect(screen.getByRole('menuitemcheckbox', { name: 'Pin message' })).toBeInTheDocument();
    });

    it('calls onPin with the message id when clicked', async () => {
      const user = userEvent.setup();
      const onPin = vi.fn();
      render(<MessageBubble message={makeMessage({ id: 'msg-42' })} onPin={onPin} />);

      await user.click(screen.getByLabelText('More message actions'));
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Pin message' }));
      expect(onPin).toHaveBeenCalledWith('msg-42');
    });

    it('reflects pinned state via its label and aria-checked', async () => {
      const user = userEvent.setup();
      render(
        <MessageBubble message={makeMessage({ metadata: { isPinned: true } })} onPin={vi.fn()} />,
      );
      await user.click(screen.getByLabelText('More message actions'));
      const item = screen.getByRole('menuitemcheckbox', { name: 'Unpin message' });
      expect(item).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('branch indicator', () => {
    it('shows git fork icon when hasBranches is true', () => {
      const msg = makeMessage({ role: 'assistant', content: 'branched' });
      const { container } = render(<MessageBubble message={msg} hasBranches />);
      const forkIcon = container.querySelector('.text-primary');
      expect(forkIcon).toBeInTheDocument();
    });

    it('renders persisted branch navigation and switches to the selected conversation', () => {
      const onSwitch = vi.fn();
      const msg = makeMessage({ id: 'fork-point', role: 'assistant', content: 'branched' });
      render(
        <MessageBubble
          message={msg}
          branchNavigation={{
            branches: [
              {
                id: 'conversation-main',
                name: 'Original',
                forkPointMessageId: 'fork-point',
              },
              {
                id: 'conversation-branch',
                name: 'Alternative',
                forkPointMessageId: 'fork-point',
              },
            ],
            activeBranchId: 'conversation-main',
            onSwitch,
          }}
        />,
      );

      expect(screen.getByText('1/2')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Next branch'));
      expect(onSwitch).toHaveBeenCalledWith('conversation-branch');
    });

    // shell-nav-ia-gap-08: Branch is a PERSISTENT icon in the action row beside
    // copy/regenerate (Manus's "Continue in new task" placement), not a
    // dropdown entry. It must not be in both places, a duplicated control is
    // its own defect, so these assert the row and the menu's absence.
    it('creates a branch from the persistent action row, not the overflow menu', async () => {
      const user = userEvent.setup();
      const onBranch = vi.fn();
      const msg = makeMessage({ id: 'fork-point', role: 'assistant', content: 'branch me' });
      render(<MessageBubble message={msg} onBranch={onBranch} />);

      await user.click(screen.getByLabelText('Branch conversation from here'));
      expect(onBranch).toHaveBeenCalledWith('fork-point');

      await user.click(screen.getByLabelText('More message actions'));
      expect(screen.queryByRole('menuitem', { name: /branch/i })).not.toBeInTheDocument();
    });

    it('disables duplicate branch creation while the request is in flight', async () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant' })}
          onBranch={vi.fn()}
          isBranching
        />,
      );

      expect(screen.getByLabelText('Creating branch…')).toBeDisabled();
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
    it('renders the catalog display name instead of a transport model identifier', async () => {
      const user = userEvent.setup();
      const modelName = getModelMetadataById(CHAT_MODEL_ID)?.name;
      expect(modelName).toBeTruthy();

      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', content: 'test', model: CHAT_MODEL_ID })}
        />,
      );

      await user.click(screen.getByLabelText('More message actions'));
      expect(screen.getByText(modelName!)).toBeInTheDocument();
      if (modelName !== CHAT_MODEL_ID) {
        expect(screen.queryByText(CHAT_MODEL_ID)).not.toBeInTheDocument();
      }
    });

    it('renders without error when tokensUsed and model are set', () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'test',
        metadata: { tokensUsed: 1234, model: CHAT_MODEL_ID },
      });
      // The token count appears inside the dropdown menu (portal) · just verify no render error
      expect(() => render(<MessageBubble message={msg} />)).not.toThrow();
    });

    it('does not resurrect a retired managed model identifier from historical messages', async () => {
      const user = userEvent.setup();
      const retiredFixtureId = 'fixture-retired-managed-model';
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'historical answer',
            model: retiredFixtureId,
          })}
        />,
      );

      await user.click(screen.getByLabelText('More message actions'));
      expect(screen.getByText('Unavailable model')).toBeInTheDocument();
      expect(screen.queryByText(retiredFixtureId)).not.toBeInTheDocument();
    });
  });

  describe('reaction callbacks', () => {
    it('calls onReact with "up" when thumbs-up clicked', () => {
      const onReact = vi.fn();
      const msg = makeMessage({ id: 'msg-react', role: 'assistant', content: 'test' });
      render(<MessageBubble message={msg} onReact={onReact} />);

      fireEvent.click(screen.getByLabelText('Good response'));
      expect(onReact).toHaveBeenCalledWith('msg-react', 'up');
    });

    it('calls onReact with "down" when thumbs-down clicked', () => {
      const onReact = vi.fn();
      const msg = makeMessage({ id: 'msg-react', role: 'assistant', content: 'test' });
      render(<MessageBubble message={msg} onReact={onReact} />);

      fireEvent.click(screen.getByLabelText('Bad response'));
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

  // Regression: a non-renderable fenced code block (python/csv/json/generic) must
  // render EXACTLY ONCE. It used to render twice, once via <MarkdownContent> and
  // again via an inline <ArtifactBlock content={cleanedContent}> that re-parsed the
  // same body, producing the visible stacked duplicate ("PYTHON" skeleton over the
  // final "python" block). ArtifactBlock was removed from the message body; assert
  // the code text appears only once.
  describe('code block de-duplication', () => {
    it('renders a python code block exactly once (no ArtifactBlock duplicate)', () => {
      const sentinel = 'UNIQUE_PY_SENTINEL_42';
      const msg = makeMessage({
        id: 'msg-code',
        role: 'assistant',
        content: `Here is code:\n\n\`\`\`python\n${sentinel} = 1\nprint(${sentinel})\n\`\`\`\n`,
      });
      render(<MessageBubble message={msg} />);

      // python is not a renderable artifact, so cleanedContent keeps the fence and
      // MarkdownContent (mocked) renders it once. Count total occurrences in the DOM.
      const occurrences = (document.body.textContent?.split(sentinel).length ?? 1) - 1;
      // The sentinel appears twice inside the single rendered content (assignment +
      // print), but it must NOT be duplicated by a second renderer: with the mocked
      // MarkdownContent rendering content verbatim once, 2 occurrences === one render.
      expect(occurrences).toBe(2);
      expect(screen.getAllByTestId('markdown-content')).toHaveLength(1);
    });
  });

  // Raster-image attachment rendering (claude.ai parity): image attachments
  // render a real <img> thumbnail that opens the full-size lightbox on click,
  // with a graceful broken-image fallback. Non-image attachments keep a chip.
  describe('image attachment rendering', () => {
    const imageAttachment = {
      id: 'att-img-1',
      name: 'diagram.png',
      type: 'image/png',
      size: 2048,
      url: 'blob:https://app.local/att-img-1',
    };

    it('renders an image attachment as a clickable thumbnail (not a plain link)', () => {
      render(<MessageBubble message={makeMessage({ attachments: [imageAttachment] })} />);
      const trigger = screen.getByRole('button', { name: /view diagram\.png full size/i });
      const img = screen.getByAltText('diagram.png') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe(imageAttachment.url);
      expect(trigger).toBeTruthy();
    });

    it('opens the full-size lightbox when the thumbnail is clicked', () => {
      render(<MessageBubble message={makeMessage({ attachments: [imageAttachment] })} />);
      expect(screen.queryByRole('dialog', { name: /image preview/i })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /view diagram\.png full size/i }));
      expect(screen.getByRole('dialog', { name: /image preview/i })).toBeTruthy();
    });

    it('shows a labelled fallback (no torn image) when the source fails to load', () => {
      render(<MessageBubble message={makeMessage({ attachments: [imageAttachment] })} />);
      const img = screen.getByAltText('diagram.png');
      fireEvent.error(img);
      // The <img> is replaced by a text fallback carrying the file name.
      expect(screen.queryByAltText('diagram.png')).toBeNull();
      expect(screen.getByText('diagram.png')).toBeTruthy();
    });

    it('keeps non-image attachments as an icon+name chip link', () => {
      const pdf = {
        id: 'att-pdf-1',
        name: 'report.pdf',
        type: 'application/pdf',
        size: 4096,
        url: 'blob:https://app.local/att-pdf-1',
      };
      render(<MessageBubble message={makeMessage({ attachments: [pdf] })} />);
      const link = screen.getByRole('link', { name: /report\.pdf/i }) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(pdf.url);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.hasAttribute('download')).toBe(false);
      // Not rendered as an image thumbnail.
      expect(screen.queryByRole('button', { name: /view report\.pdf full size/i })).toBeNull();
    });

    it('downloads non-previewable attachments intentionally', () => {
      render(
        <MessageBubble
          message={makeMessage({
            attachments: [
              {
                id: 'att-text-1',
                name: 'notes.txt',
                type: 'text/plain',
                size: 120,
                url: '/api/files/att-text-1',
              },
            ],
          })}
        />,
      );

      const link = screen.getByRole('link', { name: /notes\.txt/i }) as HTMLAnchorElement;
      expect(link.getAttribute('download')).toBe('notes.txt');
      expect(link.hasAttribute('target')).toBe(false);
    });
  });

  describe('generated files (x_generated_files metadata)', () => {
    beforeEach(() => {
      useArtifactsStore.getState().clearArtifacts();
      useChatStore.getState().setActiveConversation('conv-generated-files');
    });

    const genFile = (overrides: Record<string, unknown> = {}) => ({
      id: 'gf-1',
      fileName: 'chart.png',
      mimeType: 'image/png',
      uri: '/api/files/gf-1',
      byteCount: 1024,
      kind: 'image',
      checksumSha256: 'a'.repeat(64),
      ...overrides,
    });

    it('renders an image generated file as a thumbnail that opens the lightbox', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Here is your chart.',
            metadata: { generatedFiles: [genFile()] },
          })}
        />,
      );
      const img = screen.getByAltText('chart.png') as HTMLImageElement;
      // Same-origin authenticated serve route, the renderable url shape.
      expect(img.getAttribute('src')).toBe('/api/files/gf-1');
      fireEvent.click(screen.getByRole('button', { name: /view chart\.png full size/i }));
      expect(screen.getByRole('dialog', { name: /image preview/i })).toBeTruthy();
    });

    it('projects an image generated file into the artifact panel without a duplicate inline card', async () => {
      render(
        <MessageBubble
          message={makeMessage({
            id: 'message-image-file',
            role: 'assistant',
            content: 'Here is your chart.',
            metadata: { generatedFiles: [genFile()] },
          })}
        />,
      );

      await waitFor(() =>
        expect(
          useArtifactsStore
            .getState()
            .getConversationArtifacts('conv-generated-files')
            .find((artifact) => artifact.id === 'genfile-gf-1'),
        ).toMatchObject({
          type: 'image',
          language: 'png',
          title: 'chart.png',
          content: '/api/files/gf-1',
          messageId: 'message-image-file',
        }),
      );
      expect(screen.queryByRole('button', { name: /open artifact: chart\.png/i })).toBeNull();
    });

    it('projects a persisted image-generation result into the artifact panel', async () => {
      render(
        <MessageBubble
          message={makeMessage({
            id: 'message-generated-image',
            role: 'assistant',
            content: '',
            metadata: {
              toolType: 'image-generation',
              imageUrl: '/api/files/generated-image',
              imageGenPrompt: 'A crystal robot beside a lake',
              imageGenModel: IMAGE_MODEL_ID,
            },
          })}
        />,
      );

      await waitFor(() =>
        expect(
          useArtifactsStore
            .getState()
            .getConversationArtifacts('conv-generated-files')
            .find((artifact) => artifact.id === 'generated-image-message-generated-image'),
        ).toMatchObject({
          type: 'image',
          language: 'png',
          title: 'A crystal robot beside a lake',
          content: '/api/files/generated-image',
          messageId: 'message-generated-image',
        }),
      );
      expect(
        screen.queryByRole('button', { name: /open artifact: a crystal robot beside a lake/i }),
      ).toBeNull();
    });

    it('renders a PDF generated file as an artifact card (PDF viewer path)', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Report attached.',
            metadata: {
              generatedFiles: [
                genFile({
                  id: 'gf-pdf',
                  fileName: 'report.pdf',
                  mimeType: 'application/pdf',
                  uri: '/api/files/gf-pdf',
                  kind: 'pdf',
                }),
              ],
            },
          })}
        />,
      );
      expect(screen.getByRole('button', { name: /open artifact: report\.pdf/i })).toBeTruthy();
      // Not duplicated as a download chip.
      expect(screen.queryByRole('link', { name: /report\.pdf/i })).toBeNull();
    });

    it('restores generated-file provenance onto a matching persisted PDF artifact', async () => {
      useArtifactsStore.getState().addArtifactForMessage(
        'message-1',
        {
          id: 'genfile-gf-pdf',
          type: 'document',
          language: 'pdf',
          title: 'report.pdf',
          content: '',
        },
        'conv-generated-files',
      );

      render(
        <MessageBubble
          message={makeMessage({
            id: 'message-1',
            role: 'assistant',
            content: 'Report attached.',
            metadata: {
              generatedFiles: [
                genFile({
                  id: 'gf-pdf',
                  fileName: 'report.pdf',
                  mimeType: 'application/pdf',
                  uri: '/api/files/gf-pdf',
                  kind: 'pdf',
                }),
              ],
            },
          })}
        />,
      );

      await waitFor(() =>
        expect(
          useArtifactsStore
            .getState()
            .getConversationArtifacts('conv-generated-files')
            .find((artifact) => artifact.id === 'genfile-gf-pdf')?.generatedFile,
        ).toEqual(expect.objectContaining({ uri: '/api/files/gf-pdf' })),
      );
    });

    it('fetches CSV content same-origin and renders it as a spreadsheet artifact', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('name,score\nada,10\n', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        render(
          <MessageBubble
            message={makeMessage({
              role: 'assistant',
              content: 'Data attached.',
              metadata: {
                generatedFiles: [
                  genFile({
                    id: 'gf-csv',
                    fileName: 'data.csv',
                    mimeType: 'text/csv',
                    uri: '/api/files/gf-csv',
                    kind: 'csv',
                  }),
                ],
              },
            })}
          />,
        );
        await waitFor(() =>
          expect(screen.getByRole('button', { name: /open artifact: data\.csv/i })).toBeTruthy(),
        );
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/files/gf-csv',
          expect.objectContaining({ credentials: 'same-origin' }),
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('fetches generated HTML source and renders it in the artifact workbench', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('<h1>Sandbox report</h1>', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        render(
          <MessageBubble
            message={makeMessage({
              role: 'assistant',
              content: 'Dashboard attached.',
              metadata: {
                generatedFiles: [
                  genFile({
                    id: 'gf-html',
                    fileName: 'dashboard.html',
                    mimeType: 'text/html',
                    uri: '/api/files/gf-html',
                    kind: 'html',
                    surface: 'artifact',
                    previewable: true,
                  }),
                ],
              },
            })}
          />,
        );
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: /open artifact: dashboard\.html/i }),
          ).toBeTruthy(),
        );
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/files/gf-html',
          expect.objectContaining({ credentials: 'same-origin' }),
        );
        expect(screen.queryByRole('link', { name: /dashboard\.html/i })).toBeNull();
        await waitFor(() =>
          expect(
            useArtifactsStore
              .getState()
              .getConversationArtifacts('conv-generated-files')
              .map((artifact) => artifact.title),
          ).toContain('dashboard.html'),
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('places generated plain text in the artifact workbench instead of stranding it as a link', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('sandbox notes', { status: 200 })),
      );
      try {
        render(
          <MessageBubble
            message={makeMessage({
              role: 'assistant',
              content: 'Notes attached.',
              metadata: {
                generatedFiles: [
                  genFile({
                    id: 'gf-text',
                    fileName: 'notes.txt',
                    mimeType: 'text/plain',
                    uri: '/api/files/gf-text',
                    kind: 'other',
                    surface: 'artifact',
                    previewable: true,
                  }),
                ],
              },
            })}
          />,
        );
        await waitFor(() =>
          expect(screen.getByRole('button', { name: /open artifact: notes\.txt/i })).toBeTruthy(),
        );
        expect(screen.queryByRole('link', { name: /notes\.txt/i })).toBeNull();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('falls back to an honest download chip when the CSV fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 403 })));
      try {
        render(
          <MessageBubble
            message={makeMessage({
              role: 'assistant',
              content: 'Data attached.',
              metadata: {
                generatedFiles: [
                  genFile({
                    id: 'gf-csv2',
                    fileName: 'data.csv',
                    mimeType: 'text/csv',
                    uri: '/api/files/gf-csv2',
                    kind: 'csv',
                  }),
                ],
              },
            })}
          />,
        );
        const link = (await screen.findByRole('link', { name: /data\.csv/i })) as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('/api/files/gf-csv2');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('renders non-renderable kinds (archive) as a download chip', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Bundle attached.',
            metadata: {
              generatedFiles: [
                genFile({
                  id: 'gf-zip',
                  fileName: 'bundle.zip',
                  mimeType: 'application/zip',
                  uri: '/api/files/gf-zip',
                  kind: 'archive',
                }),
              ],
            },
          })}
        />,
      );
      const link = screen.getByRole('link', { name: /bundle\.zip/i }) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/api/files/gf-zip');
    });
  });

  describe('empty assistant turn notice', () => {
    const noOutputNotice = () => screen.queryByText(/finished without returning a response/i);

    it('reports an empty turn the model actually completed', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', content: '' })} />);
      expect(noOutputNotice()).toBeInTheDocument();
    });

    it('stays quiet on an empty turn the provider rejected, which has its own notice', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            metadata: {
              streamError: {
                message: 'The provider rejected this request. Try again, or choose another model.',
                code: '400',
                retryable: false,
              },
            },
          })}
        />,
      );
      expect(noOutputNotice()).not.toBeInTheDocument();
    });

    it('stays quiet on an empty turn whose finish reason is an error', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: '',
            metadata: { finishReason: 'error' },
          })}
        />,
      );
      expect(noOutputNotice()).not.toBeInTheDocument();
    });
  });

  describe('no-sources notice', () => {
    const noSourcesNotice = () =>
      screen.queryByText(/web search didn't return results for this turn/i);

    const codeExecutionActivity = {
      schemaVersion: 1 as const,
      sessionId: 's1',
      turnId: 't1',
      lastSequence: 1,
      status: 'completed' as const,
      startedAtMs: 0,
      updatedAtMs: 100,
      entries: [
        {
          kind: 'tool' as const,
          id: 'tool-1',
          toolCallId: 'call-1',
          name: 'code_execution',
          category: 'code-execution' as const,
          summary: 'Ran code',
          status: 'completed' as const,
          startedAtMs: 0,
          completedAtMs: 50,
        },
      ],
    };

    const failedFetchActivity = {
      schemaVersion: 1 as const,
      sessionId: 's1',
      turnId: 't1',
      lastSequence: 1,
      status: 'failed' as const,
      startedAtMs: 0,
      updatedAtMs: 100,
      entries: [
        {
          kind: 'tool' as const,
          id: 'tool-1',
          toolCallId: 'call-1',
          name: 'url_fetch',
          category: 'web-fetch' as const,
          summary: 'The tool failed for example.com',
          status: 'failed' as const,
          startedAtMs: 0,
          completedAtMs: 50,
        },
      ],
    };

    it('stays quiet on a search-enabled turn that never attempted a search (Pascal/code-execution)', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: "Here's the Pascal's triangle file.",
            metadata: {
              webSearchRequested: true,
              agentActivity: codeExecutionActivity,
            },
          })}
        />,
      );
      expect(noSourcesNotice()).not.toBeInTheDocument();
    });

    it('shows the notice when the user asked for a search and it produced zero sources', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Based on what I already know, here is an answer.',
            metadata: {
              webSearchRequested: true,
              webSearchAskedInText: true,
              agentActivity: failedFetchActivity,
            },
          })}
        />,
      );
      expect(noSourcesNotice()).toBeInTheDocument();
    });

    it('stays quiet when only the toggle asked and the search produced zero sources', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Based on what I already know, here is an answer.',
            metadata: {
              webSearchRequested: true,
              agentActivity: failedFetchActivity,
            },
          })}
        />,
      );
      expect(noSourcesNotice()).not.toBeInTheDocument();
    });

    it('stays quiet when web search was never requested for the turn', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Based on what I already know, here is an answer.',
            metadata: {
              agentActivity: failedFetchActivity,
            },
          })}
        />,
      );
      expect(noSourcesNotice()).not.toBeInTheDocument();
    });
  });

  describe('search-not-invoked notice', () => {
    const notInvokedNotice = () => screen.queryByText(/the answer used the model's own knowledge/i);

    it('names the real failure when a required search never ran', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'From what I recall, the headline was about the merger.',
            metadata: { webSearchRequested: true, webSearchAskedInText: true },
          })}
        />,
      );
      expect(notInvokedNotice()).toBeInTheDocument();
      expect(
        screen.queryByText(/web search didn't return results for this turn/i),
      ).not.toBeInTheDocument();
    });

    it('offers a one-click resend that requires the search', async () => {
      const onRegenerate = vi.fn();
      const user = userEvent.setup();
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'From what I recall, the headline was about the merger.',
            metadata: { webSearchRequested: true, webSearchAskedInText: true },
          })}
          onRegenerate={onRegenerate}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: /send this turn again with a web search required/i }),
      );
      expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('stays quiet when search was merely switched on and the message never asked for one', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'ready',
            metadata: { webSearchRequested: true },
          })}
        />,
      );
      expect(notInvokedNotice()).not.toBeInTheDocument();
    });

    it('stays quiet once the search actually ran', () => {
      render(
        <MessageBubble
          message={makeMessage({
            role: 'assistant',
            content: 'Per Reuters, the headline was about the merger.',
            metadata: {
              webSearchRequested: true,
              tools: [{ name: 'web_search', status: 'completed' }],
              searchResults: [{ url: 'https://example.com', title: 'Example' }],
            } as never,
          })}
        />,
      );
      expect(notInvokedNotice()).not.toBeInTheDocument();
    });
  });
});
