import { describe, expect, it } from 'vitest';

import { type ActionStatus, RUNTIME_ACTIVITY_STEP_STATUSES } from '../conversation';
import { LIFECYCLE_STATUS_BY_AGENT_STATUS } from '../agent';
import { LIFECYCLE_STATUS_BY_AGENT_SESSION_STATUS } from '../agent-status';
import {
  AGENT_TASK_STATE_DISPATCH_STATUSES,
  LIFECYCLE_STATUS_BY_AGENT_TASK_STATE,
  LIFECYCLE_STATUS_BY_DISPATCH_STATUS,
  RUN_STATUS_LABELS,
  TERMINAL_AGENT_TASK_STATES,
} from '../cross-device';
import { ErrorCode } from '../errors';
import {
  COMPLETION_SPELLINGS_RESERVED_AS_ALIASES,
  LIFECYCLE_STATUSES,
  LIFECYCLE_STATUS_ALIASES,
  LIFECYCLE_TRANSITIONS,
  SURFACE_STATES,
  SURFACE_STATE_RULES,
  TERMINAL_LIFECYCLE_STATUSES,
  WORK_LIFECYCLE_STATUSES,
  canTransitionLifecycleStatus,
  currentLifecycleStage,
  isLifecycleStatus,
  isPermanentFailureSurfaceState,
  isTerminalLifecycleStatus,
  lifecycleStatusFromParts,
  lifecycleTransitionEmitsEvent,
  surfaceStateForDenialLayers,
  surfaceStateForErrorCode,
  surfaceStateForResourceLifecycle,
  surfaceStateForSyncState,
  toLifecycleStatus,
  type LifecycleStatus,
} from '../lifecycle-status';
import { RESOURCE_LIFECYCLE_STATES } from '../resource-lifecycle';
import type { WorkforceTaskStatus } from '../database';
import type { RuntimeActivityStatus } from '../runtime';
import {
  LIFECYCLE_STATUS_BY_WORKFLOW_STATUS,
  lifecycleStatusForWorkflow,
  type WorkflowStatus,
} from '../workflow';
import { SyncState } from '../web-offline';

/** The video job column is in apps/web; its spellings are asserted here so the
 * contract fails first when one of them stops resolving. */
const VIDEO_JOB_STATUSES = [
  'submitting',
  'queued',
  'processing',
  'completed',
  'failed',
  'outcome_unknown',
] as const;

const UI_STATUSES = ['idle', 'loading', 'success', 'error'] as const;

