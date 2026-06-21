/**
 * Telemetry queue — opt-in only (PRD-MOBILE §13 principle 3).
 * Events accumulate locally and are flushed to backend only when the user
 * has consented (MMKV key 'telemetry_opted_in' = true).
 * Content (prompts, model responses) is NEVER stored here — counts and
 * durations only.
 */

import { storage } from '@/lib/mmkv';
import { getDb } from './db';
import type { TelemetryEvent } from './types';

/** MMKV consent key — telemetry is enqueued/flushed only when this is true. */
export const TELEMETRY_OPT_IN_KEY = 'telemetry_opted_in';

/**
 * Enforced gate (fail-closed): telemetry may be enqueued ONLY when the user has
 * explicitly opted in AND the app is NOT in Local mode.
 *
 *   - Opt-in: the real MMKV key `telemetry_opted_in` must be strictly `true`.
 *     Absent / unset / false / unreadable → not consented → drop.
 *   - Mode:   Local mode is on-device only; our telemetry collector must never
 *     receive Local-mode events even if a consent flag is somehow set. Any
 *     failure to determine the mode is treated as Local (drop).
 *
 * Returns true only when BOTH conditions pass. Any thrown error → false (drop).
 */
export function isTelemetryAllowed(): boolean {
  try {
    const consented = storage.getBoolean(TELEMETRY_OPT_IN_KEY) === true;
    if (!consented) return false;

    // Lazy require keeps this storage module importable without pulling the
    // chat-feature store graph at load time, and preserves fail-closed behaviour
    // if the store module ever fails to load. Relative specifier (not '@/'):
    // an aliased dynamic require is not guaranteed to be rewritten at runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/features/chat/store/appModeStore') as {
      useChatAppModeStore?: { getState?: () => { appMode?: unknown } };
    };
    const appMode = mod.useChatAppModeStore?.getState?.()?.appMode;
    // Fail-closed: only 'cloud' is allowed; anything else (incl. undefined) drops.
    return appMode === 'cloud';
  } catch {
    return false;
  }
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'string') {
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  }
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function row2event(r: Record<string, unknown>): TelemetryEvent {
  return {
    id: r.id as number,
    event_type: r.event_type as string,
    payload: parsePayload(r.payload),
    created_at: r.created_at as number,
    sent_at: (r.sent_at as number | null) ?? null,
  };
}

export async function enqueueTelemetryEvent(
  event_type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Enforced opt-in + non-local gate. Without this, events could accumulate in
  // the local queue (and later flush to our collector) for users who never
  // consented or who are in Local mode — a zero-leak violation. Drop silently.
  if (!isTelemetryAllowed()) return;

  const db = await getDb();
  await db.runAsync(
    'INSERT INTO telemetry_queue (event_type, payload, created_at) VALUES (?, ?, ?);',
    [event_type, JSON.stringify(payload), Date.now()],
  );
}

export async function getPendingTelemetryEvents(limit = 50): Promise<TelemetryEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM telemetry_queue WHERE sent_at IS NULL ORDER BY created_at ASC LIMIT ?;',
    [limit],
  );
  return rows.map(row2event);
}

export async function markTelemetryEventsSent(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(`UPDATE telemetry_queue SET sent_at = ? WHERE id IN (${placeholders});`, [
    Date.now(),
    ...ids,
  ]);
}

export async function purgeSentTelemetryEvents(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM telemetry_queue WHERE sent_at IS NOT NULL;');
}
