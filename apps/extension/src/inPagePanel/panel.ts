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

import { getPageActions, truncatePageText } from './pageActions';
import type { PageAction } from './pageActions';
import { buildPanelStyles } from './panelStyles';

// ─── DOM builder ────────────────────────────────────────────────────────────────

interface PanelElements {
  panel: HTMLElement;
  closeBtn: HTMLButtonElement;
  actionsRow: HTMLElement;
  textarea: HTMLTextAreaElement;
  submitBtn: HTMLButtonElement;
  responseArea: HTMLElement;
  openSidePanelBtn: HTMLButtonElement;
  providerLabel: HTMLElement;
}

function buildPanelDOM(shadow: ShadowRoot): PanelElements {
  const style = document.createElement('style');
  style.textContent = buildPanelStyles();
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'agi-panel';

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'agi-header';

  const logo = document.createElement('span');
  logo.className = 'agi-logo';
  logo.textContent = 'AGI Workforce';

  const providerLabel = document.createElement('span');
  providerLabel.className = 'agi-provider-pill';
  providerLabel.textContent = 'Default';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'agi-close-btn';
  closeBtn.setAttribute('aria-label', 'Close panel');
  closeBtn.setAttribute('type', 'button');
  closeBtn.textContent = '×';

  header.appendChild(logo);
  header.appendChild(providerLabel);
  header.appendChild(closeBtn);

  // ── Actions row ───────────────────────────────────────────────────────────
  const actionsRow = document.createElement('div');
  actionsRow.className = 'agi-actions-row';

  // ── Response area ─────────────────────────────────────────────────────────
  const responseArea = document.createElement('div');
  responseArea.className = 'agi-response-area';
  responseArea.setAttribute('role', 'log');
  responseArea.setAttribute('aria-live', 'polite');
  responseArea.setAttribute('aria-label', 'AI response');

  // ── Composer ──────────────────────────────────────────────────────────────
  const composer = document.createElement('div');
  composer.className = 'agi-composer';

  const textarea = document.createElement('textarea');
  textarea.className = 'agi-textarea';
  textarea.rows = 1;
  textarea.setAttribute('placeholder', 'Ask anything about this page…');
  textarea.setAttribute('aria-label', 'Chat input');

  const submitBtn = document.createElement('button');
  submitBtn.className = 'agi-submit-btn';
  submitBtn.setAttribute('type', 'button');
  submitBtn.setAttribute('aria-label', 'Send message');
  submitBtn.textContent = '↑';

  composer.appendChild(textarea);
  composer.appendChild(submitBtn);

  // ── Footer ────────────────────────────────────────────────────────────────
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
    openSidePanelBtn,
    providerLabel,
  };
}

// ─── Streaming helper ──────────────────────────────────────────────────────────

/**
 * Send a prompt to the background service worker and render the response.
 * Resolves once the full response has been received (batch, not chunked).
 */
async function streamPrompt(
  prompt: string,
  responseArea: HTMLElement,
  submitBtn: HTMLButtonElement,
): Promise<void> {
  submitBtn.disabled = true;
  responseArea.textContent = '';

  const cursor = document.createElement('span');
  cursor.className = 'agi-thinking';
  responseArea.appendChild(cursor);

  try {
    type PromptResult = { success: boolean; text?: string; error?: string };
    const response = await new Promise<PromptResult>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'IN_PAGE_PROMPT', prompt },
        (result: PromptResult | undefined) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result ?? { success: false, error: 'No response from background' });
        },
      );
    });

    cursor.remove();

    if (!response.success || response.error) {
      showError(responseArea, response.error ?? 'Request failed');
      return;
    }

    // Render plain text — no innerHTML — to prevent XSS from model output
    responseArea.textContent = response.text ?? '';
  } catch (err) {
    cursor.remove();
    showError(responseArea, err instanceof Error ? err.message : 'Unknown error');
  } finally {
    submitBtn.disabled = false;
  }
}

function showError(responseArea: HTMLElement, message: string): void {
  responseArea.textContent = '';
  const errEl = document.createElement('div');
  errEl.className = 'agi-error';
  errEl.textContent = `Error: ${message}`;
  responseArea.appendChild(errEl);
}

// ─── Chip builder ───────────────────────────────────────────────────────────────

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
    chip.textContent = `${action.icon} ${action.label}`;
    chip.dataset['actionId'] = action.id;
    chip.addEventListener('click', () => onChipClick(action));
    actionsRow.appendChild(chip);
  }
}

// ─── Provider label ────────────────────────────────────────────────────────────

async function refreshProviderLabel(label: HTMLElement): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['agi_default_provider', 'agi_default_model']);
    const provider = (result['agi_default_provider'] as string | undefined) ?? '';
    const model = (result['agi_default_model'] as string | undefined) ?? '';
    const text = model || provider || 'Default';
    label.textContent = text.length > 18 ? text.slice(0, 17) + '…' : text;
  } catch {
    label.textContent = 'Default';
  }
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Create the overlay panel host and return open/close/toggle controllers.
 * The host must be appended to document.body by the caller.
 */
export function createPanel(): {
  host: HTMLElement;
  open: () => void;
  close: () => void;
  toggle: () => void;
} {
  const host = document.createElement('div');
  host.setAttribute('data-agi-panel', 'true');
  host.style.cssText = 'all:initial;';

  const shadow = host.attachShadow({ mode: 'open' });
  const els = buildPanelDOM(shadow);

  // Capture page context once at creation time
  const currentUrl = window.location.href;
  const currentTitle = document.title || 'Untitled';
  const pageText = truncatePageText(document.body?.innerText ?? '');
  const actions = getPageActions(currentUrl);

  buildActionChips(actions, els.actionsRow, (action) => {
    void streamPrompt(action.buildPrompt(currentTitle, pageText), els.responseArea, els.submitBtn);
  });

  function submitComposer(): void {
    const text = els.textarea.value.trim();
    if (!text) return;
    els.textarea.value = '';
    autoResizeTextarea(els.textarea);
    const fullPrompt = `Context from page "${currentTitle}":\n${pageText}\n\nUser question: ${text}`;
    void streamPrompt(fullPrompt, els.responseArea, els.submitBtn);
  }

  els.submitBtn.addEventListener('click', submitComposer);
  els.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitComposer();
    }
  });
  els.textarea.addEventListener('input', () => autoResizeTextarea(els.textarea));

  let isOpen = false;

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    els.panel.classList.add('open');
    void refreshProviderLabel(els.providerLabel);
    els.textarea.focus();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    els.panel.classList.remove('open');
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  els.closeBtn.addEventListener('click', close);

  els.openSidePanelBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
    close();
  });

  host.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') close();
  });

  return { host, open, close, toggle };
}
