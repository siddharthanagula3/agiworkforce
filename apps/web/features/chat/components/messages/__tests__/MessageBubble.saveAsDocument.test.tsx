import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
type ScanModule0 = typeof import('@agiworkforce/unified-chat');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (base?: Record<string, string>) => base ?? {}),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { MessageBubble } from '../MessageBubble';
import { useArtifactsStore } from '../../../stores/artifacts-store';

function answer(isStreaming = false) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: 'Here is the finished weekly report, formatted the way you asked.',
    timestamp: new Date('2026-09-07T22:43:00.000Z'),
    sessionId: 'conv-1',
    isStreaming,
  };
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'More message actions' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe('Save as document in the message menu', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    useArtifactsStore.getState().setPanelOpen(false);
  });

  it('turns a finished answer into an editable document and opens the panel', async () => {
    render(<MessageBubble message={answer()} onRegenerate={vi.fn()} />);

    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Save as document' }));

    const state = useArtifactsStore.getState();
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0]).toMatchObject({
      type: 'document',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      content: 'Here is the finished weekly report, formatted the way you asked.\n',
    });
    expect(state.panelOpen).toBe(true);
  });

  it('is not offered while the answer is still streaming', async () => {
    render(<MessageBubble message={answer(true)} onRegenerate={vi.fn()} />);

    const menu = screen.queryByRole('button', { name: 'More message actions' });
    if (menu) await userEvent.click(menu);

    expect(screen.queryByRole('menuitem', { name: 'Save as document' })).toBeNull();
  });
});
