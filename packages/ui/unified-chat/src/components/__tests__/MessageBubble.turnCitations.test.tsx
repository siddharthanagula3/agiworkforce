import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  type AgentEvent,
  type AgentEventEnvelope,
} from '@agiworkforce/types';
import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import type { ChatMessage } from '../../lib/types';
import { MessageBubble } from '../MessageBubble';

function activityFrom(events: AgentEvent[]): AgentActivityState {
  return events.reduce<AgentActivityState | undefined>(
    (activity, event, sequence) =>
      applyAgentActivityEvent(activity, {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: 'session-1',
        turnId: 'turn-1',
        sequence,
        emittedAtMs: 1_760_000_000_000 + sequence,
        event,
      } satisfies AgentEventEnvelope),
    undefined,
  )!;
}

const SEARCH_TURN: AgentEvent[] = [
  {
    type: 'tool-execution-start',
    toolCallId: 'call-1',
    name: 'search_web',
    category: 'web-search',
    summary: 'Searching the web',
    input: { query: 'rust async' },
  },
  {
    type: 'source-list',
    toolCallId: 'call-1',
    query: 'rust async',
    sources: [
      { url: 'https://www.example.com/async', title: 'Async book', snippet: 'Futures' },
      { url: 'https://tokio.rs/', title: 'Tokio' },
    ],
  },
  {
    type: 'tool-execution-end',
    toolCallId: 'call-1',
    name: 'search_web',
    output: 'ok',
    isError: false,
  },
  {
    type: 'source-list',
    query: 'Project knowledge',
    sources: [{ url: '', title: 'notes.md' }],
  },
];

function assistantMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Async Rust runs futures on an executor.',
    timestamp: '2026-10-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('MessageBubble, sources of a turn with canonical activity', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists each web source as a link exactly once, though the search results repeat them', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <MessageBubble
        message={assistantMessage({
          metadata: { agentActivity: activityFrom(SEARCH_TURN) },
          webSearchResults: [
            {
              id: 'call-1',
              query: 'rust async',
              resultCount: 2,
              results: [
                { url: 'https://www.example.com/async', title: 'Async book' },
                { url: 'https://tokio.rs/', title: 'Tokio' },
              ],
            },
          ],
        })}
      />,
    );

    const links = screen.getAllByRole('button', { name: /^Open citation:/ });
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Open citation: Async book',
      'Open citation: Tokio',
    ]);
    expect(within(screen.getByTestId('message-citations')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Web search:/ })).toBeNull();

    await userEvent.click(links[0]!);
    expect(open).toHaveBeenCalledWith(
      'https://www.example.com/async',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('offers no link for a source without a web address', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          metadata: {
            agentActivity: activityFrom([
              {
                type: 'source-list',
                query: 'Project knowledge',
                sources: [{ url: '', title: 'notes.md' }],
              },
              {
                type: 'source-list',
                query: 'unsafe',
                sources: [{ url: 'javascript:alert(1)', title: 'Script' }],
              },
            ]),
          },
        })}
      />,
    );

    expect(screen.queryByTestId('message-citations')).toBeNull();
  });

  it('keeps the result card as the only list when the turn has no canonical activity', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          webSearchResults: [
            {
              id: 'search-1',
              query: 'rust async',
              resultCount: 1,
              results: [{ url: 'https://tokio.rs/', title: 'Tokio', domain: 'tokio.rs' }],
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /^Web search: rust async/ })).toBeTruthy();
    expect(screen.queryByTestId('message-citations')).toBeNull();
  });

  it('prefers citations the host attached over ones derived from activity', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          metadata: { agentActivity: activityFrom(SEARCH_TURN) },
          citations: [{ id: 'c1', url: 'https://docs.rs/', title: 'Docs.rs' }],
        })}
      />,
    );

    expect(
      screen
        .getAllByRole('button', { name: /^Open citation:/ })
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Open citation: Docs.rs']);
  });
});
