import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_COMMANDS } from '@agiworkforce/types';
import { DEVICE_STEP_TOOLS, deviceStepScope } from '@agiworkforce/local-runtime-contract';

const mocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (event: unknown) => mocks.recordAuditEvent(event),
  BLOCK_APPEAL_PATH: '/support',
}));

import { recordToolCallAudit, toolAuditEventType } from './tool-loop';

describe('toolAuditEventType', () => {
  it('files every browser command as a browser action', () => {
    for (const command of BROWSER_COMMANDS) {
      expect(toolAuditEventType(command)).toBe('browser_action');
    }
  });

  it('files screen-scoped device steps as computer use and workspace steps as tool calls', () => {
    for (const tool of DEVICE_STEP_TOOLS) {
      expect(toolAuditEventType(tool)).toBe(
        deviceStepScope(tool) === 'screen' ? 'computer_use_action' : 'tool_executed',
      );
    }
  });

  it('files any other tool as a tool call', () => {
    expect(toolAuditEventType('web_search')).toBe('tool_executed');
    expect(toolAuditEventType('mcp__github__create_issue')).toBe('tool_executed');
  });
});

describe('recordToolCallAudit', () => {
  beforeEach(() => mocks.recordAuditEvent.mockClear());

  const base = {
    userId: 'user-1',
    organizationId: 'org-1',
    surface: 'chrome',
    category: 'computer-use' as const,
  };

  it('maps status to outcome and carries the workspace, surface and duration', async () => {
    await recordToolCallAudit({
      ...base,
      toolName: 'browser_click',
      status: 'handed_off',
      durationMs: 12,
    });
    await recordToolCallAudit({ ...base, toolName: 'device_click', status: 'blocked' });
    await recordToolCallAudit({ ...base, toolName: 'web_search', status: 'failed' });

    expect(mocks.recordAuditEvent.mock.calls.map((call) => call[0])).toEqual([
      {
        userId: 'user-1',
        organizationId: 'org-1',
        surface: 'chrome',
        eventType: 'browser_action',
        outcome: 'success',
        detail: {
          resourceType: 'tool',
          resourceId: 'browser_click',
          source: 'computer-use',
          status: 'handed_off',
          durationMs: 12,
        },
      },
      expect.objectContaining({ eventType: 'computer_use_action', outcome: 'denied' }),
      expect.objectContaining({ eventType: 'tool_executed', outcome: 'failure' }),
    ]);
  });

  it('writes nothing for a run with no user to attribute it to', async () => {
    await recordToolCallAudit({
      ...base,
      userId: undefined,
      toolName: 'web_search',
      status: 'completed',
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
