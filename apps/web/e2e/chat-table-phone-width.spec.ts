import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiCall, signIn } from './qa-capability-harness';

/**
 * How wide a table column gets is decided by the browser's table layout, which
 * jsdom does not have. The transcript is a fixture served over a conversation
 * this spec creates and deletes; every write other than that conversation's
 * own rows, and every request to a route that could call a model, is refused.
 */

const CHAT_ROUTE = '/chat';
const CONVERSATIONS_PATH = '/api/chat/conversations';
const CONVERSATION_PATH_PATTERN = /^\/api\/chat\/conversations\/[0-9a-f-]{36}$/;
const MODEL_BACKED_PATH = /^\/api\/(?:llm|media|models\/[^/]+\/completions)(?:\/|$)/;
const MEDIA_AVAILABILITY_PATH = '/api/media/availability';
const API_ROUTE = '**/api/**';
const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const DATABASE_ONLY_WRITES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/api\/consent$/ },
  { method: 'PUT', path: CONVERSATION_PATH_PATTERN },
  { method: 'DELETE', path: CONVERSATION_PATH_PATTERN },
];

const LOAD_TIMEOUT_MS = 30_000;
const CONSENT_WAIT_MS = 6_000;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const LONG_TOKEN_LENGTH = 24;
const COLUMN_FLOOR_PX = 72;
const EVIDENCE_DIR = process.env['QA_RENDER_EVIDENCE_DIR'];
const EVIDENCE_HEIGHT_PX = 3200;

const MESSAGE_IDS = {
  user: '5a0bd16f-c273-448d-af96-b0c1d2e3f4a5',
  assistant: '6b1ce270-d384-459e-b0a7-c1d2e3f4a5b6',
} as const;

const LONG_LINK = `https://example.com/${'segment/'.repeat(12)}index.html`;
const LONG_PATH = 'apps/example/src/features/sessions/components/SessionConversationView.tsx';
const LONG_HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

const TABLES = {
  three: [
    '| Plan | What it includes | Who it is for |',
    '| --- | --- | --- |',
    '| Starter | Chat, projects and a library of saved work | People trying it for the first time |',
    '| Team | Shared projects and a workspace for the group | Small teams that work together |',
    '| Business | Admin controls, an audit log and single sign-on | Companies with a security review |',
  ],
  small: ['| Step | Done |', '| --- | :---: |', '| Build | Yes |', '| Test | No |'],
  seven: [
    '| Region | First quarter | Second quarter | Third quarter | Fourth quarter | Whole year | Notes |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    '| North | 1,200,000 | 1,350,000 | 1,410,000 | 1,600,000 | 5,560,000 | Strong growth |',
    '| South | 900,000 | 950,000 | 1,000,000 | 1,100,000 | 3,950,000 | Steady |',
  ],
  link: [
    '| Name | Address |',
    '| --- | --- |',
    `| Docs | ${LONG_LINK} |`,
    '| Guide | [Read the guide](https://example.com/guide) |',
  ],
  path: [
    '| File | Change | Why |',
    '| --- | --- | --- |',
    `| \`${LONG_PATH}\` | Rewritten | Reads as a conversation |`,
    '| `store.ts` | Edited | Keeps the turn |',
  ],
  token: ['| Key | Value |', '| --- | --- |', `| Checksum | ${LONG_HASH} |`],
} as const;

type TableName = keyof typeof TABLES;
const TABLE_ORDER = Object.keys(TABLES) as TableName[];

const TRANSCRIPT = TABLE_ORDER.map((name) => `Table ${name}.\n\n${TABLES[name].join('\n')}`).join(
  '\n\n',
);

const LAYOUTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'small-phone', width: 320, height: 700 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

interface TableMeasure {
  clientWidth: number;
  scrollWidth: number;
  left: number;
  right: number;
  narrowestColumn: number;
  splitWords: string[];
}

interface Measure {
  viewport: number;
  page: number;
  tables: TableMeasure[];
}

async function guardNetwork(page: Page): Promise<{ createdConversations: string[] }> {
  const createdConversations: string[] = [];
  await page.route(API_ROUTE, async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const refuse = () => route.abort('blockedbyclient');
    const isRead = READ_METHODS.has(method);
    if (isRead && pathname === MEDIA_AVAILABILITY_PATH) return route.fallback();
    if (MODEL_BACKED_PATH.test(pathname)) return refuse();
    if (isRead) return route.fallback();
    if (method === 'POST' && pathname === CONVERSATIONS_PATH) {
      const response = await route.fetch();
      const body = (await response.json().catch(() => null)) as {
        conversation?: { id?: string };
      } | null;
      if (body?.conversation?.id) createdConversations.push(body.conversation.id);
      return route.fulfill({ response });
    }
    const databaseOnly = DATABASE_ONLY_WRITES.some(
      (write) => write.method === method && write.path.test(pathname),
    );
    return databaseOnly ? route.fallback() : refuse();
  });
  return { createdConversations };
}

async function serveTranscript(page: Page, conversationId: string): Promise<void> {
  const startedAt = Date.now();
  const stored = (id: string, parentId: string | null, role: string, offsetMs: number) => ({
    id,
    parent_id: parentId,
    role,
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: new Date(startedAt + offsetMs).toISOString(),
    metadata: null,
  });
  await page.route(`**${CONVERSATIONS_PATH}/${conversationId}?*`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    return route.fulfill({
      response,
      json: {
        ...body,
        messages: [
          { ...stored(MESSAGE_IDS.user, null, 'user', 0), content: 'Show me six tables' },
          {
            ...stored(MESSAGE_IDS.assistant, MESSAGE_IDS.user, 'assistant', 1),
            content: TRANSCRIPT,
          },
        ],
        total: 2,
        hasMore: false,
      },
    });
  });
}

