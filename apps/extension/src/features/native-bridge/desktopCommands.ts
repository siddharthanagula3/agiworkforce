import {
  BROWSER_COMMAND_PROTOCOL_VERSION,
  isBrowserCommandRequest,
  type BrowserCommandRequest,
  type BrowserCommandResult,
} from '@agiworkforce/types';
import { sanitizePageText } from '../../background/policy';
import { authorizeBrowserToolTab } from '../browser-tools/tabAuthority';
import { screenshot as captureTabThroughDebugger } from '../computer-use/cdpDriver';

export const MAX_DESKTOP_PAGE_TEXT_CHARS = 20_000;

/**
 * A desktop-issued page action, carried out here.
 *
 * The paired desktop has already asked its user about the action; this side
 * still holds every action to the extension's own bar, the approved-sites list
 * plus the browser-control grant, because a paired desktop is a caller, not an
 * authority over what Chrome may do.
 */
export interface DesktopCommandContext {
  resolveTabId: () => Promise<number | null>;
  send: (tabId: number, message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  navigate: (tabId: number, url: string) => Promise<void>;
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
    case 'browser_download': {
      const response = requireSuccess(
        await context.send(tabId, { type: 'START_DOWNLOAD', url: httpUrl(args['url']) }),
      );
      return { download: response['download'] };
    }
  }
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
    const tabId = await context.resolveTabId();
    if (tabId === null) {
      return failed(raw.id, 'No web page is open in Chrome for that action.');
    }
    await authorizeBrowserToolTab(tabId);
    return succeeded(raw.id, await execute(raw, tabId, context));
  } catch (error) {
    return failed(raw.id, error instanceof Error ? error.message : 'That action failed.');
  }
}
