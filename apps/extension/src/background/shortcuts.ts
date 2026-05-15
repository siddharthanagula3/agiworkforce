import type { SavedShortcut, ExtensionResponse } from '../types';
import type { SaveShortcutMessage, DeleteShortcutMessage } from '../types';

const SHORTCUTS_STORAGE_KEY = 'agi_saved_shortcuts';
const MAX_SHORTCUTS = 50;

export async function loadShortcuts(): Promise<SavedShortcut[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SHORTCUTS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve((result[SHORTCUTS_STORAGE_KEY] as SavedShortcut[] | undefined) ?? []);
    });
  });
}

export async function saveShortcuts(shortcuts: SavedShortcut[]): Promise<void> {
  await chrome.storage.local.set({ [SHORTCUTS_STORAGE_KEY]: shortcuts });
}

export async function handleSaveShortcut(message: SaveShortcutMessage): Promise<ExtensionResponse> {
  const shortcuts = await loadShortcuts();
  if (shortcuts.length >= MAX_SHORTCUTS) {
    return {
      success: false,
      error: `Maximum ${MAX_SHORTCUTS} shortcuts reached`,
    } as ExtensionResponse;
  }
  const shortcut: SavedShortcut = {
    id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: message.name.slice(0, 100),
    actions: message.actions,
    createdAt: Date.now(),
    url: message.url,
    prompt: message.prompt,
    startUrl: message.startUrl,
    scheduled: message.scheduled,
  };
  shortcuts.push(shortcut);
  await saveShortcuts(shortcuts);
  return { success: true, shortcuts } as ExtensionResponse;
}

export async function handleListShortcuts(): Promise<ExtensionResponse> {
  const shortcuts = await loadShortcuts();
  return { success: true, shortcuts } as ExtensionResponse;
}

export async function handleDeleteShortcut(
  message: DeleteShortcutMessage,
): Promise<ExtensionResponse> {
  let shortcuts = await loadShortcuts();
  shortcuts = shortcuts.filter((s) => s.id !== message.shortcutId);
  await saveShortcuts(shortcuts);
  return { success: true, shortcuts } as ExtensionResponse;
}
