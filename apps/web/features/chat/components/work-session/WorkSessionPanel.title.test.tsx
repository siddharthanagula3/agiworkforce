import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { WorkSessionPanel } from './WorkSessionPanel';
import { buildTaskDockSummary } from './taskDockSummary';
import { TASK_DOCK_FALLBACK_TITLE } from '../../lib/agi-work';

vi.mock('../../utils/downloadArtifacts', () => ({
  downloadAllArtifacts: vi.fn().mockResolvedValue(undefined),
  downloadGeneratedFile: vi.fn().mockResolvedValue(undefined),
}));

const GOAL = 'Draft the Q3 investor update';

function messages(withGoal: boolean): Message[] {
  return [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Working.',
      createdAt: '2026-07-30T12:00:01.000Z',
      metadata: {
        agentActivity: {
          schemaVersion: 1,
          sessionId: 'conv-1',
          turnId: 'assistant-1',
          lastSequence: 2,
          status: 'running',
          startedAtMs: 1,
          updatedAtMs: 2,
          entries: [
            ...(withGoal
              ? [
                  {
                    kind: 'progress' as const,
                    id: 'goal',
                    sequence: 1,
                    progressId: 'agiwork:goal',
                    summary: GOAL,
                    status: 'running' as const,
                  },
                ]
              : []),
            {
              kind: 'progress' as const,
              id: 'step-1',
              sequence: 2,
              progressId: 'step-1',
              summary: 'Collecting numbers',
              status: 'running' as const,
            },
          ],
        },
      },
    } as unknown as Message,
  ];
}

describe('WorkSessionPanel header (agentic-modes-gap-04)', () => {
  it('titles the session with the run own goal instead of a constant', () => {
    expect(buildTaskDockSummary({ messages: messages(true), artifacts: [] }).title).toBe(GOAL);

    render(<WorkSessionPanel messages={messages(true)} open onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(GOAL);
    expect(screen.queryByText(TASK_DOCK_FALLBACK_TITLE)).toBeNull();
  });

  it('falls back to the generic label only when the run declared no goal', () => {
    expect(buildTaskDockSummary({ messages: messages(false), artifacts: [] }).title).toBeNull();

    render(<WorkSessionPanel messages={messages(false)} open onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(TASK_DOCK_FALLBACK_TITLE);
  });
});
