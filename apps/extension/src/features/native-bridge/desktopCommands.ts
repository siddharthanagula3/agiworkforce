import {
  BROWSER_COMMAND_PROTOCOL_VERSION,
  isBrowserCommandRequest,
  type BrowserCommandRequest,
  type BrowserCommandResult,
  type BrowserTabSummary,
} from '@agiworkforce/types';
import { webDomainAllowed, type WebDomainRules } from '@agiworkforce/cloud-contracts';
import { sanitizePageText } from '../../background/policy';
import { authorizeBrowserToolTab, authorizeBrowserToolUrl } from '../browser-tools/tabAuthority';
import { watchDownloadsStartedBy } from '../browser-tools/downloads';
import { screenshot as captureTabThroughDebugger } from '../computer-use/cdpDriver';

export const MAX_DESKTOP_PAGE_TEXT_CHARS = 20_000;
export const MAX_DESKTOP_FILL_FIELDS = 50;
const MAX_DESKTOP_FILL_VALUE_CHARS = 10_000;
const MAX_DESKTOP_FIND_QUERY_CHARS = 200;

/**
 * A desktop-issued page action, carried out here.
 *
 * The paired desktop has already asked its user about the action; this side
 * still holds every action to the extension's own bar, the approved-sites list
 * plus the browser-control grant, because a paired desktop is a caller, not an
 * authority over what Chrome may do.
 */
export interface DesktopCommandContext {
  resolveTabId: (explicitTabId?: number) => Promise<number | null>;
  listTabs: () => Promise<BrowserTabSummary[]>;
  send: (tabId: number, message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  navigate: (tabId: number, url: string) => Promise<void>;
  history: (tabId: number, direction: 'back' | 'forward') => Promise<void>;
  tabUrl: (tabId: number) => Promise<string>;
  capture: (tabId: number) => Promise<string>;
}

export function captureThroughDebugger(tabId: number): Promise<string> {
  return captureTabThroughDebugger(tabId);
}

function failed(id: string, error: string): BrowserCommandResult {
  return { version: BROWSER_COMMAND_PROTOCOL_VERSION, id, ok: false, error };
}

function succeeded(id: string, value: unknown): BrowserCommandResult {
  return { version: BROWSER_COMMAND_PROTOCOL_VERSION, id, ok: true, value };
}

function requireSuccess(response: Record<string, unknown>): Record<string, unknown> {
  if (response['success'] !== true) {
    throw new Error(
      typeof response['error'] === 'string' ? response['error'] : 'The page refused that action.',
    );
  }
  return response;
}

function httpUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('A URL is required.');
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https addresses are supported.');
  }
  return parsed.toString();
}

function fillFields(value: unknown): Array<{ selector: string; value: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('List the fields to fill, each with a CSS selector and a value.');
  }
  if (value.length > MAX_DESKTOP_FILL_FIELDS) {
    throw new Error(`Fill at most ${MAX_DESKTOP_FILL_FIELDS} fields in one call.`);
  }
  return value.map((field) => {
    const record = field && typeof field === 'object' ? (field as Record<string, unknown>) : {};
    const selector = record['selector'];
    const text = record['value'];
    if (typeof selector !== 'string' || selector.trim().length === 0) {
      throw new Error('Each field needs a CSS selector.');
    }
    if (typeof text !== 'string' || text.length > MAX_DESKTOP_FILL_VALUE_CHARS) {
      throw new Error(
        `Each field needs a text value of at most ${MAX_DESKTOP_FILL_VALUE_CHARS} characters.`,
      );
    }
    return { selector, value: text };
  });
}

function requireSelector(args: Record<string, unknown>): string {
  const selector = args['selector'];
  if (typeof selector !== 'string' || selector.trim().length === 0) {
    throw new Error('A CSS selector is required.');
  }
  return selector;
}

