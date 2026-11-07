'use client';

import type { SessionAuthority } from '@/lib/identity/request-authority';

export interface WorkspaceOwner {
  readonly session: SessionAuthority;
  readonly incarnation: number;
  epoch: number;
  scopeKey: string | null;
  phase: 'resolving' | 'admitted' | 'switching' | 'uncertain' | 'unavailable';
}

let owner: WorkspaceOwner | null = null;
let incarnation = 0;
let revision = 0;
let switching = false;
const accountBarriers = new Map<string, 'switching' | 'uncertain'>();
const listeners = new Set<() => void>();

function publish(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export const subscribeWorkspaceAdmission = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const workspaceAdmissionRevision = () => revision;

export function observeWorkspaceOwner(session: SessionAuthority | null): WorkspaceOwner | null {
  if (
    owner &&
    session &&
    owner.session.isCurrent() &&
    session.isCurrent() &&
    owner.session.userId === session.userId &&
    owner.session.sessionId === session.sessionId
  ) {
    return owner;
  }
  if (!owner && !session) return null;
  if (owner) owner.epoch += 1;
  owner = session?.isCurrent()
    ? {
        session,
        incarnation: ++incarnation,
        epoch: 0,
        scopeKey: null,
        phase: accountBarriers.get(session.userId) ?? 'resolving',
      }
    : null;
  queueMicrotask(publish);
  return owner;
}

export function workspaceOwnerIsCurrent(candidate: WorkspaceOwner, epoch: number): boolean {
  return owner === candidate && candidate.epoch === epoch && candidate.session.isCurrent();
}

export function workspaceQueryKey(candidate: WorkspaceOwner) {
  return [
    'workspaces',
    candidate.session.userId,
    candidate.session.sessionId,
    candidate.incarnation,
    candidate.epoch,
  ] as const;
}

export function admitWorkspace(candidate: WorkspaceOwner, epoch: number, scopeKey: string): void {
  if (
    !workspaceOwnerIsCurrent(candidate, epoch) ||
    (candidate.phase !== 'resolving' && candidate.phase !== 'admitted')
  )
    return;
  if (candidate.scopeKey !== null && candidate.scopeKey !== scopeKey) {
    candidate.epoch += 1;
    candidate.phase = 'uncertain';
    accountBarriers.set(candidate.session.userId, 'uncertain');
    publish();
    return;
  }
  if (candidate.phase === 'admitted') return;
  candidate.scopeKey = scopeKey;
  candidate.phase = 'admitted';
  publish();
}

export function failWorkspaceRead(candidate: WorkspaceOwner, epoch: number): void {
  if (
    !workspaceOwnerIsCurrent(candidate, epoch) ||
    (candidate.phase !== 'resolving' && candidate.phase !== 'admitted')
  )
    return;
  candidate.epoch += 1;
  candidate.phase = 'unavailable';
  publish();
}

export function retryWorkspaceRead(candidate: WorkspaceOwner): void {
  if (!workspaceOwnerIsCurrent(candidate, candidate.epoch) || candidate.phase !== 'unavailable')
    return;
  candidate.phase = 'resolving';
  publish();
}

export function beginWorkspaceSwitch(candidate: WorkspaceOwner, expectedEpoch: number): number {
  if (
    switching ||
    candidate.phase !== 'admitted' ||
    !workspaceOwnerIsCurrent(candidate, expectedEpoch)
  ) {
    throw new Error('Workspaces are still resolving. Reload the page if a switch was interrupted.');
  }
  switching = true;
  accountBarriers.set(candidate.session.userId, 'switching');
  candidate.epoch += 1;
  candidate.phase = 'switching';
  publish();
  return candidate.epoch;
}

export function finishWorkspaceSwitch(
  candidate: WorkspaceOwner,
  epoch: number,
  uncertain: boolean,
): void {
  switching = false;
  if (uncertain) accountBarriers.set(candidate.session.userId, 'uncertain');
  else accountBarriers.delete(candidate.session.userId);
  if (!workspaceOwnerIsCurrent(candidate, epoch)) {
    if (owner?.session.userId === candidate.session.userId) {
      owner.epoch += 1;
      owner.phase = uncertain ? 'uncertain' : 'resolving';
    }
    publish();
    return;
  }
  candidate.phase = uncertain ? 'uncertain' : 'resolving';
  publish();
}
