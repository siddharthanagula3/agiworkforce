import { describe, expect, it, vi } from 'vitest';

import {
  clampVoicePace,
  closeVoiceSession,
  createVoiceSession,
  getActiveVoiceSessionForConversation,
  isVoiceSessionStoreReady,
  listVoiceSessionHistory,
  updateVoiceSessionSettings,
  VOICE_PACE_DEFAULT,
  type VoiceSessionDb,
} from '../voice-session-store';

const ROW = {
  id: 'vs_1',
  user_id: 'user_1',
  organization_id: null,
  conversation_id: 'conv_1',
  provider: 'openai',
  provider_session_id: 'sess_1',
  model_id: 'live-model',
  surface: 'web' as const,
  voice: 'alloy',
  language: null,
  pace: '1.00',
  active_tools: ['web_search'],
  last_turn_id: null,
  status: 'active' as const,
  close_reason: null,
  started_at: '2026-09-18T00:00:00.000Z',
  last_seen_at: '2026-09-18T00:00:00.000Z',
  closed_at: null,
};

function stubDb(results: unknown[][]): { db: VoiceSessionDb; calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  const queue = [...results];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push([sql, params]);
    return (queue.shift() ?? []) as never[];
  });
  return { db: { query } as VoiceSessionDb, calls };
}

describe('clampVoicePace', () => {
  it('holds the pace inside the range the session can negotiate', () => {
    expect(clampVoicePace(undefined)).toBe(VOICE_PACE_DEFAULT);
    expect(clampVoicePace(Number.NaN)).toBe(VOICE_PACE_DEFAULT);
    expect(clampVoicePace(0.1)).toBe(0.25);
    expect(clampVoicePace(9)).toBe(4);
    expect(clampVoicePace(1.234)).toBe(1.23);
  });
});

describe('createVoiceSession', () => {
  it('closes the conversation open session before recording the new one', async () => {
    const { db, calls } = stubDb([[], [ROW]]);
    const record = await createVoiceSession({
      db,
      userId: 'user_1',
      organizationId: null,
      conversationId: 'conv_1',
      provider: 'openai',
      providerSessionId: 'sess_1',
      modelId: 'live-model',
      surface: 'web',
      voice: 'alloy',
      language: null,
      pace: 1,
      activeTools: ['web_search'],
    });

    expect(calls[0]?.[0]).toContain("set status = 'closed'");
    expect(calls[1]?.[0]).toContain('insert into public.voice_sessions');
    expect(record).toMatchObject({
      id: 'vs_1',
      conversationId: 'conv_1',
      providerSessionId: 'sess_1',
      pace: 1,
      activeTools: ['web_search'],
    });
  });

  it('clamps the pace it writes rather than trusting the caller', async () => {
    const { db, calls } = stubDb([[], [ROW]]);
    await createVoiceSession({
      db,
      userId: 'user_1',
      organizationId: null,
      conversationId: 'conv_1',
      provider: 'openai',
      providerSessionId: 'sess_1',
      modelId: 'live-model',
      surface: 'web',
      voice: 'alloy',
      language: 'fr',
      pace: 99,
      activeTools: [],
    });
    expect(calls[1]?.[1]?.[9]).toBe(4);
  });
});

describe('lookup and update', () => {
  it('finds the open session for a conversation', async () => {
    const { db, calls } = stubDb([[ROW]]);
    const record = await getActiveVoiceSessionForConversation(db, 'user_1', 'conv_1');
    expect(calls[0]?.[0]).toContain("status = 'active'");
    expect(calls[0]?.[1]).toEqual(['user_1', 'conv_1']);
    expect(record?.providerSessionId).toBe('sess_1');
  });

  it('returns null when the conversation has no open session', async () => {
    const { db } = stubDb([[]]);
    expect(await getActiveVoiceSessionForConversation(db, 'user_1', 'conv_2')).toBeNull();
  });

  it('distinguishes clearing the language from leaving it alone', async () => {
    const cleared = stubDb([[{ ...ROW, language: null }]]);
    await updateVoiceSessionSettings({
      db: cleared.db,
      userId: 'user_1',
      providerSessionId: 'sess_1',
      language: null,
    });
    expect(cleared.calls[0]?.[1]?.[3]).toBe(true);

    const untouched = stubDb([[ROW]]);
    await updateVoiceSessionSettings({
      db: untouched.db,
      userId: 'user_1',
      providerSessionId: 'sess_1',
      pace: 1.25,
    });
    expect(untouched.calls[0]?.[1]?.[3]).toBe(false);
    expect(untouched.calls[0]?.[1]?.[5]).toBe(1.25);
  });

  it('records the language a mid-session switch negotiated', async () => {
    const { db } = stubDb([[{ ...ROW, language: 'es' }]]);
    const record = await updateVoiceSessionSettings({
      db,
      userId: 'user_1',
      providerSessionId: 'sess_1',
      language: 'es',
    });
    expect(record?.language).toBe('es');
  });
});

describe('close and history', () => {
  it('closes only an open session and keeps its transcript pointer', async () => {
    const { db, calls } = stubDb([
      [{ ...ROW, status: 'closed', closed_at: '2026-09-18T00:05:00.000Z', last_turn_id: 'turn_9' }],
    ]);
    const record = await closeVoiceSession({
      db,
      userId: 'user_1',
      providerSessionId: 'sess_1',
      reason: 'close_requested',
      lastTurnId: 'turn_9',
    });
    expect(calls[0]?.[0]).toContain("status = 'active'");
    expect(record?.status).toBe('closed');
    expect(record?.lastTurnId).toBe('turn_9');
  });

  it('lists the account voice sessions newest first within a bounded limit', async () => {
    const { db, calls } = stubDb([[ROW]]);
    const history = await listVoiceSessionHistory(db, 'user_1', 5_000);
    expect(calls[0]?.[0]).toContain('order by started_at desc');
    expect(calls[0]?.[1]?.[1]).toBe(200);
    expect(history).toHaveLength(1);
  });

  it('reports the table missing rather than throwing', async () => {
    const { db } = stubDb([[{ ready: false }]]);
    expect(await isVoiceSessionStoreReady(db)).toBe(false);
  });
});
