import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_SCHEMA_VERSION,
  AUDIT_RETENTION_CLASSES,
  AUDIT_RETENTION_RULES,
  createAuditEvent,
  defaultRetentionClassForAction,
  type AuditAction,
} from '../audit';

const BASE = {
  userId: 'usr_1',
  surface: 'web' as const,
  action: 'data_deleted' as const,
  resource: 'conversation:1',
  outcome: 'success' as const,
};

describe('audit envelope', () => {
  it('stamps the schema version on every event', () => {
    expect(createAuditEvent(BASE).schemaVersion).toBe(AUDIT_EVENT_SCHEMA_VERSION);
  });

  it('carries correlation and causation only when the caller has them', () => {
    const root = createAuditEvent(BASE);
    expect(root.correlationId).toBeUndefined();
    expect(root.causationId).toBeUndefined();
    expect(root.operationRef).toBeUndefined();

    const caused = createAuditEvent({
      ...BASE,
      correlationId: 'op_1',
      causationId: root.eventId,
      operationRef: '1:req_a:op_b:att_c',
    });
    expect(caused.correlationId).toBe('op_1');
    expect(caused.causationId).toBe(root.eventId);
    expect(caused.operationRef).toBe('1:req_a:op_b:att_c');
  });

  it('references one attempt, in the shape apps/web/lib/identity mints', () => {
    const ref = '1:req_0123456789ab:op_0123456789abcdef0123:att_0123456789abcdef';
    const event = createAuditEvent({ ...BASE, operationRef: ref });
    expect(event.operationRef).toBe(ref);
    expect(event.operationRef?.split(':')).toHaveLength(4);
  });

  it('gives every event a retention class', () => {
    for (const action of [
      'auth_login',
      'auth_logout',
      'tool_approved',
      'tool_denied',
      'tool_timeout',
      'agent_started',
      'agent_completed',
      'agent_failed',
      'agent_paused',
      'agent_cancelled',
      'settings_changed',
      'data_exported',
      'data_deleted',
    ] satisfies AuditAction[]) {
      const event = createAuditEvent({ ...BASE, action });
      expect(AUDIT_RETENTION_CLASSES, action).toContain(event.retentionClass);
      expect(event.retentionClass).toBe(defaultRetentionClassForAction(action));
    }
  });

  it('lets the caller raise the class but never invents one', () => {
    expect(createAuditEvent({ ...BASE, action: 'agent_started' }).retentionClass).toBe(
      'operational',
    );
    expect(
      createAuditEvent({ ...BASE, action: 'agent_started', retentionClass: 'compliance' })
        .retentionClass,
    ).toBe('compliance');
  });

  it('keeps a security or compliance record beyond an operational one, and out of a sweep', () => {
    expect(AUDIT_RETENTION_RULES.operational.purgeable).toBe(true);
    expect(AUDIT_RETENTION_RULES.security.purgeable).toBe(false);
    expect(AUDIT_RETENTION_RULES.compliance.purgeable).toBe(false);
    expect(AUDIT_RETENTION_RULES.security.minimumDays).toBeGreaterThan(
      AUDIT_RETENTION_RULES.operational.minimumDays,
    );
    expect(AUDIT_RETENTION_RULES.compliance.minimumDays).toBeGreaterThan(
      AUDIT_RETENTION_RULES.security.minimumDays,
    );
  });

  it('anonymizes rather than deletes when the subject goes, in every class', () => {
    for (const retentionClass of AUDIT_RETENTION_CLASSES) {
      expect(AUDIT_RETENTION_RULES[retentionClass].anonymizeOnSubjectDeletion, retentionClass).toBe(
        true,
      );
    }
  });

  it('classifies an authentication event as security and an export as compliance', () => {
    expect(defaultRetentionClassForAction('auth_login')).toBe('security');
    expect(defaultRetentionClassForAction('tool_denied')).toBe('security');
    expect(defaultRetentionClassForAction('data_exported')).toBe('compliance');
    expect(defaultRetentionClassForAction('data_deleted')).toBe('compliance');
    expect(defaultRetentionClassForAction('settings_changed')).toBe('compliance');
    expect(defaultRetentionClassForAction('agent_started')).toBe('operational');
  });
});
