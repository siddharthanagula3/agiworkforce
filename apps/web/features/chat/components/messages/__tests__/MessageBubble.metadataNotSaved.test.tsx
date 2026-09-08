import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { MessageBubble } from '../MessageBubble';

const CONVERSATION_ID = 'conv-1';

function assistantMessage(metadata?: Record<string, unknown>) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: 'Here is the answer.',
    timestamp: new Date('2026-09-08T00:00:00.000Z'),
    sessionId: CONVERSATION_ID,
    ...(metadata ? { metadata } : {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

/**
 * A metadata save that fails after its retries used to be a `console.error` and
 * nothing else. The reader kept a full answer on screen and found, on the next
 * reload, that the tool steps and reasoning were gone, with nothing anywhere
 * having said so. The notice is the difference between a loss and a surprise.
 */
describe('an assistant turn whose metadata was not saved', () => {
  it('says what will not survive a reload', () => {
    render(<MessageBubble message={assistantMessage({ metadataNotSaved: true })} />);

    expect(screen.getByText(/were not saved/i)).toBeInTheDocument();
    expect(screen.getByText(/after a reload/i)).toBeInTheDocument();
  });

  it('says nothing on an ordinary turn', () => {
    render(<MessageBubble message={assistantMessage()} />);

    expect(screen.queryByText(/were not saved/i)).toBeNull();
  });

  it('says nothing on a user message, which has no metadata of its own to lose', () => {
    render(
      <MessageBubble
        message={{ ...assistantMessage({ metadataNotSaved: true }), role: 'user' as const }}
      />,
    );

    expect(screen.queryByText(/were not saved/i)).toBeNull();
  });
});
