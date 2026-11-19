import { describe, expect, it } from 'vitest';
import type { AgentActivityState, AgentActivityToolEntry } from '@agiworkforce/client-runtime';
import { SCREEN_STEP_ACTIONS, categoryToKind } from './activity-kinds';
import {
  connectorFailureReason,
  connectorSentence,
  hasOpenApprovalDecision,
  settledActivityStatus,
} from './activity-status';
import {
  CONNECTOR_AUTHORIZATION_REASONS,
  classifyToolFailure,
  humanizeToolErrorText,
  toolFailureReason,
} from './tool-failure';

function toolEntry(overrides: Partial<AgentActivityToolEntry> = {}): AgentActivityToolEntry {
  return {
    kind: 'tool',
    id: 't1',
    toolCallId: 'call-1',
    name: 'mcp__github__search_issues',
    category: 'mcp',
    summary: 'Search issues',
    status: 'running',
    startedAtMs: 0,
    ...overrides,
  };
}

function activity(
  status: AgentActivityState['status'],
  entries: AgentActivityToolEntry[],
): Pick<AgentActivityState, 'entries' | 'status'> {
  return { status, entries };
}

describe('activity status', () => {
  it('reads an undecided approval as awaiting approval whatever the run status says', () => {
    const waiting = activity('paused', [
      toolEntry({ status: 'awaiting-approval', approval: { id: 'a1' } }),
    ]);
    expect(hasOpenApprovalDecision(waiting)).toBe(true);
    expect(settledActivityStatus(waiting)).toBe('awaiting-approval');
  });

  it('reads a partial run whose last step succeeded as completed', () => {
    expect(settledActivityStatus(activity('partial', [toolEntry({ status: 'completed' })]))).toBe(
      'completed',
    );
    expect(settledActivityStatus(activity('partial', [toolEntry({ status: 'failed' })]))).toBe(
      'partial',
    );
  });

  it('writes a connector step as a sentence and leaves other tools alone', () => {
    expect(connectorSentence(toolEntry())).toMatch(/^Searching /);
    expect(connectorSentence(toolEntry({ status: 'completed' }))).toMatch(/^Searched /);
    expect(connectorSentence(toolEntry({ name: 'web_search', category: 'web-search' }))).toBe(
      undefined,
    );
  });

  it('gives a failed connector step its one-line reason', () => {
    const failed = toolEntry({ status: 'failed', error: 'The server refused the request (429).' });
    expect(connectorFailureReason(failed, null)).toBe('Rate limited, try again in a minute.');
    expect(
      connectorFailureReason(failed, {
        connectorId: 'github',
        connectorName: 'GitHub',
        toolName: 'search_issues',
        qualifiedToolName: 'mcp__github__search_issues',
        reason: 'authorization_expired',
        connectUrl: null,
        scopes: [],
      }),
    ).toBe(CONNECTOR_AUTHORIZATION_REASONS.authorization_expired);
    expect(connectorFailureReason(toolEntry({ status: 'completed' }), null)).toBeUndefined();
  });
});

describe('tool failure', () => {
  it('classifies and words a failure without reading the remote text', () => {
    expect(toolFailureReason(classifyToolFailure('Upstream answered HTTP 404'))).toBe(
      'The item was not found.',
    );
    expect(humanizeToolErrorText('Tool error:   ')).toBe(
      'The tool failed without further details.',
    );
  });
});

describe('activity kinds', () => {
  it('maps a category to the icon kind and describes a screen step', () => {
    expect(categoryToKind('filesystem')).toBe('fs-list');
    expect(categoryToKind('connector')).toBe('mcp-custom');
    expect(SCREEN_STEP_ACTIONS['device_click']!({ x: 1, y: 2, count: 2 })).toBe(
      'Double-clicked at 1, 2',
    );
    expect(SCREEN_STEP_ACTIONS['device_type']!({ text: 'a'.repeat(70) })).toBe(
      `Typed “${'a'.repeat(60)}…”`,
    );
  });
});