function measure(bubble: Locator): Promise<Measure> {
  return bubble.evaluate((root, longTokenLength) => {
    const regions = Array.from(root.querySelectorAll<HTMLElement>('[role="region"]')).filter(
      (region) => region.querySelector(':scope > table'),
    );
    return {
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      tables: regions.map((region) => {
        const splitWords: string[] = [];
        for (const cell of Array.from(region.querySelectorAll('th, td'))) {
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? '';
            for (const match of text.matchAll(/\S+/g)) {
              if (match[0].length > longTokenLength) continue;
              const start = match.index ?? 0;
              const range = document.createRange();
              range.setStart(node, start);
              range.setEnd(node, start + match[0].length);
              const lines = new Set(
                Array.from(range.getClientRects(), (rect) => Math.round(rect.top)),
              );
              if (lines.size > 1) splitWords.push(match[0]);
            }
          }
        }
        const bounds = region.getBoundingClientRect();
        const header = Array.from(region.querySelector('tr')?.children ?? []);
        return {
          clientWidth: region.clientWidth,
          scrollWidth: region.scrollWidth,
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          narrowestColumn: Math.min(
            ...header.map((cell) => Math.round(cell.getBoundingClientRect().width)),
          ),
          splitWords,
        };
      }),
    };
  }, LONG_TOKEN_LENGTH);
}

const fits = (table: TableMeasure) => table.scrollWidth <= table.clientWidth + 1;

async function capture(
  page: Page,
  layout: { width: number; height: number },
  name: string,
): Promise<void> {
  if (!EVIDENCE_DIR) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.setViewportSize({ width: layout.width, height: EVIDENCE_HEIGHT_PX });
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `chat-tables-${layout.width}-${name}.png`),
  });
  await page.setViewportSize({ width: layout.width, height: layout.height });
}

test.describe('tables in a reply at phone width', () => {
  test.setTimeout(5 * 60_000);

  test('keep whole words, stay inside the screen and scroll in their own region', async ({
    page,
  }) => {
    await signIn(page);
    const guard = await guardNetwork(page);
    try {
      const created = await apiCall(page, CONVERSATIONS_PATH, {
        method: 'POST',
        body: { title: 'Table width spec' },
      });
      expect(created.status).toBe(201);
      const conversationId = guard.createdConversations[0];
      if (!conversationId) throw new Error('the conversation was not created');
      await serveTranscript(page, conversationId);

      for (const layout of LAYOUTS) {
        await page.setViewportSize({ width: layout.width, height: layout.height });
        await page.goto(`${CHAT_ROUTE}/${conversationId}`, { waitUntil: 'domcontentloaded' });
        await page
          .getByRole('button', { name: CONSENT_DISMISS_LABEL })
          .click({ timeout: CONSENT_WAIT_MS })
          .catch(() => undefined);

        const bubble = page.locator(ASSISTANT_BUBBLE).last();
        await expect(bubble.getByRole('table')).toHaveCount(TABLE_ORDER.length, {
          timeout: LOAD_TIMEOUT_MS,
        });
        await page.waitForFunction(() => document.fonts.status === 'loaded');

        const measured = await measure(bubble);
        const byName = Object.fromEntries(
          TABLE_ORDER.map((name, index) => [name, measured.tables[index]!]),
        ) as Record<TableName, TableMeasure>;
        const context = `${layout.name} ${JSON.stringify(measured)}`;

        expect(measured.tables, context).toHaveLength(TABLE_ORDER.length);
        expect(measured.page, context).toBeLessThanOrEqual(measured.viewport);
        for (const name of TABLE_ORDER) {
          const table = byName[name];
          expect(table.splitWords, `${name} ${context}`).toEqual([]);
          expect(table.left, `${name} ${context}`).toBeGreaterThanOrEqual(0);
          expect(table.right, `${name} ${context}`).toBeLessThanOrEqual(measured.viewport);
          expect(table.narrowestColumn, `${name} ${context}`).toBeGreaterThanOrEqual(
            COLUMN_FLOOR_PX,
          );
        }

        if (layout.name === 'desktop') {
          for (const name of TABLE_ORDER)
            expect(fits(byName[name]), `${name} ${context}`).toBe(true);
        } else {
          expect(fits(byName.small), context).toBe(true);
          expect(fits(byName.link), context).toBe(true);
          expect(fits(byName.token), context).toBe(true);
          expect(fits(byName.seven), context).toBe(false);
        }
        if (layout.name === 'phone') expect(fits(byName.three), context).toBe(true);

        await capture(page, layout, 'whole-words');

        if (layout.name === 'phone') {
          await page.addStyleTag({
            content: 'td, th { overflow-wrap: anywhere !important; min-width: 0 !important; }',
          });
          const squeezed = await measure(bubble);
          await capture(page, layout, 'words-may-break-anywhere');
          expect(
            squeezed.tables.flatMap((table) => table.splitWords).length,
            'the split-word probe sees nothing when cells may break anywhere',
          ).toBeGreaterThan(0);
        }
      }
    } finally {
      for (const id of guard.createdConversations) {
        await apiCall(page, `${CONVERSATIONS_PATH}/${id}`, { method: 'DELETE' });
      }
    }
  });
});
