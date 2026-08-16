/**
 * In-page chat overlay panel.
 *
 * A 380px right-anchored slide-in panel injected directly into the page DOM
 * (not iframe) using Shadow DOM for style isolation. Contains:
 *   - Header with brand mark, close button, and provider display
 *   - Page-aware quick action chips
 *   - Free-form composer (textarea + submit)
 *   - Streaming response area
 *   - Footer with "Open in side panel" link
 *
 * Streams responses via the background service worker using chrome.runtime
 * messages that delegate to the bridge / provider-stream chain in background.ts.
 *
 * CSP-safe: no inline event handlers in injected HTML; all listeners wired here.
 *
 * @module inPagePanel/panel
 */

import { sanitizePageText } from '../../../background/policy';
import type { InPagePromptOutcome, InPagePromptResponse } from '../../../types';
import { getPageActions, truncatePageText } from './pageActions';
import type { PageAction } from './pageActions';
import { buildPanelStyles } from './panelStyles';
import {
  ArrowUp,
  Clock,
  FileEdit,
  FileText,
  Globe,
  MessageSquare,
  Search,
  renderIcon,
} from '../../../assets/icons';

interface PanelElements {
  panel: HTMLElement;
  closeBtn: HTMLButtonElement;
  actionsRow: HTMLElement;
  textarea: HTMLTextAreaElement;
  submitBtn: HTMLButtonElement;
  responseArea: HTMLElement;
  disclosure: HTMLElement;
  openSidePanelBtn: HTMLButtonElement;
}

function buildPanelDOM(shadow: ShadowRoot): PanelElements {
  const style = document.createElement('style');
  style.textContent = buildPanelStyles();
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'agi-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'AGI page assistant');

  const header = document.createElement('div');
  header.className = 'agi-header';

  const logo = document.createElement('span');
  logo.className = 'agi-logo';
  logo.textContent = 'AGI';

  const providerLabel = document.createElement('span');
  providerLabel.className = 'agi-provider-pill';
  providerLabel.textContent = 'Managed Cloud · Auto';
  providerLabel.setAttribute('aria-label', 'Provider: Managed Cloud, automatic model selection');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'agi-close-btn';
  closeBtn.setAttribute('aria-label', 'Close panel');
  closeBtn.setAttribute('type', 'button');
  closeBtn.textContent = '×';

  header.appendChild(logo);
  header.appendChild(providerLabel);
  header.appendChild(closeBtn);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'agi-actions-row';
  actionsRow.setAttribute('aria-describedby', 'agi-page-context-disclosure');

  const responseArea = document.createElement('div');
  responseArea.className = 'agi-response-area';
  responseArea.setAttribute('role', 'status');
  responseArea.setAttribute('aria-live', 'polite');
  responseArea.setAttribute('aria-label', 'Latest page assistant response');

  const disclosure = document.createElement('div');
  disclosure.id = 'agi-page-context-disclosure';
  disclosure.className = 'agi-disclosure';
  disclosure.setAttribute('role', 'note');
  disclosure.setAttribute('aria-label', 'Page context privacy notice');

  const composer = document.createElement('div');
  composer.className = 'agi-composer';

  const textarea = document.createElement('textarea');
  textarea.className = 'agi-textarea';
  textarea.rows = 1;
  textarea.setAttribute('placeholder', 'Ask one question about this page…');
  textarea.setAttribute('aria-label', 'Page assistant prompt');
  textarea.setAttribute('aria-describedby', disclosure.id);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'agi-submit-btn';
  submitBtn.setAttribute('type', 'button');
  submitBtn.setAttribute('aria-label', 'Send message');
  submitBtn.disabled = true;
  submitBtn.appendChild(renderIcon(ArrowUp, 16));

  composer.appendChild(textarea);
  composer.appendChild(submitBtn);

  const footer = document.createElement('div');
  footer.className = 'agi-footer';

  const openSidePanelBtn = document.createElement('button');
  openSidePanelBtn.className = 'agi-open-side-panel';
  openSidePanelBtn.setAttribute('type', 'button');
  openSidePanelBtn.textContent = 'Open in side panel';

  footer.appendChild(openSidePanelBtn);

  panel.appendChild(header);
  panel.appendChild(actionsRow);
  panel.appendChild(responseArea);
  panel.appendChild(disclosure);
  panel.appendChild(composer);
  panel.appendChild(footer);
  shadow.appendChild(panel);

  return {
    panel,
    closeBtn,
    actionsRow,
    textarea,
    submitBtn,
    responseArea,
    disclosure,
    openSidePanelBtn,
  };
}

