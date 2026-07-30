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

import { getExtensionTokensCssAuto } from './tokens';
import { clearAuthToken, getAuthToken } from './features/cloud-bridge/freeTrialClient';
import { isClerkExtensionAuthConfigured, openClerkSignIn } from './features/cloud-bridge/clerkAuth';

const SITE_ALLOWLIST_KEY = 'agi_site_allowlist';
const API_KEY_STORAGE_KEY = 'agi_api_key';
const AUTOFILL_PROFILE_KEY = 'agi_autofill_profile';
const DEV_BEARER_KEY = 'agi_dev_bearer_token';

// ── Constructable Stylesheets (no <style> tag created) ──────────────────────

function injectStyles(): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    ${getExtensionTokensCssAuto()}

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

    /* Profile editor */
    .opt-profile-grid {
      padding: 14px 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
    }

    .opt-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .opt-field.full-width {
      grid-column: 1 / -1;
    }

    .opt-field label {
      font-size: 11px;
      font-weight: 500;
      color: var(--agi-ext-text-muted);
    }

    .opt-field input,
    .opt-field textarea,
    .opt-field select {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--agi-ext-text);
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }

    .opt-field input:focus,
    .opt-field textarea:focus,
    .opt-field select:focus {
      border-color: var(--agi-ext-accent);
    }

    .opt-field textarea {
      resize: vertical;
      min-height: 72px;
    }

    .opt-profile-actions {
      padding: 10px 16px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-top: 1px solid var(--agi-ext-border);
    }

    .opt-btn-primary {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 6px;
      padding: 6px 16px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s;
    }

    .opt-btn-primary:hover {
      background: color-mix(in srgb, var(--agi-ext-accent) 80%, black);
    }

    .opt-save-status {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
    }

    .opt-save-status.saved {
      color: var(--agi-ext-success, #22c55e);
    }

    /* Dev bearer token section */
    .opt-bearer-body {
      padding: 12px 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .opt-bearer-help {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      line-height: 1.5;
    }

    .opt-bearer-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .opt-bearer-input {
      flex: 1;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: var(--agi-ext-text);
      font-family: monospace;
      outline: none;
    }

    .opt-bearer-input:focus {
      border-color: var(--agi-ext-accent);
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
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') {
      // The extension CSP is `style-src 'self'` (no 'unsafe-inline'), so a
      // `style="..."` ATTRIBUTE is blocked and the declaration silently never
      // applies (plus a console CSP violation on every render). Apply each
      // declaration through the CSSOM property setter instead, which CSP does
      // not gate. Caught by the real-UI load-extension smoke (e2e/smoke.mjs).
      for (const decl of v.split(';')) {
        const idx = decl.indexOf(':');
        if (idx === -1) continue;
        const prop = decl.slice(0, idx).trim();
        const val = decl.slice(idx + 1).trim();
        if (prop && val) node.style.setProperty(prop, val);
      }
    } else {
      node.setAttribute(k, v);
    }
  }
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

  const browserControlBoundary = el('div', { class: 'opt-row' });
  const browserControlBoundaryText = el('div');
  browserControlBoundaryText.appendChild(
    el('div', { class: 'opt-row-label' }, 'Browser control boundary'),
  );
  browserControlBoundaryText.appendChild(
    el(
      'div',
      { class: 'opt-row-hint' },
      'Computer use uses Chrome DevTools Protocol (CDP) only after you start a run on an approved site. Ask before acting is on by default in the side panel; the debugger attaches for one bounded action and detaches afterward. AGI does not expose an unrestricted CDP developer mode.',
    ),
  );
  browserControlBoundary.appendChild(browserControlBoundaryText);
  permSection.appendChild(browserControlBoundary);

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

  // Populate the "current site" origin. The options page opens in its OWN
  // chrome-extension:// tab, so `{active, currentWindow}` would resolve to the
  // options page itself and Add would pollute the allowlist with the extension's
  // own origin. Query the active tab of every window and pick the first real
  // http(s) site instead — the page the user actually came from.
  chrome.tabs.query({ active: true }, (tabs) => {
    const siteTab = tabs.find((t) => {
      if (!t.url) return false;
      try {
        const proto = new URL(t.url).protocol;
        return proto === 'http:' || proto === 'https:';
      } catch {
        return false;
      }
    });
    if (siteTab?.url) {
      currentOriginLabel.textContent = new URL(siteTab.url).origin;
      addBtn.disabled = false;
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

  const renderAccountRow = (signedIn: boolean): void => {
    accountSection.querySelector('.opt-row')?.remove();
    const accountRow = el('div', { class: 'opt-row' });
    const accountLeft = el('div');

    if (!signedIn) {
      accountLeft.appendChild(el('div', { class: 'opt-row-label' }, 'Sign in'));
      accountLeft.appendChild(
        el(
          'div',
          { class: 'opt-row-hint' },
          isClerkExtensionAuthConfigured()
            ? 'Use your AGI account for Managed Cloud chat and models.'
            : 'AGI account sign-in is not configured in this development build.',
        ),
      );
      accountRow.appendChild(accountLeft);

      const signInBtn = el(
        'button',
        { class: 'opt-btn-primary', id: 'opt-signin-btn' },
        isClerkExtensionAuthConfigured() ? 'Sign in' : 'Unavailable',
      ) as HTMLButtonElement;
      signInBtn.disabled = !isClerkExtensionAuthConfigured();
      signInBtn.addEventListener('click', async () => {
        signInBtn.textContent = 'Opening…';
        signInBtn.disabled = true;
        try {
          await openClerkSignIn();
          signInBtn.textContent = 'Sign-in opened';
        } catch {
          signInBtn.textContent = 'Try again';
          signInBtn.disabled = false;
        }
      });
      accountRow.appendChild(signInBtn);
      accountSection.appendChild(accountRow);
      return;
    }

    accountLeft.appendChild(el('div', { class: 'opt-row-label' }, 'Log out'));
    accountLeft.appendChild(
      el('div', { class: 'opt-row-hint' }, 'Remove your AGI account session from this device.'),
    );
    accountRow.appendChild(accountLeft);

    const logoutBtn = el('button', { class: 'opt-btn-danger', id: 'opt-logout-btn' }, 'Log out');
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.textContent = 'Logging out…';
      logoutBtn.disabled = true;
      try {
        // Actually end the session: clearAuthToken() runs signOutClerk() and clears
        // the session/dev tokens — the same real sign-out the side panel uses. The
        // storage.remove below only purged legacy keys that nothing writes, so the
        // Clerk session (the real auth) survived and the panel stayed signed in.
        await clearAuthToken();
        await chrome.storage.local.remove([
          API_KEY_STORAGE_KEY,
          'agi_user_id',
          'agi_user_tier',
          'agi_session',
        ]);
        renderAccountRow(false);
      } catch {
        logoutBtn.textContent = 'Error';
        logoutBtn.disabled = false;
      }
    });

    accountRow.appendChild(logoutBtn);
    accountSection.appendChild(accountRow);
  };

  renderAccountRow(Boolean(await getAuthToken()));
  page.appendChild(accountSection);

  // ── Section: Autofill Profile ─────────────────────────────────────────────

  const profileSection = el('div', { class: 'opt-section' });
  const profileHeader = el('div', { class: 'opt-section-header' });
  profileHeader.appendChild(el('div', { class: 'opt-section-title' }, 'Autofill Profile'));
  profileHeader.appendChild(
    el(
      'div',
      { class: 'opt-row-hint', style: 'padding-top:4px' },
      'Stored only on this device. Used by the deterministic fast-path filler and the AGI computer-use agent.',
    ),
  );
  profileSection.appendChild(profileHeader);

  // Profile fields — two-column grid
  type ProfileKey =
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'locationCity'
    | 'locationState'
    | 'locationCountry'
    | 'currentTitle'
    | 'currentCompany'
    | 'yearsOfExperience'
    | 'linkedinUrl'
    | 'githubUrl'
    | 'portfolioUrl'
    | 'workAuthorization'
    | 'salaryExpectation'
    | 'coverLetterText';

  const PROFILE_FIELDS: Array<{ key: ProfileKey; label: string; type?: string; full?: boolean }> = [
    { key: 'firstName', label: 'First name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'locationCity', label: 'City' },
    { key: 'locationState', label: 'State / Province' },
    { key: 'locationCountry', label: 'Country' },
    { key: 'currentTitle', label: 'Current title' },
    { key: 'currentCompany', label: 'Current company' },
    { key: 'yearsOfExperience', label: 'Years of experience', type: 'number' },
    { key: 'linkedinUrl', label: 'LinkedIn URL', type: 'url' },
    { key: 'githubUrl', label: 'GitHub URL', type: 'url' },
    { key: 'portfolioUrl', label: 'Portfolio / Website URL', type: 'url' },
    { key: 'workAuthorization', label: 'Work authorization' },
    { key: 'salaryExpectation', label: 'Salary expectation' },
    { key: 'coverLetterText', label: 'Cover letter (text)', full: true },
  ];

  const profileGrid = el('div', { class: 'opt-profile-grid' });
  const profileInputs: Partial<Record<ProfileKey, HTMLInputElement | HTMLTextAreaElement>> = {};

  for (const field of PROFILE_FIELDS) {
    const wrapper = el('div', { class: field.full ? 'opt-field full-width' : 'opt-field' });
    const label = el('label', { for: `profile-${field.key}` }, field.label);
    wrapper.appendChild(label);

    if (field.full) {
      const ta = el('textarea', { id: `profile-${field.key}`, rows: '4' }) as HTMLTextAreaElement;
      wrapper.appendChild(ta);
      profileInputs[field.key] = ta;
    } else {
      const input = el('input', {
        id: `profile-${field.key}`,
        type: field.type ?? 'text',
        autocomplete: 'off',
      }) as HTMLInputElement;
      wrapper.appendChild(input);
      profileInputs[field.key] = input;
    }
    profileGrid.appendChild(wrapper);
  }

  profileSection.appendChild(profileGrid);

  const profileActions = el('div', { class: 'opt-profile-actions' });
  const saveProfileBtn = el(
    'button',
    { class: 'opt-btn-primary' },
    'Save profile',
  ) as HTMLButtonElement;
  const saveStatus = el('span', { class: 'opt-save-status' }, '');
  profileActions.appendChild(saveProfileBtn);
  profileActions.appendChild(saveStatus);
  profileSection.appendChild(profileActions);

  // Load saved profile into inputs
  chrome.storage.local.get([AUTOFILL_PROFILE_KEY], (result) => {
    const saved = result[AUTOFILL_PROFILE_KEY] as Record<string, string> | undefined;
    if (!saved) return;
    for (const field of PROFILE_FIELDS) {
      const input = profileInputs[field.key];
      if (input && saved[field.key]) input.value = String(saved[field.key]);
    }
  });

  saveProfileBtn.addEventListener('click', async () => {
    const profile: Record<string, string> = {};
    for (const field of PROFILE_FIELDS) {
      const input = profileInputs[field.key];
      if (input?.value.trim()) profile[field.key] = input.value.trim();
    }
    await chrome.storage.local.set({ [AUTOFILL_PROFILE_KEY]: profile });
    saveStatus.textContent = 'Saved';
    saveStatus.className = 'opt-save-status saved';
    setTimeout(() => {
      saveStatus.textContent = '';
      saveStatus.className = 'opt-save-status';
    }, 2000);
  });

  page.appendChild(profileSection);

  // Development-only escape hatch for local gateway testing. Production
  // bundles expose only the official Clerk Native API flow and never ask a
  // user to copy a session cookie out of DevTools.
  if (import.meta.env.DEV) {
    const bearerSection = el('div', { class: 'opt-section' });
    const bearerHeader = el('div', { class: 'opt-section-header' });
    bearerHeader.appendChild(
      el('div', { class: 'opt-section-title' }, 'Computer Use — Cloud Auth'),
    );
    bearerSection.appendChild(bearerHeader);

    const bearerBody = el('div', { class: 'opt-bearer-body' });
    bearerBody.appendChild(
      el(
        'p',
        { class: 'opt-bearer-help' },
        'Local-development fallback only. Production builds use the Clerk Chrome Extension SDK. ' +
          'Use a short-lived test token issued by your local gateway; never copy a browser session cookie.',
      ),
    );

    const bearerRow = el('div', { class: 'opt-bearer-row' });
    const bearerInput = el('input', {
      class: 'opt-bearer-input',
      type: 'password',
      placeholder: 'Paste Clerk JWT here…',
      id: 'opt-bearer-input',
      autocomplete: 'off',
    }) as HTMLInputElement;
    const saveBearerBtn = el('button', { class: 'opt-btn-primary' }, 'Save') as HTMLButtonElement;
    const clearBearerBtn = el(
      'button',
      { class: 'opt-btn-danger', style: 'margin-left:4px' },
      'Clear',
    ) as HTMLButtonElement;
    const bearerStatus = el('span', { class: 'opt-save-status' }, '');

    bearerRow.appendChild(bearerInput);
    bearerRow.appendChild(saveBearerBtn);
    bearerRow.appendChild(clearBearerBtn);
    bearerBody.appendChild(bearerRow);
    bearerBody.appendChild(bearerStatus);
    bearerSection.appendChild(bearerBody);

    // Load existing token (show masked)
    chrome.storage.local.get([DEV_BEARER_KEY], (result) => {
      if (result[DEV_BEARER_KEY]) {
        bearerStatus.textContent = 'Token stored';
        bearerStatus.className = 'opt-save-status saved';
      }
    });

    saveBearerBtn.addEventListener('click', async () => {
      const val = bearerInput.value.trim();
      if (!val) return;
      await chrome.storage.local.set({ [DEV_BEARER_KEY]: val });
      bearerInput.value = '';
      bearerStatus.textContent = 'Token saved';
      bearerStatus.className = 'opt-save-status saved';
    });

    clearBearerBtn.addEventListener('click', async () => {
      await chrome.storage.local.remove([DEV_BEARER_KEY]);
      bearerInput.value = '';
      bearerStatus.textContent = 'Cleared';
      bearerStatus.className = 'opt-save-status';
      setTimeout(() => {
        bearerStatus.textContent = '';
      }, 1500);
    });

    page.appendChild(bearerSection);
  }

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
