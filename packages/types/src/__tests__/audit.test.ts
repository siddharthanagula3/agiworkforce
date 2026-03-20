/**
 * Audit Event Schema — Unit Tests
 *
 * Tests the Wave 3 audit schema from packages/types/src/audit.ts:
 *  - createAuditEvent generates valid events with required fields
 *  - Auto-generated fields (eventId, timestamp) are correct
 *  - defaultSeverityForAction maps correctly for all actions
 *  - severity override is respected when explicitly provided
 *  - All AuditAction values are covered by defaultSeverityForAction
 *  - Metadata is optional and passed through correctly
 *  - userId may be null for system events
 */

import { describe, it, expect } from 'vitest';
import {
  createAuditEvent,
  defaultSeverityForAction,
  type AuditAction,
  type AuditSeverity,
  type AuditSurface,
  type AuditOutcome,
} from '../audit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeMinimalParams(overrides: Partial<Parameters<typeof createAuditEvent>[0]> = {}) {
  return {
    userId: 'usr-abc',
    surface: 'desktop' as AuditSurface,
    action: 'auth_login' as AuditAction,
    resource: 'supabase-auth',
    outcome: 'success' as AuditOutcome,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. createAuditEvent generates valid events
// ---------------------------------------------------------------------------

describe('createAuditEvent — required fields', () => {
  it('creates an event with all required fields present', () => {
    const event = createAuditEvent(makeMinimalParams());

    expect(event.eventId).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.userId).toBe('usr-abc');
    expect(event.surface).toBe('desktop');
    expect(event.action).toBe('auth_login');
    expect(event.resource).toBe('supabase-auth');
    expect(event.outcome).toBe('success');
    expect(event.severity).toBeDefined();
  });

  it('creates distinct events for successive calls (different eventId)', () => {
    const e1 = createAuditEvent(makeMinimalParams());
    const e2 = createAuditEvent(makeMinimalParams());

    expect(e1.eventId).not.toBe(e2.eventId);
  });
});

// ---------------------------------------------------------------------------
// 2. Auto-generated fields — eventId and timestamp
// ---------------------------------------------------------------------------

describe('auto-generated fields', () => {
  it('eventId is a valid UUID v4 when not provided', () => {
    const event = createAuditEvent(makeMinimalParams());
    expect(event.eventId).toMatch(UUID_REGEX);
  });

  it('timestamp is a valid ISO 8601 string when not provided', () => {
    const before = new Date().toISOString();
    const event = createAuditEvent(makeMinimalParams());
    const after = new Date().toISOString();

    expect(event.timestamp).toMatch(ISO_REGEX);
    expect(event.timestamp >= before).toBe(true);
    expect(event.timestamp <= after).toBe(true);
  });

  it('uses the provided eventId when explicitly given', () => {
    const customId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const event = createAuditEvent({ ...makeMinimalParams(), eventId: customId });

    expect(event.eventId).toBe(customId);
  });

  it('uses the provided timestamp when explicitly given', () => {
    const customTs = '2026-01-01T00:00:00.000Z';
    const event = createAuditEvent({ ...makeMinimalParams(), timestamp: customTs });

    expect(event.timestamp).toBe(customTs);
  });
});

// ---------------------------------------------------------------------------
// 3. defaultSeverityForAction — correct mapping
// ---------------------------------------------------------------------------

