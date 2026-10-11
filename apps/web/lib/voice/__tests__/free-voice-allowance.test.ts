import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { normalizeBillingPlanTier } from '@agiworkforce/types';

import {
  FREE_VOICE_SESSION_ALLOWANCE_SECONDS,
  freeVoiceAllowanceSeconds,
  freeVoiceAllowanceUsedError,
  grantFreeVoiceSeconds,
  readFreeVoiceSession,
  settleFreeVoiceSeconds,
} from '../free-voice-allowance';

const GRANTED = 'free_voice_seconds_granted';
const SETTLED = 'free_voice_seconds_settled';
const USER = 'user-free';
const OCTOBER = new Date('2026-10-11T12:00:00.000Z');
const NOVEMBER_START = '2026-11-01T00:00:00.000Z';
const MINUTE = 60;
const TEN_MINUTES = 10 * MINUTE;

interface StoredEvent {
  userId: string;
  eventType: string;
  quantity: number;
  metadata: { sessionId: string; grantKey?: string; period: string; use?: string };
  createdAt: Date;
}

function usageEventsStore(clock: { now: Date } = { now: OCTOBER }) {
  const events: StoredEvent[] = [];
  const locks: string[] = [];
  const of = (userId: string, sessionId?: string) =>
    events.filter(
      (event) =>
        event.userId === userId &&
        (sessionId === undefined || event.metadata.sessionId === sessionId),
    );
  const sum = (rows: StoredEvent[], type: string) =>
    rows.filter((row) => row.eventType === type).reduce((total, row) => total + row.quantity, 0);
  const settledOf = (rows: StoredEvent[]) => {
    const settled = rows.filter((row) => row.eventType === SETTLED).map((row) => row.quantity);
    return settled.length > 0 ? Math.max(...settled) : null;
  };

  const adapter = {
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes('pg_advisory_xact_lock')) {
        locks.push(String(params[0]));
        return [{}];
      }
      if (sql.includes('count(*) as events')) {
        const rows = of(String(params[0]), String(params[1]));
        return [
          {
            events: rows.length,
            granted: sum(rows, GRANTED),
            settled: settledOf(rows),
            period: rows.map((row) => row.metadata.period).sort()[0] ?? null,
          },
        ];
      }
      if (sql.includes("metadata->>'grantKey'")) {
        return of(String(params[0]), String(params[1]))
          .filter((row) => row.eventType === GRANTED && row.metadata.grantKey === params[3])
          .slice(0, 1)
          .map(() => ({ id: 'event' }));
      }
      if (sql.includes('as consumed')) {
        const since = new Date(String(params[4]));
        const inPeriod = of(String(params[0])).filter(
          (row) => row.metadata.period === params[1] && row.createdAt >= since,
        );
        const sessions = new Set(inPeriod.map((row) => row.metadata.sessionId));
        const leaseStart = clock.now.getTime() - Number(params[5]) * 1_000;
        let consumed = 0;
        for (const sessionId of sessions) {
          const rows = inPeriod.filter((row) => row.metadata.sessionId === sessionId);
          const lastGrantedAt = Math.max(
            ...rows
              .filter((row) => row.eventType === GRANTED)
              .map((row) => row.createdAt.getTime()),
          );
          consumed += settledOf(rows) ?? (lastGrantedAt >= leaseStart ? sum(rows, GRANTED) : 0);
        }
        return [{ consumed }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async execute(_sql: string, params: unknown[] = []) {
      events.push({
        userId: String(params[0]),
        eventType: String(params[1]),
        quantity: Number(params[2]),
        metadata: JSON.parse(String(params[3])) as StoredEvent['metadata'],
        createdAt: clock.now,
      });
    },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(adapter as unknown as DatabaseAdapter);
    },
  };
  return { db: adapter as unknown as DatabaseAdapter, events, locks };
}

function grantMinute(
  store: ReturnType<typeof usageEventsStore>,
  sessionId: string,
  block: number,
  now: Date = OCTOBER,
) {
  return grantFreeVoiceSeconds({
    db: store.db,
    userId: USER,
    sessionId,
    use: 'live',
    grantKey: `provider:${block}`,
    seconds: MINUTE,
    limitSeconds: TEN_MINUTES,
    now,
  });
}

