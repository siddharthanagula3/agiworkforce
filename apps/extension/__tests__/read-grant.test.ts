import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestReadGrant } from '../src/features/side-panel/readGrant';
import { chooseBrowserContextTabs } from '../src/features/side-panel/tabContext';

function permissionState(
  initial: string[] = [],
  options: { approve?: boolean; approved?: string[] } = {},
) {
  const granted = new Set(initial);
  const transient = new Map<string, string>();
  const dependencies = {
    contains: vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) =>
      origins.every((origin) => granted.has(origin)),
    ),
    request: vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
      if (options.approve === false) return false;
      for (const origin of origins) granted.add(origin);
      return true;
    }),
    remove: vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
      for (const origin of origins) granted.delete(origin);
      return true;
    }),
    approvedSites: vi.fn(async () => options.approved ?? []),
    record: vi.fn(async (id: string, origin: string) => {
      transient.set(id, origin);
    }),
    forget: vi.fn(async (ids: readonly string[]) => {
      for (const id of ids) transient.delete(id);
    }),
  };
  return { granted, transient, dependencies };
}

describe('reading attached tabs leaves no lasting site access', () => {
  it('grants access for the read and takes it back afterwards', async () => {
    const state = permissionState();
    const grant = await requestReadGrant(
      ['https://news.example/a', 'https://docs.example/b', 'https://news.example/c'],
      state.dependencies,
    );
    expect(grant.granted).toBe(true);
    expect(state.dependencies.request).toHaveBeenCalledWith({
      origins: ['https://news.example/*', 'https://docs.example/*'],
    });
    expect([...state.transient.values()]).toEqual(['https://news.example', 'https://docs.example']);
    await grant.release();
    expect([...state.granted]).toEqual([]);
    expect(state.transient.size).toBe(0);
  });

  it('keeps access the extension already had and sites the user approved meanwhile', async () => {
    const state = permissionState(['https://kept.example/*'], {
      approved: ['https://approved.example'],
    });
    const grant = await requestReadGrant(
      ['https://kept.example/', 'https://approved.example/', 'https://once.example/'],
      state.dependencies,
    );
    await grant.release();
    expect([...state.granted].sort()).toEqual([
      'https://approved.example/*',
      'https://kept.example/*',
    ]);
  });

  it('leaves nothing behind when the user declines Chrome’s prompt', async () => {
    const state = permissionState([], { approve: false });
    const grant = await requestReadGrant(['https://news.example/a'], state.dependencies);
    expect(grant.granted).toBe(false);
    expect([...state.granted]).toEqual([]);
    expect(state.transient.size).toBe(0);
  });

  it('asks Chrome in the same tick as the click, so the user gesture still counts', () => {
    const state = permissionState();
    void requestReadGrant(['https://news.example/a'], state.dependencies);
    expect(state.dependencies.request).toHaveBeenCalledTimes(1);
  });
});

describe('Attach tabs picker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('asks for access through the read grant with the chosen tabs only', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { id: 1, windowId: 3, url: 'https://news.example/a', title: 'News' },
          { id: 2, windowId: 3, url: 'https://docs.example/b', title: 'Docs' },
        ]),
      },
    });
    const requestAccess = vi.fn(async () => true);
    const choice = chooseBrowserContextTabs(() => true, 5, requestAccess);
    await vi.waitFor(() => expect(document.querySelectorAll('.sp-tab-picker-row')).toHaveLength(2));
    document.querySelector<HTMLInputElement>('.sp-tab-picker-row input')!.click();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Attach selected tabs')!
      .click();
    const tabs = await choice;
    expect(requestAccess).toHaveBeenCalledWith(['https://news.example/a']);
    expect(tabs?.map((tab) => tab.tabId)).toEqual([1]);
  });

  it('shows an attached tab without asking for access to it again', async () => {
    const existing = { tabId: 1, windowId: 3, url: 'https://news.example/a', title: 'News' };
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { ...existing, id: existing.tabId },
          { id: 2, windowId: 3, url: 'https://docs.example/b', title: 'Docs' },
        ]),
      },
    });
    const requestAccess = vi.fn(async () => true).mockResolvedValueOnce(false);
    const choice = chooseBrowserContextTabs(() => true, 1, requestAccess, undefined, [existing]);
    const checkboxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    await vi.waitFor(() => expect(checkboxes()).toHaveLength(2));
    const [news, docs] = checkboxes();
    expect(news!.checked).toBe(true);
    expect(news!.disabled).toBe(true);
    docs!.click();
    const attach = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Attach selected tabs',
    )!;
    attach.click();
    await vi.waitFor(() => expect(attach.disabled).toBe(false));
    expect(news!.disabled).toBe(true);
    expect(docs!.checked).toBe(true);
    attach.click();

    expect(await choice).toMatchObject([{ tabId: 2 }]);
    expect(requestAccess).toHaveBeenCalledTimes(2);
    expect(requestAccess).toHaveBeenNthCalledWith(1, ['https://docs.example/b']);
    expect(requestAccess).toHaveBeenNthCalledWith(2, ['https://docs.example/b']);
  });

  it('keeps the selected tabs fixed until the access request settles', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { id: 1, windowId: 3, url: 'https://news.example/a', title: 'News' },
          { id: 2, windowId: 3, url: 'https://docs.example/b', title: 'Docs' },
        ]),
      },
    });
    const access = Promise.withResolvers<boolean>();
    const requestAccess = vi.fn(() => access.promise);
    const choice = chooseBrowserContextTabs(() => true, 5, requestAccess);
    const checkboxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    await vi.waitFor(() => expect(checkboxes()).toHaveLength(2));
    const [news, docs] = checkboxes();
    const attach = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Attach selected tabs',
    )!;
    news!.click();
    attach.click();
    docs!.click();
    expect(docs!.checked).toBe(false);
    expect(news!.disabled).toBe(true);
    expect(attach.disabled).toBe(true);

    access.resolve(false);
    await vi.waitFor(() => expect(news!.disabled).toBe(false));
    expect(news!.checked).toBe(true);
    expect(attach.disabled).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await choice).toBeNull();
  });

  it('dismisses the picker immediately and waits for pending access before returning cancellation', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          { id: 1, windowId: 3, url: 'https://news.example/a', title: 'News' },
        ]),
      },
    });
    const access = Promise.withResolvers<boolean>();
    const state = permissionState();
    const request = state.dependencies.request.getMockImplementation()!;
    state.dependencies.request.mockImplementation(async (permissions) =>
      (await access.promise) ? request(permissions) : false,
    );
    let grant: Awaited<ReturnType<typeof requestReadGrant>> | undefined;
    const settled = vi.fn(async (selection) => {
      await grant?.release();
      return selection;
    });
    const choice = chooseBrowserContextTabs(
      () => true,
      5,
      async (urls) => {
        grant = await requestReadGrant(urls, state.dependencies);
        return grant.granted;
      },
    ).then(settled);
    await vi.waitFor(() => expect(document.querySelector('input')).not.toBeNull());
    document.querySelector<HTMLInputElement>('input')!.click();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Attach selected tabs')!
      .click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.sp-tab-picker')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).not.toHaveBeenCalled();
    access.resolve(true);
    await choice;
    expect(settled).toHaveBeenCalledExactlyOnceWith(null);
    expect(state.dependencies.remove).toHaveBeenCalledExactlyOnceWith({
      origins: ['https://news.example/*'],
    });
    expect(state.granted.size).toBe(0);
    expect(state.transient.size).toBe(0);
  });
});
