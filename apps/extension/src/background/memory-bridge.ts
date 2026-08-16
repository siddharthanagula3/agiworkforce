
import type { Memory } from '@agiworkforce/types';

export type MemoryItem = Pick<Memory, 'id' | 'content' | 'createdAt'> & { updatedAt: string };

const MEMORY_STORAGE_KEY = 'agi_memories';
const MAX_MEMORY_ITEMS = 200;
const MAX_CONTENT_CHARS = 2000;

export async function memoryList(): Promise<MemoryItem[]> {
  try {
    const res = await chrome.storage.local.get(MEMORY_STORAGE_KEY);
    const raw = (res as Record<string, unknown>)[MEMORY_STORAGE_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.filter(isMemoryItem);
  } catch {
    return [];
  }
}

export async function memoryAdd(content: string): Promise<MemoryItem | null> {
  const trimmed = content.trim().slice(0, MAX_CONTENT_CHARS);
  if (!trimmed) return null;

  const existing = await memoryList();
  if (existing.length >= MAX_MEMORY_ITEMS) return null;

  const now = new Date().toISOString();
  const item: MemoryItem = {
    id: crypto.randomUUID(),
    content: trimmed,
    createdAt: now,
    updatedAt: now,
  };

  await chrome.storage.local.set({ [MEMORY_STORAGE_KEY]: [...existing, item] });
  return item;
}

export async function memoryUpdate(id: string, content: string): Promise<MemoryItem | null> {
  const trimmed = content.trim().slice(0, MAX_CONTENT_CHARS);
  if (!trimmed) return null;

  const existing = await memoryList();
  const idx = existing.findIndex((m) => m.id === id);
  if (idx === -1) return null;

  const updated: MemoryItem = {
    ...(existing[idx] as MemoryItem),
    content: trimmed,
    updatedAt: new Date().toISOString(),
  };

  const next = [...existing];
  next[idx] = updated;
  await chrome.storage.local.set({ [MEMORY_STORAGE_KEY]: next });
  return updated;
}

export async function memoryDelete(id: string): Promise<boolean> {
  const existing = await memoryList();
  const next = existing.filter((m) => m.id !== id);
  if (next.length === existing.length) return false;
  await chrome.storage.local.set({ [MEMORY_STORAGE_KEY]: next });
  return true;
}

export function isMemoryItem(v: unknown): v is MemoryItem {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['content'] === 'string' &&
    typeof o['createdAt'] === 'string' &&
    typeof o['updatedAt'] === 'string'
  );
}

export { MEMORY_STORAGE_KEY, MAX_MEMORY_ITEMS, MAX_CONTENT_CHARS };
