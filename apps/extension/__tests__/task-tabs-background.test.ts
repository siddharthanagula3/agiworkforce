import { parseTaskTabScope } from '../src/features/browser-tools/taskTabScope';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskTabs } from '../src/features/browser-tools/taskTabs';

const tabs = vi.hoisted(() => new Map<number, chrome.tabs.Tab>());
const updated = vi.hoisted(() => vi.fn());
const documents = vi.hoisted(() => new Map<number, string>());

vi.mock('../src/features/browser-tools/tabAuthority', () => ({
  authorizeBrowserToolUrl: vi.fn(async (url: string) => ({
    origin: new URL(url).origin,
    url,
  })),
  authorizeBrowserToolTab: vi.fn(async (tabId: number) => {
    const tab = tabs.get(tabId);
    if (!tab?.url) throw new Error('Tab not found.');
    return { tabId, origin: new URL(tab.url).origin, url: tab.url };
  }),
}));

function tab(id: number, url: string, active: boolean): chrome.tabs.Tab {
  return {
    id,
    url,
    windowId: 7,
    active,
    index: id,
    highlighted: active,
    pinned: false,
    incognito: false,
  };
}

function taskTabs(
  restoredTabs?: readonly {
    tabId: number;
    windowId: number;
    url: string;
    documentId: string;
    closeable: boolean;
  }[],
  initialTabId = 1,
) {
  let current = initialTabId;
  const pending = new Map<symbol, number>();
  return new TaskTabs({
    initialTabId,
    restoredTabs,
    windowId: 7,
    currentTabId: () => current,
    assertCurrent: async () => undefined,
    beginTransition: (tabId) => {
      const token = Symbol('transition');
      pending.set(token, tabId);
      return token;
    },
    commitTransition: (token) => {
      current = pending.get(token)!;
      pending.delete(token);
    },
    abortTransition: (token) => {
      pending.delete(token);
    },
    transitionFailed: () => undefined,
  });
}

