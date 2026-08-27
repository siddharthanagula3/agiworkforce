import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { TaskDetailPanel } from '../TaskDetailPanel';

afterEach(cleanup);

const RUN_ID = '0190a000-0000-7000-8000-0000000000cc';

const run: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'completed',
  provider: 'openai',
  model: 'fixture-task-model',
  lastEventSequence: 3,
  cancellationRequestedAt: null,
  completedAt: '2026-08-02T12:05:00.000Z',
  createdAt: '2026-08-02T12:00:00.000Z',
  updatedAt: '2026-08-02T12:05:00.000Z',
};

function event(sequence: number, value: AgentEventEnvelope['event']): AgentEventEnvelope {
  return {
    schemaVersion: 4,
    sessionId: 'conversation-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_785_000_000_000 + sequence,
    event: value,
  };
}

const events: AgentEventEnvelope[] = [
  event(0, {
    type: 'tool-execution-start',
    toolCallId: 'call-search',
    name: 'web_search',
    category: 'web-search',
    summary: 'Searching official sources',
    input: { query: 'pricing' },
  }),
  event(1, {
    type: 'tool-execution-start',
    toolCallId: 'call-code',
    name: 'execute_code',
    category: 'code-execution',
    summary: 'Running code',
    input: { code: 'print(1)' },
  }),
  event(2, {
    type: 'tool-execution-start',
    toolCallId: 'call-browser',
    name: 'computer',
    category: 'computer-use',
    summary: 'Clicking through the page',
    input: {},
  }),
  event(3, {
    type: 'progress-update',
    progressId: 'step-1',
    summary: 'Wrapping up',
    status: 'completed',
  }),
];

function panel() {
  return render(
    <TaskDetailPanel
      run={run}
      events={events}
      loading={false}
      error={null}
      onRefresh={vi.fn()}
      onClose={vi.fn()}
      onOpenConversation={vi.fn()}
    />,
  );
}

describe('TaskDetailPanel · tool identity in the progress log', () => {
  it('gives each tool entry an icon keyed to its tool category, not just a status dot', () => {
    const { container } = panel();

    const categories = [...container.querySelectorAll('[data-tool-category]')].map((node) =>
      node.getAttribute('data-tool-category'),
    );

    expect(categories).toEqual(['web-search', 'code-execution', 'computer-use']);
  });

  it('renders distinct glyphs per category rather than one repeated mark', () => {
    const { container } = panel();

    const shapes = [...container.querySelectorAll('[data-tool-category]')].map(
      (node) => node.innerHTML,
    );

    expect(new Set(shapes).size).toBe(3);
  });

  it('leaves non-tool progress entries on the plain status dot', () => {
    const { container } = panel();

    expect(screen.getByText('Wrapping up')).toBeTruthy();
    expect(container.querySelectorAll('[data-tool-category]')).toHaveLength(3);
    expect(
      container.querySelectorAll('span.rounded-full.h-2, span.h-2.w-2').length,
    ).toBeGreaterThan(0);
  });
});
