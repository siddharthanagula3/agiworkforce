import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import { appendCloudAgentEvents } from './cloud-agent-run-service';

/**
 * Envelope types a provider emits once per streamed token. They carry no run
 * state, so holding a handful of them for a few hundred milliseconds changes
 * nothing a reader can observe except how far behind the journal is. Every
 * other type — `task-state-changed`, tool boundaries, approvals, errors, stop —
 * flushes the moment it arrives, exactly as it did when each envelope was its
 * own transaction.
 */
const COALESCED_EVENT_TYPES: ReadonlySet<AgentEventEnvelope['event']['type']> = new Set([
  'text-delta',
  'reasoning-delta',
  'tool-use-delta',
]);

const FLUSH_INTERVAL_MS = 250;
const FLUSH_MAX_BUFFERED_EVENTS = 64;

export interface CloudAgentEventJournal {
  /** Buffers the envelope and returns the run state as of the last write. */
  append(envelope: AgentEventEnvelope): Promise<AgentTaskState | undefined>;
  /** Writes anything still buffered. Safe to call when nothing is pending. */
  flush(): Promise<AgentTaskState | undefined>;
}

export interface CloudAgentEventJournalTarget {
  db: DatabaseAdapter;
  userId: string;
  runId: string;
}

/**
 * Buffers streamed agent events so a turn journals a few rows per second
 * instead of one full RLS transaction per provider token.
 *
 * Callers must `flush()` on every exit from the stream — completion, failure
 * and cancellation alike — or the tail of the run never reaches the journal.
 */
export function createCloudAgentEventJournal(
  target: CloudAgentEventJournalTarget,
): CloudAgentEventJournal {
  const buffered: AgentEventEnvelope[] = [];
  let lastFlushAtMs = Date.now();
  let lastState: AgentTaskState | undefined;

  const flush = async (): Promise<AgentTaskState | undefined> => {
    if (buffered.length === 0) return lastState;
    const batch = buffered.splice(0, buffered.length);
    lastFlushAtMs = Date.now();
    const run = await appendCloudAgentEvents(target.db, {
      userId: target.userId,
      runId: target.runId,
      envelopes: batch,
    });
    lastState = run.state;
    return lastState;
  };

  return {
    async append(envelope) {
      buffered.push(envelope);
      const due =
        !COALESCED_EVENT_TYPES.has(envelope.event.type) ||
        buffered.length >= FLUSH_MAX_BUFFERED_EVENTS ||
        Date.now() - lastFlushAtMs >= FLUSH_INTERVAL_MS;
      return due ? flush() : lastState;
    },
    flush,
  };
}