describe('task tabs activate only after their approved destination is verified', () => {
  beforeEach(() => {
    tabs.clear();
    documents.clear();
    documents.set(1, 'document-1');
    updated.mockReset();
    updated.mockImplementation(async (id: number, update: chrome.tabs.UpdateProperties) => {
      const target = tabs.get(id);
      if (!target) throw new Error('missing');
      if (update.active) for (const existing of tabs.values()) existing.active = existing.id === id;
      return target;
    });
    tabs.set(1, tab(1, 'http://127.0.0.1:8765/act.html', true));
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript: vi.fn(async ({ target }: { target: { tabId: number } }) => [
          { documentId: documents.get(target.tabId), result: tabs.get(target.tabId)?.url },
        ]),
      },
      tabs: {
        get: vi.fn(async (id: number) => {
          const found = tabs.get(id);
          if (!found) throw new Error('missing');
          return found;
        }),
        create: vi.fn(async (create: chrome.tabs.CreateProperties) => {
          const created = tab(2, create.url ?? 'about:blank', false);
          tabs.set(2, created);
          documents.set(2, 'document-2');
          return created;
        }),
        update: updated,
        remove: vi.fn(async (id: number) => {
          tabs.delete(id);
        }),
      },
    });
  });

  it('restores task-created close authority without granting it to the original tab', async () => {
    const first = taskTabs();
    await first.execute(
      await first.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' }),
    );
    const scope = await first.snapshot();
    expect(scope).toEqual([
      { tabId: 1, windowId: 7, url: tabs.get(1)!.url, documentId: 'document-1', closeable: false },
      { tabId: 2, windowId: 7, url: tabs.get(2)!.url, documentId: 'document-2', closeable: true },
    ]);
    const restored = taskTabs(scope, 2);
    await expect(restored.prepare('close_tab', { tabId: 1 })).rejects.toThrow('Only tabs created');
    await restored.execute(await restored.prepare('close_tab', { tabId: 2, returnToTabId: 1 }));
    expect(tabs.has(2)).toBe(false);
    expect(tabs.get(1)?.active).toBe(true);
  });

  it('refuses a restored tab whose document reloaded without changing URL', async () => {
    const first = taskTabs();
    await first.execute(
      await first.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' }),
    );
    const scope = await first.snapshot();
    documents.set(2, 'reloaded-document');
    const restored = taskTabs(scope, 2);
    await expect(restored.prepare('close_tab', { tabId: 2, returnToTabId: 1 })).rejects.toThrow(
      'page changed',
    );
    expect(tabs.has(2)).toBe(true);
  });

  it('does not close a document replaced after the close approval plan', async () => {
    const tasks = taskTabs();
    await tasks.execute(
      await tasks.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' }),
    );
    const plan = await tasks.prepare('close_tab', { tabId: 2, returnToTabId: 1 });
    documents.set(2, 'reloaded-after-plan');
    await expect(tasks.execute(plan)).rejects.toThrow('document');
    expect(tabs.has(2)).toBe(true);
  });

  it('does not open a new tab after its source document changed during approval', async () => {
    const tasks = taskTabs();
    const plan = await tasks.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' });
    documents.set(1, 'reloaded-after-plan');
    await expect(tasks.execute(plan)).rejects.toThrow('document');
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it.each([
    { scope: [] },
    {
      scope: [
        {
          tabId: 1,
          windowId: 7,
          url: 'https://example.test',
          documentId: 'document-1',
          closeable: false,
        },
        {
          tabId: 1,
          windowId: 7,
          url: 'https://example.test',
          documentId: 'document-1',
          closeable: true,
        },
      ],
    },
    { scope: [{ tabId: 1, windowId: 7, url: 'https://example.test', closeable: false }] },
    {
      scope: [
        {
          tabId: 1,
          windowId: 7,
          url: 'javascript:alert(1)',
          documentId: 'document-1',
          closeable: false,
        },
      ],
    },
  ])('rejects malformed task-tab snapshots %#', ({ scope }) => {
    expect(() => parseTaskTabScope(scope)).toThrow();
  });

  it('refuses a task snapshot that omits the exact current document', () => {
    const scope = [
      {
        tabId: 1,
        windowId: 7,
        url: 'https://example.test',
        documentId: 'document-1',
        closeable: false,
      },
    ];
    expect(() =>
      parseTaskTabScope(scope, { ...scope[0]!, documentId: 'reloaded-document' }),
    ).toThrow('does not belong');
  });

  it('waits for the approved new document to finish loading before activation', async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    vi.mocked(chrome.tabs.create).mockImplementationOnce(async (create) => {
      const created = { ...tab(2, create.url!, false), status: 'loading' as chrome.tabs.TabStatus };
      tabs.set(2, created);
      documents.set(2, 'document-2');
      timer = setTimeout(() => {
        created.status = 'complete';
      }, 10);
      return created;
    });
    try {
      const tasks = taskTabs();
      await expect(
        tasks.execute(
          await tasks.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' }),
        ),
      ).resolves.toMatchObject({ tabId: 2 });
      expect(tabs.get(2)?.status).toBe('complete');
      expect(updated).toHaveBeenCalledExactlyOnceWith(2, { active: true });
    } finally {
      clearTimeout(timer);
    }
  });

  it('creates the new tab in the background, then switches the task to it', async () => {
    const tasks = taskTabs();
    const plan = await tasks.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' });
    const receipt = await tasks.execute(plan);

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:8765/opened.html',
      windowId: 7,
      active: false,
    });
    expect(updated).toHaveBeenCalledExactlyOnceWith(2, { active: true });
    expect(receipt.tabId).toBe(2);
    expect(tabs.get(1)?.active).toBe(false);
    expect(tabs.get(2)?.active).toBe(true);
  });

  async function returnedToOriginal() {
    const tasks = taskTabs();
    await tasks.execute(
      await tasks.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' }),
    );
    await tasks.execute(await tasks.prepare('switch_tab', { tabId: 1 }));
    return tasks;
  }

  it('closes an inactive created tab while retaining the explicitly named current tab', async () => {
    const tasks = await returnedToOriginal();
    const switches = updated.mock.calls.length;
    const plan = await tasks.prepare('close_tab', { tabId: 2, returnToTabId: 1 });
    const receipt = await tasks.execute(plan);
    expect(chrome.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);
    expect(updated).toHaveBeenCalledTimes(switches);
    expect(tabs.has(2)).toBe(false);
    expect(tabs.get(1)?.active).toBe(true);
    expect(receipt).toMatchObject({
      tabId: 1,
      affectedTabId: 2,
      knownTabs: [{ tabId: 1, closeable: false }],
    });
  });

  it.each([2, 777, -1, 1.5, '1', null])(
    'rejects a different or invalid inactive return target: %j',
    async (returnToTabId) => {
      const tasks = await returnedToOriginal();
      await expect(tasks.prepare('close_tab', { tabId: 2, returnToTabId })).rejects.toThrow();
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
      expect(tabs.get(1)?.active).toBe(true);
    },
  );

  it('rejects an explicit retained tab that is no longer active', async () => {
    const tasks = await returnedToOriginal();
    tabs.get(1)!.active = false;
    await expect(tasks.prepare('close_tab', { tabId: 2, returnToTabId: 1 })).rejects.toThrow(
      'active current task tab',
    );
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it('does not close when the retained current tab changes after approval', async () => {
    const tasks = await returnedToOriginal();
    const plan = await tasks.prepare('close_tab', { tabId: 2, returnToTabId: 1 });
    tabs.get(1)!.url = 'http://127.0.0.1:8765/changed.html';
    await expect(tasks.execute(plan)).rejects.toThrow('changed after approval');
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it('preserves the original tab even with an explicit return target', async () => {
    const tasks = await returnedToOriginal();
    await expect(tasks.prepare('close_tab', { tabId: 1, returnToTabId: 2 })).rejects.toThrow(
      'Only tabs created by this task',
    );
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it('leaves the current tab active when the created destination changes', async () => {
    vi.mocked(chrome.tabs.create).mockImplementationOnce(async () => {
      const created = tab(2, 'http://127.0.0.1:8765/different.html', false);
      tabs.set(2, created);
      return created;
    });
    const tasks = taskTabs();
    const plan = await tasks.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' });
    await expect(tasks.execute(plan)).rejects.toThrow('navigated away from the approved URL');
    expect(updated).not.toHaveBeenCalled();
    expect(tabs.get(1)?.active).toBe(true);
    expect(tabs.get(2)?.active).toBe(false);
  });

  it('does not claim a switch when Chrome did not activate the target', async () => {
    updated.mockImplementationOnce(async () => tabs.get(2));
    const tasks = taskTabs();
    const plan = await tasks.prepare('open_tab', { url: 'http://127.0.0.1:8765/opened.html' });
    await expect(tasks.execute(plan)).rejects.toThrow('did not activate the approved task tab');
    expect(tabs.get(1)?.active).toBe(true);
    expect(tabs.get(2)?.active).toBe(false);
  });
});
