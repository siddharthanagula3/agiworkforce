/**
 * memoryStore.ts — Shared cross-conversation memory store for VS Code extension.
 *
 * Persists facts in `vscode.ExtensionContext.globalState` ONLY.
 * v1 LOCAL ONLY — no cloud sync. NOT written to consumer chat tables.
 *
 * Schema is intentionally minimal and backward-compatible:
 *   { id, text, createdAt, updatedAt? }
 * Entries written by the R6 QuickPick (pre-updatedAt) default updatedAt to createdAt.
 */

import * as vscode from 'vscode';

export const MEMORY_STORE_KEY = 'agiWorkforce.memoryFacts';

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

// Change notification so TreeDataProvider can react without polling.
const _onDidChange = new vscode.EventEmitter<void>();
export const onMemoryDidChange = _onDidChange.event;

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `mem_${globalThis.crypto.randomUUID()}`;
  }
  return `mem_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function isMemoryFact(v: unknown): v is MemoryFact {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['text'] === 'string' &&
    typeof obj['createdAt'] === 'string'
  );
}

export function loadFacts(globalState: vscode.ExtensionContext['globalState']): MemoryFact[] {
  const stored = globalState.get<unknown>(MEMORY_STORE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter(isMemoryFact).slice();
}

export async function saveFacts(
  globalState: vscode.ExtensionContext['globalState'],
  facts: MemoryFact[],
): Promise<void> {
  await globalState.update(MEMORY_STORE_KEY, facts);
  _onDidChange.fire();
}

export async function addFact(
  globalState: vscode.ExtensionContext['globalState'],
  text: string,
): Promise<MemoryFact> {
  const facts = loadFacts(globalState);
  const now = new Date().toISOString();
  const fact: MemoryFact = { id: generateId(), text: text.trim(), createdAt: now, updatedAt: now };
  facts.unshift(fact);
  await saveFacts(globalState, facts);
  return fact;
}

export async function updateFact(
  globalState: vscode.ExtensionContext['globalState'],
  id: string,
  newText: string,
): Promise<boolean> {
  const facts = loadFacts(globalState);
  const idx = facts.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  facts[idx] = { ...facts[idx]!, text: newText.trim(), updatedAt: new Date().toISOString() };
  await saveFacts(globalState, facts);
  return true;
}

export async function deleteFact(
  globalState: vscode.ExtensionContext['globalState'],
  id: string,
): Promise<boolean> {
  const facts = loadFacts(globalState);
  const before = facts.length;
  const next = facts.filter((f) => f.id !== id);
  if (next.length === before) return false;
  await saveFacts(globalState, next);
  return true;
}

export async function clearFacts(
  globalState: vscode.ExtensionContext['globalState'],
): Promise<void> {
  await saveFacts(globalState, []);
}