async function execute(
  request: BrowserCommandRequest,
  tabId: number,
  context: DesktopCommandContext,
): Promise<unknown> {
  const { args } = request;

  switch (request.command) {
    case 'browser_list_tabs':
      return context.listTabs();
    case 'browser_read_page': {
      const info = requireSuccess(await context.send(tabId, { type: 'GET_PAGE_INFO' }));
      const text = await context.send(tabId, { type: 'GET_TEXT', selector: 'body' });
      return {
        url: typeof info['url'] === 'string' ? info['url'] : '',
        title: typeof info['title'] === 'string' ? info['title'] : '',
        text:
          typeof text['text'] === 'string'
            ? sanitizePageText(text['text']).slice(0, MAX_DESKTOP_PAGE_TEXT_CHARS)
            : '',
      };
    }
    case 'browser_click':
      requireSuccess(await context.send(tabId, { type: 'CLICK', selector: requireSelector(args) }));
      return { clicked: true };
    case 'browser_type': {
      const text = args['text'];
      if (typeof text !== 'string') throw new Error('Text is required.');
      requireSuccess(
        await context.send(tabId, {
          type: 'TYPE',
          selector: requireSelector(args),
          text,
          options: { clear: args['clear'] === true },
        }),
      );
      return { typed: true };
    }
    case 'browser_navigate': {
      const url = httpUrl(args['url']);
      await authorizeBrowserToolUrl(url);
      await context.navigate(tabId, url);
      return { url };
    }
    case 'browser_screenshot': {
      // Two ways to photograph a tab, and Chrome gates both: the debugger
      // wants <all_urls> or activeTab, and captureVisibleTab wants the same,
      // while a desktop-issued capture has no click behind it to grant
      // activeTab. Try the debugger, fall back, and say what is missing.
      try {
        return { dataUrl: `data:image/png;base64,${await context.capture(tabId)}` };
      } catch (debuggerError) {
        const response = await context.send(tabId, { type: 'CAPTURE_SCREENSHOT', format: 'png' });
        if (response['success'] === true && typeof response['data'] === 'string') {
          return { dataUrl: response['data'] };
        }
        throw new Error(
          `Chrome would not let the extension photograph this tab. ${
            debuggerError instanceof Error ? debuggerError.message : ''
          } Open the AGI Workforce side panel on this tab and approve browser control for this site, then try again.`.trim(),
        );
      }
    }
    case 'browser_console': {
      const response = requireSuccess(
        await context.send(tabId, { type: 'READ_PAGE_CONSOLE', ...args }),
      );
      return { origin: response['origin'], console: response['console'] };
    }
    case 'browser_network': {
      const response = requireSuccess(
        await context.send(tabId, { type: 'READ_PAGE_NETWORK', ...args }),
      );
      return { origin: response['origin'], network: response['network'] };
    }
    case 'browser_find': {
      const query = args['query'];
      if (
        query !== undefined &&
        (typeof query !== 'string' || query.length > MAX_DESKTOP_FIND_QUERY_CHARS)
      ) {
        throw new Error(
          `A search term is text of at most ${MAX_DESKTOP_FIND_QUERY_CHARS} characters.`,
        );
      }
      const response = requireSuccess(
        await context.send(tabId, {
          type: 'FIND_ELEMENTS',
          ...(query === undefined ? {} : { query }),
        }),
      );
      return { elements: response['elements'] };
    }
    case 'browser_fill_form': {
      const response = requireSuccess(
        await context.send(tabId, { type: 'FILL_FIELDS', fields: fillFields(args['fields']) }),
      );
      return { filled: response['filled'], failed: response['failed'] };
    }
    case 'browser_history': {
      const direction = args['direction'];
      if (direction !== 'back' && direction !== 'forward') {
        throw new Error('Say whether to go back or forward.');
      }
      await context.history(tabId, direction);
      const url = await context.tabUrl(tabId);
      try {
        await authorizeBrowserToolUrl(url);
      } catch (error) {
        await context.history(tabId, direction === 'back' ? 'forward' : 'back');
        throw error;
      }
      return { direction, url };
    }
    case 'browser_download': {
      const response = requireSuccess(
        await context.send(tabId, {
          type: 'START_DOWNLOAD',
          url: httpUrl(args['url']),
          ...(request.siteRules ? { siteRules: request.siteRules } : {}),
        }),
      );
      return { download: response['download'] };
    }
  }
}

const OFF_LIMITS =
  'is a site your workspace administrator does not allow the assistant to use, so nothing from it was read.';

/** Commands that can leave the tab on a page the command did not name. */
const MOVES_THE_TAB: ReadonlySet<string> = new Set([
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_history',
]);

