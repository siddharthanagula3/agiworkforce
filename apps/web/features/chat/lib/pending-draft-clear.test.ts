import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingDraftClear,
  hasPendingDraftClear,
  markPendingDraftClear,
  readPendingDraftClearToken,
} from './pending-draft-clear';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pending draft clear intent', () => {
  it('survives a document reload without storing the draft text', () => {
    expect(markPendingDraftClear(CONVERSATION)).toBe(true);
    expect(hasPendingDraftClear(CONVERSATION)).toBe(true);
    expect(hasPendingDraftClear('22222222-2222-4222-8222-222222222222')).toBe(false);
    expect(Object.values(window.localStorage).join('')).not.toContain('draft text');

    clearPendingDraftClear(CONVERSATION);
    expect(hasPendingDraftClear(CONVERSATION)).toBe(false);
  });

  it('expires a clear intent that could otherwise suppress a later cross-device draft', () => {
    markPendingDraftClear(CONVERSATION);
    vi.advanceTimersByTime(24 * 60 * 60 * 1_000 + 1);

    expect(hasPendingDraftClear(CONVERSATION)).toBe(false);
  });
});

describe('clear marker acknowledgment ownership', () => {
  it('retains valid legacy markers until their exact acknowledgment', () => {
    window.localStorage.setItem(
      `agi-composer-draft-clear:v1:${CONVERSATION}`,
      JSON.stringify({ clearedAt: Date.now() }),
    );
    const token = readPendingDraftClearToken(CONVERSATION);
    expect(token).not.toBeNull();
    expect(hasPendingDraftClear(CONVERSATION)).toBe(true);
    clearPendingDraftClear(CONVERSATION, token!);
    expect(hasPendingDraftClear(CONVERSATION)).toBe(false);
  });

  it('does not acknowledge a newer clear minted within the same millisecond', () => {
    markPendingDraftClear(CONVERSATION);
    const first = readPendingDraftClearToken(CONVERSATION)!;
    markPendingDraftClear(CONVERSATION);
    const second = readPendingDraftClearToken(CONVERSATION)!;
    expect(second).not.toBe(first);
    clearPendingDraftClear(CONVERSATION, first);
    expect(readPendingDraftClearToken(CONVERSATION)).toBe(second);
    clearPendingDraftClear(CONVERSATION, second);
    expect(hasPendingDraftClear(CONVERSATION)).toBe(false);
  });

  it('preserves a legacy marker when a replacement cannot be minted', () => {
    window.localStorage.setItem(
      `agi-composer-draft-clear:v1:${CONVERSATION}`,
      JSON.stringify({ clearedAt: Date.now() }),
    );
    const token = readPendingDraftClearToken(CONVERSATION);
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('Unavailable');
    });
    expect(markPendingDraftClear(CONVERSATION)).toBe(false);
    expect(readPendingDraftClearToken(CONVERSATION)).toBe(token);
    uuid.mockRestore();
  });
});
