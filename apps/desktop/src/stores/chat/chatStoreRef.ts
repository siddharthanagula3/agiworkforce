interface ChatStoreStateReader {
  getState: () => { isStreaming?: boolean };
}

const chatStoreStateReaders = new Set<ChatStoreStateReader>();

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
