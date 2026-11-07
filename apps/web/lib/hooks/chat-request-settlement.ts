import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';

export interface ChatRequestSettlement {
  readonly controller: AbortController;
  readonly conversationId: string;
  isCurrent: () => boolean;
  assertCurrent: () => void;
  claimMessageWrite: (messageId: string) => () => void;
  track: <T>(work: Promise<T>) => Promise<T>;
  onRelease: (release: () => void) => void;
  finish: () => void;
  move: (conversationId: string) => void;
}

export interface ChatRequestSettlements {
  begin: (conversationId: string, messageId: string) => ChatRequestSettlement;
  observe: (conversationId: string) => { isCurrent: () => boolean; release: () => void };
  dispose: () => void;
}

export function createChatRequestSettlements(
  controllers: Map<string, AbortController>,
  onBegin?: (conversationId: string) => void,
): ChatRequestSettlements {
  const latest = new Map<string, ChatRequestSettlement>();
  const writers = new Map<string, ChatRequestSettlement>();
  const observers = new Map<string, Set<() => void>>();
  const invalidateObservers = (conversationId: string) => {
    for (const invalidate of observers.get(conversationId) ?? []) invalidate();
    observers.delete(conversationId);
  };
  return {
    begin: (initialConversationId, messageId) => {
      invalidateObservers(initialConversationId);
      onBegin?.(initialConversationId);
      controllers.get(initialConversationId)?.abort();
      const controller = new AbortController();
      controllers.set(initialConversationId, controller);
      let conversationId = initialConversationId;
      const ownedMessageIds = new Set([messageId]);
      const messageKey = (id: string) => JSON.stringify([conversationId, id]);
      let mainFinished = false;
      let pending = 0;
      let released = false;
      const releases = new Set<() => void>();
      const release = () => {
        if (released || !mainFinished || pending > 0) return;
        released = true;
        if (latest.get(conversationId) === request) latest.delete(conversationId);
        for (const id of ownedMessageIds) {
          if (writers.get(messageKey(id)) === request) writers.delete(messageKey(id));
        }
        for (const callback of releases) callback();
        releases.clear();
      };
      const request: ChatRequestSettlement = {
        controller,
        get conversationId() {
          return conversationId;
        },
        isCurrent: () => !released && latest.get(conversationId) === request,
        assertCurrent: () => {
          if (!request.isCurrent())
            throw new DOMException('Chat request was replaced', 'AbortError');
        },
        claimMessageWrite: (id) => {
          if (!ownedMessageIds.has(id)) {
            request.assertCurrent();
            ownedMessageIds.add(id);
            writers.set(messageKey(id), request);
          }
          return () => {
            if (released || writers.get(messageKey(id)) !== request) {
              throw new DOMException('Chat message generation was replaced', 'AbortError');
            }
          };
        },
        track: (work) => {
          pending += 1;
          return work.finally(() => {
            pending -= 1;
            release();
          });
        },
        onRelease: (callback) => {
          if (released) callback();
          else releases.add(callback);
        },
        finish: () => {
          if (controllers.get(conversationId) === controller) controllers.delete(conversationId);
          mainFinished = true;
          release();
        },
        move: (nextConversationId) => {
          request.assertCurrent();
          invalidateObservers(conversationId);
          invalidateObservers(nextConversationId);
          latest.delete(conversationId);
          for (const id of ownedMessageIds) {
            if (writers.get(messageKey(id)) === request) writers.delete(messageKey(id));
          }
          if (controllers.get(conversationId) === controller) controllers.delete(conversationId);
          controllers.get(nextConversationId)?.abort();
          conversationId = nextConversationId;
          latest.set(conversationId, request);
          for (const id of ownedMessageIds) writers.set(messageKey(id), request);
          controllers.set(conversationId, controller);
        },
      };
      latest.set(conversationId, request);
      writers.set(messageKey(messageId), request);
      return request;
    },
    observe: (conversationId) => {
      let current = true;
      const invalidate = () => {
        current = false;
      };
      const entries = observers.get(conversationId) ?? new Set<() => void>();
      entries.add(invalidate);
      observers.set(conversationId, entries);
      return {
        isCurrent: () => current,
        release: () => {
          invalidate();
          entries.delete(invalidate);
          if (observers.get(conversationId) === entries && entries.size === 0) {
            observers.delete(conversationId);
          }
        },
      };
    },
    dispose: () => {
      for (const request of latest.values()) request.controller.abort();
      latest.clear();
      writers.clear();
      for (const conversationId of observers.keys()) invalidateObservers(conversationId);
    },
  };
}

export type ChatRequestAuthToken = (() => Promise<string>) & {
  authority?: RequestAuthority;
  settlement?: ChatRequestSettlement;
  requests?: ChatRequestSettlements;
  accountToken?: ChatRequestAuthToken;
  dispatchFetch?: typeof fetch;
};

export function createChatRequestToken(
  source: ChatRequestAuthToken,
  settlement: ChatRequestSettlement,
  requests: ChatRequestSettlements,
): ChatRequestAuthToken {
  const accountToken = source.accountToken ?? source;
  const parent = accountToken.authority;
  const dispatchAuthority = parent
    ? createRequestAuthority(parent.session, parent.isCurrent, settlement.assertCurrent)
    : undefined;
  if (parent && dispatchAuthority) {
    parent.signal.addEventListener('abort', dispatchAuthority.retire, { once: true });
    settlement.onRelease(() => {
      parent.signal.removeEventListener('abort', dispatchAuthority.retire);
      dispatchAuthority.retire();
    });
  }
  const dispatchFetch: typeof fetch = async (input, init) => {
    settlement.assertCurrent();
    return (dispatchAuthority?.fetch ?? parent?.fetch ?? fetch)(input, init);
  };
  return Object.assign(
    async () => {
      settlement.assertCurrent();
      const token = await accountToken();
      settlement.assertCurrent();
      return token;
    },
    {
      authority: parent,
      settlement,
      requests,
      accountToken,
      dispatchFetch,
    },
  );
}