async function streamPrompt(
  prompt: string,
  pageContext: string,
  responseArea: HTMLElement,
  setBusy: (busy: boolean) => void,
  retry: () => void,
  openSidePanel: () => void,
): Promise<void> {
  setBusy(true);
  responseArea.textContent = '';

  const cursor = document.createElement('span');
  cursor.className = 'agi-thinking';
  responseArea.appendChild(cursor);

  try {
    const response = await new Promise<InPagePromptResponse>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'IN_PAGE_PROMPT', prompt, pageContext },
        (result: unknown) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(normalizeInPagePromptResponse(result));
        },
      );
    });

    cursor.remove();

    if (!response.success) {
      showPromptOutcome(responseArea, response, retry, openSidePanel);
      return;
    }

    responseArea.textContent = response.text ?? '';
  } catch (err) {
    cursor.remove();
    showPromptOutcome(
      responseArea,
      {
        success: false,
        outcome: 'retryable_error',
        message: err instanceof Error ? err.message : 'Unknown extension error.',
        retryable: true,
      },
      retry,
      openSidePanel,
    );
  } finally {
    setBusy(false);
  }
}

function normalizeInPagePromptResponse(result: unknown): InPagePromptResponse {
  if (!result || typeof result !== 'object') {
    return {
      success: false,
      outcome: 'retryable_error',
      message: 'No response from the extension background service.',
      retryable: true,
    };
  }
  const value = result as Record<string, unknown>;
  if (
    value['success'] === true &&
    typeof value['text'] === 'string' &&
    value['provider'] === 'managed_cloud' &&
    value['modelSelection'] === 'auto'
  ) {
    return value as InPagePromptResponse;
  }
  const outcome = value['outcome'];
  if (
    value['success'] === false &&
    typeof outcome === 'string' &&
    outcome in IN_PAGE_OUTCOME_TITLES &&
    typeof value['message'] === 'string' &&
    typeof value['retryable'] === 'boolean'
  ) {
    return value as InPagePromptResponse;
  }
  return {
    success: false,
    outcome: 'retryable_error',
    message:
      typeof value['error'] === 'string'
        ? value['error']
        : 'The extension returned an invalid response.',
    retryable: true,
  };
}

const IN_PAGE_OUTCOME_TITLES: Record<InPagePromptOutcome, string> = {
  signed_out: 'Sign in to continue',
  plan_required: 'Managed Cloud is unavailable',
  quota_exceeded: 'Usage limit reached',
  account_unavailable: 'Account status unavailable',
  rate_limited: 'Too many requests',
  cancelled: 'Request cancelled',
  request_rejected: 'Request not sent',
  retryable_error: 'Managed Cloud request failed',
};

function showPromptOutcome(
  responseArea: HTMLElement,
  response: Extract<InPagePromptResponse, { success: false }>,
  retry: () => void,
  openSidePanel: () => void,
): void {
  responseArea.textContent = '';
  const errEl = document.createElement('div');
  errEl.className = `agi-access-state agi-access-state--${response.outcome}`;
  const titleEl = document.createElement('div');
  titleEl.className = 'agi-access-state-title';
  titleEl.textContent = IN_PAGE_OUTCOME_TITLES[response.outcome];
  const messageEl = document.createElement('div');
  messageEl.className = 'agi-access-state-message';
  messageEl.textContent = response.message;
  errEl.appendChild(titleEl);
  errEl.appendChild(messageEl);

  if (response.retryable) {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'agi-state-action';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', retry);
    errEl.appendChild(retryBtn);
  } else if (
    response.outcome === 'signed_out' ||
    response.outcome === 'plan_required' ||
    response.outcome === 'quota_exceeded'
  ) {
    const accountBtn = document.createElement('button');
    accountBtn.type = 'button';
    accountBtn.className = 'agi-state-action';
    accountBtn.textContent =
      response.outcome === 'signed_out' ? 'Open side panel to sign in' : 'Open side panel';
    accountBtn.addEventListener('click', openSidePanel);
    errEl.appendChild(accountBtn);
  }
  responseArea.appendChild(errEl);
}

function buildActionChips(
  actions: PageAction[],
  actionsRow: HTMLElement,
  onChipClick: (action: PageAction) => void,
): void {
  actionsRow.textContent = '';
  for (const action of actions) {
    const chip = document.createElement('button');
    chip.className = 'agi-action-chip';
    chip.setAttribute('type', 'button');
    chip.setAttribute('aria-label', action.label);
    chip.setAttribute('aria-describedby', 'agi-page-context-disclosure');
    chip.appendChild(renderIcon(getActionIcon(action.id), 14));
    chip.appendChild(document.createTextNode(action.label));
    chip.dataset['actionId'] = action.id;
    chip.addEventListener('click', () => onChipClick(action));
    actionsRow.appendChild(chip);
  }
}

