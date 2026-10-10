import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getTierPolicy } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { LIVE_SESSION_CEILING_SECONDS } from '@/lib/voice/live-voice-billing';

import {
  planIncludesVoice,
  planVoiceMinutesBlock,
  VOICE_MINUTES_EXHAUSTED_CODE,
  voiceMinutesExhaustedMessage,
  voiceUsageErrorResponse,
} from '../voice-session-budget';

const RESET_AT = '2026-11-01T00:00:00.000Z';

function dbWithConsumedSeconds(seconds: number) {
  const queries: string[] = [];
  const db = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('as reset_at')) {
        return [{ period_start: '2026-10-01T00:00:00.000Z', reset_at: RESET_AT }];
      }
      return [{ consumed: seconds }];
    }),
  };
  return { db: db as never, queries };
}

const request = () => new NextRequest('http://localhost/api/voice/live/sessions');

describe('planVoiceMinutesBlock', () => {
  it('starts a Free session on its voice minutes with no managed budget at all', async () => {
    expect(getTierPolicy('free').voiceMinutesPerMonth).toBe(30);
    const { db, queries } = dbWithConsumedSeconds(0);

    const seconds = await planVoiceMinutesBlock({ db, userId: 'user-1', planTier: 'free' });

    expect(seconds).toBe(LIVE_SESSION_CEILING_SECONDS);
    expect(queries.some((sql) => sql.includes('credit_transactions'))).toBe(false);
    expect(queries.some((sql) => sql.includes('reserve_managed_usage'))).toBe(false);
  });

  it('holds the block to the minutes that are left', async () => {
    const { db } = dbWithConsumedSeconds(27 * 60);

    expect(await planVoiceMinutesBlock({ db, userId: 'user-1', planTier: 'free' })).toBe(3 * 60);
  });

  it('refuses with the reset instant once under a minute is left', async () => {
    const { db } = dbWithConsumedSeconds(30 * 60);

    await expect(
      planVoiceMinutesBlock({ db, userId: 'user-1', planTier: 'free' }),
    ).rejects.toMatchObject({
      status: 429,
      code: VOICE_MINUTES_EXHAUSTED_CODE,
      limitContext: { resetsAt: RESET_AT },
    });
  });

  it('gives Max a whole block without reading any usage, because its minutes are unlimited', async () => {
    expect(getTierPolicy('max').voiceMinutesPerMonth).toBeNull();
    const { db, queries } = dbWithConsumedSeconds(1_000_000);

    expect(await planVoiceMinutesBlock({ db, userId: 'user-1', planTier: 'max' })).toBe(
      LIVE_SESSION_CEILING_SECONDS,
    );
    expect(queries).toHaveLength(0);
  });

  it('gives Pro the minutes its plan declares', async () => {
    expect(getTierPolicy('pro').voiceMinutesPerMonth).toBe(300);
    const { db } = dbWithConsumedSeconds(299 * 60 + 1);

    await expect(
      planVoiceMinutesBlock({ db, userId: 'user-1', planTier: 'pro' }),
    ).rejects.toMatchObject({ code: VOICE_MINUTES_EXHAUSTED_CODE });
  });
});

describe('planIncludesVoice', () => {
  it('includes voice on every plan that declares minutes or unlimited minutes', () => {
    for (const tier of ['free', 'basic', 'pro', 'team', 'max', 'enterprise']) {
      expect(planIncludesVoice(tier)).toBe(true);
    }
  });
});

describe('the voice minutes refusal', () => {
  it('names the reset date and offers text', () => {
    expect(voiceMinutesExhaustedMessage(RESET_AT)).toBe(
      "You've used this month's voice minutes. They reset on November 1. Continue in text, or upgrade for more voice minutes.",
    );
  });

  it('carries the reset instant and the plain sentence in the response body', async () => {
    const refusal = new ManagedUsageRequestError('generic', 429, VOICE_MINUTES_EXHAUSTED_CODE);
    refusal.limitContext = { resetsAt: RESET_AT, alternativeModel: null };

    const response = voiceUsageErrorResponse(request(), refusal);

    expect(response.status).toBe(429);
    const body = (await response.json()) as {
      error: { code: string; message: string; resets_at: string };
    };
    expect(body.error).toMatchObject({
      code: VOICE_MINUTES_EXHAUSTED_CODE,
      resets_at: RESET_AT,
      message: voiceMinutesExhaustedMessage(RESET_AT),
    });
  });
});
