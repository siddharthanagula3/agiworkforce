const HISTORY_KEY = 'agi_conversation_history';
const MAX_CONVERSATIONS = 100;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationEntry {
  id: string;
  title: string;
  messages: HistoryMessage[];
  savedAt: number;
}

function pruneExpired(entries: ConversationEntry[]): ConversationEntry[] {
  const cutoff = Date.now() - TTL_MS;
  return entries.filter((e) => e.savedAt >= cutoff);
}

function deriveTitle(messages: HistoryMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Conversation';
  const text = firstUser.content.trim().replace(/\s+/g, ' ');
  return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

async function readAll(): Promise<ConversationEntry[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(HISTORY_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      const raw = result[HISTORY_KEY];
      resolve(Array.isArray(raw) ? (raw as ConversationEntry[]) : []);
    });
  });
}

async function writeAll(entries: ConversationEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [HISTORY_KEY]: entries }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function saveConversation(messages: HistoryMessage[]): Promise<string> {
  if (messages.length === 0) return '';
  const all = await readAll();
  const pruned = pruneExpired(all);
  const entry: ConversationEntry = {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: deriveTitle(messages),
    messages,
    savedAt: Date.now(),
  };
  const updated = [entry, ...pruned].slice(0, MAX_CONVERSATIONS);
  await writeAll(updated);
  return entry.id;
}

export async function listConversations(): Promise<ConversationEntry[]> {
  const all = await readAll();
  return pruneExpired(all);
}

export async function getConversation(id: string): Promise<ConversationEntry | undefined> {
  const all = await readAll();
  return all.find((e) => e.id === id);
}

export async function deleteConversation(id: string): Promise<void> {
  const all = await readAll();
  const updated = all.filter((e) => e.id !== id);
  await writeAll(updated);
}
