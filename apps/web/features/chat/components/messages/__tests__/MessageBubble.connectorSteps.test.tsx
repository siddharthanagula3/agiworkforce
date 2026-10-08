import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AgentActivityState, AgentActivityToolEntry } from '@agiworkforce/client-runtime';
import { AGI_WORK_MODE, useChatStore } from '@shared/stores/web-chat-store';
type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (base?: Record<string, string>) => base ?? {}),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<UnifiedChatModule>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { MessageBubble } from '../MessageBubble';

const CONVERSATION_ID = 'conv-connector-steps';

function step(overrides: Partial<AgentActivityToolEntry>): AgentActivityToolEntry {
  return {
    kind: 'tool',
    id: `tool:${overrides.toolCallId ?? 'call'}`,
    toolCallId: 'call',
    name: 'mcp__gmail__search_threads',
    category: 'connector',
    summary: 'Using Gmail connector',
    status: 'completed',
    input: { query: 'from:nils' },
    startedAtMs: 1_100,
    completedAtMs: 2_000,
    elapsedMs: 900,
    ...overrides,
  };
}

function turn(entries: AgentActivityToolEntry[], status: AgentActivityState['status']) {
  return {
    id: 'msg-connector-steps',
    role: 'assistant' as const,
    content: 'Here is what I found.',
    timestamp: new Date('2026-10-08T09:00:00.000Z'),
    sessionId: CONVERSATION_ID,
    metadata: {
      agentActivity: {
        schemaVersion: 1,
        sessionId: 'session-1',
        turnId: 'turn-1',
        lastSequence: 9,
        status,
        startedAtMs: 1_000,
        updatedAtMs: 66_000,
        ...(status === 'running' ? {} : { completedAtMs: 66_000 }),
        entries,
      } satisfies AgentActivityState,
    },
  };
}

const GMAIL_TURN = [
  step({ toolCallId: 'search' }),
  step({ toolCallId: 'read', name: 'mcp__gmail__get_thread' }),
  step({
    toolCallId: 'limited',
    name: 'mcp__gmail__list_labels',
    status: 'failed',
    summary: 'The tool failed',
    output: 'Gmail answered HTTP 429.',
    error: 'Gmail answered HTTP 429.',
  }),
  step({
    toolCallId: 'custom',
    name: 'mcp__custom-a1b2c3d4e5__search_orders',
    summary: 'Using Acme Logistics connector',
  }),
];

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.inline-tool-call')];
}

function rowText(row: HTMLElement): string {
  return row.querySelector('.inline-tool-call__label')?.textContent ?? '';
}

async function openActivity() {
  const trigger = screen.getByRole('button', { name: /show agent activity/i });
  trigger.click();
  await screen.findAllByRole('button', { name: /gmail/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  cleanup();
  useChatStore.setState({ workModeByConversation: {} });
});

describe('connector steps in the web transcript', () => {
  it('words each finished Gmail call in the past tense and each failure with its reason', async () => {
    render(<MessageBubble message={turn(GMAIL_TURN, 'partial')} />);
    await openActivity();

    expect(rows().map(rowText)).toEqual([
      'Searched Gmail',
      'Read from Gmail',
      'Could not list items in Gmail. Rate limited, try again in a minute.',
      'Searched Acme Logistics',
    ]);
    expect(document.body.textContent).not.toContain('Using Gmail connector');
    expect(document.body.textContent).not.toMatch(/mcp__|custom-a1b2c3d4e5/);
  });

  it('draws the official Gmail mark on its rows and keeps the letter for a custom connector', async () => {
    render(<MessageBubble message={turn(GMAIL_TURN, 'partial')} />);
    await openActivity();

    const [search, read, limited, custom] = rows();
    for (const row of [search, read, limited]) {
      expect(row?.querySelector('[data-badge-kind="mark"] svg path')).not.toBeNull();
      expect(row?.querySelector('[data-badge-kind="letter"]')).toBeNull();
    }
    expect(custom?.querySelector('[data-badge-kind="mark"]')).toBeNull();
    expect(
      custom?.querySelector('[data-badge-kind="letter"]')?.getAttribute('data-badge-letter'),
    ).toBe('A');
  });

  it('uses the present tense and the same mark while a call is still running', () => {
    render(
      <MessageBubble
        message={turn(
          [step({ toolCallId: 'search', status: 'running', completedAtMs: undefined })],
          'running',
        )}
      />,
    );
    screen.getByRole('button', { name: /agent activity/i }).click();

    return screen.findByRole('button', { name: /searching gmail/i }).then(() => {
      const [row] = rows();
      expect(row && rowText(row)).toBe('Searching Gmail');
      expect(row?.querySelector('[data-badge-kind="mark"] svg path')).not.toBeNull();
    });
  });

  it('shows the same rows under the elapsed run line in AGI Work', async () => {
    useChatStore.setState({ workModeByConversation: { [CONVERSATION_ID]: AGI_WORK_MODE } });
    render(<MessageBubble message={turn(GMAIL_TURN.slice(0, 2), 'completed')} />);

    expect(screen.getByRole('button', { name: /agent activity/i }).textContent).toContain(
      'Worked for 1m 5s',
    );
    await openActivity();
    expect(rows().map(rowText)).toEqual(['Searched Gmail', 'Read from Gmail']);
    expect(document.querySelectorAll('[data-badge-kind="mark"] svg path')).toHaveLength(2);
  });
});
