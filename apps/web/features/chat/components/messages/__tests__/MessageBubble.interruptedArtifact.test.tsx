import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
import { useArtifactsStore } from '../../../stores/artifacts-store';

const MESSAGE_ID = 'msg-interrupted';
const CONVERSATION_ID = 'conv-1';
const NOTICE = 'interrupted-artifact-notice';

function assistantMessage() {
  return {
    id: MESSAGE_ID,
    role: 'assistant' as const,
    content: 'Here is the page.',
    timestamp: new Date('2026-09-07T00:00:00.000Z'),
    sessionId: CONVERSATION_ID,
  };
}

function storeArtifact(interrupted: boolean) {
  useArtifactsStore.getState().upsertArtifact({
    id: 'artifact-1',
    type: 'html',
    language: 'html',
    title: 'Stopped artifact',
    content: '<!DOCTYPE html>\n<html>\n  <body>',
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    ...(interrupted ? { interrupted: true } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useArtifactsStore.getState().reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe('WEB-USE-STREAMING-ARTIFACT-INTERRUPTING-01 · transcript card', () => {
  it('says the artifact on the card is a fragment and offers the way to a whole one', async () => {
    const onRegenerate = vi.fn();
    storeArtifact(true);

    render(<MessageBubble message={assistantMessage()} onRegenerate={onRegenerate} />);

    expect(screen.getByTestId(NOTICE).textContent).toMatch(/stopped before it finished/i);

    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(onRegenerate).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('offers no regenerate control to a host that cannot run one', () => {
    storeArtifact(true);

    render(<MessageBubble message={assistantMessage()} />);

    expect(screen.getByTestId(NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
  });

  it('stays silent for an artifact that finished', () => {
    storeArtifact(false);

    render(<MessageBubble message={assistantMessage()} onRegenerate={vi.fn()} />);

    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});
