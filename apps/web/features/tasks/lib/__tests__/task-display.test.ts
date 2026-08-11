import { describe, expect, it } from 'vitest';
import { isCancellableState, taskStateLabel, taskStateTone, workModeLabel } from '../task-display';

describe('task-display', () => {
  it('labels work modes with the AGI product vocabulary', () => {
    expect(workModeLabel('agiwork')).toBe('AGI Work');
    expect(workModeLabel('research')).toBe('Research');
    expect(workModeLabel('chat')).toBe('Chat');
  });

  it('maps every state to a tone', () => {
    expect(taskStateTone('running')).toBe('active');
    expect(taskStateTone('awaiting_input')).toBe('attention');
    expect(taskStateTone('completed')).toBe('success');
    expect(taskStateTone('failed')).toBe('danger');
    expect(taskStateTone('cancelled')).toBe('muted');
  });

  it('treats only non-terminal states as cancellable', () => {
    for (const s of ['queued', 'running', 'awaiting_input', 'paused'] as const) {
      expect(isCancellableState(s)).toBe(true);
    }
    for (const s of ['ready_for_review', 'completed', 'failed', 'cancelled', 'archived'] as const) {
      expect(isCancellableState(s)).toBe(false);
    }
  });

  it('gives every state a human label', () => {
    expect(taskStateLabel('ready_for_review')).toBe('Ready for review');
    expect(taskStateLabel('awaiting_input')).toBe('Awaiting input');
  });
});
