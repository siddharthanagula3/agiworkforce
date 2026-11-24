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

async function readShortcutStore(): Promise<SavedShortcut[]> {
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
  const result = mutationQueue.then(async () => operation(await readShortcutStore()));
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function isRecording(shortcut: SavedShortcut): boolean {
  return Array.isArray(shortcut.actions) && shortcut.actions.length > 0;
}

function visibleShortcuts(
  shortcuts: SavedShortcut[],
  accountId: string | null | undefined,
): SavedShortcut[] {
  return shortcuts.filter(
    (shortcut) =>
      !isRecording(shortcut) ||
      (accountId !== undefined && (shortcut.ownerAccountId ?? null) === accountId),
  );
}

export async function loadShortcuts(accountId?: string | null): Promise<SavedShortcut[]> {
  return visibleShortcuts(await readShortcutStore(), accountId);
}

/**
 * Recordings can carry what the user typed, so they belong to the account
 * that made them. One made while signed out goes to the first authenticated account.
 */
export function claimUnownedRecordings(signedInAccountId: string): Promise<void> {
  return mutateShortcuts(async (shortcuts) => {
    let changed = false;
    const owned = shortcuts.map((shortcut) => {
      if (!isRecording(shortcut) || shortcut.ownerAccountId != null) return shortcut;
      changed = true;
      return { ...shortcut, ownerAccountId: signedInAccountId };
    });
    if (changed) await saveShortcuts(owned);
  });
}

export async function handleSaveShortcut(
  message: SaveShortcutMessage,
  ownerAccountId?: string | null,
): Promise<ExtensionResponse> {
  return mutateShortcuts(async (shortcuts) => {
    const actions = Array.isArray(message.actions) ? message.actions : [];
    if (actions.length > 0 && ownerAccountId === undefined) {
      return {
        success: false,
        error: 'Could not confirm which account owns this recording. Try saving again.',
      } as ExtensionResponse;
    }
    if (visibleShortcuts(shortcuts, ownerAccountId).length >= MAX_SHORTCUTS) {
      return {
        success: false,
        error: `Maximum ${MAX_SHORTCUTS} shortcuts reached`,
      } as ExtensionResponse;
    }
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
    return {
      success: true,
      shortcuts: visibleShortcuts(shortcuts, ownerAccountId),
    } as ExtensionResponse;
  });
}

export async function handleUpdateShortcut(
  message: UpdateShortcutMessage,
  accountId?: string | null,
): Promise<ExtensionResponse> {
  return mutateShortcuts(async (shortcuts) => {
    const index = shortcuts.findIndex((shortcut) => shortcut.id === message.shortcutId);
    const current = shortcuts[index];
    if (!current || !visibleShortcuts([current], accountId).length) {
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
    return {
      success: true,
      shortcuts: visibleShortcuts(shortcuts, accountId),
    } as ExtensionResponse;
  });
}

export async function handleListShortcuts(accountId?: string | null): Promise<ExtensionResponse> {
  const shortcuts = await loadShortcuts(accountId);
  return { success: true, shortcuts } as ExtensionResponse;
}

export async function handleDeleteShortcut(
  message: DeleteShortcutMessage,
  accountId?: string | null,
): Promise<ExtensionResponse> {
  return mutateShortcuts(async (shortcuts) => {
    if (
      !visibleShortcuts(shortcuts, accountId).some((shortcut) => shortcut.id === message.shortcutId)
    ) {
      return { success: false, error: 'Shortcut not found' } as ExtensionResponse;
    }
    const remaining = shortcuts.filter((shortcut) => shortcut.id !== message.shortcutId);
    await saveShortcuts(remaining);
    return {
      success: true,
      shortcuts: visibleShortcuts(remaining, accountId),
    } as ExtensionResponse;
  });
}
