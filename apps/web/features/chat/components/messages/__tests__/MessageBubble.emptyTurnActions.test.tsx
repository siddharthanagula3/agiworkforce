import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (base?: Record<string, string>) => base ?? {}),
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

function stoppedTurn(content: string) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content,
    timestamp: new Date('2026-09-07T22:43:00.000Z'),
    sessionId: 'conv-1',
    metadata: { finishReason: 'stopped' as const },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe('the action row on a turn that produced nothing', () => {
  it('offers no copy and no verdict on a turn stopped before its first token', () => {
    render(<MessageBubble message={stoppedTurn('')} onRegenerate={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Good response' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bad response' })).toBeNull();
  });

  it('keeps the actions that still apply to a stopped turn', () => {
    render(<MessageBubble message={stoppedTurn('')} onRegenerate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Regenerate response' })).toBeInTheDocument();
    expect(screen.getByTestId('message-action-row')).toBeInTheDocument();
  });

  it('keeps copy and both verdicts once the turn produced words', () => {
    render(<MessageBubble message={stoppedTurn('Half an answer.')} onRegenerate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Good response' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bad response' })).toBeInTheDocument();
  });
});
