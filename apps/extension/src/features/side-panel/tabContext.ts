import { MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH } from '@agiworkforce/cloud-contracts';
import type { BrowserContextTabReference } from '../../types';
import { sanitizePageText } from '../../background/policy';
import { boundPageText } from '../content/in-page-panel/pageActions';

export const TAB_CONTEXT_PICKER_CSS = `
  .sp-tab-picker-overlay { position: fixed; inset: 0; z-index: 110; display: flex; align-items: center; justify-content: center; padding: 12px; background: var(--agi-ext-bg); }
  .sp-tab-picker { display: flex; flex-direction: column; width: 100%; max-width: 440px; max-height: 80vh; min-height: 0; padding: 16px; gap: 12px; background: var(--agi-ext-surface); color: var(--agi-ext-text); border: 1px solid var(--agi-ext-border-control); border-radius: 14px; }
  .sp-tab-picker h2 { margin: 0; font-size: 16px; }
  .sp-tab-picker p { margin: 0; color: var(--agi-ext-text-muted); font-size: 12px; line-height: 1.5; }
  .sp-tab-picker-list { display: flex; flex-direction: column; gap: 4px; overflow: auto; min-height: 0; }
  .sp-tab-picker-row { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px; border: 1px solid var(--agi-ext-border); border-radius: 8px; cursor: pointer; }
  .sp-tab-picker-row input { accent-color: var(--agi-ext-accent); flex-shrink: 0; }
  .sp-tab-picker-row-copy { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
  .sp-tab-picker-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .sp-tab-picker-row-origin { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--agi-ext-text-muted); font-size: 11px; }
  .sp-tab-picker-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .sp-tab-picker-actions button { padding: 8px 12px; min-height: 36px; border: 1px solid var(--agi-ext-border-control); border-radius: 8px; background: var(--agi-ext-bg); color: var(--agi-ext-text); cursor: pointer; }
  .sp-tab-picker-actions button[data-primary='true'] { background: var(--agi-ext-primary); color: var(--agi-ext-on-primary); border-color: var(--agi-ext-primary); }
  .sp-tab-picker-actions button:disabled { background: var(--agi-ext-hover); color: var(--agi-ext-text-muted); cursor: not-allowed; }
  .sp-tab-picker-actions button:focus-visible, .sp-tab-picker-row input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
`;

function ordinaryTab(tab: chrome.tabs.Tab): BrowserContextTabReference | null {
  if (!Number.isSafeInteger(tab.id) || !Number.isSafeInteger(tab.windowId) || !tab.url) return null;
  try {
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return {
      tabId: tab.id!,
      windowId: tab.windowId,
      url: url.href,
      title: tab.title ?? url.hostname,
    };
  } catch {
    return null;
  }
}

