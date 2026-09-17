import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agentTaskStateForStopReason } from '../cloud-code';
import {
  AGENT_TASK_STATE_LABELS,
  TERMINAL_AGENT_TASK_STATES,
  agentTaskStateForDispatchStatus,
  agentTaskStateLabel,
  dispatchStatusForAgentTaskState,
  agentTaskStatesReadAs,
  legacyAgentTaskState,
  RUN_STATUS_LABELS,
  runStatusLabel,
  type DispatchTaskLifecycleStatus,
} from '../cross-device';
import type { AgentTaskState } from '../generated/protocol/AgentTaskState';
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

describe('agent task state labels', () => {
  const states = Object.keys(AGENT_TASK_STATE_LABELS) as AgentTaskState[];

  it('labels every state the engine can report', () => {
    const expected: AgentTaskState[] = [
      'queued',
      'running',
      'awaiting_input',
      'ready_for_review',
      'completed',
      'failed',
      'cancelled',
      'paused',
      'archived',
      'planning',
      'awaiting_approval',
      'resuming',
      'partial',
      'timed_out',
    ];
    expect([...states].sort()).toEqual([...expected].sort());
  });

  it('reuses the run vocabulary for every state the two lifecycles share', () => {
    for (const state of [
      'queued',
      'running',
      'awaiting_input',
      'ready_for_review',
      'completed',
      'failed',
      'cancelled',
    ] as const) {
      expect(agentTaskStateLabel(state)).toBe(runStatusLabel(state));
    }
  });

  it('has one word for a run waiting on the user, not two', () => {
    expect(agentTaskStateLabel('awaiting_input')).toBe('Waiting for input');
    expect(Object.values(AGENT_TASK_STATE_LABELS)).not.toContain('Waiting on you');
  });

  it('adds words only for the states dispatch has none for', () => {
    expect(agentTaskStateLabel('paused')).toBe('Paused');
    expect(agentTaskStateLabel('archived')).toBe('Archived');
    expect(agentTaskStateLabel('planning')).toBe('Planning');
    expect(agentTaskStateLabel('awaiting_approval')).toBe('Waiting for approval');
    expect(agentTaskStateLabel('resuming')).toBe('Resuming');
    expect(agentTaskStateLabel('partial')).toBe('Partially completed');
    expect(agentTaskStateLabel('timed_out')).toBe('Timed out');
  });

  it('uses the tool-call word for an approval wait, so a run and its call agree', () => {
    expect(agentTaskStateLabel('awaiting_approval')).toBe(toolCallStatusLabel('awaiting_approval'));
  });
});

describe('work state mapping', () => {
  const states = Object.keys(AGENT_TASK_STATE_LABELS) as AgentTaskState[];
  const original: AgentTaskState[] = [
    'queued',
    'running',
    'awaiting_input',
    'ready_for_review',
    'completed',
    'failed',
    'cancelled',
    'paused',
    'archived',
  ];

  it('degrades every state to one a client built before the finer states parses', () => {
    for (const state of states) {
      expect(original).toContain(legacyAgentTaskState(state));
    }
    for (const state of original) {
      expect(legacyAgentTaskState(state)).toBe(state);
    }
  });

  it('mirrors the Rust legacy_equivalent mapping exactly', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../../crates/agiworkforce-protocol/src/task_state.rs',
      ),
      'utf8',
    );
    const body = /pub const fn legacy_equivalent[\s\S]*?\n {4}\}/u.exec(source)?.[0] ?? '';
    const snake = (name: string) => name.replace(/(?<!^)([A-Z])/gu, '_$1').toLowerCase();
    const rustPairs = new Map<string, string>();
    for (const [, lhs, rhs] of body.matchAll(/((?:Self::\w+\s*\|?\s*)+)=>\s*Self::(\w+)/gu)) {
      for (const [, variant] of (lhs ?? '').matchAll(/Self::(\w+)/gu)) {
        rustPairs.set(snake(variant ?? ''), snake(rhs ?? ''));
      }
    }
    expect(rustPairs.size).toBeGreaterThan(0);
    for (const state of states) {
      expect(legacyAgentTaskState(state)).toBe(rustPairs.get(state) ?? state);
    }
  });

  it('lists a legacy filter state together with every finer state that reads as it', () => {
    expect(agentTaskStatesReadAs('running').sort()).toEqual(['planning', 'resuming', 'running']);
    expect(agentTaskStatesReadAs('failed').sort()).toEqual(['failed', 'partial', 'timed_out']);
    expect(agentTaskStatesReadAs('awaiting_input').sort()).toEqual([
      'awaiting_approval',
      'awaiting_input',
    ]);
    expect(agentTaskStatesReadAs('timed_out')).toEqual(['timed_out']);
  });

  it('maps every dispatch status and code stop reason onto the one Work vocabulary', () => {
    expect(agentTaskStateForDispatchStatus('accepted')).toBe('queued');
    expect(agentTaskStateForDispatchStatus('rejected')).toBe('failed');
    expect(agentTaskStateForDispatchStatus('awaiting_input')).toBe('awaiting_input');
    expect(agentTaskStateForStopReason('awaiting_approval')).toBe('awaiting_approval');
    expect(agentTaskStateForStopReason('timeout')).toBe('timed_out');
    expect(agentTaskStateForStopReason('max_steps')).toBe('partial');
    expect(agentTaskStateForStopReason('done')).toBe('ready_for_review');
    for (const status of RUN_STATUSES) {
      expect(states).toContain(agentTaskStateForDispatchStatus(status));
    }
    expect(dispatchStatusForAgentTaskState('paused')).toBe('awaiting_input');
    expect(dispatchStatusForAgentTaskState('archived')).toBe('completed');
    for (const state of states) {
      expect(dispatchStatusForAgentTaskState(state)).toBe(
        dispatchStatusForAgentTaskState(legacyAgentTaskState(state)),
      );
    }
  });

  it('names every checklist Work state', () => {
    for (const state of [
      'queued',
      'planning',
      'running',
      'awaiting_input',
      'awaiting_approval',
      'paused',
      'resuming',
      'completed',
      'partial',
      'failed',
      'cancelled',
      'timed_out',
    ] as const) {
      expect(TERMINAL_AGENT_TASK_STATES.has(state)).toBe(
        ['completed', 'partial', 'failed', 'cancelled', 'timed_out'].includes(state),
      );
    }
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
