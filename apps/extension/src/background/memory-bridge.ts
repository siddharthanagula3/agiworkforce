/**
 * memory-bridge.ts — Chrome MV3 memory store for the popup.
 *
 * Persistence: chrome.storage.local ONLY — device-scoped, never synced.
 * v1 LOCAL ONLY rule: no cloud sync, no writes to consumer chat tables.
 *
 * Schema: structural subtype of packages/contracts/types/src/memory.ts::Memory.
 * MemoryItem = Pick<Memory, 'id'|'content'|'createdAt'> & { updatedAt: string }
 * — uses the canonical field names and semantics from @agiworkforce/types.
 * — updatedAt is required (canonical Memory has it optional); enforced at write.
 * — Omits fields irrelevant to the local popup surface (embedding, userId, etc.).
 *
 * Storage key: `agi_memories` → MemoryItem[]
 * Max entries: 200 (guard against unbounded growth in local storage)
 */

import type { Memory } from '@agiworkforce/types';

/**
 * Device-scoped memory entry stored in chrome.storage.local.
 *
 * Structural subtype of the canonical Memory from @agiworkforce/types:
 *   Pick<Memory, 'id' | 'content' | 'createdAt'> & { updatedAt: string }
 *
 * updatedAt is required here (canonical Memory has it optional) because every
 * write path in this bridge sets it explicitly.
 */
export type MemoryItem = Pick<Memory, 'id' | 'content' | 'createdAt'> & { updatedAt: string };

const MEMORY_STORAGE_KEY = 'agi_memories';
const MAX_MEMORY_ITEMS = 200;
const MAX_CONTENT_CHARS = 2000;

/** Simple UUID v4 using crypto.randomUUID when available, falling back to Math.random. */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments where crypto.randomUUID is not available
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Read all memories from chrome.storage.local. Never throws. */
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

/** Persist a new memory entry. Returns the new item or null on failure. */
export async function memoryAdd(content: string): Promise<MemoryItem | null> {
  const trimmed = content.trim().slice(0, MAX_CONTENT_CHARS);
  if (!trimmed) return null;

  const existing = await memoryList();
  if (existing.length >= MAX_MEMORY_ITEMS) return null;

  const now = new Date().toISOString();
  const item: MemoryItem = {
    id: generateId(),
    content: trimmed,
    createdAt: now,
    updatedAt: now,
  };

  await chrome.storage.local.set({ [MEMORY_STORAGE_KEY]: [...existing, item] });
  return item;
}

/** Update an existing memory by id. Returns updated item or null if not found. */
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

/** Delete a memory by id. Returns true if deleted, false if not found. */
export async function memoryDelete(id: string): Promise<boolean> {
  const existing = await memoryList();
  const next = existing.filter((m) => m.id !== id);
  if (next.length === existing.length) return false;
  await chrome.storage.local.set({ [MEMORY_STORAGE_KEY]: next });
  return true;
}

/** Type guard for raw storage values. */
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