export async function chooseBrowserContextTabs(
  isCurrent: () => boolean,
  maxTabs: number,
  signal?: AbortSignal,
): Promise<readonly BrowserContextTabReference[] | null> {
  if (signal?.aborted || !isCurrent() || !Number.isSafeInteger(maxTabs) || maxTabs <= 0)
    return null;
  const initialFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'sp-tab-picker-overlay';
  const dialog = document.createElement('section');
  dialog.className = 'sp-tab-picker';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'sp-tab-picker-title');
  const heading = document.createElement('h2');
  heading.id = 'sp-tab-picker-title';
  heading.textContent = 'Attach tabs';
  const description = document.createElement('p');
  description.textContent = `Choose up to ${maxTabs} tabs from this window. Only the selected pages are sent as context when you send your message. Browser actions still require site permissions.`;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Loading open tabs…';
  const list = document.createElement('div');
  list.className = 'sp-tab-picker-list';
  const actions = document.createElement('div');
  actions.className = 'sp-tab-picker-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const attach = document.createElement('button');
  attach.type = 'button';
  attach.textContent = 'Attach selected tabs';
  attach.dataset['primary'] = 'true';
  attach.disabled = true;
  actions.append(cancel, attach);
  dialog.append(heading, description, status, list, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  cancel.focus();
  const selected = new Map<number, BrowserContextTabReference>();
  let closed = false;
  const result = new Promise<readonly BrowserContextTabReference[] | null>((resolve) => {
    const finish = (value: readonly BrowserContextTabReference[] | null): void => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener('abort', onAbort);
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      if (initialFocus?.isConnected) initialFocus.focus();
      resolve(value);
    };
    const onAbort = (): void => finish(null);
    signal?.addEventListener('abort', onAbort, { once: true });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      } else if (event.key === 'Tab') {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    cancel.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(null);
    });
    attach.addEventListener('click', async () => {
      if (!isCurrent() || selected.size === 0 || selected.size > maxTabs) {
        finish(null);
        return;
      }
      const tabs = [...selected.values()];
      if (JSON.stringify(tabs).length > MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH) {
        status.textContent = 'These tab details exceed the context budget. Choose fewer tabs.';
        return;
      }
      attach.disabled = true;
      const origins = [...new Set(tabs.map((tab) => `${new URL(tab.url).origin}/*`))];
      try {
        const granted = await chrome.permissions.request({ origins });
        if (closed) return;
        if (!isCurrent()) {
          finish(null);
          return;
        }
        if (granted) finish(tabs);
        else {
          status.textContent = 'Page access was declined. You can choose other tabs or cancel.';
          attach.disabled = false;
        }
      } catch {
        if (closed) return;
        status.textContent = 'Page access could not be granted. Try again or cancel.';
        attach.disabled = false;
      }
    });
  });
  const load = async (): Promise<void> => {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      if (closed) return;
      if (!isCurrent()) {
        cancel.click();
        return;
      }
      const candidates = tabs
        .map(ordinaryTab)
        .filter((tab): tab is BrowserContextTabReference => tab !== null);
      status.textContent = candidates.length
        ? 'Choose the pages to include.'
        : 'No readable website tabs are open in this window.';
      for (const tab of candidates) {
        const row = document.createElement('label');
        row.className = 'sp-tab-picker-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        const copy = document.createElement('span');
        copy.className = 'sp-tab-picker-row-copy';
        const title = document.createElement('span');
        title.className = 'sp-tab-picker-row-title';
        title.textContent = tab.title;
        const origin = document.createElement('span');
        origin.className = 'sp-tab-picker-row-origin';
        origin.textContent = new URL(tab.url).origin;
        copy.append(title, origin);
        row.append(checkbox, copy);
        list.append(row);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked && selected.size >= maxTabs) {
            checkbox.checked = false;
            status.textContent = `Choose at most ${maxTabs} tabs.`;
          } else {
            if (checkbox.checked) selected.set(tab.tabId, tab);
            else selected.delete(tab.tabId);
            status.textContent = `${selected.size} ${selected.size === 1 ? 'tab' : 'tabs'} selected.`;
          }
          attach.disabled = selected.size === 0;
        });
      }
    } catch {
      if (!closed) status.textContent = 'Open tabs could not be listed. Cancel and try again.';
    }
  };
  void load();
  return result;
}

export interface PageSelection {
  text: string;
  truncated: boolean;
}

/**
 * Runs inside the page through chrome.scripting, so it may reference nothing
 * outside its own body.
 */
export function readVisibleSelection(maxCharacters: number): PageSelection | null {
  const focused = document.activeElement;
  if (
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement ||
    focused instanceof HTMLSelectElement
  ) {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const excluded =
    'input, textarea, select, script, style, noscript, template, [hidden], [aria-hidden="true"]';
  const blockOf = (element: Element): Element => {
    for (let current: Element | null = element; current; current = current.parentElement) {
      const display = getComputedStyle(current).display;
      if (display && !display.startsWith('inline') && display !== 'contents') return current;
    }
    return element;
  };
  let text = '';
  let previousBlock: Element | null = null;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const root = range.commonAncestorContainer;
    const walker = document.createTreeWalker(
      root.nodeType === Node.TEXT_NODE && root.parentNode ? root.parentNode : root,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!range.intersectsNode(node)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded)) continue;
      if (
        typeof parent.checkVisibility === 'function' &&
        !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
        continue;
      }
      const value = node.nodeValue ?? '';
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : value.length;
      const piece = value.slice(start, end);
      if (!piece.trim()) continue;
      const block = blockOf(parent);
      if (previousBlock && block !== previousBlock && !text.endsWith('\n')) text += '\n';
      previousBlock = block;
      text += piece;
    }
  }
  const collapsed = text
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  if (!collapsed) return null;
  return {
    text: collapsed.slice(0, maxCharacters),
    truncated: collapsed.length > maxCharacters,
  };
}

export function prepareSelectionContext(
  selection: PageSelection,
  pageUrl: string,
): PageSelection | null {
  try {
    const url = new URL(pageUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  } catch {
    return null;
  }
  const bounded = boundPageText(sanitizePageText(selection.text), selection.truncated);
  return bounded.text.trim() ? bounded : null;
}