describe('the monthly voice allowance of a plan with no paid usage ledger', () => {
  it('is ten minutes on the Free plan and absent on a paid one', () => {
    expect(freeVoiceAllowanceSeconds(normalizeBillingPlanTier(null))).toBe(TEN_MINUTES);
    expect(FREE_VOICE_SESSION_ALLOWANCE_SECONDS).toBe(TEN_MINUTES);
    expect(freeVoiceAllowanceSeconds('pro')).toBeNull();
    expect(freeVoiceAllowanceSeconds('max')).toBeNull();
  });

  it('gives a call its minutes one at a time and stops it at the tenth', async () => {
    const store = usageEventsStore();
    for (let block = 1; block <= 10; block += 1) {
      await expect(grantMinute(store, 'call', block)).resolves.toEqual({
        granted: true,
        grantedSeconds: block * MINUTE,
        fresh: true,
      });
    }
    await expect(grantMinute(store, 'call', 11)).resolves.toEqual({
      granted: false,
      reason: 'allowance_used',
      resetsAt: NOVEMBER_START,
    });
    expect(store.events).toHaveLength(10);
    expect(new Set(store.locks)).toEqual(new Set([`free-voice:${USER}`]));
  });

  it('counts a running call for everything it was granted, so a second cannot be admitted on the same remainder', async () => {
    const store = usageEventsStore();
    for (let block = 1; block <= 9; block += 1) await grantMinute(store, 'first', block);
    await expect(grantMinute(store, 'second', 1)).resolves.toMatchObject({ granted: true });
    await expect(grantMinute(store, 'third', 1)).resolves.toMatchObject({
      granted: false,
      reason: 'allowance_used',
    });
  });

  it('returns what a call did not use to the month when it ends', async () => {
    const store = usageEventsStore();
    for (let block = 1; block <= 10; block += 1) await grantMinute(store, 'call', block);
    await expect(
      settleFreeVoiceSeconds({ db: store.db, userId: USER, sessionId: 'call', usedSeconds: 75.2 }),
    ).resolves.toBe(76);

    await expect(readFreeVoiceSession(store.db, USER, 'call')).resolves.toEqual({
      grantedSeconds: TEN_MINUTES,
      settledSeconds: 76,
    });
    for (let block = 1; block <= 8; block += 1) {
      await expect(grantMinute(store, 'next', block)).resolves.toMatchObject({ granted: true });
    }
    await expect(grantMinute(store, 'next', 9)).resolves.toMatchObject({ granted: false });
  });

  it('never settles a call above what it was granted, however long its record says it ran', async () => {
    const store = usageEventsStore();
    await grantMinute(store, 'call', 1);
    await grantMinute(store, 'call', 2);
    await expect(
      settleFreeVoiceSeconds({ db: store.db, userId: USER, sessionId: 'call', usedSeconds: 900 }),
    ).resolves.toBe(2 * MINUTE);
  });

  it('gives nothing new for a stretch it already gave', async () => {
    const store = usageEventsStore();
    await grantMinute(store, 'call', 1);
    await expect(grantMinute(store, 'call', 1)).resolves.toEqual({
      granted: true,
      grantedSeconds: MINUTE,
      fresh: false,
    });
    expect(store.events).toHaveLength(1);
  });

  it('settles once, and gives an ended call nothing more', async () => {
    const store = usageEventsStore();
    await grantMinute(store, 'call', 1);
    const settle = () =>
      settleFreeVoiceSeconds({ db: store.db, userId: USER, sessionId: 'call', usedSeconds: 20 });
    await expect(settle()).resolves.toBe(20);
    await expect(settle()).resolves.toBe(20);
    expect(store.events.filter((event) => event.eventType === SETTLED)).toHaveLength(1);
    await expect(grantMinute(store, 'call', 2)).resolves.toEqual({
      granted: false,
      reason: 'session_settled',
      resetsAt: NOVEMBER_START,
    });
  });

  it('gives a refused attempt its whole grant back when it settles at nothing', async () => {
    const store = usageEventsStore();
    for (let block = 1; block <= 10; block += 1) await grantMinute(store, 'failed', block);
    await settleFreeVoiceSeconds({
      db: store.db,
      userId: USER,
      sessionId: 'failed',
      usedSeconds: 0,
    });
    await expect(grantMinute(store, 'retry', 1)).resolves.toMatchObject({ granted: true });
  });

  it('stops counting a grant nobody settled once the session lease and a block have passed', async () => {
    const clock = { now: OCTOBER };
    const store = usageEventsStore(clock);
    for (let block = 1; block <= 10; block += 1) await grantMinute(store, 'died', block);
    await expect(grantMinute(store, 'next', 1)).resolves.toMatchObject({ granted: false });

    clock.now = new Date(OCTOBER.getTime() + 11 * MINUTE * 1_000 - 1_000);
    await expect(grantMinute(store, 'next', 1)).resolves.toMatchObject({ granted: false });

    clock.now = new Date(OCTOBER.getTime() + 11 * MINUTE * 1_000 + 1_000);
    await expect(grantMinute(store, 'next', 1)).resolves.toMatchObject({ granted: true });
  });

  it('tells a session it funded from one it did not', async () => {
    const store = usageEventsStore();
    await expect(readFreeVoiceSession(store.db, USER, 'paid-call')).resolves.toBeNull();
    await expect(
      settleFreeVoiceSeconds({
        db: store.db,
        userId: USER,
        sessionId: 'paid-call',
        usedSeconds: 40,
      }),
    ).resolves.toBeNull();
    expect(store.events).toHaveLength(0);
  });

  it('keeps a call in the month it started and starts the next month empty', async () => {
    const clock = { now: new Date('2026-10-31T23:59:40.000Z') };
    const store = usageEventsStore(clock);
    for (let block = 1; block <= 10; block += 1) {
      await grantMinute(store, 'october', block, clock.now);
    }

    clock.now = new Date('2026-11-01T00:00:30.000Z');
    await expect(grantMinute(store, 'october', 11, clock.now)).resolves.toMatchObject({
      granted: false,
      resetsAt: NOVEMBER_START,
    });
    await expect(grantMinute(store, 'november', 1, clock.now)).resolves.toEqual({
      granted: true,
      grantedSeconds: MINUTE,
      fresh: true,
    });
  });

  it('holds another account to its own allowance', async () => {
    const store = usageEventsStore();
    for (let block = 1; block <= 10; block += 1) await grantMinute(store, 'call', block);
    await expect(
      grantFreeVoiceSeconds({
        db: store.db,
        userId: 'someone-else',
        sessionId: 'their-call',
        use: 'dictation',
        grantKey: 'recording',
        seconds: 12.4,
        limitSeconds: TEN_MINUTES,
        now: OCTOBER,
      }),
    ).resolves.toEqual({ granted: true, grantedSeconds: 13, fresh: true });
  });

  it('refuses in the words and code the monthly voice limit already uses, with the reset', () => {
    const refusal = freeVoiceAllowanceUsedError(NOVEMBER_START);
    expect(refusal.status).toBe(429);
    expect(refusal.code).toBe('voice_minutes_monthly_limit_reached');
    expect(refusal.limitContext).toEqual({ resetsAt: NOVEMBER_START, alternativeModel: null });
  });
});
