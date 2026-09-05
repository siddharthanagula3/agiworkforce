import { describe, expect, it } from 'vitest';

import {
  isDestructiveTool,
  isEscalationReason,
  isParallelSafeTool,
  isToolActionClass,
  isToolApprovalReason,
  isToolErrorClass,
  isToolPermissionDecision,
  isToolPermissionScope,
  isToolSurface,
  qualifiedMcpToolName,
  TOOL_ACTION_CLASSES,
  TOOL_APPROVAL_REASONS,
  TOOL_PERMISSION_DECISIONS,
  TOOL_SURFACES,
  toolDefinitionFromMcpDescriptor,
  toolPermission,
  undeclaredToolDefinition,
  type McpToolDescriptor,
  type ToolActionClass,
  type ToolAuditRecord,
  type ToolDefinition,
  type ToolResult,
} from '../tool-primitive';
import { DEVELOPER_SESSION_SURFACES, SYNCED_APP_SURFACES } from '../suite-contracts';

const descriptor: McpToolDescriptor = {
  serverName: 'acme',
  toolName: 'publish',
  fallbackDescription: 'Publish a document',
  inputSchema: { type: 'object' },
};

function declared(actionClass: ToolActionClass, reversible: boolean): ToolDefinition {
  return {
    ...undeclaredToolDefinition('web_search', 'Search the web', { type: 'object' }),
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
    expect(isEscalationReason('lethal_trifecta')).toBe(true);
    expect(isEscalationReason('never_rememberable')).toBe(true);
    expect(isEscalationReason('auto_approval_mode')).toBe(false);
  });

  it('covers exactly the surfaces the suite contract knows', () => {
    expect([...TOOL_SURFACES].sort()).toEqual(
      [...SYNCED_APP_SURFACES, ...DEVELOPER_SESSION_SURFACES].sort(),
    );
  });
});

describe('tool primitive guards', () => {
  it('accepts every declared member', () => {
    for (const value of TOOL_ACTION_CLASSES) expect(isToolActionClass(value)).toBe(true);
    for (const value of TOOL_PERMISSION_DECISIONS)
      expect(isToolPermissionDecision(value)).toBe(true);
    for (const value of TOOL_APPROVAL_REASONS) expect(isToolApprovalReason(value)).toBe(true);
    for (const value of TOOL_SURFACES) expect(isToolSurface(value)).toBe(true);
  });

  it('rejects an unknown action class', () => {
    expect(isToolActionClass('publish')).toBe(false);
    expect(isToolActionClass('READ')).toBe(false);
    expect(isToolActionClass(undefined)).toBe(false);
    expect(isToolActionClass({ actionClass: 'read' })).toBe(false);
  });

  it('rejects a vocabulary borrowed from another surface', () => {
    expect(isToolPermissionDecision('prompt')).toBe(false);
    expect(isToolPermissionDecision('forbidden')).toBe(false);
    expect(isToolPermissionScope('forever')).toBe(false);
    expect(isToolApprovalReason('requires_confirmation')).toBe(false);
    expect(isToolErrorClass('failed')).toBe(false);
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

  it('treats an undeclared tool as the most dangerous shape it could be', () => {
    const unknown = undeclaredToolDefinition('mcp__acme__publish', '', {});
    expect(unknown.actionClass).toBe('write');
    expect(unknown.reversible).toBe(false);
    expect(unknown.acceptsUntrustedContent).toBe(true);
    expect(unknown.createsEgressPath).toBe(true);
    expect(isDestructiveTool(unknown)).toBe(true);
    expect(isParallelSafeTool(unknown)).toBe(false);
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

  it('collapses a permission nobody may persist to the call it was granted for', () => {
    expect(toolPermission('email_send', 'allow', 'account', false).scope).toBe('single_call');
    expect(toolPermission('web_search', 'allow', 'account', true).scope).toBe('account');
  });
});

describe('mcp catalog adapter', () => {
  it('qualifies the tool name the way the web loop resolves it', () => {
    expect(qualifiedMcpToolName(descriptor)).toBe('mcp__acme__publish');
  });

  it('yields an undeclared definition gated on the connector grant', () => {
    const definition = toolDefinitionFromMcpDescriptor(descriptor);
    expect(definition.name).toBe('mcp__acme__publish');
    expect(definition.description).toBe(descriptor.fallbackDescription);
    expect(definition.declared).toBe(false);
    expect(definition.category).toBe('mcp');
    expect(definition.auth).toEqual({ kind: 'connector_grant', connectorId: 'acme', scopes: [] });
    expect(definition.outputSchema).toBeUndefined();
  });

  it('prefers the server description and carries an output schema when one is declared', () => {
    const definition = toolDefinitionFromMcpDescriptor({
      ...descriptor,
      description: 'Publish to the acme feed',
      outputSchema: { type: 'string' },
    });
    expect(definition.description).toBe('Publish to the acme feed');
    expect(definition.outputSchema).toEqual({ type: 'string' });
  });
});
