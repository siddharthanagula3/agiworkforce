import { createHash } from 'node:crypto';
import type * as vscode from 'vscode';

const TYPED_MESSAGES_KEY = 'agiWorkforce.typedMessages';
const MAX_THREADS = 50;
const MAX_MESSAGES_PER_THREAD = 300;
const MAX_TYPED_TEXT_LENGTH = 20_000;

interface TypedMessage {
  typed: string;
  sent: string;
}

interface ThreadTypedMessages {
  touchedAt: number;
  messages: Record<string, TypedMessage>;
}

type TypedMessageStore = Record<string, ThreadTypedMessages>;

function fingerprint(text: string): string {
  return createHash('sha256').update(text).digest('base64url');
}

function readStore(memento: vscode.Memento): TypedMessageStore {
  const stored = memento.get<unknown>(TYPED_MESSAGES_KEY);
  return typeof stored === 'object' && stored !== null ? (stored as TypedMessageStore) : {};
}

export function typedTextFor(
  memento: vscode.Memento,
  threadId: string,
  index: number,
  storedText: string,
): string | undefined {
  const entry = readStore(memento)[threadId]?.messages[String(index)];
  if (entry === undefined || entry.sent !== fingerprint(storedText)) return undefined;
  return entry.typed;
}

export async function rememberTypedText(
  memento: vscode.Memento,
  threadId: string,
  index: number,
  storedText: string,
  typed: string,
): Promise<void> {
  if (typed.length > MAX_TYPED_TEXT_LENGTH || typed === storedText) return;
  const store = readStore(memento);
  const thread = store[threadId] ?? { touchedAt: 0, messages: {} };
  thread.messages[String(index)] = { typed, sent: fingerprint(storedText) };
  const indexes = Object.keys(thread.messages)
    .map(Number)
    .sort((a, b) => a - b);
  for (const stale of indexes.slice(0, Math.max(0, indexes.length - MAX_MESSAGES_PER_THREAD))) {
    delete thread.messages[String(stale)];
  }
  thread.touchedAt = Date.now();
  store[threadId] = thread;
  const threads = Object.entries(store).sort(([, a], [, b]) => b.touchedAt - a.touchedAt);
  await memento.update(TYPED_MESSAGES_KEY, Object.fromEntries(threads.slice(0, MAX_THREADS)));
}