describe('lifecycle status vocabulary', () => {
  it('has no duplicate members and every member is recognised', () => {
    expect(new Set(LIFECYCLE_STATUSES).size).toBe(LIFECYCLE_STATUSES.length);
    for (const status of LIFECYCLE_STATUSES) expect(isLifecycleStatus(status)).toBe(true);
  });

  it('covers every work-lifecycle value the four domains share', () => {
    for (const status of WORK_LIFECYCLE_STATUSES) expect(isLifecycleStatus(status)).toBe(true);
    const asLifecycle: readonly LifecycleStatus[] = WORK_LIFECYCLE_STATUSES;
    expect(asLifecycle).toHaveLength(5);
    const action: ActionStatus = 'cancelled';
    const activity: RuntimeActivityStatus = action;
    const task: WorkforceTaskStatus = activity;
    const workflow: WorkflowStatus = task;
    expect(workflow).toBe('cancelled');
  });

  it('projects every workflow status, including the one canonical names lack', () => {
    expect(Object.keys(LIFECYCLE_STATUS_BY_WORKFLOW_STATUS)).toHaveLength(6);
    expect(lifecycleStatusForWorkflow('paused')).toBe('awaiting_input');
    expect(toLifecycleStatus('paused')).toBe('awaiting_input');
  });

  it('covers every VideoJobStatus value directly or by alias', () => {
    for (const status of VIDEO_JOB_STATUSES) {
      expect(toLifecycleStatus(status)).not.toBeNull();
    }
    expect(toLifecycleStatus('submitting')).toBe('pending');
    expect(toLifecycleStatus('processing')).toBe('running');
  });

  it('covers every RuntimeActivityStep status', () => {
    for (const status of RUNTIME_ACTIVITY_STEP_STATUSES) {
      expect(isLifecycleStatus(status)).toBe(true);
    }
  });

  it('keeps `completed` the only canonical spelling of a successful ending', () => {
    for (const spelling of COMPLETION_SPELLINGS_RESERVED_AS_ALIASES) {
      expect(isLifecycleStatus(spelling)).toBe(false);
      expect(toLifecycleStatus(spelling)).toBe('completed');
    }
  });

  it('never lets an alias shadow a canonical member', () => {
    for (const alias of Object.keys(LIFECYCLE_STATUS_ALIASES)) {
      expect(isLifecycleStatus(alias)).toBe(false);
    }
    for (const target of Object.values(LIFECYCLE_STATUS_ALIASES)) {
      expect(isLifecycleStatus(target)).toBe(true);
    }
  });

  it('treats outcome_unknown as unresolved rather than terminal', () => {
    expect(isTerminalLifecycleStatus('outcome_unknown')).toBe(false);
    expect(canTransitionLifecycleStatus('outcome_unknown', 'completed')).toBe(true);
    for (const terminal of TERMINAL_LIFECYCLE_STATUSES) {
      expect(LIFECYCLE_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });

  it('declares a transition list for every status and only to known statuses', () => {
    for (const status of LIFECYCLE_STATUSES) {
      const next = LIFECYCLE_TRANSITIONS[status] as readonly LifecycleStatus[];
      expect(next).toBeDefined();
      for (const target of next) {
        expect(isLifecycleStatus(target)).toBe(true);
        expect(target).not.toBe(status);
      }
    }
  });

  it('requires an event on start, on every ending and on an unknown outcome', () => {
    expect(lifecycleTransitionEmitsEvent('queued', 'running')).toBe(true);
    expect(lifecycleTransitionEmitsEvent('running', 'completed')).toBe(true);
    expect(lifecycleTransitionEmitsEvent('running', 'failed')).toBe(true);
    expect(lifecycleTransitionEmitsEvent('running', 'outcome_unknown')).toBe(true);
    expect(lifecycleTransitionEmitsEvent('idle', 'pending')).toBe(false);
    expect(lifecycleTransitionEmitsEvent('completed', 'running')).toBe(false);
  });

  it('never reports work that partly landed as a whole failure', () => {
    expect(lifecycleStatusFromParts(['completed', 'failed'])).toBe('completed_partial');
    expect(lifecycleStatusFromParts(['failed', 'failed'])).toBe('failed');
    expect(lifecycleStatusFromParts(['completed', 'completed'])).toBe('completed');
    expect(lifecycleStatusFromParts(['completed', 'cancelled'])).toBe('completed_partial');
    expect(lifecycleStatusFromParts(['cancelled', 'cancelled'])).toBe('cancelled');
    expect(isTerminalLifecycleStatus('completed_partial')).toBe(true);
    expect(toLifecycleStatus('partial')).toBe('completed_partial');
  });

  it('holds a whole open while any part still owes a reconciliation', () => {
    expect(lifecycleStatusFromParts(['completed', 'outcome_unknown'])).toBe('outcome_unknown');
    expect(lifecycleStatusFromParts(['failed', 'outcome_unknown'])).toBe('outcome_unknown');
    expect(lifecycleStatusFromParts(['completed', 'running'])).toBe('running');
    expect(lifecycleStatusFromParts([])).toBe('completed');
  });

  it('reports the first unfinished stage as the current one', () => {
    const stages = [
      { status: 'completed' as const, message: 'Read the file' },
      { status: 'running' as const, message: 'Edit the file' },
      { status: 'pending' as const, message: 'Run the tests' },
    ];
    expect(currentLifecycleStage(stages)?.message).toBe('Edit the file');
    expect(currentLifecycleStage([{ status: 'completed' as const }])).toBeNull();
  });
});

describe('domain projections', () => {
  const projections = {
    agentTaskState: LIFECYCLE_STATUS_BY_AGENT_TASK_STATE,
    dispatchStatus: LIFECYCLE_STATUS_BY_DISPATCH_STATUS,
    agentStatus: LIFECYCLE_STATUS_BY_AGENT_STATUS,
    agentSessionStatus: LIFECYCLE_STATUS_BY_AGENT_SESSION_STATUS,
  } as const;

  it('projects every domain state onto a canonical status', () => {
    for (const [name, projection] of Object.entries(projections)) {
      const entries = Object.entries(projection);
      expect(entries.length, name).toBeGreaterThan(0);
      for (const [state, status] of entries) {
        expect(isLifecycleStatus(status), `${name}.${state}`).toBe(true);
      }
    }
  });

  it('covers every dispatch status the labels declare', () => {
    expect(Object.keys(LIFECYCLE_STATUS_BY_DISPATCH_STATUS).sort()).toEqual(
      Object.keys(RUN_STATUS_LABELS).sort(),
    );
  });

  it('covers every agent task state dispatch already maps', () => {
    expect(Object.keys(LIFECYCLE_STATUS_BY_AGENT_TASK_STATE).sort()).toEqual(
      Object.keys(AGENT_TASK_STATE_DISPATCH_STATUSES).sort(),
    );
  });

  it('keeps a partially completed run apart from a failed one', () => {
    expect(LIFECYCLE_STATUS_BY_AGENT_TASK_STATE.partial).toBe('completed_partial');
    expect(LIFECYCLE_STATUS_BY_AGENT_TASK_STATE.failed).toBe('failed');
    expect(LIFECYCLE_STATUS_BY_AGENT_TASK_STATE.partial).not.toBe(
      LIFECYCLE_STATUS_BY_AGENT_TASK_STATE.failed,
    );
  });

  it('agrees with the engine on which agent task states are endings', () => {
    for (const [state, status] of Object.entries(LIFECYCLE_STATUS_BY_AGENT_TASK_STATE)) {
      const engineSaysTerminal = TERMINAL_AGENT_TASK_STATES.has(
        state as Parameters<typeof TERMINAL_AGENT_TASK_STATES.has>[0],
      );
      expect(isTerminalLifecycleStatus(status), state).toBe(engineSaysTerminal);
    }
  });
});

describe('surface state', () => {
  it('extends the four states every client already had', () => {
    for (const status of UI_STATUSES) {
      expect(SURFACE_STATES).toContain(status);
    }
  });

  it('declares a rule for every state', () => {
    for (const state of SURFACE_STATES) {
      expect(SURFACE_STATE_RULES[state]).toBeDefined();
    }
  });

  it('never renders offline as a permanent failure', () => {
    expect(isPermanentFailureSurfaceState('offline')).toBe(false);
    expect(SURFACE_STATE_RULES.offline.retryable).toBe(true);
    expect(SURFACE_STATE_RULES.offline.remedy).toBe('reconnect');
    expect(surfaceStateForSyncState(SyncState.OFFLINE)).toBe('offline');
    expect(surfaceStateForErrorCode(ErrorCode.NETWORK_ERROR)).toBe('offline');
  });

  it('gives permission, policy, entitlement and support their own state', () => {
    expect(surfaceStateForErrorCode(ErrorCode.FORBIDDEN)).toBe('permission_denied');
    expect(surfaceStateForErrorCode(ErrorCode.UNAUTHORIZED)).toBe('permission_denied');
    expect(surfaceStateForErrorCode(ErrorCode.MFA_REQUIRED)).toBe('policy_blocked');
    expect(surfaceStateForErrorCode(ErrorCode.IP_NOT_ALLOWED)).toBe('policy_blocked');
    expect(surfaceStateForErrorCode(ErrorCode.PAYMENT_REQUIRED)).toBe('entitlement_blocked');
    expect(surfaceStateForErrorCode(ErrorCode.CAPABILITY_UNAVAILABLE)).toBe('unsupported');
    expect(surfaceStateForErrorCode(ErrorCode.INTERNAL_ERROR)).toBe('error');
  });

  it('never offers an upgrade for something that would still not work', () => {
    expect(surfaceStateForDenialLayers(['tier'])).toBe('entitlement_blocked');
    expect(surfaceStateForDenialLayers(['settings'])).toBe('policy_blocked');
    expect(surfaceStateForDenialLayers(['model'])).toBe('unsupported');
    expect(surfaceStateForDenialLayers(['tier', 'model'])).toBe('unsupported');
    expect(surfaceStateForDenialLayers(['tier', 'settings'])).toBe('policy_blocked');
    expect(surfaceStateForDenialLayers([])).toBe('error');
  });

  it('separates a deleted resource from an archived one', () => {
    expect(surfaceStateForResourceLifecycle('active')).toBe('success');
    expect(surfaceStateForResourceLifecycle('archived')).toBe('archived');
    expect(surfaceStateForResourceLifecycle('soft_deleted')).toBe('deleted');
    expect(surfaceStateForResourceLifecycle('purged')).toBe('deleted');
    for (const state of RESOURCE_LIFECYCLE_STATES) {
      expect(SURFACE_STATES).toContain(surfaceStateForResourceLifecycle(state));
    }
    expect(SURFACE_STATE_RULES.archived.remedy).toBe('restore');
    expect(isPermanentFailureSurfaceState('archived')).toBe(false);
  });

  it('keeps ActionStatus assignable to the shared vocabulary', () => {
    const status: LifecycleStatus = 'completed' satisfies ActionStatus;
    expect(status).toBe('completed');
  });
});
