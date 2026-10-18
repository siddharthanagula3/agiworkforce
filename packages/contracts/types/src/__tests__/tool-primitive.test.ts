import { describe, expect, it } from 'vitest';

import {
  isDestructiveTool,
  isParallelSafeTool,
  TOOL_ACTION_CLASSES,
  TOOL_APPROVAL_REASONS,
  TOOL_PERMISSION_DECISIONS,
  TOOL_SURFACES,
  type ToolActionClass,
  type ToolAuditRecord,
  type ToolDefinition,
  type ToolResult,
} from '../tool-primitive';
import { DEVELOPER_SESSION_SURFACES, SYNCED_APP_SURFACES } from '../suite-contracts';

const undeclared: ToolDefinition = {
  name: 'mcp__acme__publish',
  description: '',
  inputSchema: {},
  category: 'other',
  actionClass: 'write',
  auth: { kind: 'user_session', scopes: [] },
  reversible: false,
  acceptsUntrustedContent: true,
  createsEgressPath: true,
  retrySafety: 'unknown',
  declared: false,
};

function declared(actionClass: ToolActionClass, reversible: boolean): ToolDefinition {
  return {
    ...undeclared,
    name: 'web_search',
    description: 'Search the web',
    inputSchema: { type: 'object' },
    actionClass,
    reversible,
    declared: true,
  };
}

describe('tool primitive vocabulary', () => {
  it('carries the web action classes the contract adopted', () => {
    expect([...TOOL_ACTION_CLASSES]).toEqual([
      'read',
      'write',
      'delete',
      'execute',
      'external_send',
    ]);
  });

  it('carries the allow, ask and deny verdicts', () => {
    expect([...TOOL_PERMISSION_DECISIONS]).toEqual(['allow', 'ask', 'deny']);
  });

  it('names the trifecta escalation as a first-class reason', () => {
    expect(TOOL_APPROVAL_REASONS).toContain('lethal_trifecta');
  });

  it('covers exactly the surfaces the suite contract knows', () => {
    expect([...TOOL_SURFACES].sort()).toEqual(
      [...SYNCED_APP_SURFACES, ...DEVELOPER_SESSION_SURFACES].sort(),
    );
  });
});
describe('tool primitive records', () => {
  it('round trips a definition, a result and an audit record through JSON', () => {
    const definition = declared('external_send', false);
    const result: ToolResult = {
      callId: 'call-1',
      tool: definition.name,
      status: 'error',
      errorClass: 'rate_limited',
      artifacts: [{ id: 'artifact-1', kind: 'json', byteSize: 12 }],
      cost: { durationMs: 31 },
    };
    const audit: ToolAuditRecord = {
      occurredAt: '2026-09-05T00:00:00Z',
      surface: 'web',
      tool: definition.name,
      actionClass: definition.actionClass,
      decision: 'ask',
      reason: 'lethal_trifecta',
      outcome: 'denied',
      status: 'error',
      errorClass: 'permission_denied',
      trace: { callId: 'call-1' },
    };

    for (const record of [definition, result, audit]) {
      expect(JSON.parse(JSON.stringify(record))).toEqual(record);
    }
  });

  it('treats an undeclared irreversible write as destructive and never parallel', () => {
    expect(isDestructiveTool(undeclared)).toBe(true);
    expect(isParallelSafeTool(undeclared)).toBe(false);
  });

  it('derives destructiveness from the action class and reversibility', () => {
    expect(isDestructiveTool(declared('read', false))).toBe(false);
    expect(isDestructiveTool(declared('delete', true))).toBe(true);
    expect(isDestructiveTool(declared('external_send', true))).toBe(true);
    expect(isDestructiveTool(declared('write', false))).toBe(true);
    expect(isDestructiveTool(declared('write', true))).toBe(false);
    expect(isDestructiveTool(declared('execute', false))).toBe(true);
  });

  it('runs only declared reads in parallel', () => {
    expect(isParallelSafeTool(declared('read', true))).toBe(true);
    expect(isParallelSafeTool(declared('write', true))).toBe(false);
  });
});
