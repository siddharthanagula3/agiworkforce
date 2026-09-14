import { describe, expect, it } from 'vitest';
import {
  RUN_STATUS_LABELS,
  runStatusLabel,
  type DispatchTaskLifecycleStatus,
} from '../cross-device';
import {
  TOOL_CALL_STATUS_LABELS,
  toolCallStatusLabel,
  type ToolCallDisplayStatus,
  type ToolCallStatus,
} from '../conversation';
import { TOOL_APPROVAL_ACTION_LABELS } from '../tool-approval-policy';

const RUN_STATUSES = Object.keys(RUN_STATUS_LABELS) as DispatchTaskLifecycleStatus[];
const TOOL_CALL_STATUSES = Object.keys(TOOL_CALL_STATUS_LABELS) as ToolCallDisplayStatus[];

describe('run status labels', () => {
  it('labels every state in the lifecycle union', () => {
    const expected: DispatchTaskLifecycleStatus[] = [
      'accepted',
      'queued',
      'running',
      'awaiting_input',
      'ready_for_review',
      'completed',
      'failed',
      'cancelled',
      'rejected',
    ];
    expect(RUN_STATUSES.sort()).toEqual([...expected].sort());
  });

  it('reads back the label the record holds', () => {
    for (const status of RUN_STATUSES) {
      expect(runStatusLabel(status)).toBe(RUN_STATUS_LABELS[status]);
    }
  });

  it('gives an accepted run the same word as a queued one', () => {
    expect(runStatusLabel('accepted')).toBe(runStatusLabel('queued'));
  });

  it('names a finished run Completed rather than Done or Success', () => {
    expect(runStatusLabel('completed')).toBe('Completed');
  });

  it('spells every label as a sentence-case phrase, never a bare lowercase token', () => {
    for (const status of RUN_STATUSES) {
      const label = runStatusLabel(status);
      expect(label.length).toBeGreaterThan(0);
      expect(label[0]).toBe(label[0]!.toUpperCase());
      expect(label).not.toBe(status);
    }
  });

  it('distinguishes a run waiting on the user from one waiting on a reviewer', () => {
    expect(runStatusLabel('awaiting_input')).toBe('Waiting for input');
    expect(runStatusLabel('ready_for_review')).toBe('Ready for review');
  });
});

describe('tool call status labels', () => {
  it('covers every persisted tool call status', () => {
    const persisted: ToolCallStatus[] = ['pending', 'running', 'completed', 'failed'];
    for (const status of persisted) {
      expect(TOOL_CALL_STATUSES).toContain(status);
    }
  });

  it('carries the approval and cancellation states the surfaces render', () => {
    expect(toolCallStatusLabel('awaiting_approval')).toBe('Waiting for approval');
    expect(toolCallStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('reuses the run vocabulary for the states both lifecycles share', () => {
    expect(toolCallStatusLabel('pending')).toBe(runStatusLabel('queued'));
    expect(toolCallStatusLabel('running')).toBe(runStatusLabel('running'));
    expect(toolCallStatusLabel('completed')).toBe(runStatusLabel('completed'));
    expect(toolCallStatusLabel('failed')).toBe(runStatusLabel('failed'));
  });
});

describe('tool approval verbs', () => {
  it('spells one word per decision', () => {
    expect(TOOL_APPROVAL_ACTION_LABELS.allow).toBe('Allow');
    expect(TOOL_APPROVAL_ACTION_LABELS.alwaysAllow).toBe('Always allow');
    expect(TOOL_APPROVAL_ACTION_LABELS.ask).toBe('Ask');
    expect(TOOL_APPROVAL_ACTION_LABELS.deny).toBe('Deny');
    expect(TOOL_APPROVAL_ACTION_LABELS.approve).toBe('Approve');
  });

  it('has no second spelling for refusing an action', () => {
    const verbs = Object.values(TOOL_APPROVAL_ACTION_LABELS);
    expect(verbs).not.toContain('Block');
    expect(verbs).not.toContain('Reject');
  });
});
