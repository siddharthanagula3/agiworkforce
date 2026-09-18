import { describe, expect, it } from 'vitest';

import {
  evaluateProviderEgress,
  evaluateTrustTransition,
  type ProviderEgressRequest,
} from '../trust-boundary-crossing';

const BASE: ProviderEgressRequest = {
  mode: 'managed',
  surface: 'web',
  userId: 'usr_1',
  routeKeyAttribution: 'platform-key',
};

describe('provider egress', () => {
  it('allows a managed call on a platform key and records it', () => {
    const outcome = evaluateProviderEgress(BASE);
    expect(outcome.decision).toBe('allowed');
    expect(outcome.reason).toBeNull();
    expect(outcome.audit.retentionClass).toBe('security');
    expect(outcome.audit.metadata).toMatchObject({ trustMode: 'managed', decision: 'allowed' });
  });

  it('refuses a platform key for a caller who chose byok', () => {
    const outcome = evaluateProviderEgress({ ...BASE, mode: 'byok' });
    expect(outcome.decision).toBe('refused');
    expect(outcome.reason).toBe('platform-key-not-permitted');
    expect(outcome.audit.outcome).toBe('denied');
    expect(outcome.audit.severity).toBe('warning');
  });

  it('allows the byok caller on their own key', () => {
    const outcome = evaluateProviderEgress({
      ...BASE,
      mode: 'byok',
      routeKeyAttribution: 'user-key',
    });
    expect(outcome.decision).toBe('allowed');
  });

  it('refuses an unapproved fallback in local mode and allows an approved one', () => {
    const unapproved = evaluateProviderEgress({
      ...BASE,
      mode: 'local',
      routeKeyAttribution: 'none',
      isFallback: true,
    });
    expect(unapproved.reason).toBe('fallback-needs-approval');

    const approved = evaluateProviderEgress({
      ...BASE,
      mode: 'local',
      routeKeyAttribution: 'none',
      isFallback: true,
      fallbackApproved: true,
    });
    expect(approved.decision).toBe('allowed');
  });

  it('refuses a byok fallback that would leave the boundary', () => {
    const outcome = evaluateProviderEgress({
      ...BASE,
      mode: 'byok',
      routeKeyAttribution: 'user-key',
      isFallback: true,
    });
    expect(outcome.decision).toBe('allowed');

    const downgraded = evaluateProviderEgress({
      ...BASE,
      mode: 'byok',
      routeKeyAttribution: 'platform-key',
      isFallback: true,
    });
    expect(downgraded.reason).toBe('platform-key-not-permitted');
  });

  it('reads an unknown mode as local, so it never silently loosens', () => {
    const outcome = evaluateProviderEgress({
      ...BASE,
      mode: 'not-a-mode' as ProviderEgressRequest['mode'],
      isFallback: true,
    });
    expect(outcome.decision).toBe('refused');
    expect(outcome.audit.metadata).toMatchObject({ trustMode: 'local' });
  });

  it('refuses a payload carrying a credential in every mode', () => {
    const payload = 'here is the key sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH';
    for (const mode of ['local', 'byok', 'managed'] as const) {
      const outcome = evaluateProviderEgress({
        ...BASE,
        mode,
        routeKeyAttribution: mode === 'byok' ? 'user-key' : 'platform-key',
        payload,
      });
      expect(outcome.decision, mode).toBe('refused');
      expect(outcome.reason, mode).toBe('secret-in-payload');
      expect(outcome.secrets.length, mode).toBeGreaterThan(0);
    }
  });

  it('carries the operation the crossing belongs to into the record', () => {
    const outcome = evaluateProviderEgress({
      ...BASE,
      correlationId: 'op_1',
      causationId: 'evt_0',
      operationRef: '1:req_a:op_b:att_c',
    });
    expect(outcome.audit.correlationId).toBe('op_1');
    expect(outcome.audit.causationId).toBe('evt_0');
    expect(outcome.audit.operationRef).toBe('1:req_a:op_b:att_c');
  });
});

describe('trust transitions', () => {
  it('records a refused downgrade as the evidence the promise held', () => {
    const outcome = evaluateTrustTransition({
      from: 'local',
      to: 'managed',
      surface: 'web',
      userId: 'usr_1',
    });
    expect(outcome.decision).toBe('refused');
    expect(outcome.refusal?.reason).toBe('downgrade-needs-approval');
    expect(outcome.audit.outcome).toBe('denied');
    expect(outcome.audit.resource).toBe('trust-mode:local->managed');
    expect(outcome.audit.retentionClass).toBe('security');
  });

  it('records an approved downgrade and a tightening alike', () => {
    const approved = evaluateTrustTransition({
      from: 'byok',
      to: 'managed',
      approved: true,
      surface: 'web',
      userId: 'usr_1',
    });
    expect(approved.decision).toBe('allowed');
    expect(approved.audit.metadata).toMatchObject({ from: 'byok', to: 'managed' });

    const tightened = evaluateTrustTransition({
      from: 'managed',
      to: 'local',
      surface: 'web',
      userId: 'usr_1',
    });
    expect(tightened.decision).toBe('allowed');
    expect(tightened.refusal).toBeNull();
  });
});
