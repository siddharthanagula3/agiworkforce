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
});
