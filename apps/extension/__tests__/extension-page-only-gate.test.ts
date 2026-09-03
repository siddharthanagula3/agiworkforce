import { describe, expect, it } from 'vitest';
import { EXTENSION_PAGE_ONLY_MESSAGE_TYPES } from '../src/background/policy';

const EXTENSION_ID = 'extension-id-stub-32-chars-long-aa';

interface SenderShape {
  id?: string;
  tab?: { id?: number; url?: string };
}

function isRejectedByExtensionPageOnlyGate(
  msgType: string,
  sender: SenderShape,
  extensionId: string = EXTENSION_ID,
): boolean {
  if (!EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(msgType)) return false;
  return Boolean(sender.tab) || sender.id !== extensionId;
}

describe('EXTENSION_PAGE_ONLY_MESSAGE_TYPES gate, content-script senders rejected', () => {
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

  it('rejects RESUME_CHAT_RUN from a content script', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('RESUME_CHAT_RUN', {
        id: EXTENSION_ID,
        tab: { id: 1 },
      }),
    ).toBe(true);
  });

  it('rejects context-handoff approval and cancellation from a content script', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 1, url: 'https://allowlisted.com/' },
    };
    expect(isRejectedByExtensionPageOnlyGate('APPROVE_CONTEXT_HANDOFF', sender)).toBe(true);
    expect(isRejectedByExtensionPageOnlyGate('CANCEL_CONTEXT_HANDOFF', sender)).toBe(true);
  });

  it('rejects REPLAY_SHORTCUT from an allowlisted content script', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 1, url: 'https://allowlisted.com/' },
    };
    expect(isRejectedByExtensionPageOnlyGate('REPLAY_SHORTCUT', sender)).toBe(true);
  });

  it('rejects REPLAY_SHORTCUT alongside the CHAT_MESSAGE it can proxy', () => {
    const sender: SenderShape = {
      id: EXTENSION_ID,
      tab: { id: 7, url: 'https://allowlisted.com/attacker' },
    };
    for (const type of ['REPLAY_SHORTCUT', 'CHAT_MESSAGE']) {
      expect(isRejectedByExtensionPageOnlyGate(type, sender)).toBe(true);
    }
  });

  it('rejects when sender.id is from another extension', () => {
    const sender: SenderShape = {
      id: 'different-extension-id',
      tab: undefined,
    };
    expect(isRejectedByExtensionPageOnlyGate('CREATE_SCHEDULED_TASK', sender)).toBe(true);
  });
});

describe('EXTENSION_PAGE_ONLY_MESSAGE_TYPES gate, extension pages allowed', () => {
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

  it('allows REPLAY_SHORTCUT from the side panel, its only real caller', () => {
    expect(
      isRejectedByExtensionPageOnlyGate('REPLAY_SHORTCUT', {
        id: EXTENSION_ID,
        tab: undefined,
      }),
    ).toBe(false);
  });
});

describe('EXTENSION_PAGE_ONLY_MESSAGE_TYPES gate, non-gated types pass through', () => {
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