function getActionIcon(actionId: string): string {
  if (actionId.includes('timestamps')) return Clock;
  if (actionId.includes('review')) return FileEdit;
  if (actionId.includes('translate')) return Globe;
  if (actionId.includes('qa')) return MessageSquare;
  if (actionId.includes('explain')) return Search;
  return FileText;
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

function capturePageContext(): {
  url: string;
  title: string;
  pageText: string;
  actions: PageAction[];
} {
  const url = window.location.href;
  const title = truncatePageText(sanitizePageText(document.title || 'Untitled'), 300);
  const pageText = truncatePageText(sanitizePageText(document.body?.innerText ?? ''));
  const actions = getPageActions(url);
  return { url, title, pageText, actions };
}

function updateDisclosure(
  disclosure: HTMLElement,
  context: ReturnType<typeof capturePageContext>,
): void {
  let source = 'this approved page';
  try {
    source = new URL(context.url).hostname || source;
  } catch {
    // The page URL is only a label; an unparsable URL must not hide the notice.
  }
  disclosure.textContent =
    `This panel can send visible text from ${source} ` +
    `(${context.pageText.length.toLocaleString()} characters; 30,000 maximum) to ` +
    'AGI Managed Cloud with your requests. The extension redacts patterns that resemble ' +
    'secrets; review page content before sending. Each response replaces the previous one here; ' +
    'open the side panel for a saved conversation.';
}

export function createPanel(): {
  host: HTMLElement;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setReturnFocus: (element: HTMLElement | null) => void;
} {
  const host = document.createElement('div');
  host.setAttribute('data-agi-panel', 'true');
  host.style.cssText = 'all:initial;';

  const shadow = host.attachShadow({ mode: 'closed' });
  const els = buildPanelDOM(shadow);

  let ctx = capturePageContext();
  let requestInFlight = false;
  let returnFocus: HTMLElement | null = null;

  function syncComposerState(): void {
    els.submitBtn.disabled = requestInFlight || els.textarea.value.trim().length === 0;
  }

  function setBusy(busy: boolean): void {
    requestInFlight = busy;
    for (const chip of els.actionsRow.querySelectorAll<HTMLButtonElement>('.agi-action-chip')) {
      chip.disabled = busy;
    }
    els.textarea.disabled = busy;
    syncComposerState();
  }

  function runPrompt(prompt: string, pageContext: string): void {
    if (requestInFlight) return;
    void streamPrompt(
      prompt,
      pageContext,
      els.responseArea,
      setBusy,
      () => runPrompt(prompt, pageContext),
      openSidePanel,
    );
  }

  function rebuildChips(): void {
    ctx = capturePageContext();
    updateDisclosure(els.disclosure, ctx);
    buildActionChips(ctx.actions, els.actionsRow, (action) => {
      const fresh = capturePageContext();
      ctx = fresh;
      updateDisclosure(els.disclosure, fresh);
      runPrompt(
        action.buildPrompt(fresh.title, ''),
        `Page title: ${fresh.title}\n\nVisible page text:\n${fresh.pageText}`,
      );
    });
  }

  rebuildChips();

  window.addEventListener('popstate', rebuildChips);
  const _origPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    _origPushState(...args);
    rebuildChips();
  };

  function submitComposer(): void {
    const text = els.textarea.value.trim();
    if (!text || requestInFlight) return;
    const fresh = capturePageContext();
    ctx = fresh;
    updateDisclosure(els.disclosure, fresh);
    els.textarea.value = '';
    autoResizeTextarea(els.textarea);
    syncComposerState();
    runPrompt(text, `Page title: ${fresh.title}\n\nVisible page text:\n${fresh.pageText}`);
  }

  els.submitBtn.addEventListener('click', submitComposer);
  els.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitComposer();
    }
  });
  els.textarea.addEventListener('input', () => {
    autoResizeTextarea(els.textarea);
    syncComposerState();
  });

  void ctx;

  let isOpen = false;

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    els.panel.classList.add('open');
    els.textarea.focus();
  }

  function closePanel(restoreFocus = true): void {
    if (!isOpen) return;
    isOpen = false;
    els.panel.classList.remove('open');
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  }

  function close(): void {
    closePanel(true);
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  els.closeBtn.addEventListener('click', close);

  function openSidePanel(): void {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
    closePanel(false);
  }

  els.openSidePanelBtn.addEventListener('click', openSidePanel);

  host.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') close();
  });

  return {
    host,
    open,
    close,
    toggle,
    setReturnFocus: (element: HTMLElement | null) => {
      returnFocus = element;
    },
  };
}