async function readTabUrl(tabId: number, context: DesktopCommandContext): Promise<string | null> {
  try {
    const url = await context.tabUrl(tabId);
    return typeof url === 'string' && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

function siteRulesOf(value: unknown): WebDomainRules | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const list = (entry: unknown) =>
    Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string') : [];
  const rules = { allow: list(record['allow']), deny: list(record['deny']) };
  return rules.allow.length > 0 || rules.deny.length > 0 ? rules : null;
}

/**
 * Before acting: the tab the command reads or acts on must be on an allowed
 * site, and so must any address it opens or downloads. Opening or going back
 * from a blocked page is how the user leaves it, so those are judged by where
 * they land instead.
 */
async function refusalBeforeActing(
  request: BrowserCommandRequest,
  tabId: number,
  rules: WebDomainRules,
  context: DesktopCommandContext,
): Promise<string | null> {
  const target = request.args['url'];
  if (typeof target === 'string' && !webDomainAllowed(rules, target)) {
    return `${target} ${OFF_LIMITS}`;
  }
  if (request.command === 'browser_navigate' || request.command === 'browser_history') return null;
  const current = await readTabUrl(tabId, context);
  if (current === null) {
    return rules.allow.length > 0
      ? 'The address of the tab could not be read, so it could not be checked against your workspace website rules.'
      : null;
  }
  return webDomainAllowed(rules, current) ? null : `The open tab, ${current}, ${OFF_LIMITS}`;
}

/**
 * After acting: a redirect or a click can land somewhere nobody named. A tab
 * that moved onto a blocked site goes back, and the result is withheld; an
 * address that cannot be read counts as blocked under an allow list.
 */
async function refusalAfterActing(
  command: string,
  tabId: number,
  landed: string | null,
  rules: WebDomainRules,
  context: DesktopCommandContext,
): Promise<string | null> {
  const allowed = landed === null ? rules.allow.length === 0 : webDomainAllowed(rules, landed);
  if (allowed) return null;
  if (MOVES_THE_TAB.has(command) && command !== 'browser_history') {
    await context.history(tabId, 'back').catch(() => undefined);
  }
  return landed === null
    ? 'The page the tab moved to could not be read, so its content was withheld under your workspace website rules.'
    : `The tab moved to ${landed}, which ${OFF_LIMITS} It went back.`;
}

/** Every result names the page the tab is on, for the desktop to check again. */
function withTabUrl(value: unknown, tabUrl: string | null): unknown {
  if (tabUrl === null || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  return { ...(value as Record<string, unknown>), tabUrl };
}

export async function runDesktopBrowserCommand(
  raw: unknown,
  context: DesktopCommandContext,
): Promise<BrowserCommandResult> {
  if (!isBrowserCommandRequest(raw)) {
    const id =
      raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string'
        ? (raw as { id: string }).id
        : '';
    return failed(id, 'AGI Desktop asked for an action this extension does not support.');
  }

  try {
    if (raw.command === 'browser_list_tabs') {
      return succeeded(raw.id, await context.listTabs());
    }
    const requestedTabId = raw.args['tabId'];
    const explicitTabId =
      typeof requestedTabId === 'number' && Number.isInteger(requestedTabId)
        ? requestedTabId
        : undefined;
    const tabId = await context.resolveTabId(explicitTabId);
    if (explicitTabId !== undefined && tabId !== explicitTabId) {
      return failed(raw.id, 'That tab is no longer open in Chrome.');
    }
    if (tabId === null) {
      return failed(raw.id, 'No web page is open in Chrome for that action.');
    }
    await authorizeBrowserToolTab(tabId);
    const rules = siteRulesOf(raw.siteRules);
    const refusal = rules ? await refusalBeforeActing(raw, tabId, rules, context) : null;
    if (refusal) return failed(raw.id, refusal);
    if (rules && MOVES_THE_TAB.has(raw.command)) watchDownloadsStartedBy(rules);
    const value = await execute(raw, tabId, context);
    const landed = await readTabUrl(tabId, context);
    if (rules) {
      const blocked = await refusalAfterActing(raw.command, tabId, landed, rules, context);
      if (blocked) return failed(raw.id, blocked);
    }
    return succeeded(raw.id, withTabUrl(value, landed));
  } catch (error) {
    return failed(raw.id, error instanceof Error ? error.message : 'That action failed.');
  }
}
