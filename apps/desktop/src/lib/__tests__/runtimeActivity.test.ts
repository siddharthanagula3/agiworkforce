import { describe, expect, it } from 'vitest';
import {
  buildRuntimeActivityEmission,
  buildToolStreamCancelledActivity,
  buildToolStreamStartedActivity,
  buildToolStreamTerminalActivity,
} from '../runtimeActivity';

describe('runtimeActivity', () => {
  it('builds a log entry and applies the default trail fade time', () => {
    expect(
      buildRuntimeActivityEmission({
        id: 'calendar-connected',
        type: 'terminal',
        title: 'Calendar connected',
        description: 'Connected account abc',
        status: 'success',
        sidecarEventType: 'calendar',
        trail: {
          type: 'completed',
          message: 'Calendar connected',
        },
      }),
    ).toEqual({
      log: {
        id: 'calendar-connected',
        actionId: undefined,
        workflowHash: undefined,
        type: 'terminal',
        title: 'Calendar connected',
        description: 'Connected account abc',
        status: 'success',
        requiresApproval: undefined,
        metadata: undefined,
        result: undefined,
        error: undefined,
      },
      trail: {
        type: 'completed',
        message: 'Calendar connected',
        fadeAfter: 3500,
      },
      sidecarEventType: 'calendar',
    });
  });

  it('preserves explicit trail settings when provided', () => {
    expect(
      buildRuntimeActivityEmission({
        id: 'tool-running',
        type: 'mcp',
        title: 'Tool running',
        status: 'running',
        trail: {
          type: 'running',
          message: 'Executing tool...',
          fadeAfter: 5000,
          metadata: { tool: 'filesystem.read' },
        },
      }),
    ).toMatchObject({
      trail: {
        type: 'running',
        message: 'Executing tool...',
        fadeAfter: 5000,
        metadata: { tool: 'filesystem.read' },
      },
    });
  });

  it('supports MCP activity payloads with action ids and sidecar event routing', () => {
    expect(
      buildRuntimeActivityEmission({
        id: 'mcp-tool-1',
        actionId: 'tool-1',
        type: 'mcp',
        title: 'Using read file',
        description: 'Executing MCP tool from filesystem',
        status: 'running',
        metadata: { tool_id: 'tool-1', server_name: 'filesystem' },
        trail: {
          type: 'running',
          message: 'Using read file...',
        },
        sidecarEventType: 'mcp',
      }),
    ).toMatchObject({
      log: {
        id: 'mcp-tool-1',
        actionId: 'tool-1',
        type: 'mcp',
        title: 'Using read file',
        description: 'Executing MCP tool from filesystem',
        status: 'running',
        metadata: { tool_id: 'tool-1', server_name: 'filesystem' },
      },
      trail: {
        type: 'running',
        message: 'Using read file...',
      },
      sidecarEventType: 'mcp',
    });
  });

  it('builds started tool-stream activity with normalized metadata and inline trail', () => {
    expect(
      buildToolStreamStartedActivity({
        id: 'toolstream-tool-1',
        actionId: 'tool-1',
        type: 'filesystem',
        toolName: 'Read file',
        timestamp: '2026-03-12T10:00:00.000Z',
        parameters: { path: 'README.md' },
        sidecarEventType: 'browser',
      }),
    ).toMatchObject({
      log: {
        id: 'toolstream-tool-1',
        actionId: 'tool-1',
        type: 'filesystem',
        title: 'Execute Read file',
        description: 'Running Read file',
        status: 'running',
        metadata: {
          tool_name: 'Read file',
          parameters: { path: 'README.md' },
          stream_started_at: '2026-03-12T10:00:00.000Z',
        },
      },
      trail: {
        type: 'running',
        message: 'Executing Read file...',
        metadata: { tool_call_id: 'tool-1' },
      },
      sidecarEventType: 'browser',
    });
  });

  it('builds terminal tool-stream activity for success and failure', () => {
    expect(
      buildToolStreamTerminalActivity({
        id: 'toolstream-tool-1',
        actionId: 'tool-1',
        type: 'filesystem',
        toolName: 'Read file',
        status: 'success',
        timestamp: '2026-03-12T10:00:00.000Z',
        durationMs: 420,
        result: '{"ok":true}',
      }),
    ).toMatchObject({
      log: {
        status: 'success',
        result: '{"ok":true}',
        metadata: { stream_completed_at: '2026-03-12T10:00:00.000Z' },
      },
      trail: {
        type: 'completed',
        message: 'Read file completed (420ms)',
      },
    });

    expect(
      buildToolStreamTerminalActivity({
        id: 'toolstream-tool-1',
        actionId: 'tool-1',
        type: 'filesystem',
        toolName: 'Read file',
        status: 'failed',
        timestamp: '2026-03-12T10:00:00.000Z',
        durationMs: 420,
        error: 'Permission denied',
        retryable: true,
      }),
    ).toMatchObject({
      log: {
        status: 'failed',
        error: 'Permission denied',
        metadata: {
          stream_error_at: '2026-03-12T10:00:00.000Z',
          retryable: true,
        },
      },
      trail: {
        type: 'error',
        message: 'Read file failed: Permission denied',
      },
    });
  });

  it('builds cancelled tool-stream activity', () => {
    expect(
      buildToolStreamCancelledActivity({
        id: 'toolstream-tool-1',
        actionId: 'tool-1',
        type: 'filesystem',
        toolName: 'Read file',
        timestamp: '2026-03-12T10:00:00.000Z',
        durationMs: 300,
        reason: 'User cancelled',
      }),
    ).toMatchObject({
      log: {
        status: 'failed',
        error: 'User cancelled',
        metadata: { stream_cancelled_at: '2026-03-12T10:00:00.000Z' },
      },
      trail: {
        type: 'error',
        message: 'Read file cancelled: User cancelled',
      },
    });
  });
});
