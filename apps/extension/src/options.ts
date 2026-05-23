/**
 * options.ts — AGI extension options page (W5-05).
 *
 * Sections:
 *  - Permissions: task-notification toggle, approved sites allowlist
 *  - Account: log out
 *  - Shortcuts: keyboard shortcut reference
 *
 * Styles injected via Constructable Stylesheets (CSP-compliant, same pattern as side_panel.ts).
 */

import { getExtensionTokensCss } from './tokens';

const SITE_ALLOWLIST_KEY = 'agi_site_allowlist';
const API_KEY_STORAGE_KEY = 'agi_api_key';

// ── Constructable Stylesheets (no <style> tag created) ──────────────────────

function injectStyles(): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    ${getExtensionTokensCss('dark')}

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: var(--agi-ext-text);
      background: var(--agi-ext-bg);
      min-height: 100vh;
    }

    .opt-page {
      max-width: 640px;
      margin: 0 auto;
      padding: 32px 20px 48px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .opt-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--agi-ext-border);
    }

    .opt-header-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--agi-ext-text);
    }

    .opt-header-sub {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      margin-top: 2px;
    }

    .opt-section {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      overflow: hidden;
    }

    .opt-section-header {
      padding: 14px 16px 10px;
      border-bottom: 1px solid var(--agi-ext-border);
    }

    .opt-section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--agi-ext-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .opt-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--agi-ext-border);
    }

    .opt-row:last-child { border-bottom: none; }

    .opt-row-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--agi-ext-text);
    }

    .opt-row-hint {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      margin-top: 2px;
      line-height: 1.4;
    }

    .opt-toggle {
      appearance: none;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: var(--agi-ext-hover);
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
      border: none;
      outline: none;
    }

    .opt-toggle:checked { background: var(--agi-ext-accent); }

    .opt-toggle::after {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: white;
      top: 3px;
      left: 3px;
      transition: transform 0.2s;
    }

    .opt-toggle:checked::after { transform: translateX(16px); }
    .opt-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* Allowlist */
    .opt-allowlist-body {
      padding: 12px 16px;
    }

    .opt-allowlist-help {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      margin-bottom: 10px;
      line-height: 1.45;
    }

    .opt-allowlist-current-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .opt-allowlist-origin {
      flex: 1;
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .opt-allowlist-toggle-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.12s;
    }

    .opt-allowlist-toggle-btn:hover {
      background: color-mix(in srgb, var(--agi-ext-accent) 80%, black);
    }

    .opt-allowlist-toggle-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .opt-allowlist-toggle-btn.remove {
      background: none;
      border: 1px solid var(--agi-ext-danger-border);
      color: var(--agi-ext-danger);
    }

    .opt-allowlist-toggle-btn.remove:hover {
      background: color-mix(in srgb, var(--agi-ext-danger) 10%, transparent);
    }

    .opt-allowlist-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .opt-allowlist-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
    }

    .opt-allowlist-item-origin {
      flex: 1;
      font-size: 11px;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .opt-allowlist-item-remove {
      background: none;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
      transition: color 0.12s;
      flex-shrink: 0;
    }

    .opt-allowlist-item-remove:hover { color: var(--agi-ext-danger); }

    .opt-allowlist-empty {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      padding: 4px 0;
    }

    /* Danger button */
    .opt-btn-danger {
      background: none;
      border: 1px solid var(--agi-ext-danger-border);
      color: var(--agi-ext-danger);
      border-radius: 6px;
      padding: 5px 14px;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.12s;
    }

    .opt-btn-danger:hover {
      background: color-mix(in srgb, var(--agi-ext-danger) 10%, transparent);
    }

    /* Shortcuts table */
    .opt-shortcuts-table {
      width: 100%;
      border-collapse: collapse;
    }

    .opt-shortcuts-table td {
      padding: 10px 16px;
      font-size: 12px;
      border-bottom: 1px solid var(--agi-ext-border);
    }

    .opt-shortcuts-table tr:last-child td { border-bottom: none; }

    .opt-shortcuts-table td:first-child { color: var(--agi-ext-text-muted); }

    .opt-shortcut-kbd {
      display: inline-flex;
      gap: 2px;
    }

    kbd {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: monospace;
      font-size: 11px;
      color: var(--agi-ext-text);
    }

    .opt-version {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      text-align: center;
    }
  `);
  document.adoptedStyleSheets = [sheet];
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// ── Allowlist helpers ────────────────────────────────────────────────────────

async function loadAllowlist(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SITE_ALLOWLIST_KEY, (result) => {
      const raw = result[SITE_ALLOWLIST_KEY];
      resolve(Array.isArray(raw) ? (raw as string[]) : []);
    });
  });
}

async function saveAllowlist(list: string[]): Promise<void> {
  await chrome.storage.local.set({ [SITE_ALLOWLIST_KEY]: list });
}

// ── Build page ───────────────────────────────────────────────────────────────

async function buildPage(): Promise<void> {
  injectStyles();

  const page = el('div', { class: 'opt-page' });

  // Header
  const header = el('div', { class: 'opt-header' });
  const headerText = el('div');
  headerText.appendChild(el('div', { class: 'opt-header-title' }, 'AGI Options'));
  headerText.appendChild(
    el('div', { class: 'opt-header-sub' }, 'Browser automation extension settings'),
  );
  header.appendChild(headerText);
  page.appendChild(header);

  // ── Section: Permissions ──────────────────────────────────────────────────

  const permSection = el('div', { class: 'opt-section' });
  const permHeader = el('div', { class: 'opt-section-header' });
  permHeader.appendChild(el('div', { class: 'opt-section-title' }, 'Permissions'));
  permSection.appendChild(permHeader);

  // Task notifications toggle
  const notifRow = el('div', { class: 'opt-row' });
  const notifLeft = el('div');
  notifLeft.appendChild(el('div', { class: 'opt-row-label' }, 'Task notifications'));
  notifLeft.appendChild(
    el('div', { class: 'opt-row-hint' }, 'Show a Chrome notification when a scheduled task fires.'),
  );
  notifRow.appendChild(notifLeft);

  const notifToggle = el('input', {
    type: 'checkbox',
    class: 'opt-toggle',
    id: 'opt-notif-toggle',
  }) as HTMLInputElement;

  // Load saved preference (default true — matches user intent when they schedule tasks)
  chrome.storage.local.get({ agi_task_notifications: true }, (items) => {
    notifToggle.checked = items['agi_task_notifications'] !== false;
  });
  notifToggle.addEventListener('change', () => {
    chrome.storage.local
      .set({ agi_task_notifications: notifToggle.checked })
      .catch((err: unknown) => console.warn('[Options] Failed to save notif pref:', err));
  });

  notifRow.appendChild(notifToggle);
  permSection.appendChild(notifRow);

  // Approved sites (allowlist)
  const allowlistBody = el('div', { class: 'opt-allowlist-body' });
  allowlistBody.appendChild(
    el(
      'p',
      { class: 'opt-allowlist-help' },
      'Pages on these origins can run AGI automation in their tab. Add the current site, then reload it.',
    ),
  );

  const currentRow = el('div', { class: 'opt-allowlist-current-row' });
  const currentOriginLabel = el(
    'span',
    { class: 'opt-allowlist-origin', id: 'opt-current-origin' },
    '—',
  );
  const addBtn = el(
    'button',
    { class: 'opt-allowlist-toggle-btn', id: 'opt-add-btn' },
    'Add',
  ) as HTMLButtonElement;
  addBtn.disabled = true;
  currentRow.appendChild(currentOriginLabel);
  currentRow.appendChild(addBtn);
  allowlistBody.appendChild(currentRow);

  const allowlistUl = el('ul', { class: 'opt-allowlist-list', id: 'opt-allowlist-list' });
  const allowlistEmpty = el(
    'p',
    { class: 'opt-allowlist-empty', id: 'opt-allowlist-empty' },
    'No sites allowlisted yet.',
  );
  allowlistBody.appendChild(allowlistUl);
  allowlistBody.appendChild(allowlistEmpty);

  async function refreshAllowlist(): Promise<void> {
    const origins = await loadAllowlist();
    allowlistUl.replaceChildren();
    allowlistEmpty.hidden = origins.length > 0;
    for (const origin of origins) {
      const li = el('li', { class: 'opt-allowlist-item' });
      const originSpan = el('span', { class: 'opt-allowlist-item-origin' }, origin);
      const removeBtn = el(
        'button',
        {
          class: 'opt-allowlist-item-remove',
          title: `Remove ${origin}`,
          'aria-label': `Remove ${origin}`,
        },
        '×',
      ) as HTMLButtonElement;
      removeBtn.addEventListener('click', async () => {
        const list = await loadAllowlist();
        await saveAllowlist(list.filter((o) => o !== origin));
        await refreshAllowlist();
      });
      li.appendChild(originSpan);
      li.appendChild(removeBtn);
      allowlistUl.appendChild(li);
    }
    // Update add/remove button for the current origin
    const stored = await loadAllowlist();
    const currentOrigin = currentOriginLabel.textContent ?? '';
    if (currentOrigin && currentOrigin !== '—') {
      const isAdded = stored.includes(currentOrigin);
      addBtn.textContent = isAdded ? 'Remove' : 'Add';
      addBtn.className = isAdded ? 'opt-allowlist-toggle-btn remove' : 'opt-allowlist-toggle-btn';
      addBtn.disabled = false;
    }
  }

  // Populate current tab origin
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url;
    if (url) {
      try {
        const origin = new URL(url).origin;
        if (origin !== 'null') {
          currentOriginLabel.textContent = origin;
          addBtn.disabled = false;
        }
      } catch {
        // non-parseable URL — leave disabled
      }
    }
    void refreshAllowlist();
  });

  addBtn.addEventListener('click', async () => {
    const origin = currentOriginLabel.textContent ?? '';
    if (!origin || origin === '—') return;
    const list = await loadAllowlist();
    const isAdded = list.includes(origin);
    if (isAdded) {
      await saveAllowlist(list.filter((o) => o !== origin));
    } else {
      list.push(origin);
      await saveAllowlist(list);
    }
    await refreshAllowlist();
  });

  permSection.appendChild(allowlistBody);
  page.appendChild(permSection);

  // ── Section: Account ──────────────────────────────────────────────────────

  const accountSection = el('div', { class: 'opt-section' });
  const accountHeader = el('div', { class: 'opt-section-header' });
  accountHeader.appendChild(el('div', { class: 'opt-section-title' }, 'Account'));
  accountSection.appendChild(accountHeader);

  const logoutRow = el('div', { class: 'opt-row' });
  const logoutLeft = el('div');
  logoutLeft.appendChild(el('div', { class: 'opt-row-label' }, 'Log out'));
  logoutLeft.appendChild(
    el('div', { class: 'opt-row-hint' }, 'Remove your API key and session from this device.'),
  );
  logoutRow.appendChild(logoutLeft);

  const logoutBtn = el('button', { class: 'opt-btn-danger', id: 'opt-logout-btn' }, 'Log out');
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.textContent = 'Logging out…';
    logoutBtn.disabled = true;
    try {
      await chrome.storage.local.remove([
        API_KEY_STORAGE_KEY,
        'agi_user_id',
        'agi_user_tier',
        'agi_session',
      ]);
      logoutBtn.textContent = 'Logged out';
    } catch {
      logoutBtn.textContent = 'Error';
      logoutBtn.disabled = false;
    }
  });

  logoutRow.appendChild(logoutBtn);
  accountSection.appendChild(logoutRow);
  page.appendChild(accountSection);

  // ── Section: Shortcuts ────────────────────────────────────────────────────

  const shortcutsSection = el('div', { class: 'opt-section' });
  const shortcutsHeader = el('div', { class: 'opt-section-header' });
  shortcutsHeader.appendChild(el('div', { class: 'opt-section-title' }, 'Keyboard Shortcuts'));
  shortcutsSection.appendChild(shortcutsHeader);

  const table = el('table', { class: 'opt-shortcuts-table' });
  const shortcuts: Array<[string, string[]]> = [
    ['Open popup', ['Cmd/Ctrl', 'Shift', 'A']],
    ['Capture page', ['Cmd/Ctrl', 'Shift', 'C']],
  ];
  for (const [action, keys] of shortcuts) {
    const tr = document.createElement('tr');
    const tdAction = document.createElement('td');
    tdAction.textContent = action;
    const tdKeys = document.createElement('td');
    const kbdSpan = el('span', { class: 'opt-shortcut-kbd' });
    for (let i = 0; i < keys.length; i++) {
      const k = document.createElement('kbd');
      k.textContent = keys[i] ?? '';
      kbdSpan.appendChild(k);
      if (i < keys.length - 1) {
        kbdSpan.appendChild(document.createTextNode(' + '));
      }
    }
    tdKeys.appendChild(kbdSpan);
    tr.appendChild(tdAction);
    tr.appendChild(tdKeys);
    table.appendChild(tr);
  }
  shortcutsSection.appendChild(table);
  page.appendChild(shortcutsSection);

  // Version footer
  const ver = chrome.runtime.getManifest().version;
  page.appendChild(el('p', { class: 'opt-version' }, `AGI v${ver}`));

  document.body.appendChild(page);
}

void buildPage();
