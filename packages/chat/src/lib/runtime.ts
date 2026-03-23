import type { Conversation, ChatMessage, SendMessageParams, StreamChunk } from './types';

export interface FileRef {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface ChatRuntime {
  sendMessage(params: SendMessageParams): AsyncIterable<StreamChunk>;
  stopGeneration(conversationId: string): void;
  uploadFile(file: File): Promise<FileRef>;
  createConversation(title?: string, projectId?: string): Promise<Conversation>;
  loadConversations(): Promise<Conversation[]>;
  loadMessages(conversationId: string): Promise<ChatMessage[]>;
  deleteConversation(id: string): Promise<void>;
  archiveConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  getPlatform(): 'desktop' | 'web' | 'mobile';
}

export const ChatRuntimeContext = '__CHAT_RUNTIME__';
