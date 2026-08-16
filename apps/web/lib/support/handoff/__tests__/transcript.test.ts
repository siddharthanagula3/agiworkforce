
import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSCRIPT_CHARS,
  MAX_TRANSCRIPT_TURNS,
  normalizeAttemptedActions,
  normalizeCitations,
  normalizeTranscript,
  redactSecrets,
} from '../transcript';

const OPENAI_KEY = `sk-${'a'.repeat(48)}`;
const STRIPE_KEY = `sk_live_${'b'.repeat(30)}`;
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';

describe('redactSecrets', () => {
  it.each([
    [OPENAI_KEY, 'api-key'],
    [STRIPE_KEY, 'stripe-live-key'],
    [JWT, 'jwt'],
    [`Bearer ${'c'.repeat(30)}`, 'bearer-token'],
  ])('replaces %s with a labelled marker', (secret, label) => {
    const out = redactSecrets(`before ${secret} after`);
    expect(out).not.toContain(secret);
    expect(out).toContain(`[redacted:${label}]`);
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('replaces EVERY occurrence, not just the first', () => {
    const out = redactSecrets(`${OPENAI_KEY} and again ${OPENAI_KEY}`);
    expect(out).not.toContain(OPENAI_KEY);
    expect(out.match(/\[redacted:api-key\]/gu)).toHaveLength(2);
  });

  it('leaves ordinary text alone', () => {
    expect(redactSecrets('my invoice doubled last month')).toBe('my invoice doubled last month');
  });

  it('does not throw on a secret — a user pasting their own key must still get help', () => {
    expect(() => redactSecrets(OPENAI_KEY)).not.toThrow();
  });
});

describe('normalizeTranscript', () => {
  it('redacts every turn', () => {
    const { turns } = normalizeTranscript([
      { role: 'user', content: `key ${OPENAI_KEY}`, at: 'x' },
      { role: 'assistant', content: `token ${JWT}`, at: 'y' },
    ]);
    expect(JSON.stringify(turns)).not.toContain(OPENAI_KEY);
    expect(JSON.stringify(turns)).not.toContain(JWT);
  });

  it('drops the OLDEST turns past the count cap and reports how many', () => {
    const input = Array.from({ length: MAX_TRANSCRIPT_TURNS + 10 }, (_, i) => ({
      role: 'user' as const,
      content: `turn-${i}`,
      at: 'x',
    }));
    const { turns, droppedTurns } = normalizeTranscript(input);

    expect(turns).toHaveLength(MAX_TRANSCRIPT_TURNS);
    expect(droppedTurns).toBe(10);
    expect(turns.at(-1)?.content).toBe(`turn-${MAX_TRANSCRIPT_TURNS + 9}`);
    expect(turns.at(0)?.content).toBe('turn-10');
  });

  it('drops the oldest turns past the character cap', () => {
    const big = 'x'.repeat(7_000);
    const input = Array.from({ length: 20 }, () => ({
      role: 'user' as const,
      content: big,
      at: 'x',
    }));
    const { turns, droppedTurns } = normalizeTranscript(input);

    const total = turns.reduce((sum, turn) => sum + turn.content.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    expect(droppedTurns).toBeGreaterThan(0);
  });

  it('caps a single enormous turn rather than letting it blow the budget', () => {
    const { turns } = normalizeTranscript([{ role: 'user', content: 'y'.repeat(50_000), at: 'x' }]);
    expect(turns[0]!.content.length).toBeLessThan(50_000);
    expect(turns[0]!.content).toContain('[truncated]');
  });
});

describe('normalizeAttemptedActions / normalizeCitations', () => {
  it('redacts and bounds attempted actions', () => {
    const [action] = normalizeAttemptedActions([
      {
        action: 'regenerate_api_key',
        outcome: 'succeeded',
        detail: `new key ${OPENAI_KEY}`,
        at: 'x',
      },
    ]);
    expect(action?.detail).not.toContain(OPENAI_KEY);
    expect(action?.outcome).toBe('succeeded');
  });

  it('returns empty arrays for absent input rather than undefined', () => {
    expect(normalizeAttemptedActions(undefined)).toEqual([]);
    expect(normalizeCitations(undefined)).toEqual([]);
  });
});
