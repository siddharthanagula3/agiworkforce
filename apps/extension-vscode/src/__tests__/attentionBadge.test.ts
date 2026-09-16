import { describe, expect, it } from 'vitest';
import { AttentionState } from '../features/sidebar-webview/attentionBadge';

function after(...events: Parameters<AttentionState['record']>[0][]) {
  const state = new AttentionState();
  for (const event of events) state.record(event);
  return state.badge();
}

describe('what the hidden chat panel says on the Activity Bar', () => {
  it('says nothing until something wants the user', () => {
    expect(after()).toBeUndefined();
  });

  it('marks a turn that is blocked on an approval', () => {
    expect(after('approval-requested')).toEqual({
      value: 1,
      tooltip: 'AGI Workforce is waiting for your approval',
    });
  });

  it('counts concurrent approvals rather than showing the first one twice', () => {
    expect(after('approval-requested', 'approval-requested')).toEqual({
      value: 2,
      tooltip: 'AGI Workforce is waiting on 2 approvals',
    });
  });

  it('drops back to one when a single approval is answered', () => {
    expect(after('approval-requested', 'approval-requested', 'approval-resolved')?.value).toBe(1);
  });

  it('clears once every approval is answered and nothing else is waiting', () => {
    expect(after('approval-requested', 'approval-resolved')).toBeUndefined();
  });

  it('never counts below zero, so a stray resolution cannot hide a later approval', () => {
    expect(after('approval-resolved', 'approval-resolved', 'approval-requested')?.value).toBe(1);
  });

  it('marks a reply that finished while the panel was hidden', () => {
    expect(after('turn-finished')).toEqual({
      value: 1,
      tooltip: 'AGI Workforce finished a reply',
    });
  });

  it('keeps showing the approval when a turn also finished, since only one blocks', () => {
    expect(after('turn-finished', 'approval-requested')?.tooltip).toContain('approval');
  });

  it('shows the finished reply again once the approval it was behind is answered', () => {
    expect(after('turn-finished', 'approval-requested', 'approval-resolved')?.tooltip).toContain(
      'finished',
    );
  });

  it('clears everything once the user looks at the panel', () => {
    expect(after('approval-requested', 'turn-finished', 'seen')).toBeUndefined();
  });

  it('marks again after the user looks away and something new happens', () => {
    expect(after('turn-finished', 'seen', 'approval-requested')?.value).toBe(1);
  });
});
