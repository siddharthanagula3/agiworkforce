import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_POLICY_ADMIN_UNAVAILABLE } from '@agiworkforce/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_BROWSER_TASK_TOOL,
  CHAT_READ_PAGE_TOOL,
  chatBrowserToolDefinitions,
  parseChatBrowserToolCall,
} from '../src/features/computer-use/chatBrowserTools';
import {
  CHAT_SEARCH_HISTORY_TOOL,
  HISTORY_SEARCH_MAX_RESULTS,
  describeHistoryResults,
  redactHistoryUrl,
  searchBrowsingHistory,
} from '../src/features/computer-use/historySearch';
import { createHistoryAccessRow } from '../src/features/options/history-access-row';
import { buildHistorySearchCard } from '../src/features/side-panel/bubbles';

const NOW = Date.UTC(2026, 9, 19);

function call(args: unknown) {
  return {
    id: 'call_h',
    function: { name: CHAT_SEARCH_HISTORY_TOOL, arguments: JSON.stringify(args) },
  };
}

describe('history search is offered only when it is on', () => {
  it('adds the history tool to whichever page tools apply, and offers it on pages it cannot read', () => {
    const names = (tools: readonly { function: { name: string } }[]) =>
      tools.map((tool) => tool.function.name);
    expect(names(chatBrowserToolDefinitions('act'))).toEqual([
      CHAT_READ_PAGE_TOOL,
      CHAT_BROWSER_TASK_TOOL,
    ]);
    expect(names(chatBrowserToolDefinitions('read', true))).toEqual([
      CHAT_READ_PAGE_TOOL,
      CHAT_SEARCH_HISTORY_TOOL,
    ]);
    expect(names(chatBrowserToolDefinitions(undefined, true))).toEqual([CHAT_SEARCH_HISTORY_TOOL]);
    expect(chatBrowserToolDefinitions(undefined)).toEqual([]);
  });
});

describe('history search arguments', () => {
  it('reads a query and a day range, defaulting to 30 days', () => {
    expect(parseChatBrowserToolCall(call({ query: ' flight ' }))).toEqual({
      kind: 'search_history',
      toolCallId: 'call_h',
      query: 'flight',
      days: 30,
    });
    expect(parseChatBrowserToolCall(call({ query: 'flight', days: 90 }))).toMatchObject({
      days: 90,
    });
  });

  it.each([
    ['an empty query', { query: '  ' }],
    ['a query that is too long', { query: 'x'.repeat(201) }],
    ['a range over 90 days', { query: 'flight', days: 91 }],
    ['a fractional range', { query: 'flight', days: 1.5 }],
    ['an extra field', { query: 'flight', maxResults: 500 }],
  ])('refuses %s', (_label, args) => {
    expect(parseChatBrowserToolCall(call(args))).toBeNull();
  });
});

describe('history results', () => {
  it('drops fragments, credentials and secret-like query values and keeps the rest', () => {
    expect(
      redactHistoryUrl('https://user:pw@shop.example/order?id=7&session_id=abc&code=99#top'),
    ).toBe('https://shop.example/order?id=7&session_id=redacted&code=redacted');
    expect(redactHistoryUrl('chrome://settings')).toBeNull();
    expect(redactHistoryUrl('file:///Users/me/notes.txt')).toBeNull();
  });

  it('searches the requested window, newest first, one row per address, capped at 20', async () => {
    const items: chrome.history.HistoryItem[] = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      url: `https://docs.example/page-${index % 25}`,
      title: `Page ${index}`,
      lastVisitTime: NOW - index * 1000,
    }));
    const search = vi.fn(async () => items);
    const entries = await searchBrowsingHistory(
      { query: 'page', days: 3 },
      {
        search,
        sitePolicy: async () => ({ admin: null, userAllowlist: [] }),
        blockedOrigins: async () => [],
        now: () => NOW,
      },
    );
    expect(search).toHaveBeenCalledWith({
      text: 'page',
      startTime: NOW - 3 * 24 * 60 * 60 * 1000,
      maxResults: 200,
    });
    expect(entries).toHaveLength(HISTORY_SEARCH_MAX_RESULTS);
    expect(entries[0]).toEqual({
      title: 'Page 0',
      url: 'https://docs.example/page-0',
      lastVisitTime: NOW,
    });
    expect(new Set(entries.map((entry) => entry.url)).size).toBe(entries.length);
  });

  it('leaves out sites the organization blocks, and refuses when its policy is unreadable', async () => {
    const search = vi.fn(async () => [
      { id: '1', url: 'https://bank.example/statements', title: 'Statements', lastVisitTime: NOW },
      { id: '2', url: 'https://news.example/a', title: 'News', lastVisitTime: NOW - 1 },
    ]);
    const entries = await searchBrowsingHistory(
      { query: 's', days: 1 },
      {
        search,
        sitePolicy: async () => ({
          admin: { version: 1, blocklist: [{ pattern: 'https://bank.example' }], allowlist: [] },
          userAllowlist: [],
        }),
        blockedOrigins: async () => [],
        now: () => NOW,
      },
    );
    expect(entries.map((entry) => entry.url)).toEqual(['https://news.example/a']);
    await expect(
      searchBrowsingHistory(
        { query: 's', days: 1 },
        {
          search,
          sitePolicy: async () => ({ admin: SITE_POLICY_ADMIN_UNAVAILABLE, userAllowlist: [] }),
          blockedOrigins: async () => [],
          now: () => NOW,
        },
      ),
    ).rejects.toThrow('site policy could not be read');
    expect(search).toHaveBeenCalledOnce();
  });

  it('says plainly when nothing matched', () => {
    expect(describeHistoryResults({ query: 'tax form', days: 30 }, [])).toBe(
      'No pages in the last 30 days of browsing history match "tax form".',
    );
  });
});

