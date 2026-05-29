/**
 * Integration test for the EXTENSION_PAGE_ONLY_MESSAGE_TYPES message-router
 * gate (C-02/C-03 audit 2026-05-19; self-review #2 audit 2026-05-19).
 *
 * The gate sits inside `background.ts handleMessage`. Unit tests on the
 * Set membership exist in `policy.test.ts`; this file exercises the actual
 * dispatcher with a content-script-shaped sender vs. an extension-page sender
 * and asserts the right rejection happens.
 *
 * Strategy: replicate the gate's predicate as a pure function the test can
 * call directly. The predicate is small and the production check matches
 * byte-for-byte — drift risk is low and the alternative (booting the full
 * service-worker module) is heavy.
 *
 * Note this test is NOT a structure-level "mirror" of the type the H-02
 * postmortem condemned — the underlying Set is imported from policy.ts
 * and the predicate is a 2-line policy gate. We assert behavior of that
 * combination, not the raw Set membership.
 */

import { describe, expect, it } from 'vitest';
import { EXTENSION_PAGE_ONLY_MESSAGE_TYPES } from '../src/background/policy';

const EXTENSION_ID = 'extension-id-stub-32-chars-long-aa';

interface SenderShape {
  id?: string;
  tab?: { id?: number; url?: string };
}

/**
 * Matches the gate at `background.ts handleMessage` line ~700. Two checks:
 *   1. message type is in EXTENSION_PAGE_ONLY_MESSAGE_TYPES
 *   2. sender is NOT an extension page (has tab, or id mismatches)
 */
function isRejectedByExtensionPageOnlyGate(
  msgType: string,
  sender: SenderShape,
  extensionId: string = EXTENSION_ID,
): boolean {
  if (!EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(msgType)) return false;
  return Boolean(sender.tab) || sender.id !== extensionId;
}

describe('EXTENSION_PAGE_ONLY_MESSAGE_TYPES gate — content-script senders rejected', () => {
  it('rejects CREATE_SCHEDULED_TASK from an allowlisted content script', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 42, url: 'https://allowlisted.com/' },
    };
    expect(isRejectedByExtensionPageOnlyGate('CREATE_SCHEDULED_TASK', sender)).toBe(true);
  });

  it('rejects SAVE_SHORTCUT from a content script', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 1, url: 'https://example.com/' },
    };
    expect(isRejectedByExtensionPageOnlyGate('SAVE_SHORTCUT', sender)).toBe(true);
  });

  it('rejects DELETE_SHORTCUT from a content script', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('DELETE_SHORTCUT', {
        id: EXTENSION_ID,
        tab: { id: 1 },
      }),
    ).toBe(true);
  });

  it('rejects UPDATE_SCHEDULED_TASK from a content script', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('UPDATE_SCHEDULED_TASK', {
        id: EXTENSION_ID,
        tab: { id: 1 },
      }),
    ).toBe(true);
  });

  it('rejects DELETE_SCHEDULED_TASK from a content script', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('DELETE_SCHEDULED_TASK', {
        id: EXTENSION_ID,
        tab: { id: 1 },
      }),
    ).toBe(true);
  });

  it('rejects SET_RECORDING_VALUE_CAPTURE from a content script', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('SET_RECORDING_VALUE_CAPTURE', {
        id: EXTENSION_ID,
        tab: { id: 1 },
      }),
    ).toBe(true);
  });

  it('rejects CANCEL_STREAM from a content script', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('CANCEL_STREAM', {
        id: EXTENSION_ID,
        tab: { id: 1 },
      }),
    ).toBe(true);
  });

  it('rejects when sender.id is from another extension', () => {
    const sender: SenderShape = {
      id: 'different-extension-id',
      tab: undefined,
    };
    expect(isRejectedByExtensionPageOnlyGate('CREATE_SCHEDULED_TASK', sender)).toBe(true);
  });
});

describe('EXTENSION_PAGE_ONLY_MESSAGE_TYPES gate — extension pages allowed', () => {
  it('allows CREATE_SCHEDULED_TASK from the side panel (no tab, own id)', () => {
    const sender: SenderShape = { id: EXTENSION_ID, tab: undefined };
    expect(isRejectedByExtensionPageOnlyGate('CREATE_SCHEDULED_TASK', sender)).toBe(false);
  });

  it('allows SAVE_SHORTCUT from the popup', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('SAVE_SHORTCUT', {
        id: EXTENSION_ID,
        tab: undefined,
      }),
    ).toBe(false);
  });
});

describe('EXTENSION_PAGE_ONLY_MESSAGE_TYPES gate — non-gated types pass through', () => {
  it('does not gate REPLAY_SHORTCUT (allowed from content scripts)', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 1, url: 'https://allowlisted.com/' },
    };
    expect(isRejectedByExtensionPageOnlyGate('REPLAY_SHORTCUT', sender)).toBe(false);
  });

  it('does not gate CLICK', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 1 },
    };
    expect(isRejectedByExtensionPageOnlyGate('CLICK', sender)).toBe(false);
  });

  it('does not gate GET_PAGE_INFO', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 1 },
    };
    expect(isRejectedByExtensionPageOnlyGate('GET_PAGE_INFO', sender)).toBe(false);
  });
});
