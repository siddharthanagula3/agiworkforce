import type { SavedShortcut, ExtensionResponse } from '../../types';
import type { SaveShortcutMessage, DeleteShortcutMessage } from '../../types';
import {
  ORIGIN_EXTENSION_PAGE,
  generateRecordId,
  validateShortcutActions,
} from '../../background/policy';

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
  const actions = Array.isArray(message.actions) ? message.actions : [];
  if (!validateShortcutActions(actions)) {
    return {
      success: false,
      error: 'Shortcut contains an unsupported action type.',
    } as ExtensionResponse;
  }
  const shortcut: SavedShortcut = {
    id: generateRecordId('sc'),
    name: message.name.slice(0, 100),
    actions,
    createdAt: Date.now(),
    createdByOrigin: ORIGIN_EXTENSION_PAGE,
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
