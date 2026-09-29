import { type DesktopCapability } from '@agiworkforce/local-runtime-contract';
import { BROWSER_CDP_COMMANDS, isBrowserCommand, type BrowserCommand } from '@agiworkforce/types';

export class InvalidBrowserArguments extends Error {}

export interface BrowserCommandPlan {
  command: BrowserCommand;
  args: Record<string, unknown>;
  capability: DesktopCapability;
  summary: string;
  detail: string;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidBrowserArguments(`"${key}" must be a non-empty string.`);
  }
  return value;
}

function requireHttpUrl(args: Record<string, unknown>, key: string): string {
  const value = requireString(args, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidBrowserArguments(`"${key}" must be a URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidBrowserArguments('Only http and https addresses are supported.');
  }
  return parsed.toString();
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new InvalidBrowserArguments(`"${key}" must be a string.`);
  }
  return value;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidBrowserArguments(`"${key}" must be a number.`);
  }
  return value;
}

const MAX_FILL_FIELDS = 50;
const MAX_FILL_VALUE_CHARS = 10_000;

function requireFillFields(
  args: Record<string, unknown>,
): Array<{ selector: string; value: string }> {
  const fields = args['fields'];
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FILL_FIELDS) {
    throw new InvalidBrowserArguments(
      `"fields" must list between 1 and ${MAX_FILL_FIELDS} fields to fill.`,
    );
  }
  return fields.map((field) => {
    const record = field && typeof field === 'object' ? (field as Record<string, unknown>) : {};
    const selector = record['selector'];
    const value = record['value'];
    if (typeof selector !== 'string' || selector.trim() === '') {
      throw new InvalidBrowserArguments('Each field needs a "selector".');
    }
    if (typeof value !== 'string' || value.length > MAX_FILL_VALUE_CHARS) {
      throw new InvalidBrowserArguments(
        `Each field needs a "value" of at most ${MAX_FILL_VALUE_CHARS} characters.`,
      );
    }
    return { selector, value };
  });
}

function withDefined(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

/**
 * Validates one desktop-issued browser command and states, in the words the
 * approval dialog uses, exactly what it will do in the paired browser.
 */
export function planBrowserCommand(
  command: string,
  rawArgs: Record<string, unknown>,
): BrowserCommandPlan {
  if (!isBrowserCommand(command)) {
    throw new InvalidBrowserArguments(`"${command}" is not a browser command.`);
  }
  const capability: DesktopCapability = BROWSER_CDP_COMMANDS.includes(command)
    ? 'browser.cdp'
    : 'browser.site';

  const plan = (args: Record<string, unknown>, summary: string, detail: string) => ({
    command,
    args,
    capability,
    summary,
    detail,
  });

  switch (command) {
    case 'browser_list_tabs':
      return plan(
        {},
        'List the tabs open in the paired browser?',
        'The titles and addresses of every open web tab are shown in AGI Cloud so you can choose one. Nothing is added to the conversation until you read a tab.',
      );
    case 'browser_read_page': {
      const tabId = optionalNumber(rawArgs, 'tabId');
      return plan(
        withDefined({ tabId }),
        'Read the page open in the paired browser?',
        tabId === undefined
          ? 'The address, title and visible text of the active tab are copied into this conversation.'
          : 'The address, title and visible text of the tab you chose are copied into this conversation.',
      );
    }
    case 'browser_click': {
      const selector = requireString(rawArgs, 'selector');
      return plan(
        { selector },
        'Click in the paired browser?',
        `The element matching ${selector} is clicked on the active tab. A click can submit a form or start a purchase.`,
      );
    }
    case 'browser_type': {
      const selector = requireString(rawArgs, 'selector');
      const text = requireString(rawArgs, 'text');
      const clear = rawArgs['clear'] === true;
      return plan(
        withDefined({ selector, text, clear: clear || undefined }),
        'Type into the paired browser?',
        `${text}\n\nis typed into ${selector} on the active tab.`,
      );
    }
    case 'browser_navigate': {
      const url = requireHttpUrl(rawArgs, 'url');
      return plan(
        { url },
        'Open a page in the paired browser?',
        `The active tab leaves its current page and loads ${url}.`,
      );
    }
    case 'browser_screenshot':
      return plan(
        {},
        'Capture the paired browser?',
        'A picture of the visible part of the active tab is attached to this conversation.',
      );
    case 'browser_console':
      return plan(
        withDefined({
          pattern: optionalString(rawArgs, 'pattern'),
          level: optionalString(rawArgs, 'level'),
          limit: optionalNumber(rawArgs, 'limit'),
        }),
        "Read the paired browser's console?",
        'Console messages recorded on the active tab, which can include values the page logged, are copied into this conversation.',
      );
    case 'browser_network':
      return plan(
        withDefined({
          pattern: optionalString(rawArgs, 'pattern'),
          resourceType: optionalString(rawArgs, 'resourceType'),
          failedOnly: rawArgs['failedOnly'] === true ? true : undefined,
          limit: optionalNumber(rawArgs, 'limit'),
        }),
        "Read the paired browser's network activity?",
        'Requests the active tab made, including their addresses and status, are copied into this conversation.',
      );
    case 'browser_find': {
      const query = optionalString(rawArgs, 'query');
      const tabId = optionalNumber(rawArgs, 'tabId');
      return plan(
        withDefined({ query, tabId }),
        'List the controls on the page in the paired browser?',
        query === undefined
          ? 'The buttons, links and fields of the page, with their labels, are copied into this conversation. Field values are not.'
          : `The buttons, links and fields whose label matches "${query}" are copied into this conversation. Field values are not.`,
      );
    }
    case 'browser_fill_form': {
      const fields = requireFillFields(rawArgs);
      const tabId = optionalNumber(rawArgs, 'tabId');
      return plan(
        withDefined({ fields, tabId }),
        'Fill in fields in the paired browser?',
        `${fields.map((field) => `${field.selector}: ${field.value}`).join('\n')}\n\nare entered on the page. Nothing is submitted. Password and payment fields are left for you.`,
      );
    }
    case 'browser_history': {
      const direction = requireString(rawArgs, 'direction');
      if (direction !== 'back' && direction !== 'forward') {
        throw new InvalidBrowserArguments('"direction" must be back or forward.');
      }
      const tabId = optionalNumber(rawArgs, 'tabId');
      return plan(
        withDefined({ direction, tabId }),
        direction === 'back'
          ? 'Go back in the paired browser?'
          : 'Go forward in the paired browser?',
        `The tab returns to the page it showed ${direction === 'back' ? 'before' : 'after'} this one.`,
      );
    }
    case 'browser_download': {
      const url = requireHttpUrl(rawArgs, 'url');
      return plan(
        { url },
        'Download a file through the paired browser?',
        `${url} is saved to your downloads folder by the browser.`,
      );
    }
  }
}
