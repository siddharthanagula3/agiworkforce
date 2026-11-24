import { createHash } from 'node:crypto';
import type * as vscode from 'vscode';

const TYPED_MESSAGES_KEY = 'agiWorkforce.typedMessages';
const MAX_THREADS = 50;
const MAX_MESSAGES_PER_THREAD = 300;
const MAX_TYPED_TEXT_LENGTH = 20_000;
const MAX_CONTEXT_ENTRIES = 64;
const MAX_CONTEXT_PREVIEW_LENGTH = 4_000;

export interface SentContext {
  label: string;
  kind: 'active-file' | 'selection' | 'problems' | 'reference' | 'attachment' | 'image' | 'web';
  text?: string;
  truncated?: boolean;
}

interface StoredContext extends Omit<SentContext, 'text'> {
  range?: { start: number; end: number };
}

interface TypedMessage {
  typed?: string;
  sent: string;
  context?: StoredContext[];
}

interface ThreadTypedMessages {
  touchedAt: number;
  messages: Record<string, TypedMessage>;
}

type TypedMessageStore = Record<string, ThreadTypedMessages>;
const inProgress = new WeakMap<vscode.Memento, Promise<void>>();

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

export function sentContextFor(
  memento: vscode.Memento,
  threadId: string,
  index: number,
  storedText: string,
): SentContext[] | undefined {
  const entry = readStore(memento)[threadId]?.messages[String(index)];
  if (!Array.isArray(entry?.context) || entry.sent !== fingerprint(storedText)) return undefined;
  return entry.context.map(({ range, ...context }) => ({
    ...context,
    ...(range === undefined ? {} : { text: storedText.slice(range.start, range.end) }),
  }));
}

export function previewSentContext(context: readonly SentContext[]): SentContext[] {
  return context.slice(0, MAX_CONTEXT_ENTRIES).map((entry) => ({
    ...entry,
    ...(entry.text !== undefined && entry.text.length > MAX_CONTEXT_PREVIEW_LENGTH
      ? { text: entry.text.slice(0, MAX_CONTEXT_PREVIEW_LENGTH), truncated: true }
      : {}),
  }));
}

function storeContext(context: readonly SentContext[], storedText: string): StoredContext[] {
  return context.slice(0, MAX_CONTEXT_ENTRIES).map(({ text, ...entry }) => {
    const start = text === undefined || text === '' ? -1 : storedText.lastIndexOf(text);
    if (start === -1 || text === undefined) return entry;
    return {
      ...entry,
      range: { start, end: start + Math.min(text.length, MAX_CONTEXT_PREVIEW_LENGTH) },
      ...(text.length > MAX_CONTEXT_PREVIEW_LENGTH ? { truncated: true } : {}),
    };
  });
}

export async function rememberTypedText(
  memento: vscode.Memento,
  threadId: string,
  index: number,
  storedText: string,
  typed: string,
  context: readonly SentContext[] = [],
): Promise<void> {
  if (typed.length > MAX_TYPED_TEXT_LENGTH || (typed === storedText && context.length === 0))
    return;
  const previous = inProgress.get(memento);
  const write = (previous ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const store = readStore(memento);
      const thread = store[threadId] ?? { touchedAt: 0, messages: {} };
      thread.messages[String(index)] = {
        ...(typed === storedText ? {} : { typed }),
        sent: fingerprint(storedText),
        ...(context.length === 0 ? {} : { context: storeContext(context, storedText) }),
      };
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
    });
  inProgress.set(memento, write);
  try {
    await write;
  } finally {
    if (inProgress.get(memento) === write) inProgress.delete(memento);
  }
}
