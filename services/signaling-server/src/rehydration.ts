import type { SignalingSession } from './db.js';
import { withinDeadline } from './deadline.js';

export type SessionLookup =
  | { kind: 'found'; row: SignalingSession }
  | { kind: 'missing' }
  | { kind: 'unavailable'; reason: 'timeout' | 'db_error' };

type SessionLoad = () => Promise<{ data: SignalingSession | null; error: unknown }>;

export async function lookupSession(load: SessionLoad, timeoutMs: number): Promise<SessionLookup> {
  const outcome = await withinDeadline(load(), timeoutMs);
  if (outcome.kind === 'timeout') return { kind: 'unavailable', reason: 'timeout' };
  if (outcome.kind === 'failed' || outcome.value.error) {
    return { kind: 'unavailable', reason: 'db_error' };
  }
  return outcome.value.data ? { kind: 'found', row: outcome.value.data } : { kind: 'missing' };
}
