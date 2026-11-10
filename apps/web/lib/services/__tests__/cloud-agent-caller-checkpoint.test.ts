import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/cloud-contracts';
import {
  claimCloudAgentCallerCheckpoint,
  saveCloudAgentCallerCheckpoint,
  CloudAgentCallerResultError,
} from '../cloud-agent-run-service';

vi.mock('server-only', () => ({}));

const persistenceReached = new Error('Persistence reached');
const transaction = vi.fn<() => void>();
const forbiddenQuery = vi.fn(async (): Promise<never> => {
  throw new Error('Unexpected query');
});
const db: DatabaseAdapter = {
  query: forbiddenQuery,
  execute: forbiddenQuery,
  transaction<T>(_callback: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    transaction();
    return Promise.reject<T>(persistenceReached);
  },
  withUser: () => {
    throw new Error('Unexpected user rebind');
  },
  withOrg: () => {
    throw new Error('Unexpected organization rebind');
  },
  dispose: async () => {},
};

function boundary() {
  const call = {
    id: 'local-read',
    type: 'function' as const,
    function: { name: 'read_dom', arguments: '{}' },
  };
  const base = {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-1',
    turnId: 'turn-1',
    emittedAtMs: 1,
  };
  return {
    userId: 'fixture-user',
    runId: '11111111-1111-4111-8111-111111111111',
    sessionId: base.sessionId,
    turnId: base.turnId,
    nextEventSequence: 3,
    completedSteps: 1,
    request: { model: 'fixture-model', caller_tool_handoff_version: AGENT_EVENT_SCHEMA_VERSION },
    messages: [
      { role: 'user', content: 'Inspect the page and search hours.' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'host-search',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"hours"}' },
          },
          call,
        ],
      },
      { role: 'tool', tool_call_id: 'host-search', content: 'Hosted result.' },
    ],
    pendingToolCalls: [{ id: call.id, qualifiedName: call.function.name, args: {} }],
    events: [
      {
        ...base,
        sequence: 0,
        event: { type: 'caller-tools-requested', nextEventSequence: 3, calls: [call] },
      },
      {
        ...base,
        sequence: 1,
        event: {
          type: 'task-state-changed',
          taskId: 'task-1',
          state: 'awaiting_input',
          summary: 'Working in your browser.',
        },
      },
      { ...base, sequence: 2, event: { type: 'lifecycle', phase: 'paused' } },
    ],
  };
}

beforeEach(() => {
  transaction.mockClear();
  forbiddenQuery.mockClear();
});

describe('caller checkpoint admission before persistence', () => {
  it('admits a complete boundary with resolved hosted siblings', async () => {
    await expect(saveCloudAgentCallerCheckpoint(db, boundary())).rejects.toBe(persistenceReached);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(forbiddenQuery).not.toHaveBeenCalled();
  });

  it('does not discard an unanswered hosted call', async () => {
    const value = boundary();
    value.messages = value.messages.filter((message) => message.role !== 'tool');
    await expect(saveCloudAgentCallerCheckpoint(db, value)).rejects.toBeInstanceOf(
      CloudAgentCallerResultError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not accept duplicate answers for a hosted call', async () => {
    const value = boundary();
    value.messages.push(value.messages.at(-1)!);
    await expect(saveCloudAgentCallerCheckpoint(db, value)).rejects.toBeInstanceOf(
      CloudAgentCallerResultError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not reissue a caller obligation already answered in the transcript', async () => {
    const value = boundary();
    value.messages.push({ role: 'tool', tool_call_id: 'local-read', content: 'Already answered.' });
    await expect(saveCloudAgentCallerCheckpoint(db, value)).rejects.toBeInstanceOf(
      CloudAgentCallerResultError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('binds the persisted cursor to the complete event boundary', async () => {
    const value = boundary();
    value.nextEventSequence++;
    await expect(saveCloudAgentCallerCheckpoint(db, value)).rejects.toBeInstanceOf(
      CloudAgentCallerResultError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires the caller to advertise the continuation protocol', async () => {
    await expect(
      saveCloudAgentCallerCheckpoint(db, { ...boundary(), request: { model: 'fixture-model' } }),
    ).rejects.toBeInstanceOf(CloudAgentCallerResultError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not reinterpret a malformed argument default as a caller action', async () => {
    const value = boundary();
    value.pendingToolCalls = value.pendingToolCalls.map((call) => ({
      ...call,
      argsMalformed: true,
    }));
    await expect(saveCloudAgentCallerCheckpoint(db, value)).rejects.toMatchObject({
      name: 'ZodError',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps hosted approval scope data out of a caller checkpoint', async () => {
    const value = boundary();
    value.pendingToolCalls = value.pendingToolCalls.map((call) => ({
      ...call,
      approvalScopes: ['once'],
    }));
    await expect(saveCloudAgentCallerCheckpoint(db, value)).rejects.toMatchObject({
      name: 'ZodError',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate results before acquiring a database lease', async () => {
    const result = { tool_call_id: 'local-read', content: '' };
    await expect(
      claimCloudAgentCallerCheckpoint(db, {
        userId: 'fixture-user',
        resume: {
          schema_version: AGENT_EVENT_SCHEMA_VERSION,
          run_id: boundary().runId,
          turn_id: 'turn-1',
          next_event_sequence: 3,
          tool_results: [result, result],
        },
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
    expect(transaction).not.toHaveBeenCalled();
  });
});
