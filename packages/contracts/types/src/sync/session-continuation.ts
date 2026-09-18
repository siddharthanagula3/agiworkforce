/**
 * Whether a workflow survives leaving the device it started on. Chat and code
 * answered this in their own services and the other six answered nowhere, so a
 * surface offering "continue on another device" could not know whether it could
 * keep the promise. The three questions below are distinct, not one.
 */

export const CONTINUABLE_WORKFLOWS = [
  'chat',
  'agent',
  'work',
  'research',
  'code',
  'browser',
  'schedule',
  'study',
] as const;

export type ContinuableWorkflow = (typeof CONTINUABLE_WORKFLOWS)[number];

export interface SessionContinuation {
  workflow: ContinuableWorkflow;
  /** Held on the device, so it opens with no network. */
  locallyPersisted: boolean;
  /** Rebuildable on a device that has never seen it, from the cloud alone. */
  rehydratable: boolean;
  /** Carries on from where it stopped rather than starting again. */
  resumable: boolean;
  /** What a surface must tell the user when one of the three is false. */
  limit: string | null;
}

export const SESSION_CONTINUATION: Readonly<Record<ContinuableWorkflow, SessionContinuation>> = {
  chat: {
    workflow: 'chat',
    locallyPersisted: true,
    rehydratable: true,
    resumable: true,
    limit: null,
  },
  agent: {
    workflow: 'agent',
    locallyPersisted: false,
    rehydratable: true,
    resumable: true,
    limit: 'The run lives in the cloud, so it needs a connection to open at all.',
  },
  work: {
    workflow: 'work',
    locallyPersisted: false,
    rehydratable: true,
    resumable: true,
    limit: 'The plan is rebuilt from the cloud; steps already done are not repeated.',
  },
  research: {
    workflow: 'research',
    locallyPersisted: false,
    rehydratable: true,
    resumable: false,
    limit: 'A stopped report keeps its findings but restarts from the brief; it is not continued.',
  },
  code: {
    workflow: 'code',
    locallyPersisted: false,
    rehydratable: true,
    resumable: true,
    limit: 'Resuming claims the session, so a second device waits until the first releases it.',
  },
  browser: {
    workflow: 'browser',
    locallyPersisted: false,
    rehydratable: true,
    resumable: false,
    limit: 'The browser it drove is gone when the task stops, so a new task starts a new browser.',
  },
  schedule: {
    workflow: 'schedule',
    locallyPersisted: false,
    rehydratable: true,
    resumable: false,
    limit: 'A missed run is re-run whole under the schedule policy, never continued part-way.',
  },
  study: {
    workflow: 'study',
    locallyPersisted: false,
    rehydratable: true,
    resumable: false,
    limit: 'Progress is kept, but a stopped session is reopened as a new one from that progress.',
  },
};

export function sessionContinuation(workflow: ContinuableWorkflow): SessionContinuation {
  return SESSION_CONTINUATION[workflow];
}

export function isContinuableWorkflow(value: string): value is ContinuableWorkflow {
  return (CONTINUABLE_WORKFLOWS as readonly string[]).includes(value);
}

/** Workflows a surface may offer to continue elsewhere without qualifying it. */
export function workflowsResumableAcrossDevices(): ContinuableWorkflow[] {
  return CONTINUABLE_WORKFLOWS.filter((workflow) => SESSION_CONTINUATION[workflow].resumable);
}
