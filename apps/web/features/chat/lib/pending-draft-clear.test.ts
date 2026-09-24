import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingDraftClear,
  hasPendingDraftClear,
  markPendingDraftClear,
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
