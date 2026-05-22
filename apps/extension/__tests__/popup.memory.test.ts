/**
 * Tests for the memory editor section in popup.ts.
 *
 * Covers:
 *   - renderMemoryList() renders items with content + timestamp
 *   - renderMemoryList() shows empty state when list is empty
 *   - renderMemoryList() hides empty state when list has items
 *   - Delete button: first click enters confirm state, second executes delete
 *   - Delete confirm button reverts after 3 s without second click
 *   - initMemoryUI() wires ADD_MEMORY message via background on save
 *   - initMemoryUI() shows/hides editor on add/cancel
 *   - initMemoryUI() re-renders on chrome.storage.onChanged for agi_memories key
 *   - refreshMemoryUI() calls LIST_MEMORIES and re-renders
 *
 * Architecture: DOM fixture built before import, chrome mocked via vi.hoisted().
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Chrome API stubs ─────────────────────────────────────────────────────────

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;
type MessageListener = (message: unknown) => void;

const chromeMock = vi.hoisted(() => {
  const msgListeners: MessageListener[] = [];
  const storageListeners: StorageChangeListener[] = [];

  const mock = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ success: true, memories: [] }),
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
      onMessage: {
        addListener: vi.fn((cb: MessageListener) => msgListeners.push(cb)),
        _listeners: msgListeners,
      },
      lastError: undefined as string | undefined,
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com/', title: 'Ex' }]),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn((cb: StorageChangeListener) => storageListeners.push(cb)),
        _listeners: storageListeners,
      },
    },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ─── Mock storageUtils ───────────────────────────────────────────────────────

vi.mock('../src/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  storageUtils: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── DOM fixture ─────────────────────────────────────────────────────────────

function buildMemoryDom(): void {
  document.body.innerHTML = `
    <!-- Core popup elements (required by initializePopup) -->
    <div id="statusCard"><span id="statusTitle">--</span><button id="reconnectBtn">↺</button></div>
    <button id="captureBtn">Capture</button>
    <button id="refreshBtn">Refresh</button>
    <button id="sidePanelBtn">Side Panel</button>
    <button id="groupBtn">Group</button>
    <span id="extVersion"></span>
    <span id="tabId"></span>
    <span id="currentUrl"></span>
    <span id="tabCount"></span>
    <span id="actionCount"></span>
    <span id="sessionTime"></span>
    <!-- Memory section elements -->
    <button id="memoryAddBtn">Add memory</button>
    <button id="memoryAddFirstBtn">Add your first memory</button>
    <div id="memoryEditor" hidden>
      <textarea id="memoryTextarea" rows="3" maxlength="2000"></textarea>
      <div class="memory-editor-actions">
        <button id="memorySaveBtn">Save</button>
        <button id="memoryCancelBtn">Cancel</button>
      </div>
    </div>
    <ul id="memoryList"></ul>
    <div id="memoryEmpty" hidden>
      <p class="memory-empty-text">No saved memories yet.</p>
      <button id="memoryAddFirstBtn2">Add your first memory</button>
      <p class="memory-empty-hint">Memories let AGI remember facts, preferences, and patterns.</p>
    </div>
  `;
}

buildMemoryDom();

// ─── Import after DOM + mocks ─────────────────────────────────────────────────

import {
  renderMemoryList,
  refreshMemoryUI,
  initMemoryUI,
  MEMORY_STORAGE_KEY,
} from '../src/popup.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<{ id: string; content: string; createdAt: string; updatedAt: string }> = {},
) {
  return {
    id: overrides.id ?? 'test-id-1',
    content: overrides.content ?? 'Test memory fact',
    createdAt: overrides.createdAt ?? new Date(Date.now() - 60_000).toISOString(),
    updatedAt: overrides.updatedAt ?? new Date(Date.now() - 30_000).toISOString(),
  };
}

/** Wait for microtasks and short async steps. */
function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Wait for initializePopup() to settle
  await new Promise<void>((r) => setTimeout(r, 50));
});

beforeEach(() => {
  buildMemoryDom();
  vi.clearAllMocks();
  chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, memories: [] });
  chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/', title: 'Ex' }]);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ═══════════════════════════════════════════════════════════════════════════════
// renderMemoryList — empty state
// ═══════════════════════════════════════════════════════════════════════════════