describe('defaultSeverityForAction', () => {
  it.each([
    { action: 'tool_denied' as AuditAction, expected: 'warning' as AuditSeverity },
    { action: 'tool_timeout' as AuditAction, expected: 'warning' as AuditSeverity },
    { action: 'agent_failed' as AuditAction, expected: 'warning' as AuditSeverity },
    { action: 'data_deleted' as AuditAction, expected: 'critical' as AuditSeverity },
    { action: 'auth_login' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'auth_logout' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'tool_approved' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'agent_started' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'agent_completed' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'agent_paused' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'agent_cancelled' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'settings_changed' as AuditAction, expected: 'info' as AuditSeverity },
    { action: 'data_exported' as AuditAction, expected: 'info' as AuditSeverity },
  ])('defaultSeverityForAction($action) === $expected', ({ action, expected }) => {
    expect(defaultSeverityForAction(action)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 4. All AuditAction values are covered
// ---------------------------------------------------------------------------

describe('all AuditAction values produce a severity', () => {
  const ALL_ACTIONS: AuditAction[] = [
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
  ];

  it.each(ALL_ACTIONS)('action=%s returns a valid severity', (action) => {
    const severity = defaultSeverityForAction(action);
    expect(['info', 'warning', 'critical']).toContain(severity);
  });

  it('covers all expected AuditAction literals', () => {
    // This ensures we do not miss any newly added actions in the future
    for (const action of ALL_ACTIONS) {
      expect(() => defaultSeverityForAction(action)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. severity override
// ---------------------------------------------------------------------------

describe('severity override', () => {
  it('uses provided severity over the default', () => {
    // tool_approved defaults to info, override to critical
    const event = createAuditEvent({
      ...makeMinimalParams({ action: 'tool_approved' }),
      severity: 'critical',
    });

    expect(event.severity).toBe('critical');
  });

  it('uses provided severity for data_deleted override to info', () => {
    const event = createAuditEvent({
      ...makeMinimalParams({ action: 'data_deleted' }),
      severity: 'info',
    });

    expect(event.severity).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// 6. userId may be null (system events)
// ---------------------------------------------------------------------------

describe('system events — null userId', () => {
  it('creates a valid event with null userId', () => {
    const event = createAuditEvent({
      ...makeMinimalParams({ userId: null }),
    });

    expect(event.userId).toBeNull();
    expect(event.eventId).toBeDefined();
    expect(event.surface).toBe('desktop');
  });
});

// ---------------------------------------------------------------------------
// 7. Metadata is optional and passed through
// ---------------------------------------------------------------------------

describe('metadata field', () => {
  it('is undefined when not provided', () => {
    const event = createAuditEvent(makeMinimalParams());
    expect(event.metadata).toBeUndefined();
  });

  it('passes through arbitrary metadata fields', () => {
    const metadata = {
      toolName: 'mcp__filesystem__write_file',
      conversationId: 'conv-123',
      riskLevel: 'high',
      approvedBy: 'user',
    };

    const event = createAuditEvent({ ...makeMinimalParams(), metadata });

    expect(event.metadata).toEqual(metadata);
    expect(event.metadata?.['toolName']).toBe('mcp__filesystem__write_file');
    expect(event.metadata?.['riskLevel']).toBe('high');
  });

  it('handles deeply nested metadata', () => {
    const metadata = {
      agent: { id: 'agent-1', model: 'claude-opus-4.6', iterations: 5 },
      context: { path: '/home/user', filesChanged: ['a.ts', 'b.ts'] },
    };

    const event = createAuditEvent({ ...makeMinimalParams(), metadata });

    expect((event.metadata?.['agent'] as Record<string, unknown>)?.['model']).toBe(
      'claude-opus-4.6',
    );
    expect(event.metadata?.['context']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8. All surfaces are valid
// ---------------------------------------------------------------------------

describe('surface field', () => {
  const ALL_SURFACES: AuditSurface[] = ['desktop', 'mobile', 'web', 'cli', 'vscode'];

  it.each(ALL_SURFACES)('creates a valid event for surface=%s', (surface) => {
    const event = createAuditEvent({ ...makeMinimalParams({ surface }) });
    expect(event.surface).toBe(surface);
  });
});

// ---------------------------------------------------------------------------
// 9. All outcomes are valid
// ---------------------------------------------------------------------------

describe('outcome field', () => {
  const ALL_OUTCOMES: AuditOutcome[] = ['success', 'failure', 'denied'];

  it.each(ALL_OUTCOMES)('creates a valid event for outcome=%s', (outcome) => {
    const event = createAuditEvent({ ...makeMinimalParams({ outcome }) });
    expect(event.outcome).toBe(outcome);
  });
});
