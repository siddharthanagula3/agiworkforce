import { create } from 'zustand';

/**
 * "Mark as unread" from the chat row menu has no server column. It is stored
 * per-browser, the same tier as a collapsed sidebar section or a remembered
 * tab: durable enough to survive a reload, private to this device, never
 * claimed as synced state elsewhere.
 */
export const UNREAD_STORAGE_KEY = 'agi.sidebar.unreadConversationIds';

const NO_IDS: ReadonlySet<string> = new Set();

function readStoredIds(): ReadonlySet<string> {
  if (typeof window === 'undefined') return NO_IDS;
  try {
    const raw = window.localStorage.getItem(UNREAD_STORAGE_KEY);
    if (!raw) return NO_IDS;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : NO_IDS;
  } catch {
    return NO_IDS;
  }
}

function writeStoredIds(ids: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage can throw (quota, private mode); the toggle still works for
    // the rest of this session, it just will not survive a reload.
  }
}

interface UnreadConversationsState {
  ids: ReadonlySet<string>;
  toggle: (conversationId: string) => void;
  connect: () => () => void;
}

let connections = 0;

function syncFromOtherTab(event: StorageEvent): void {
  if (event.key !== null && event.key !== UNREAD_STORAGE_KEY) return;
  useUnreadConversationsStore.setState({ ids: readStoredIds() });
}

export const useUnreadConversationsStore = create<UnreadConversationsState>()((set, get) => ({
  ids: NO_IDS,

  toggle: (conversationId) => {
    const next = new Set(get().ids);
    if (next.has(conversationId)) next.delete(conversationId);
    else next.add(conversationId);
    writeStoredIds(next);
    set({ ids: next });
  },

  connect: () => {
    set({ ids: readStoredIds() });
    if (connections === 0) window.addEventListener('storage', syncFromOtherTab);
    connections += 1;
    return () => {
      connections -= 1;
      if (connections === 0) window.removeEventListener('storage', syncFromOtherTab);
    };
  },
}));
