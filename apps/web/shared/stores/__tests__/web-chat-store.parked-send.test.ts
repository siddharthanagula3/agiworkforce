import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useChatStore,
  firstParkedSend,
  selectParkedSends,
  selectDraftContent,
} from '../web-chat-store';

const PLACEHOLDER_ID = 'client-placeholder-id';
const REAL_ID = 'server-conversation-id';
const FINGERPRINT = 'Actually, forget the file, just say hi|';
const OTHER_FINGERPRINT = 'A third thought|';
const CONTENT = 'Actually, forget the file, just say hi';

beforeEach(() => {
  useChatStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parked blocked sends', () => {
  it('survives the placeholder-to-real conversation rename that wipes every id-keyed slot', () => {
    const store = useChatStore.getState();
    store.setActiveConversation(PLACEHOLDER_ID);
    store.parkBlockedSend(FINGERPRINT, CONTENT);

    useChatStore.getState().renameConversationId(PLACEHOLDER_ID, REAL_ID);

    expect(useChatStore.getState().activeConversationId).toBe(REAL_ID);
    expect(firstParkedSend(selectParkedSends(useChatStore.getState()))).toEqual({
      fingerprint: FINGERPRINT,
      content: CONTENT,
    });
  });

  it('carries a parked draft onto the renamed conversation instead of stranding it', () => {
    const store = useChatStore.getState();
    store.setDraftContent('half typed under the placeholder', PLACEHOLDER_ID);

    useChatStore.getState().renameConversationId(PLACEHOLDER_ID, REAL_ID);

    expect(selectDraftContent(REAL_ID)(useChatStore.getState())).toBe(
      'half typed under the placeholder',
    );
    expect(selectDraftContent(PLACEHOLDER_ID)(useChatStore.getState())).toBe('');
  });

  it('re-parking the same fingerprint leaves the slot untouched', () => {
    useChatStore.getState().parkBlockedSend(FINGERPRINT, CONTENT);
    const first = selectParkedSends(useChatStore.getState());

    useChatStore.getState().parkBlockedSend(FINGERPRINT, CONTENT);

    expect(selectParkedSends(useChatStore.getState())).toBe(first);
  });

  it('clears exactly the fingerprint it is given and keeps the one queued behind it', () => {
    const store = useChatStore.getState();
    store.parkBlockedSend(FINGERPRINT, CONTENT);
    store.parkBlockedSend(OTHER_FINGERPRINT, 'A third thought');

    useChatStore.getState().clearParkedSend(FINGERPRINT);

    expect(firstParkedSend(selectParkedSends(useChatStore.getState()))).toEqual({
      fingerprint: OTHER_FINGERPRINT,
      content: 'A third thought',
    });
  });

  it('reports no parked send once the last one is released', () => {
    useChatStore.getState().parkBlockedSend(FINGERPRINT, CONTENT);
    useChatStore.getState().clearParkedSend(FINGERPRINT);

    expect(firstParkedSend(selectParkedSends(useChatStore.getState()))).toBeNull();
  });

  it('survives rehydrating a fresh store after a reload', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    useChatStore.getState().parkBlockedSend(FINGERPRINT, CONTENT);
    const partialize = useChatStore.persist.getOptions().partialize;
    const merge = useChatStore.persist.getOptions().merge;
    expect(partialize).toBeDefined();
    expect(merge).toBeDefined();

    const persisted = partialize!(useChatStore.getState());
    useChatStore.getState().reset();
    const rehydrated = merge!(persisted, useChatStore.getState());

    expect(firstParkedSend(selectParkedSends(rehydrated))).toEqual({
      fingerprint: FINGERPRINT,
      content: CONTENT,
    });
  });

  it('drops a persisted send after its retry window expires', () => {
    const merge = useChatStore.persist.getOptions().merge;
    expect(merge).toBeDefined();
    vi.spyOn(Date, 'now').mockReturnValue(100_000_000);

    const rehydrated = merge!(
      {
        parkedSendsByFingerprint: { [FINGERPRINT]: CONTENT },
        parkedSendCreatedAtByFingerprint: { [FINGERPRINT]: 1 },
      },
      useChatStore.getState(),
    );

    expect(firstParkedSend(selectParkedSends(rehydrated))).toBeNull();
  });

  it('bounds the persisted queue to the eight newest failed sends', () => {
    const partialize = useChatStore.persist.getOptions().partialize;
    expect(partialize).toBeDefined();
    vi.spyOn(Date, 'now').mockReturnValue(100);
    useChatStore.setState({
      parkedSendsByFingerprint: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [`fingerprint-${index + 1}`, `send-${index + 1}`]),
      ),
      parkedSendCreatedAtByFingerprint: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [`fingerprint-${index + 1}`, index + 1]),
      ),
    });

    const persisted = partialize!(useChatStore.getState()) as {
      parkedSendsByFingerprint: Record<string, string>;
    };

    expect(Object.keys(persisted.parkedSendsByFingerprint)).toEqual(
      Array.from({ length: 8 }, (_, index) => `fingerprint-${index + 5}`),
    );
  });
});
