interface ChatStoreStateReader {
  getState: () => {
    isStreaming: boolean;
  };
}

let chatStoreStateReader: ChatStoreStateReader | null = null;

export function registerChatStoreStateReader(reader: ChatStoreStateReader): void {
  chatStoreStateReader = reader;
}

export function isChatStoreStreaming(): boolean {
  return chatStoreStateReader?.getState().isStreaming ?? false;
}
