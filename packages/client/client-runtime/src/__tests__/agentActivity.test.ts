import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  isLocalPlaceholderActivityEntry,
  startAgentActivityLocally,
} from '../agentActivity';
import type { AgentActivityEntry, AgentActivityToolEntry } from '../agentActivity';

function isToolEntry(entry: AgentActivityEntry | undefined): entry is AgentActivityToolEntry {
  return entry?.kind === 'tool';
}

function envelope(sequence: number, event: AgentEvent): AgentEventEnvelope {
  return {
    schemaVersion: 4,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_000 + sequence * 100,
    event,
  };
}

describe('portable agent activity projection', () => {
  it('creates a local starting action that canonical provider activity replaces', () => {
    const starting = startAgentActivityLocally({
      sessionId: 'session-1',
      turnId: 'turn-1',
      summary: 'Starting AGI Work',
      startedAtMs: 900,
    });
    expect(starting).toMatchObject({
      status: 'running',
      lastSequence: -1,
      entries: [expect.objectContaining({ summary: 'Starting AGI Work', status: 'running' })],
    });

    const canonical = applyAgentActivityEvent(
      starting,
      envelope(0, {
        type: 'progress-update',
        progressId: 'planning',
        summary: 'Planning the workspace task',
        status: 'running',
      }),
    );
    expect(canonical.entries).toEqual([
      expect.objectContaining({ summary: 'Planning the workspace task', status: 'running' }),
    ]);
    expect(JSON.stringify(canonical)).not.toContain('Starting AGI Work');
  });

  it('does not treat a retry placeholder as a suppressible local placeholder', () => {
    const retrying = startAgentActivityLocally({
      sessionId: 'session-1',
      turnId: 'turn-1',
      summary: 'Retrying',
      startedAtMs: 900,
      isRetry: true,
    });
    expect(isLocalPlaceholderActivityEntry(retrying.entries[0] as AgentActivityEntry)).toBe(false);

    const canonical = applyAgentActivityEvent(
      retrying,
      envelope(0, {
        type: 'progress-update',
        progressId: 'planning',
        summary: 'Planning the workspace task',
        status: 'running',
      }),
    );
    expect(canonical.entries).toEqual([
      expect.objectContaining({ summary: 'Planning the workspace task', status: 'running' }),
    ]);
    expect(JSON.stringify(canonical)).not.toContain('Retrying');
  });

  it('keeps a tool entry a local bridge appended before the first canonical event of the turn arrives', () => {
    const starting = startAgentActivityLocally({
      sessionId: 'session-1',
      turnId: 'turn-1',
      summary: 'Starting AGI Work',
      startedAtMs: 900,
    });

    const bridged = {
      ...starting,
      entries: [
        ...starting.entries,
        {
          kind: 'tool',
          id: 'tool:native-web-search',
          toolCallId: 'native-web-search',
          name: 'web_search',
          category: 'web-search',
          summary: 'Reading 3 sources',
          status: 'running',
          startedAtMs: 950,
        } satisfies AgentActivityToolEntry,
      ],
    };

    const next = applyAgentActivityEvent(
      bridged,
      envelope(0, { type: 'text-delta', delta: 'Here is what I found. ' }),
    );

    const tool = next.entries.find((entry) => entry.id === 'tool:native-web-search');
    expect(isToolEntry(tool)).toBe(true);
    expect(tool).toMatchObject({ summary: 'Reading 3 sources', status: 'running' });
    expect(JSON.stringify(next)).not.toContain('Starting AGI Work');
  });

  it('can complete a local starting action when a provider returns without activity events', () => {
    const starting = startAgentActivityLocally({
      sessionId: 'session-1',
      turnId: 'turn-1',
      summary: 'Starting AGI Work',
      startedAtMs: 900,
    });
    const completed = finishAgentActivityLocally(starting, {
      status: 'completed',
      completedAtMs: 1_200,
    });

    expect(completed).toMatchObject({
      status: 'completed',
      stopReason: 'end-turn',
      completedAtMs: 1_200,
      entries: [
        expect.objectContaining({
          summary: 'Response ready',
          status: 'completed',
          completedAtMs: 1_200,
        }),
      ],
    });

    const cancelled = finishAgentActivityLocally(starting, {
      status: 'cancelled',
      completedAtMs: 1_300,
    });
    expect(cancelled.entries).toEqual([
      expect.objectContaining({ summary: 'Response cancelled', status: 'cancelled' }),
    ]);
  });

  it('projects canonical task states without inventing a surface-local enum', () => {
    let state = applyAgentActivityEvent(
      undefined,
      envelope(0, {
        type: 'task-state-changed',
        taskId: 'turn-1',
        state: 'running',
        summary: 'Agent started work.',
      }),
    );

    state = applyAgentActivityEvent(
      state,
      envelope(1, {
        type: 'task-state-changed',
        taskId: 'turn-1',
        previousState: 'running',
        state: 'awaiting_input',
        summary: 'Approval is required.',
      }),
    );

    expect(state.taskId).toBe('turn-1');
    expect(state.taskState).toBe('awaiting_input');
    expect(state.status).toBe('awaiting-approval');
  });

  it('projects a tool run, sources, approval, artifact, and compaction into one ordered state', () => {
    let state = applyAgentActivityEvent(
      undefined,
      envelope(0, { type: 'lifecycle', phase: 'started' }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(1, {
        type: 'progress-update',
        progressId: 'plan',
        summary: 'Planning the research pass',
        detail: 'Selecting official sources only',
        status: 'running',
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(2, {
        type: 'tool-execution-start',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'official agent documentation' },
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(3, {
        type: 'source-list',
        toolCallId: 'search-1',
        query: 'official agent documentation',
        sources: [
          {
            url: 'https://example.com/docs',
            title: 'Official documentation',
            snippet: 'Primary source',
          },
        ],
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(4, {
        type: 'approval-requested',
        approvalId: 'approval-1',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Search official sources',
        input: { query: 'official agent documentation' },
        riskLevel: 'low',
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(5, {
        type: 'approval-resolved',
        approvalId: 'approval-1',
        decision: 'approved-for-session',
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(6, {
        type: 'tool-execution-end',
        toolCallId: 'search-1',
        name: 'web_search',
        output: { matches: 1 },
        isError: false,
        elapsedMs: 725,
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(7, {
        type: 'context-compacted',
        beforeTokens: 98_000,
        afterTokens: 31_000,
        summary: 'Kept the verified findings and open questions',
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(8, {
        type: 'artifact-produced',
        artifactId: 'report-1',
        name: 'research-report.html',
        mimeType: 'text/html',
        uri: '/api/files/report-1',
        sizeBytes: 2048,
      }),
    );
    state = applyAgentActivityEvent(state, envelope(9, { type: 'stop', reason: 'end-turn' }));

    expect(state).toMatchObject({
      schemaVersion: 1,
      sessionId: 'session-1',
      turnId: 'turn-1',
      lastSequence: 9,
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 1_900,
      stopReason: 'end-turn',
    });
    expect(state.entries).toHaveLength(4);
    expect(state.entries[0]).toMatchObject({
      kind: 'progress',
      id: 'progress:plan',
      summary: 'Planning the research pass',
      status: 'running',
    });
    expect(state.entries[1]).toMatchObject({
      kind: 'tool',
      id: 'tool:search-1',
      name: 'web_search',
      category: 'web-search',
      summary: 'Searching official sources',
      status: 'completed',
      elapsedMs: 725,
      approval: {
        id: 'approval-1',
        decision: 'approved-for-session',
        riskLevel: 'low',
      },
      query: 'official agent documentation',
      sources: [{ url: 'https://example.com/docs', title: 'Official documentation' }],
    });
    expect(state.entries[2]).toMatchObject({
      kind: 'context',
      summary: 'Kept the verified findings and open questions',
      beforeTokens: 98_000,
      afterTokens: 31_000,
    });
    expect(state.entries[3]).toMatchObject({
      kind: 'artifact',
      artifactId: 'report-1',
      name: 'research-report.html',
    });
  });

  it('ignores duplicate and out-of-order envelopes', () => {
    const first = applyAgentActivityEvent(
      undefined,
      envelope(2, {
        type: 'progress-update',
        progressId: 'p1',
        summary: 'First accepted summary',
        status: 'running',
      }),
    );

    const duplicate = applyAgentActivityEvent(
      first,
      envelope(2, {
        type: 'progress-update',
        progressId: 'p1',
        summary: 'Must be ignored',
        status: 'failed',
      }),
    );
    const older = applyAgentActivityEvent(
      duplicate,
      envelope(1, { type: 'error', message: 'Must also be ignored' }),
    );

    expect(older).toBe(first);
    expect(older.entries).toEqual([
      expect.objectContaining({ summary: 'First accepted summary', status: 'running' }),
    ]);
  });

  it('starts a fresh projection when the server starts another turn', () => {
    const previous = applyAgentActivityEvent(
      undefined,
      envelope(4, {
        type: 'progress-update',
        progressId: 'old',
        summary: 'Old turn',
        status: 'completed',
      }),
    );
    const next = applyAgentActivityEvent(previous, {
      ...envelope(0, { type: 'lifecycle', phase: 'started' }),
      turnId: 'turn-2',
      emittedAtMs: 5_000,
    });

    expect(next.turnId).toBe('turn-2');
    expect(next.status).toBe('running');
    expect(next.entries).toEqual([]);
    expect(next.startedAtMs).toBe(5_000);
  });

  it('closes the writing-response row when a tool call interrupts generation, in order', () => {
    let state = applyAgentActivityEvent(
      undefined,
      envelope(0, { type: 'text-delta', delta: 'Let me check that for you. ' }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(1, {
        type: 'tool-execution-start',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'official agent documentation' },
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(2, {
        type: 'tool-execution-end',
        toolCallId: 'search-1',
        name: 'web_search',
        output: { matches: 1 },
        isError: false,
        elapsedMs: 50,
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(3, { type: 'text-delta', delta: 'Here is the answer.' }),
    );

    expect(state.entries).toHaveLength(3);
    expect(state.entries[0]).toMatchObject({
      kind: 'progress',
      summary: 'Writing response',
      status: 'completed',
      completedAtMs: 1_100,
    });
    expect(state.entries[1]).toMatchObject({
      kind: 'tool',
      id: 'tool:search-1',
      status: 'completed',
    });
    expect(state.entries[2]).toMatchObject({
      kind: 'progress',
      summary: 'Writing response',
      status: 'running',
    });
    expect(state.entries[0]!.id).not.toBe(state.entries[2]!.id);
  });

  it('records a terminal error without exposing reasoning or text deltas as activity rows', () => {
    let state = applyAgentActivityEvent(
      undefined,
      envelope(0, { type: 'reasoning-delta', delta: 'private scratchpad' }),
    );
    state = applyAgentActivityEvent(state, envelope(1, { type: 'text-delta', delta: 'answer' }));
    state = applyAgentActivityEvent(
      state,
      envelope(2, { type: 'error', message: 'Sandbox unavailable', retryable: true }),
    );

    expect(state.status).toBe('failed');
    expect(state.entries).toEqual([
      expect.objectContaining({
        kind: 'error',
        message: 'Sandbox unavailable',
        retryable: true,
      }),
    ]);
    expect(JSON.stringify(state)).not.toContain('private scratchpad');
  });

  it('honestly finalizes in-flight work when the local transport is cancelled or fails', () => {
    let running = applyAgentActivityEvent(
      undefined,
      envelope(0, {
        type: 'progress-update',
        progressId: 'research',
        summary: 'Researching official sources',
        status: 'running',
      }),
    );
    running = applyAgentActivityEvent(
      running,
      envelope(1, {
        type: 'tool-execution-start',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'official sources' },
      }),
    );

    const cancelled = finishAgentActivityLocally(running, {
      status: 'cancelled',
      completedAtMs: 2_000,
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      stopReason: 'cancelled',
      completedAtMs: 2_000,
      updatedAtMs: 2_000,
    });
    expect(cancelled.entries).toEqual([
      expect.objectContaining({ kind: 'progress', status: 'cancelled', completedAtMs: 2_000 }),
      expect.objectContaining({ kind: 'tool', status: 'cancelled', completedAtMs: 2_000 }),
    ]);

    const failed = finishAgentActivityLocally(running, {
      status: 'failed',
      completedAtMs: 2_100,
      error: 'Connection lost',
    });
    expect(failed).toMatchObject({ status: 'failed', stopReason: 'error', completedAtMs: 2_100 });
    expect(failed.entries).toEqual([
      expect.objectContaining({ kind: 'progress', status: 'failed', completedAtMs: 2_100 }),
      expect.objectContaining({
        kind: 'tool',
        status: 'failed',
        error: 'Connection lost',
        completedAtMs: 2_100,
      }),
      expect.objectContaining({ kind: 'error', message: 'Connection lost' }),
    ]);
    expect(failed.lastSequence).toBe(running.lastSequence);
  });

  it('can fail a nominally completed projection when host protocol validation rejects it', () => {
    const completed = applyAgentActivityEvent(
      applyAgentActivityEvent(undefined, envelope(0, { type: 'lifecycle', phase: 'started' })),
      envelope(1, { type: 'stop', reason: 'end-turn' }),
    );

    const failed = finishAgentActivityLocally(completed, {
      status: 'failed',
      completedAtMs: 2_200,
      error: 'Completed without renderable output',
      overrideTerminal: true,
    });

    expect(failed).toMatchObject({
      status: 'failed',
      stopReason: 'error',
      completedAtMs: 2_200,
    });
    expect(failed.entries).toContainEqual(
      expect.objectContaining({
        kind: 'error',
        message: 'Completed without renderable output',
      }),
    );
  });
});

describe('run outcome versus stop reason', () => {
  function runWith(toolResults: readonly boolean[]): ReturnType<typeof applyAgentActivityEvent> {
    let state = startAgentActivityLocally({
      sessionId: 'session-1',
      turnId: 'turn-1',
      summary: 'Starting AGI Work',
      startedAtMs: 900,
    });
    let sequence = 0;
    toolResults.forEach((succeeded, index) => {
      const toolCallId = `tool-${index}`;
      state = applyAgentActivityEvent(
        state,
        envelope((sequence += 1), {
          type: 'tool-execution-start',
          toolCallId,
          name: 'code_execution',
          category: 'code-execution',
          summary: index === 0 ? 'Create Folder' : 'Listing files',
          input: {},
        }),
      );
      state = applyAgentActivityEvent(
        state,
        envelope((sequence += 1), {
          type: 'tool-execution-end',
          toolCallId,
          name: 'code_execution',
          output: succeeded ? { ok: true } : { error: 'Code execution is unavailable' },
          isError: !succeeded,
          elapsedMs: 12,
        }),
      );
    });
    // The loop ends normally regardless of what the tools did.
    return applyAgentActivityEvent(
      state,
      envelope((sequence += 1), { type: 'stop', reason: 'end-turn' }),
    );
  }

  it('does not call a run complete when every tool failed', () => {
    // The audit's case: Create Folder and Listing files both errored, then the
    // turn reported "Done / Agent activity completed" with no deliverable.
    expect(runWith([false, false]).status).toBe('failed');
  });

  it('reports a mixed run as partial rather than complete', () => {
    expect(runWith([true, false]).status).toBe('partial');
  });

  it('still reports a clean run as complete', () => {
    expect(runWith([true, true]).status).toBe('completed');
  });

  it('leaves a cancelled run cancelled even if some work succeeded', () => {
    let state = startAgentActivityLocally({
      sessionId: 'session-1',
      turnId: 'turn-1',
      summary: 'Starting AGI Work',
      startedAtMs: 900,
    });
    state = applyAgentActivityEvent(state, envelope(1, { type: 'stop', reason: 'cancelled' }));
    expect(state.status).toBe('cancelled');
  });
});

describe('tool failure summaries', () => {
  it('replaces a raw exception with a generic summary but keeps the raw text on error', () => {
    let state = applyAgentActivityEvent(
      undefined,
      envelope(0, {
        type: 'tool-execution-start',
        toolCallId: 'call-1',
        name: 'search_docs',
        category: 'connector',
        summary: 'Using Docs connector',
        input: {},
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(1, {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'search_docs',
        output: "TypeError: Cannot read properties of undefined (reading 'access_token')",
        isError: true,
        elapsedMs: 10,
      }),
    );

    const entry = state.entries[0];
    expect(entry).toMatchObject({
      kind: 'tool',
      status: 'failed',
      summary: 'The tool failed',
      error: "TypeError: Cannot read properties of undefined (reading 'access_token')",
    });
    expect(isToolEntry(entry)).toBe(true);
    expect(JSON.stringify(isToolEntry(entry) ? entry.summary : undefined)).not.toContain(
      'access_token',
    );
  });
});

describe('unavailable tool notices', () => {
  function endWithError(output: string) {
    let state = applyAgentActivityEvent(
      undefined,
      envelope(0, {
        type: 'tool-execution-start',
        toolCallId: 'call-unavailable',
        name: 'execute_code',
        category: 'code-execution',
        input: {},
      }),
    );
    state = applyAgentActivityEvent(
      state,
      envelope(1, {
        type: 'tool-execution-end',
        toolCallId: 'call-unavailable',
        name: 'execute_code',
        output,
        isError: true,
        elapsedMs: 5,
      }),
    );
    const entry = state.entries.find(isToolEntry);
    if (!entry) throw new Error('no tool entry');
    return entry;
  }

  it('reads the cause the harness named back into the notice', () => {
    const entry = endWithError(
      'Code execution is unavailable for this request: no sandbox was available for this ' +
        'account right now. Do not call an execution tool again on this turn; answer without ' +
        'running code and tell the user why.',
    );
    expect(entry.unavailable).toBe(true);
    expect(entry.summary).toBe(
      'Code execution was not available: no sandbox was available for this account right now.',
    );
  });

  it('falls back to the generic notice when no cause is named', () => {
    const entry = endWithError('Code execution is unavailable for this request.');
    expect(entry.unavailable).toBe(true);
    expect(entry.summary).toContain('Code execution was not available for this request');
  });

  it('names the account setting when cloud code execution is turned off', () => {
    const entry = endWithError(
      'Cloud code execution is turned off for this account. Tell the user it is off.',
    );
    expect(entry.unavailable).toBe(true);
    expect(entry.summary).toBe(
      'Code execution was not available: it is turned off for this account.',
    );
  });

  it('names the tool that was not offered', () => {
    const entry = endWithError('Tool write_file is not available.');
    expect(entry.unavailable).toBe(true);
    expect(entry.summary).toBe('write_file was not available for this request.');
  });

  it('leaves a genuine tool failure styled as a failure', () => {
    const entry = endWithError('TypeError: x is not a function');
    expect(entry.unavailable).toBe(false);
  });
});
