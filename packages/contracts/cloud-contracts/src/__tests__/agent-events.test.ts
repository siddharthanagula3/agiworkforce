import { describe, expect, it } from 'vitest';

import {
  AGENT_EVENT_SCHEMA_VERSION,
  AgentEventEnvelopeSchema,
  parseAgentEventDelta,
} from '../agent-events';

const BASE_ENVELOPE = {
  schemaVersion: 3,
  sessionId: 'conversation-1',
  turnId: 'turn-1',
  sequence: 0,
  emittedAtMs: 1_752_000_000_123,
} as const;

describe('AgentEventEnvelopeSchema / parseAgentEventDelta', () => {
  it('pins the canonical run-activity schema version', () => {
    expect(AGENT_EVENT_SCHEMA_VERSION).toBe(3);
  });

  it('parses the engine-authored task lifecycle without surface inference', () => {
    const envelope = {
      ...BASE_ENVELOPE,
      event: {
        type: 'task-state-changed',
        taskId: 'task-1',
        previousState: 'running',
        state: 'ready_for_review',
        summary: 'Work finished and is ready for review.',
      },
    };

    expect(parseAgentEventDelta(envelope)).toEqual(envelope);
  });

  it('parses user-displayable progress without treating it as private reasoning', () => {
    const envelope = {
      ...BASE_ENVELOPE,
      event: {
        type: 'progress-update',
        progressId: 'research-plan',
        summary: 'Planning an exhaustive report',
        detail: 'I’ll reconcile official sources and flag unresolved evidence gaps.',
        status: 'running',
      },
    };

    expect(parseAgentEventDelta(envelope)).toEqual(envelope);
  });

  it('parses the execution, source, approval, artifact, and compaction event families', () => {
    const events = [
      {
        type: 'tool-execution-start',
        toolCallId: 'call-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'release notes' },
      },
      {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'web_search',
        output: { resultCount: 3 },
        isError: false,
        elapsedMs: 841,
      },
      {
        type: 'source-list',
        toolCallId: 'call-1',
        query: 'release notes',
        sources: [
          { url: 'https://example.com', title: 'Example', snippet: 'Current release notes' },
        ],
      },
      {
        type: 'approval-requested',
        approvalId: 'approval-1',
        toolCallId: 'call-2',
        name: 'shell',
        category: 'shell',
        summary: 'Install a package',
        input: { command: 'install package' },
        riskLevel: 'medium',
      },
      { type: 'approval-resolved', approvalId: 'approval-1', decision: 'approved' },
      {
        type: 'artifact-produced',
        artifactId: 'artifact-1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        uri: '/files/artifact-1',
        sizeBytes: 4096,
      },
      {
        type: 'context-compacted',
        beforeTokens: 180_000,
        afterTokens: 42_000,
        summary: 'Context automatically compacted',
      },
    ];

    for (const [sequence, event] of events.entries()) {
      const envelope = { ...BASE_ENVELOPE, sequence, event };
      expect(parseAgentEventDelta(envelope)).toEqual(envelope);
    }
  });

  it('rejects unsupported schema versions and malformed ordering metadata', () => {
    expect(
      parseAgentEventDelta({
        ...BASE_ENVELOPE,
        schemaVersion: 1,
        event: { type: 'lifecycle', phase: 'started' },
      }),
    ).toBeNull();
    expect(
      parseAgentEventDelta({
        ...BASE_ENVELOPE,
        sequence: -1,
        event: { type: 'lifecycle', phase: 'started' },
      }),
    ).toBeNull();
  });

  it('never throws on untrusted stream payloads', () => {
    expect(parseAgentEventDelta(undefined)).toBeNull();
    expect(parseAgentEventDelta('not an event')).toBeNull();
    expect(parseAgentEventDelta({ ...BASE_ENVELOPE, event: { type: 'invented' } })).toBeNull();
    expect(
      AgentEventEnvelopeSchema.safeParse({
        ...BASE_ENVELOPE,
        event: { type: 'artifact-produced', name: 'missing required fields' },
      }).success,
    ).toBe(false);
  });
});
