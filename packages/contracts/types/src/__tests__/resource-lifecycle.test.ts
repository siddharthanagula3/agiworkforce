import { describe, expect, it } from 'vitest';
import {
  RESOURCE_LIFECYCLE_STATES,
  RESOURCE_PERMISSIONS,
  RESOURCE_VISIBILITIES,
  isAiRetrievableLifecycleState,
  isSearchableLifecycleState,
  lifecycleSemantics,
  parseResourceVisibility,
  resourcePermissionsForRole,
  visibilityGrantsView,
} from '../resource-lifecycle';

describe('resource lifecycle semantics', () => {
  it('states AI retrieval eligibility for every lifecycle state', () => {
    for (const state of RESOURCE_LIFECYCLE_STATES) {
      expect(typeof lifecycleSemantics(state).aiRetrievable, state).toBe('boolean');
    }
    expect(isAiRetrievableLifecycleState('active')).toBe(true);
    expect(isAiRetrievableLifecycleState('archived')).toBe(false);
    expect(isAiRetrievableLifecycleState('soft_deleted')).toBe(false);
  });

  it('keeps the retention clock running while a resource is archived or soft-deleted', () => {
    expect(lifecycleSemantics('archived').retentionClockRunning).toBe(true);
    expect(lifecycleSemantics('soft_deleted').retentionClockRunning).toBe(true);
    expect(lifecycleSemantics('purged').retentionClockRunning).toBe(false);
  });

  it('makes archive restorable and hidden rather than withdrawn', () => {
    const archived = lifecycleSemantics('archived');
    expect(archived.restorable).toBe(true);
    expect(archived.listed).toBe(false);
    expect(isSearchableLifecycleState('archived')).toBe(false);
  });

  it('resolves an unknown visibility to the most restrictive value', () => {
    expect(parseResourceVisibility('organization')).toBe('organization');
    expect(parseResourceVisibility('link-anyone')).toBe('private');
    expect(parseResourceVisibility(undefined)).toBe('private');
    expect(RESOURCE_VISIBILITIES).toEqual(['private', 'organization', 'public']);
  });

  it('never lets visibility confer more than view', () => {
    for (const visibility of RESOURCE_VISIBILITIES) {
      expect(
        visibilityGrantsView(visibility, { userId: 'u', organizationId: 'o' }, 'o'),
        visibility,
      ).toBe(visibility !== 'private');
    }
    expect(visibilityGrantsView('organization', { userId: null, organizationId: 'o' }, 'o')).toBe(
      false,
    );
    expect(visibilityGrantsView('organization', { userId: 'u', organizationId: 'x' }, 'o')).toBe(
      false,
    );
  });

  it('models every permission as reachable from some role', () => {
    const reachable = new Set(
      (['owner', 'editor', 'commenter', 'viewer'] as const).flatMap((role) => [
        ...resourcePermissionsForRole(role),
      ]),
    );
    for (const permission of RESOURCE_PERMISSIONS) {
      expect(reachable.has(permission), permission).toBe(true);
    }
  });
});
