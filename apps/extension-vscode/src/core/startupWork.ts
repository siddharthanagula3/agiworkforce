/**
 * Background work the extension owes a user who is actually using it.
 *
 * VS Code wakes the extension for several reasons, and one of them is the
 * window finishing startup. Heartbeats, account lookups and anything else that
 * leaves the machine wait here until the user opens the AGI view, runs an AGI
 * command or reopens an AGI session, unless `agiWorkforce.activateOnStartup`
 * says the user wants it running from the moment the window opens.
 */

import { recordFailure } from './subsystemHealth';

export const IN_USE_REASONS = [
  'chat-view',
  'command',
  'session-restore',
  'startup-setting',
] as const;

export type InUseReason = (typeof IN_USE_REASONS)[number];

type StartupTask = (reason: InUseReason) => void;

let waiting: StartupTask[] | undefined = [];
let started: InUseReason | undefined;

function run(task: StartupTask, reason: InUseReason): void {
  try {
    task(reason);
  } catch (err) {
    recordFailure('startup-work', err);
  }
}

export function whenInUse(task: StartupTask): void {
  if (started !== undefined) {
    run(task, started);
    return;
  }
  waiting?.push(task);
}

export function markInUse(reason: InUseReason): void {
  if (started !== undefined) return;
  started = reason;
  const tasks = waiting ?? [];
  waiting = undefined;
  for (const task of tasks) run(task, reason);
}

export function inUseReason(): InUseReason | undefined {
  return started;
}

export function __resetStartupWorkForTests(): void {
  waiting = [];
  started = undefined;
}