describe('renderMemoryList — empty state', () => {
  it('shows the empty div when list is empty', () => {
    renderMemoryList([]);
    const empty = document.getElementById('memoryEmpty');
    expect(empty?.hidden).toBe(false);
  });

  it('has no list items when list is empty', () => {
    renderMemoryList([]);
    const ul = document.getElementById('memoryList');
    expect(ul?.children.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// renderMemoryList — with items
// ═══════════════════════════════════════════════════════════════════════════════

describe('renderMemoryList — with items', () => {
  it('hides empty div when list has items', () => {
    renderMemoryList([makeItem()]);
    const empty = document.getElementById('memoryEmpty');
    expect(empty?.hidden).toBe(true);
  });

  it('renders one list item per memory', () => {
    renderMemoryList([makeItem({ id: 'a' }), makeItem({ id: 'b' })]);
    const ul = document.getElementById('memoryList');
    expect(ul?.children.length).toBe(2);
  });

  it('renders memory content as text (no innerHTML injection)', () => {
    const evil = '<script>alert(1)</script>';
    renderMemoryList([makeItem({ content: evil })]);
    const ul = document.getElementById('memoryList');
    // textContent should contain the literal string
    expect(ul?.textContent).toContain('<script>');
    // But innerHTML should be escaped — no raw <script> tag
    const scripts = ul?.querySelectorAll('script');
    expect(scripts?.length).toBe(0);
  });

  it('each item has data-id attribute matching the memory id', () => {
    renderMemoryList([makeItem({ id: 'test-uuid-123' })]);
    const li = document.querySelector('[data-id="test-uuid-123"]');
    expect(li).not.toBeNull();
  });

  it('clears previous items before rendering new list', () => {
    renderMemoryList([makeItem({ id: 'first' })]);
    renderMemoryList([makeItem({ id: 'second' }), makeItem({ id: 'third' })]);
    const ul = document.getElementById('memoryList');
    expect(ul?.children.length).toBe(2);
    expect(ul?.querySelector('[data-id="first"]')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Delete confirm UX
// ═══════════════════════════════════════════════════════════════════════════════

describe('delete button confirm flow', () => {
  it('adds is-confirm class on first click', () => {
    renderMemoryList([makeItem()]);
    const deleteBtn = document.querySelector('.memory-item-delete-btn') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();
    expect(deleteBtn!.classList.contains('is-confirm')).toBe(true);
  });

  it('changes delete button text to "Confirm delete" on first click', () => {
    renderMemoryList([makeItem()]);
    const deleteBtn = document.querySelector('.memory-item-delete-btn') as HTMLButtonElement | null;
    deleteBtn!.click();
    expect(deleteBtn!.textContent).toBe('Confirm delete');
  });

  it('sends DELETE_MEMORY on second click', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
    renderMemoryList([makeItem({ id: 'del-id' })]);
    const deleteBtn = document.querySelector('.memory-item-delete-btn') as HTMLButtonElement | null;
    deleteBtn!.click(); // first — confirm
    deleteBtn!.click(); // second — execute
    await flushAsync();
    const calls = chromeMock.runtime.sendMessage.mock.calls;
    const deleteCall = calls.find(
      ([msg]) => (msg as Record<string, unknown>)['type'] === 'DELETE_MEMORY',
    );
    expect(deleteCall).toBeDefined();
    expect((deleteCall![0] as Record<string, unknown>)['id']).toBe('del-id');
  });

  it('reverts confirm state after timeout without second click', async () => {
    vi.useFakeTimers();
    renderMemoryList([makeItem()]);
    const deleteBtn = document.querySelector('.memory-item-delete-btn') as HTMLButtonElement | null;
    deleteBtn!.click();
    expect(deleteBtn!.classList.contains('is-confirm')).toBe(true);
    vi.advanceTimersByTime(3100);
    expect(deleteBtn!.classList.contains('is-confirm')).toBe(false);
    expect(deleteBtn!.textContent).toBe('Delete');
    vi.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// initMemoryUI — editor show/hide
// ═══════════════════════════════════════════════════════════════════════════════

describe('initMemoryUI — editor show/hide', () => {
  it('shows the editor when Add memory button is clicked', async () => {
    await initMemoryUI();
    const addBtn = document.getElementById('memoryAddBtn') as HTMLButtonElement | null;
    const editor = document.getElementById('memoryEditor');
    addBtn?.click();
    expect(editor?.hidden).toBe(false);
  });

  it('hides the editor when Cancel button is clicked', async () => {
    await initMemoryUI();
    const addBtn = document.getElementById('memoryAddBtn') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('memoryCancelBtn') as HTMLButtonElement | null;
    const editor = document.getElementById('memoryEditor');
    addBtn?.click();
    expect(editor?.hidden).toBe(false);
    cancelBtn?.click();
    expect(editor?.hidden).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// initMemoryUI — save sends ADD_MEMORY
// ═══════════════════════════════════════════════════════════════════════════════

describe('initMemoryUI — save sends ADD_MEMORY', () => {
  it('sends ADD_MEMORY with the textarea content', async () => {
    chromeMock.runtime.sendMessage.mockImplementation(
      (msg: unknown): Promise<Record<string, unknown>> => {
        const m = msg as Record<string, unknown>;
        if (m['type'] === 'ADD_MEMORY') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, memories: [] });
      },
    );

    await initMemoryUI();

    const textarea = document.getElementById('memoryTextarea') as HTMLTextAreaElement | null;
    const saveBtn = document.getElementById('memorySaveBtn') as HTMLButtonElement | null;

    if (textarea) textarea.value = 'User prefers dark mode';
    saveBtn?.click();
    await flushAsync();

    const calls = chromeMock.runtime.sendMessage.mock.calls;
    const addCall = calls.find(
      ([msg]) => (msg as Record<string, unknown>)['type'] === 'ADD_MEMORY',
    );
    expect(addCall).toBeDefined();
    expect((addCall![0] as Record<string, unknown>)['content']).toBe('User prefers dark mode');
  });

  it('does not send ADD_MEMORY when textarea is empty', async () => {
    await initMemoryUI();

    const saveBtn = document.getElementById('memorySaveBtn') as HTMLButtonElement | null;
    saveBtn?.click();
    await flushAsync();

    const calls = chromeMock.runtime.sendMessage.mock.calls;
    const addCall = calls.find(
      ([msg]) => (msg as Record<string, unknown>)['type'] === 'ADD_MEMORY',
    );
    expect(addCall).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// refreshMemoryUI — calls LIST_MEMORIES
// ═══════════════════════════════════════════════════════════════════════════════

describe('refreshMemoryUI', () => {
  it('sends LIST_MEMORIES to background', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, memories: [] });
    await refreshMemoryUI();
    const calls = chromeMock.runtime.sendMessage.mock.calls;
    const listCall = calls.find(
      ([msg]) => (msg as Record<string, unknown>)['type'] === 'LIST_MEMORIES',
    );
    expect(listCall).toBeDefined();
  });

  it('renders items returned from background', async () => {
    const items = [
      makeItem({ id: 'r1', content: 'Fact A' }),
      makeItem({ id: 'r2', content: 'Fact B' }),
    ];
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, memories: items });
    await refreshMemoryUI();
    const ul = document.getElementById('memoryList');
    expect(ul?.children.length).toBe(2);
  });

  it('handles non-array memories gracefully', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: false });
    await expect(refreshMemoryUI()).resolves.toBeUndefined();
    const ul = document.getElementById('memoryList');
    expect(ul?.children.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// storage.onChanged — memory key triggers re-render
// ═══════════════════════════════════════════════════════════════════════════════

describe('storage.onChanged — memory key', () => {
  it('re-renders list when agi_memories changes in local storage', async () => {
    const items = [makeItem({ id: 'storage-change-id', content: 'New fact from storage' })];
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, memories: items });

    await initMemoryUI();

    for (const listener of chromeMock.storage.onChanged._listeners as StorageChangeListener[]) {
      listener({ [MEMORY_STORAGE_KEY]: { newValue: items, oldValue: [] } }, 'local');
    }

    await flushAsync();

    const calls = chromeMock.runtime.sendMessage.mock.calls;
    const listCall = calls.find(
      ([msg]) => (msg as Record<string, unknown>)['type'] === 'LIST_MEMORIES',
    );
    expect(listCall).toBeDefined();
  });

  it('does not re-render when a different storage key changes', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, memories: [] });

    await initMemoryUI();
    vi.clearAllMocks();
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, memories: [] });

    for (const listener of chromeMock.storage.onChanged._listeners as StorageChangeListener[]) {
      listener({ some_other_key: { newValue: true, oldValue: false } }, 'local');
    }

    await flushAsync();

    const calls = chromeMock.runtime.sendMessage.mock.calls;
    const listCall = calls.find(
      ([msg]) => (msg as Record<string, unknown>)['type'] === 'LIST_MEMORIES',
    );
    expect(listCall).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY_STORAGE_KEY constant
// ═══════════════════════════════════════════════════════════════════════════════

describe('MEMORY_STORAGE_KEY', () => {
  it('is the string "agi_memories"', () => {
    expect(MEMORY_STORAGE_KEY).toBe('agi_memories');
  });
});
