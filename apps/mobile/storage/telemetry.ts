/**
 * Telemetry queue — opt-in only (PRD-MOBILE §13 principle 3).
 * Events accumulate locally and are flushed to backend only when the user
 * has consented (MMKV key 'telemetry_opted_in' = true).
 * Content (prompts, model responses) is NEVER stored here — counts and
 * durations only.
 */

import { getDb } from './db';
import type { TelemetryEvent } from './types';

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
