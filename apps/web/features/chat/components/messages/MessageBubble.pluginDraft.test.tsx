import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import {
  PLUGIN_DRAFT_RESULT_KEY,
  PLUGIN_DRAFT_TOOL_NAME,
  projectPersistedMessageMetadata,
} from '@agiworkforce/cloud-contracts';
import { MessageBubble } from './MessageBubble';

type CsrfModule = typeof import('@/lib/client/csrf');

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const getCsrfToken = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  getCsrfToken,
}));

const toolCallId = 'draft-call';
const draft = {
  name: 'DOT short answers',
  description: 'Short-answer handling for DOT synthetic test questions.',
  skills: [
    {
      name: 'dot-short-answers',
      description:
        'Use when answering DOT synthetic test questions that call for a brief response.',
      body: 'Answer synthetic test questions in one short sentence.',
    },
  ],
};
const draftOutput = JSON.stringify({ [PLUGIN_DRAFT_RESULT_KEY]: draft, shown: 'shown' });

function draftEntry(
  status: 'running' | 'completed' | 'failed',
  output: string | undefined,
  id = toolCallId,
): AgentActivityState['entries'][number] {
  return {
    kind: 'tool',
    id: `tool:${id}`,
    toolCallId: id,
    name: PLUGIN_DRAFT_TOOL_NAME,
    category: 'other',
    summary: 'Running Draft Plugin',
    status,
    input: { name: draft.name },
    ...(output === undefined ? {} : { output }),
    startedAtMs: 1,
  };
}

function activity(entries: AgentActivityState['entries']): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'draft-session',
    turnId: 'draft-turn',
    lastSequence: 2,
    status: 'completed',
    startedAtMs: 1,
    updatedAtMs: 2,
    entries,
  };
}

function message(
  metadata: NonNullable<Parameters<typeof MessageBubble>[0]['message']['metadata']>,
): Parameters<typeof MessageBubble>[0]['message'] {
  return {
    id: 'draft-message',
    sessionId: 'draft-chat',
    role: 'assistant',
    content: 'I drafted the plugin.',
    timestamp: new Date(),
    metadata,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCsrfToken.mockResolvedValue('csrf-token');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('plugin draft card in an assistant turn', () => {
  it('renders the draft card when the canonical activity owns the tool step', () => {
    render(
      <MessageBubble
        message={message({ agentActivity: activity([draftEntry('completed', draftOutput)]) })}
      />,
    );
    const card = screen.getByRole('group', { name: `Plugin draft: ${draft.name}` });
    expect(within(card).getByRole('button', { name: 'Save plugin' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Save as a skill' })).toBeInTheDocument();
  });

  it('renders the card outside the collapsed activity disclosure', () => {
    render(
      <MessageBubble
        message={message({ agentActivity: activity([draftEntry('completed', draftOutput)]) })}
      />,
    );
    expect(screen.getByRole('button', { name: /Show agent activity/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('plugin-draft-card')).toHaveLength(1);
  });

  it('renders one card for the legacy tool timeline', () => {
    render(
      <MessageBubble
        message={message({
          tools: [
            {
              id: toolCallId,
              toolCallId,
              name: PLUGIN_DRAFT_TOOL_NAME,
              status: 'completed',
              result: draftOutput,
            },
          ],
        })}
      />,
    );
    expect(screen.getAllByTestId('plugin-draft-card')).toHaveLength(1);
  });

  it('shows only the newest draft of the turn', () => {
    const revised = { ...draft, name: 'DOT short answers v2' };
    render(
      <MessageBubble
        message={message({
          agentActivity: activity([
            draftEntry('completed', draftOutput, 'first'),
            draftEntry(
              'completed',
              JSON.stringify({ [PLUGIN_DRAFT_RESULT_KEY]: revised, shown: 'shown' }),
              'second',
            ),
          ]),
        })}
      />,
    );
    expect(screen.getAllByTestId('plugin-draft-card')).toHaveLength(1);
    expect(
      screen.getByRole('group', { name: `Plugin draft: ${revised.name}` }),
    ).toBeInTheDocument();
  });

  it('draws no card for a draft step that is still running or failed', () => {
    render(
      <MessageBubble
        message={message({
          agentActivity: activity([
            draftEntry('running', undefined, 'running'),
            draftEntry('failed', 'The draft cannot be saved yet.', 'failed'),
          ]),
        })}
      />,
    );
    expect(screen.queryByTestId('plugin-draft-card')).toBeNull();
  });

  it('draws the card again from the metadata a conversation stores and reloads', () => {
    const stored = projectPersistedMessageMetadata({
      agentActivity: activity([draftEntry('completed', draftOutput)]),
      tools: [
        {
          id: toolCallId,
          toolCallId,
          name: PLUGIN_DRAFT_TOOL_NAME,
          status: 'completed',
          result: draftOutput,
        },
      ],
    });
    render(<MessageBubble message={message(JSON.parse(JSON.stringify(stored)))} />);
    expect(screen.getAllByTestId('plugin-draft-card')).toHaveLength(1);
    expect(screen.getByRole('group', { name: `Plugin draft: ${draft.name}` })).toBeInTheDocument();
  });

  it('saves the drafted skill through the skills route and confirms it in the card', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ skill: { name: 'dot-short-answers' } }), { status: 201 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MessageBubble
        message={message({ agentActivity: activity([draftEntry('completed', draftOutput)]) })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save as a skill' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved as a skill. It is on in your chats.',
      ),
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/skills',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(draft.skills[0]),
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
      }),
    );
  });
});
