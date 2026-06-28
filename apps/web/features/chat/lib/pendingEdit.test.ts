import { describe, it, expect } from 'vitest';
import { planEditRollback, consumePendingEdit, planRegenerateRollback } from './pendingEdit';

const msgs = [
  { id: 'u1', role: 'user' },
  { id: 'a1', role: 'assistant' },
  { id: 'u2', role: 'user' },
  { id: 'a2', role: 'assistant' },
];

describe('planEditRollback', () => {
  it('rolls back the edited user message and everything after it', () => {
    const plan = planEditRollback(msgs, 'u1', 'conv-1');
    expect(plan).toEqual({ conversationId: 'conv-1', rollbackIds: ['u1', 'a1', 'u2', 'a2'] });
  });

  it('rolls back from a later user message onward only', () => {
    const plan = planEditRollback(msgs, 'u2', 'conv-1');
    expect(plan).toEqual({ conversationId: 'conv-1', rollbackIds: ['u2', 'a2'] });
  });

  it('refuses to plan a rollback for an assistant message', () => {
    expect(planEditRollback(msgs, 'a1', 'conv-1')).toBeNull();
  });

  it('returns null for an unknown message id', () => {
    expect(planEditRollback(msgs, 'nope', 'conv-1')).toBeNull();
  });
});

describe('planRegenerateRollback', () => {
  it('rolls back from the preceding user message (not the assistant) so re-send does not duplicate', () => {
    // Regenerate the LAST assistant (a2). The rollback must include u2 so that
    // re-sending its content replaces it instead of adding a second u2.
    const plan = planRegenerateRollback(msgs, 'a2');
    expect(plan).toEqual({ userIndex: 2, rollbackIds: ['u2', 'a2'] });
  });

  it('rolls back the full turn when regenerating an earlier assistant message', () => {
    const plan = planRegenerateRollback(msgs, 'a1');
    expect(plan).toEqual({ userIndex: 0, rollbackIds: ['u1', 'a1', 'u2', 'a2'] });
  });

  it('returns null when regenerating a message with no preceding user turn', () => {
    expect(planRegenerateRollback([{ id: 'a0', role: 'assistant' }], 'a0')).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(planRegenerateRollback(msgs, 'nope')).toBeNull();
  });
});

describe('consumePendingEdit', () => {
  it('returns the rollback ids when the send targets the same conversation', () => {
    const pending = { conversationId: 'conv-1', rollbackIds: ['u1', 'a1'] };
    expect(consumePendingEdit(pending, 'conv-1')).toEqual({ rollbackIds: ['u1', 'a1'] });
  });

  it('does NOT apply a rollback to a different conversation (cross-conversation safety)', () => {
    const pending = { conversationId: 'conv-1', rollbackIds: ['u1', 'a1'] };
    expect(consumePendingEdit(pending, 'conv-2')).toBeNull();
  });

  it('returns null when there is no pending edit (normal send is non-destructive)', () => {
    expect(consumePendingEdit(null, 'conv-1')).toBeNull();
  });

  it('returns null for an empty rollback range', () => {
    const pending = { conversationId: 'conv-1', rollbackIds: [] };
    expect(consumePendingEdit(pending, 'conv-1')).toBeNull();
  });
});
