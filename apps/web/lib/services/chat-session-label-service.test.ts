import { describe, expect, it } from 'vitest';
import {
  assertSessionInvariants,
  validateSessionInvariants,
  type AppSession,
} from '@agiworkforce/types';
import { buildCloudChatSessionLabel } from './chat-session-label-service';

const BASE_INPUT = {
  conversationId: 'conv_1',
  ownerUserId: 'user_1',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

describe('buildCloudChatSessionLabel — session-label shape', () => {
  it('labels a new conversation as a well-formed cloud_chat session', () => {
    const session = buildCloudChatSessionLabel(BASE_INPUT);
    expect(session.kind).toBe('cloud_chat');
    expect(session.id).toBe('conv_1');
    expect(session.ownerUserId).toBe('user_1');
    expect(session.originSurface).toBe('web');
    expect(session.storageScope).toBe('synced_app_cloud');
    expect(session.trustBoundary).toEqual({
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
    });
    expect(session.syncPolicy.syncEligible).toBe(true);
    expect(session.hostRequirement).toEqual({ required: false });
  });

  it('carries the real project id through accountScope when the conversation belongs to a project', () => {
    const session = buildCloudChatSessionLabel({ ...BASE_INPUT, projectId: 'proj_9' });
    expect(session.accountScope.projectId).toBe('proj_9');
  });

  it('defaults accountScope.projectId to null for a project-less conversation', () => {
    const session = buildCloudChatSessionLabel(BASE_INPUT);
    expect(session.accountScope.projectId).toBeNull();
  });

  it('the well-formed label passes assertSessionInvariants without throwing (the additive/happy-path guarantee)', () => {
    const session = buildCloudChatSessionLabel({ ...BASE_INPUT, projectId: 'proj_9' });
    expect(validateSessionInvariants(session)).toEqual([]);
    expect(() => assertSessionInvariants(session)).not.toThrow();
  });
});

describe('assertSessionInvariants — invariant-firing test (proves the gate is real, not a no-op)', () => {
  it('throws when a cloud_chat label is tampered into an inconsistent trust boundary', () => {
    const session = buildCloudChatSessionLabel(BASE_INPUT);
    // `CloudChatSession.trustBoundary.providerMode` is compile-time pinned to
    // `'ManagedGateway' | 'ManagedNative'` — the `as AppSession` cast
    // simulates a value that arrived from outside the type system (e.g.
    // deserialized from a stale record) so the RUNTIME gate is what's under
    // test here, not the compiler.
    const tampered = {
      ...session,
      trustBoundary: { privacyMode: 'managed', providerMode: 'DirectByok' },
    } as unknown as AppSession;
    expect(() => assertSessionInvariants(tampered)).toThrow(/trust-boundary-provider-mismatch/);
  });

  it('throws when a cloud_chat label is tampered to claim sync eligibility from a non-synced surface', () => {
    const session = buildCloudChatSessionLabel(BASE_INPUT);
    const tampered = { ...session, originSurface: 'cli' } as unknown as AppSession;
    expect(() => assertSessionInvariants(tampered)).toThrow(/sync-eligible-surface-not-synced/);
  });
});
