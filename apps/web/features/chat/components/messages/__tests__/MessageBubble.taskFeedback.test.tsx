import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (base?: Record<string, string>) => ({
    ...base,
    'x-csrf-token': 'test-token',
  })),
  getCsrfToken: vi.fn(async () => 'test-token'),
}));

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
import { useChatStore } from '@shared/stores/web-chat-store';

const RUN_ID = '2f0d2f2f-0f2f-4f2f-8f2f-0f2f2f2f2f2f';

const fetchMock = vi.fn();

function taskReply() {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: 'Here is the comparison.',
    timestamp: new Date('2026-09-05T00:00:00.000Z'),
    sessionId: 'conv-1',
    metadata: {
      cloudAgentRun: {
        runId: RUN_ID,
        runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
        lastSequence: 7,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  useChatStore.setState({ workModeByConversation: {}, activeConversationId: 'conv-1' });
});

afterEach(cleanup);

// ChatGPT Work carries a Work-specific feedback control on every task reply,
// on top of the ordinary thumbs; a task is its own surface worth its own signal.
describe('task feedback on an AGI Work reply', () => {
  it('offers the control on a reply produced by an AGI Work run', () => {
    useChatStore.setState({ workModeByConversation: { 'conv-1': 'agiwork' } });
    render(<MessageBubble message={taskReply()} />);

    expect(screen.getByRole('button', { name: 'Task feedback' })).toBeInTheDocument();
  });

  it('does not offer it on an ordinary chat reply', () => {
    render(<MessageBubble message={taskReply()} />);

    expect(screen.queryByRole('button', { name: 'Task feedback' })).toBeNull();
  });

  it('does not offer it when the turn has no run to name', () => {
    useChatStore.setState({ workModeByConversation: { 'conv-1': 'agiwork' } });
    render(<MessageBubble message={{ ...taskReply(), metadata: {} }} />);

    expect(screen.queryByRole('button', { name: 'Task feedback' })).toBeNull();
  });

  it('scopes the report to the run it came from', async () => {
    useChatStore.setState({ workModeByConversation: { 'conv-1': 'agiwork' } });
    render(<MessageBubble message={taskReply()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Task feedback' }));
    await userEvent.type(screen.getByLabelText('Details'), 'It skipped the second source.');
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    const body = JSON.parse(String(init.body)) as {
      metadata: { feedback_context: string; run_id: string; conversation_id: string };
    };
    expect(body.metadata.feedback_context).toBe('task_feedback');
    expect(body.metadata.run_id).toBe(RUN_ID);
    expect(body.metadata.conversation_id).toBe('conv-1');
  });
});
