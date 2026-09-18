import { describe, expect, it } from 'vitest';

import {
  NON_SYNC_SURFACES,
  SYNC_OBJECT_SEMANTICS,
  SYNC_OBJECT_TYPES,
  isSyncObjectType,
  surfaceIsInsideSyncBoundary,
  syncObjectCarriesTombstone,
  syncObjectSemantics,
} from '../sync/object-semantics';
import {
  CONTINUABLE_WORKFLOWS,
  SESSION_CONTINUATION,
  isContinuableWorkflow,
  sessionContinuation,
  workflowsResumableAcrossDevices,
} from '../sync/session-continuation';

describe('cross-device object semantics', () => {
  it('answers for every object type the product syncs, with no entry left out', () => {
    for (const type of SYNC_OBJECT_TYPES) {
      const semantics = syncObjectSemantics(type);
      expect(semantics.type).toBe(type);
      expect(semantics.surfaces.length).toBeGreaterThan(0);
    }
    expect(Object.keys(SYNC_OBJECT_SEMANTICS).sort()).toEqual([...SYNC_OBJECT_TYPES].sort());
  });

  it('covers the five object types the client package never carried', () => {
    for (const type of ['task', 'notification', 'connector', 'skill', 'device'] as const) {
      expect(isSyncObjectType(type)).toBe(true);
      expect(SYNC_OBJECT_SEMANTICS[type].conflict).toBe('server-authoritative');
    }
  });

  it('keeps a row-level type on a tombstone rather than a hard delete', () => {
    expect(syncObjectCarriesTombstone('conversation')).toBe(true);
    expect(syncObjectCarriesTombstone('message')).toBe(true);
    expect(syncObjectCarriesTombstone('project')).toBe(true);
    expect(syncObjectCarriesTombstone('memory')).toBe(true);
    expect(syncObjectCarriesTombstone('settings')).toBe(false);
  });

  it('resolves a consent control restrictively, not last-writer-wins', () => {
    expect(SYNC_OBJECT_SEMANTICS['memory-controls'].conflict).toBe('restrictive-wins');
  });

  it('states which surfaces are inside the boundary and which are deliberately out', () => {
    expect(surfaceIsInsideSyncBoundary('web')).toBe(true);
    expect(surfaceIsInsideSyncBoundary('desktop')).toBe(true);
    expect(surfaceIsInsideSyncBoundary('mobile')).toBe(true);
    for (const surface of NON_SYNC_SURFACES) {
      expect(surfaceIsInsideSyncBoundary(surface)).toBe(false);
    }
    expect(isSyncObjectType('nonsense')).toBe(false);
  });

  it('does not claim the cloud holds the bytes for every type', () => {
    expect(SYNC_OBJECT_SEMANTICS.artifact.payload).toBe('cloud-or-device');
    expect(SYNC_OBJECT_SEMANTICS.skill.payload).toBe('cloud-or-device');
  });
});

describe('session continuation', () => {
  it('gives all eight workflows an answer to all three questions', () => {
    expect(CONTINUABLE_WORKFLOWS).toHaveLength(8);
    for (const workflow of CONTINUABLE_WORKFLOWS) {
      const answer = sessionContinuation(workflow);
      expect(typeof answer.locallyPersisted).toBe('boolean');
      expect(typeof answer.rehydratable).toBe('boolean');
      expect(typeof answer.resumable).toBe('boolean');
    }
    expect(Object.keys(SESSION_CONTINUATION).sort()).toEqual([...CONTINUABLE_WORKFLOWS].sort());
  });

  it('makes a workflow that cannot be continued say so instead of staying silent', () => {
    for (const workflow of CONTINUABLE_WORKFLOWS) {
      const answer = sessionContinuation(workflow);
      const complete = answer.locallyPersisted && answer.rehydratable && answer.resumable;
      if (complete) expect(answer.limit).toBeNull();
      else expect(answer.limit?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('names the workflows a surface may offer to continue elsewhere unqualified', () => {
    expect(workflowsResumableAcrossDevices()).toContain('chat');
    expect(workflowsResumableAcrossDevices()).toContain('code');
    expect(workflowsResumableAcrossDevices()).not.toContain('research');
    expect(isContinuableWorkflow('chat')).toBe(true);
    expect(isContinuableWorkflow('nonsense')).toBe(false);
  });
});
