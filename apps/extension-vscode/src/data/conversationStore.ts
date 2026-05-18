/**
 * conversationStore.ts — Persistent conversation storage using VS Code globalState
 *
 * Conversations are stored as JSON in the extension's globalState,
 * persisting across VS Code sessions. Max 50 conversations (oldest pruned).
 */

import * as vscode from 'vscode';

export interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface StoredConversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'agiWorkforce.conversations';
const MAX_CONVERSATIONS = 50;

export class ConversationStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): StoredConversation[] {
    const raw = this.context.globalState.get<StoredConversation[]>(STORAGE_KEY) ?? [];
    return raw.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): StoredConversation | undefined {
    return this.context.globalState
      .get<StoredConversation[]>(STORAGE_KEY)
      ?.find((c) => c.id === id);
  }

  save(conversation: StoredConversation): void {
    const all = this.context.globalState.get<StoredConversation[]>(STORAGE_KEY) ?? [];
    const idx = all.findIndex((c) => c.id === conversation.id);
    if (idx >= 0) {
      all[idx] = conversation;
    } else {
      all.push(conversation);
    }

    // Prune oldest if over limit
    const pruned = all
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);

    void this.context.globalState.update(STORAGE_KEY, pruned);
  }

  delete(id: string): void {
    const all = this.context.globalState.get<StoredConversation[]>(STORAGE_KEY) ?? [];
    void this.context.globalState.update(
      STORAGE_KEY,
      all.filter((c) => c.id !== id),
    );
  }

  create(title: string, model: string): StoredConversation {
    const now = Date.now();
    const conversation: StoredConversation = {
      id: now.toString(36) + Math.random().toString(36).slice(2),
      title,
      messages: [],
      model,
      createdAt: now,
      updatedAt: now,
    };
    this.save(conversation);
    return conversation;
  }

  addMessage(id: string, message: StoredMessage): void {
    const conversation = this.get(id);
    if (conversation === undefined) return;

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    // Auto-title from first user message
    if (conversation.title === 'New Chat' && message.role === 'user') {
      conversation.title = message.content.slice(0, 60).replace(/\n/g, ' ');
    }

    this.save(conversation);
  }
}
