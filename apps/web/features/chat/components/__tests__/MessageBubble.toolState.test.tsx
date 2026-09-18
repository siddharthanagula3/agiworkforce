import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { MessageBubble } from '../messages/MessageBubble';
import type { ToolEntry } from '../messages/ToolTimeline';

const CONVERSATION_ID = 'conv-tool-state';
const PREAMBLE = 'Let me look that up for you.';

function assistantMessage(options: {
  tools: ToolEntry[];
  isStreaming?: boolean;
  content?: string;
}) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: options.content ?? PREAMBLE,
    timestamp: new Date('2026-09-18T00:00:00.000Z'),
    sessionId: CONVERSATION_ID,
    isStreaming: options.isStreaming ?? false,
    metadata: { tools: options.tools },
  };
}

function proseElement(container: HTMLElement): HTMLElement {
  const prose = container.querySelector('.message-text');
  if (!(prose instanceof HTMLElement)) throw new Error('message prose not rendered');
  return prose;
}

function precedes(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING &&
    !first.contains(second),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

/**
 * The card used to be pinned above the prose, so a model's own "let me search
 * for that" preamble read as text written after the run had already stopped.
 */
describe('a turn paused on a tool approval', () => {
  it('puts the card after the prose that was written before it', () => {
    const { container } = render(
      <MessageBubble
        message={assistantMessage({
          isStreaming: true,
          tools: [
            {
              id: 'tool-1',
              name: 'mcp__github__create_issue',
              status: 'awaiting_approval',
              requiresApproval: true,
              toolCallId: 'call_1',
            },
          ],
        })}
      />,
    );

    const prose = proseElement(container);
    const card = screen.getByText(/Waiting for your approval/i);
    expect(precedes(prose, card)).toBe(true);
  });

  it('drops the streaming treatment while the decision is outstanding', () => {
    const { container } = render(
      <MessageBubble
        message={assistantMessage({
          isStreaming: true,
          tools: [
            {
              id: 'tool-1',
              name: 'mcp__github__create_issue',
              status: 'awaiting_approval',
              requiresApproval: true,
              toolCallId: 'call_1',
            },
          ],
        })}
      />,
    );

    expect(container.querySelector('[data-streaming="true"]')).toBeNull();
    expect(container.querySelector('.animate-pulse.bg-primary')).toBeNull();
  });

  it('keeps the streaming treatment while a tool is actually running', () => {
    const { container } = render(
      <MessageBubble
        message={assistantMessage({
          isStreaming: true,
          tools: [{ id: 'tool-1', name: 'mcp__github__create_issue', status: 'running' }],
        })}
      />,
    );

    expect(container.querySelector('[data-streaming="true"]')).not.toBeNull();
  });

  it('shows no "Thinking..." beside a card that is the step\'s own indicator', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          isStreaming: true,
          content: '',
          tools: [{ id: 'tool-1', name: 'mcp__github__create_issue', status: 'running' }],
        })}
      />,
    );

    expect(screen.queryByText('Thinking...')).toBeNull();
  });
});

describe('a turn that carries its own reasoning segments', () => {
  it('renders each tool once, from the interleaved path alone', () => {
    render(
      <MessageBubble
        message={{
          ...assistantMessage({
            isStreaming: true,
            tools: [
              {
                id: 'tool-1',
                name: 'mcp__github__create_issue',
                status: 'awaiting_approval',
                requiresApproval: true,
                toolCallId: 'call_1',
              },
            ],
          }),
          metadata: {
            tools: [
              {
                id: 'tool-1',
                name: 'mcp__github__create_issue',
                status: 'awaiting_approval',
                requiresApproval: true,
                toolCallId: 'call_1',
              },
            ],
            thinkingSegments: [
              {
                id: 'seg-1',
                content: 'Deciding which issue to open.',
                isStreaming: false,
                startedAt: '2026-09-18T00:00:00.000Z',
                completedAt: '2026-09-18T00:00:01.000Z',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getAllByLabelText('Toggle tool timeline')).toHaveLength(1);
  });
});

describe('a turn whose tool has already returned', () => {
  it('leads with the card, because prose may have followed it', () => {
    const { container } = render(
      <MessageBubble
        message={assistantMessage({
          content: 'Opened the issue.',
          tools: [
            {
              id: 'tool-1',
              name: 'mcp__github__create_issue',
              status: 'completed',
              result: 'ok',
            },
          ],
        })}
      />,
    );

    const prose = proseElement(container);
    const card = screen.getByText(/Used the GitHub integration/i);
    expect(precedes(card, prose)).toBe(true);
  });

  it('does not ask again for an approval the stored entry already carried', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          content: 'Opened the issue.',
          tools: [
            {
              id: 'tool-1',
              name: 'mcp__github__create_issue',
              status: 'completed',
              requiresApproval: true,
              approved: true,
              toolCallId: 'call_1',
              result: 'ok',
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText(/Waiting for your approval/i)).toBeNull();
  });

  it('names a denied call as the user decision it was', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          content: 'I did not run it.',
          tools: [
            {
              id: 'tool-1',
              name: 'mcp__github__create_issue',
              status: 'failed',
              approved: false,
              toolCallId: 'call_1',
              error: 'You denied this tool.',
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('You denied 1 tool call')).toBeInTheDocument();
    expect(screen.getByText('1 denied')).toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).toBeNull();
    expect(screen.queryByText(/Waiting for your approval/i)).toBeNull();
  });
});
