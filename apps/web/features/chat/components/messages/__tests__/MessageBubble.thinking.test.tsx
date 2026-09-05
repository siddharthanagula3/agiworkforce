import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (base?: Record<string, string>) => ({
    ...base,
    'x-csrf-token': 'test-token',
  })),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { MessageBubble } from '../MessageBubble';

function assistantMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: 'Here is an answer.',
    timestamp: new Date('2026-09-02T00:00:00.000Z'),
    sessionId: 'conv-1',
    ...overrides,
  };
}

describe('two adjacent thinking deltas', () => {
  it('render as one thinking block when no tool row sits between them', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          metadata: {
            thinkingSegments: [
              {
                id: 'msg-1-think-0',
                content: 'first thought',
                isStreaming: false,
                startedAt: '2026-09-02T00:00:00.000Z',
                completedAt: '2026-09-02T00:00:01.000Z',
                durationSeconds: 1,
              },
              {
                id: 'msg-1-think-1',
                content: 'second thought',
                isStreaming: false,
                startedAt: '2026-09-02T00:00:01.000Z',
                completedAt: '2026-09-02T00:00:02.000Z',
                durationSeconds: 1,
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Expand reasoning' })).toHaveLength(1);
    expect(screen.getByText('Thought for 2s')).toBeInTheDocument();
  });

  it('stay separate when a tool call renders between them', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          metadata: {
            thinkingSegments: [
              {
                id: 'msg-1-think-0',
                content: 'first thought',
                isStreaming: false,
                startedAt: '2026-09-02T00:00:00.000Z',
                completedAt: '2026-09-02T00:00:01.000Z',
                durationSeconds: 1,
              },
              {
                id: 'msg-1-think-1',
                content: 'second thought',
                isStreaming: false,
                startedAt: '2026-09-02T00:00:01.000Z',
                completedAt: '2026-09-02T00:00:02.000Z',
                durationSeconds: 1,
              },
            ],
            tools: [{ id: 'tool-1', name: 'web_search', status: 'completed' }],
          },
        })}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Expand reasoning' })).toHaveLength(2);
  });
});
