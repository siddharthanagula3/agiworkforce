import type { SavedShortcut, ExtensionResponse } from '../../types';
import type {
  SaveShortcutMessage,
  DeleteShortcutMessage,
  UpdateShortcutMessage,
} from '../../types';
import {
  ORIGIN_EXTENSION_PAGE,
  generateRecordId,
  validateShortcutActions,
} from '../../background/policy';
import { normalizeShortcutStartUrl } from '../shortcuts/origin';

export const SHORTCUTS_STORAGE_KEY = 'agi_saved_shortcuts';
const MAX_SHORTCUTS = 50;
let mutationQueue: Promise<void> = Promise.resolve();

export function planShortcutReplay(
  shortcut: Pick<SavedShortcut, 'actions' | 'prompt'>,
): { kind: 'actions' } | { kind: 'prompt'; prompt: string } | { kind: 'empty' } {
  if (Array.isArray(shortcut.actions) && shortcut.actions.length > 0) {
    return { kind: 'actions' };
  }
  const prompt = shortcut.prompt?.trim();
  if (prompt) {
    return { kind: 'prompt', prompt };
  }
  return { kind: 'empty' };
}

export async function loadShortcuts(): Promise<SavedShortcut[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(SHORTCUTS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(`Shortcut storage could not be read: ${chrome.runtime.lastError.message}`),
        );
        return;
      }
      resolve((result[SHORTCUTS_STORAGE_KEY] as SavedShortcut[] | undefined) ?? []);
    });
  });
}

async function saveShortcuts(shortcuts: SavedShortcut[]): Promise<void> {
  await chrome.storage.local.set({ [SHORTCUTS_STORAGE_KEY]: shortcuts });
}

function mutateShortcuts<T>(operation: (shortcuts: SavedShortcut[]) => Promise<T>): Promise<T> {
  const result = mutationQueue.then(async () => operation(await loadShortcuts()));
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function isRecording(shortcut: SavedShortcut): boolean {
  return Array.isArray(shortcut.actions) && shortcut.actions.length > 0;
}

/**
 * Recordings can carry what the user typed, so they belong to the account
 * that made them. One made while signed out goes to the first account seen;
 * every other recording is removed on a sign-out or a switch of account.
 */
export function releaseRecordingsOfOtherAccounts(signedInAccountId: string | null): Promise<void> {
  return mutateShortcuts(async (shortcuts) => {
    let changed = false;
    const kept: SavedShortcut[] = [];
    for (const shortcut of shortcuts) {
      const owner = shortcut.ownerAccountId ?? null;
      if (!isRecording(shortcut) || owner === signedInAccountId) {
        kept.push(shortcut);
      } else if (owner === null) {
        kept.push({ ...shortcut, ownerAccountId: signedInAccountId });
        changed = true;
      } else {
        changed = true;
      }
    }
    if (changed) await saveShortcuts(kept);
  });
}

export async function handleSaveShortcut(
  message: SaveShortcutMessage,
  ownerAccountId: string | null = null,
): Promise<ExtensionResponse> {
  return mutateShortcuts(async (shortcuts) => {
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
    const startUrl = normalizeShortcutStartUrl(message.startUrl);
    if (actions.length > 0 && !startUrl) {
      return {
        success: false,
        error: 'Recorded shortcuts must be bound to the web site where recording started.',
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
      ...(startUrl ? { startUrl } : {}),
      scheduled: message.scheduled,
      ...(actions.length > 0 ? { ownerAccountId } : {}),
    };
    shortcuts.push(shortcut);
    await saveShortcuts(shortcuts);
    return { success: true, shortcuts } as ExtensionResponse;
  });
}

export async function handleUpdateShortcut(
  message: UpdateShortcutMessage,
): Promise<ExtensionResponse> {
  return mutateShortcuts(async (shortcuts) => {
    const index = shortcuts.findIndex((shortcut) => shortcut.id === message.shortcutId);
    const current = shortcuts[index];
    if (!current) {
      return { success: false, error: 'Shortcut not found' } as ExtensionResponse;
    }
    if (planShortcutReplay(current).kind !== 'prompt') {
      return {
        success: false,
        error: 'Recorded workflows cannot be edited. Record the workflow again instead.',
      } as ExtensionResponse;
    }
    const name = typeof message.name === 'string' ? message.name.trim().slice(0, 100) : '';
    const prompt = typeof message.prompt === 'string' ? message.prompt.trim() : '';
    if (!name || !prompt) {
      return {
        success: false,
        error: 'A shortcut needs a name and a prompt.',
      } as ExtensionResponse;
    }
    shortcuts[index] = { ...current, name, prompt };
    await saveShortcuts(shortcuts);
    return { success: true, shortcuts } as ExtensionResponse;
  });
}

export async function handleListShortcuts(): Promise<ExtensionResponse> {
  const shortcuts = await loadShortcuts();
  return { success: true, shortcuts } as ExtensionResponse;
}

export async function handleDeleteShortcut(
  message: DeleteShortcutMessage,
): Promise<ExtensionResponse> {
  return mutateShortcuts(async (shortcuts) => {
    const remaining = shortcuts.filter((shortcut) => shortcut.id !== message.shortcutId);
    await saveShortcuts(remaining);
    return { success: true, shortcuts: remaining } as ExtensionResponse;
  });
}
