/**
 * Streaming readers consulted by the Local/Cloud mode-switch guard.
 *
 * `appModeStore.setMode` refuses a switch while a chat is streaming: the switch
 * disposes the active runtime and wipes the conversation boundary, so an
 * in-flight answer would be destroyed. Two independent stores can be streaming
 * and BOTH have to be visible here:
 *
 *   - the desktop execution store (`chatExecutionStore`) owns `isStreaming` for
 *     Local/BYOK turns. Registering `useChatMessageStore` instead made
 *     `getState().isStreaming` `undefined`, so the guard was permanently false.
 *   - `@agiworkforce/unified-chat`'s shared chat store owns `isStreaming` for
 *     every Managed Cloud turn; the desktop guard never consulted it at all.
 *
 * Readers register themselves (desktop execution store from `chatStore.ts`,
 * shared store from `App.tsx`) and the guard is the OR of all of them.
 */
interface ChatStoreStateReader {
  getState: () => { isStreaming?: boolean };
}

const chatStoreStateReaders = new Set<ChatStoreStateReader>();

/** Registers a streaming reader. Returns a disposer that unregisters it. */
export function registerChatStoreStateReader(reader: ChatStoreStateReader): () => void {
  chatStoreStateReaders.add(reader);
  return () => {
    chatStoreStateReaders.delete(reader);
  };
}

export function isChatStoreStreaming(): boolean {
  for (const reader of chatStoreStateReaders) {
    if (reader.getState().isStreaming === true) return true;
  }
  return false;
}