describe('Browsing history row in extension settings', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      i18n: {
        getMessage: (key: string) =>
          ({
            optHistoryOn: 'On.',
            optHistoryOff: 'Off.',
            optHistoryRefused: 'Chrome did not grant history access.',
          })[key] ?? key,
        getUILanguage: () => 'en',
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function control(initial: boolean, grant = true) {
    let granted = initial;
    return {
      has: vi.fn(async () => granted),
      request: vi.fn(async () => {
        granted = grant;
        return grant;
      }),
      remove: vi.fn(async () => {
        granted = false;
        return true;
      }),
    };
  }

  it('shows the Chrome permission as the setting and asks Chrome when turned on', async () => {
    const permission = control(false);
    const row = createHistoryAccessRow(permission);
    await row.loaded;
    expect(row.toggle.checked).toBe(false);
    expect(row.status.textContent).toBe('Off.');
    row.toggle.checked = true;
    row.toggle.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(row.status.textContent).toBe('On.'));
    expect(permission.request).toHaveBeenCalledOnce();
    expect(row.toggle.checked).toBe(true);
  });

  it('stays off and says so when Chrome refuses', async () => {
    const permission = control(false, false);
    const row = createHistoryAccessRow(permission);
    await row.loaded;
    row.toggle.checked = true;
    row.toggle.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(row.status.textContent).toBe('Chrome did not grant history access.'),
    );
    expect(row.toggle.checked).toBe(false);
  });

  it('gives the permission back to Chrome when turned off', async () => {
    const permission = control(true);
    const row = createHistoryAccessRow(permission);
    await row.loaded;
    expect(row.toggle.checked).toBe(true);
    row.toggle.checked = false;
    row.toggle.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(row.status.textContent).toBe('Off.'));
    expect(permission.remove).toHaveBeenCalledOnce();
  });
});

describe('history search card', () => {
  const catalog = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../_locales/en/messages.json'),
      'utf8',
    ),
  ) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;
  const getMessage = (key: string, substitutions: string[] = []): string => {
    const entry = catalog[key];
    if (!entry) return '';
    return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
      (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
        /\$(\d)/g,
        (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
      ),
    );
  };

  beforeEach(() => {
    vi.stubGlobal('chrome', { i18n: { getMessage, getUILanguage: () => 'en' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('names the words and the window in plain English, one day or many', () => {
    const one = buildHistorySearchCard({ query: 'lake', days: 1, onDecide: vi.fn() });
    expect(one.textContent).toContain('Looking for "lake" in the last day');
    const many = buildHistorySearchCard({ query: 'lake', days: 7, onDecide: vi.fn() });
    expect(many.textContent).toContain('Looking for "lake" in the last 7 days');
  });

  it('reports one decision and disables both buttons after it', () => {
    const onDecide = vi.fn();
    const card = buildHistorySearchCard({ query: 'lake', days: 7, onDecide });
    const [allow, decline] = [...card.querySelectorAll('button')];
    allow!.click();
    expect(onDecide).toHaveBeenCalledExactlyOnceWith(true);
    expect(allow!.disabled && decline!.disabled).toBe(true);
  });
});
