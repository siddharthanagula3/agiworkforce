import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeSelectedBrowserTabs,
  MAX_TAB_CLEANUP_SELECTION,
} from '../src/features/browser-tools/tabCleanup';
import { chooseTabsToClose } from '../src/features/side-panel/tabContext';

const reference = (tabId = 1) => ({
  tabId,
  windowId: 7,
  url: `https://example.com/${tabId}`,
  title: `Tab ${tabId}`,
});

function setup() {
  const get = vi.fn(async (tabId: number) => ({
    id: tabId,
    ...reference(tabId),
    active: false,
    pinned: false,
  }));
  const remove = vi.fn(async (_tabId: number) => undefined);
  vi.stubGlobal('chrome', { tabs: { get, remove } });
  return { get, remove };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('selected tab cleanup', () => {
  it('closes only the selected unchanged tabs', async () => {
    const h = setup();
    expect(await closeSelectedBrowserTabs([reference(1), reference(3)], () => true)).toEqual({
      closed: [1, 3],
      skipped: [],
      failed: [],
    });
    expect(h.remove.mock.calls).toEqual([[1], [3]]);
  });

  it.each([
    { active: true },
    { pinned: true },
    { pendingUrl: 'https://other.example/' },
    { windowId: 8 },
    { url: 'https://other.example/' },
  ])('keeps a tab changed after selection: %s', async (changed) => {
    const h = setup();
    h.get.mockResolvedValueOnce({
      id: 1,
      ...reference(),
      active: false,
      pinned: false,
      ...changed,
    });
    expect(await closeSelectedBrowserTabs([reference()], () => true)).toEqual({
      closed: [],
      skipped: [1],
      failed: [],
    });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('stops before removing a tab when authority changes during lookup', async () => {
    const h = setup();
    let current = true;
    h.get.mockImplementationOnce(async (tabId) => {
      current = false;
      return { id: tabId, ...reference(tabId), active: false, pinned: false };
    });
    expect(await closeSelectedBrowserTabs([reference(1), reference(2)], () => current)).toEqual({
      closed: [],
      skipped: [1, 2],
      failed: [],
    });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('does not continue after the chat or account changes between closes', async () => {
    const h = setup();
    let current = true;
    h.remove.mockImplementationOnce(async () => {
      current = false;
    });
    expect(await closeSelectedBrowserTabs([reference(1), reference(2)], () => current)).toEqual({
      closed: [1],
      skipped: [2],
      failed: [],
    });
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('reports a failed close separately from a successful close', async () => {
    const h = setup();
    h.remove.mockRejectedValueOnce(new Error('Chrome refused'));
    expect(await closeSelectedBrowserTabs([reference(1), reference(2)], () => true)).toEqual({
      closed: [2],
      skipped: [],
      failed: [1],
    });
  });

  it('rejects duplicate or oversized selections before touching Chrome', async () => {
    const h = setup();
    await expect(closeSelectedBrowserTabs([reference(), reference()], () => true)).rejects.toThrow(
      'duplicate',
    );
    await expect(
      closeSelectedBrowserTabs(
        Array.from({ length: MAX_TAB_CLEANUP_SELECTION + 1 }, (_, i) => reference(i)),
        () => true,
      ),
    ).rejects.toThrow('Too many');
    expect(h.get).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('offers inactive websites and own extension pages without reading page contents or granting site access', async () => {
    const query = vi.fn(async () => [
      { id: 1, windowId: 7, url: 'https://example.com/1', title: 'Finished test' },
      { id: 2, windowId: 7, url: 'https://example.com/active', title: 'Active page', active: true },
      { id: 3, windowId: 7, url: 'https://example.com/pinned', title: 'Pinned page', pinned: true },
      { id: 4, windowId: 7, url: 'chrome-extension://agi-fixture/welcome.html', title: 'Welcome' },
      {
        id: 5,
        windowId: 7,
        url: 'chrome-extension://other-extension/options.html',
        title: 'Other extension',
      },
      { id: 6, windowId: 7, url: 'chrome://extensions/', title: 'Manager' },
    ]);
    const request = vi.fn();
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://agi-fixture/${path}` },
      tabs: { query, sendMessage },
      permissions: { request },
    });
    const pending = chooseTabsToClose(() => true);
    await vi.waitFor(() => expect(document.querySelectorAll('.sp-tab-picker-row')).toHaveLength(2));
    const dialog = document.querySelector('[role=dialog]')!;
    expect(dialog.textContent).toContain('Closing can discard unsaved edits');
    expect(dialog.textContent).not.toContain('Other extension');
    document.querySelector<HTMLInputElement>('.sp-tab-picker-row input')!.click();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Close selected tabs')!
      .click();
    expect((await pending)?.map((tab) => tab.tabId)).toEqual([1]);
    expect(query).toHaveBeenCalledWith({ currentWindow: true });
    expect(request).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('cancels with Escape and restores keyboard focus', async () => {
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => []) } });
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const pending = chooseTabsToClose(() => true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await pending).toBeNull();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
