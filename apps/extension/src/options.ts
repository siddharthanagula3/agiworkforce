/**
 * options.ts — AGI extension options page (W5-05).
 *
 * Sections:
 *  - Permissions: task-notification toggle, approved sites allowlist
 *  - Account: log out
 *  - Shortcuts: keyboard shortcut reference
 *  - Help: links to the Help center, docs and support routes on the web app
 *
 * Styles injected via Constructable Stylesheets (CSP-compliant, same pattern as side_panel.ts).
 */

import { getExtensionTokensCssAuto } from './tokens';
import { clearAuthToken, getAuthToken } from './features/cloud-bridge/freeTrialClient';
import { isClerkExtensionAuthConfigured, openClerkSignIn } from './features/cloud-bridge/clerkAuth';
import { beginOptionsAccountRefresh } from './features/options/account-state';
import {
  normalizeApprovedSiteOrigin,
  sanitizeApprovedSiteOrigins,
  selectApprovedSiteOrigin,
} from './features/options/site-allowlist';
import { SITE_ALLOWLIST_STORAGE_KEY } from './background/policy';

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

    .opt-link {
      font-size: 12px;
      font-weight: 500;
      color: var(--agi-ext-accent);
      text-decoration: none;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .opt-link:hover { text-decoration: underline; }
    .opt-link:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

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
      background: #ffffff;
      /* Definition ring. The OFF track is --agi-ext-hover, which is #f0f0f0 in
         the light theme — a plain white knob on it was ~1.05:1 and the OFF
         state read as an empty pill. An outset ring costs no layout and
         reads on both grounds. */
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.28);
      top: 3px;
      left: 3px;
      transition: transform 0.2s;
    }

    .opt-toggle:checked::after { transform: translateX(16px); }
    .opt-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }


    /* Respect the OS "reduce motion" setting. Five infinite animations (typing
       dots, spinners, pulse states) plus smooth scrolling ran unconditionally,
       which is a vestibular-trigger risk and an accessibility failure. Motion is
       reduced to near-zero rather than removed, so state changes still register. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
    @media (forced-colors: active) {
      .opt-toggle { border: 1px solid CanvasText; }
      .opt-toggle::after { background: CanvasText; box-shadow: none; }
      .opt-toggle:checked { background: Highlight; }
      .opt-toggle:checked::after { background: HighlightText; }
    }
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

    .opt-shortcuts-table td,
    .opt-shortcuts-table th {
      padding: 10px 16px;
      font-size: 12px;
      border-bottom: 1px solid var(--agi-ext-border);
      text-align: left;
    }

    .opt-shortcuts-table tr:last-child td,
    .opt-shortcuts-table tr:last-child th { border-bottom: none; }

    .opt-shortcuts-table th {
      color: var(--agi-ext-text-muted);
      font-weight: 400;
    }

    .opt-shortcuts-table + .opt-save-status {
      display: block;
      padding: 10px 16px 14px;
      border-top: 1px solid var(--agi-ext-border);
    }

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

    /* Inputs have no width, so each 1fr grid track could not shrink below the
       browser's default input width and the page scrolled horizontally, clipping
       the right-hand column. There was no @media rule in this file at all. */
    .opt-field input,
    .opt-field textarea,
    .opt-field select {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    @media (max-width: 520px) {
      .opt-profile-grid {
        grid-template-columns: 1fr;
      }
      .opt-page {
        padding: 20px 14px 32px;
      }
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

    .opt-btn-primary:disabled,
    .opt-btn-danger:disabled,
    .opt-allowlist-item-remove:disabled {
      opacity: 0.55;
      cursor: wait;
    }

    .opt-save-status {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
    }

    .opt-save-status.saved {
      color: var(--agi-ext-success, #22c55e);
    }

    .opt-save-status.error {
      color: var(--agi-ext-danger);
    }

    .opt-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
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

    /* ── Chrome settings visual system ──────────────────────────────────── */
    body {
      color-scheme: dark;
      background: var(--agi-ext-bg);
      letter-spacing: -0.005em;
    }

    @media (prefers-color-scheme: light) {
      body { color-scheme: light; }
    }

    button,
    input,
    textarea,
    select { font: inherit; }

    button:focus-visible,
    a:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
    }

    .opt-shell {
      display: grid;
      grid-template-columns: 238px minmax(0, 1fr);
      min-height: 100vh;
    }

    .opt-sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 26px;
      padding: 26px 18px 22px;
      border-right: 1px solid var(--agi-ext-border);
      background: color-mix(in srgb, var(--agi-ext-bg) 94%, black);
    }

    .opt-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 34px;
      padding: 0 8px;
    }

    .opt-brand-mark {
      width: 28px;
      height: 28px;
      object-fit: contain;
    }

    .opt-brand-name {
      color: var(--agi-ext-text);
      font-size: 18px;
      font-weight: 650;
      letter-spacing: -0.025em;
    }

    .opt-nav {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .opt-nav-item {
      width: 100%;
      min-height: 42px;
      padding: 0 13px;
      border: 0;
      border-radius: 11px;
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      text-align: left;
      transition: background 140ms ease, color 140ms ease;
    }

    .opt-nav-item:hover {
      background: var(--agi-ext-hover);
      color: var(--agi-ext-text);
    }

    .opt-nav-item.active {
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      font-weight: 600;
      box-shadow: inset 3px 0 0 var(--agi-ext-accent);
    }

    .opt-page {
      width: 100%;
      max-width: 1160px;
      margin: 0 auto;
      padding: 42px 48px 64px;
      gap: 22px;
    }

    .opt-header {
      justify-content: space-between;
      gap: 24px;
      padding: 0 2px 14px;
      border-bottom: 0;
    }

    .opt-header-title {
      font-size: 28px;
      font-weight: 650;
      letter-spacing: -0.035em;
    }

    .opt-header-sub {
      margin-top: 7px;
      font-size: 13px;
      line-height: 1.5;
    }

    .opt-header-account {
      min-height: 40px;
      padding: 0 15px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 11px;
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      cursor: pointer;
      white-space: nowrap;
      transition: background 140ms ease, border-color 140ms ease;
    }

    .opt-header-account:hover {
      border-color: color-mix(in srgb, var(--agi-ext-accent) 45%, var(--agi-ext-border));
      background: var(--agi-ext-hover);
    }

    .opt-section {
      scroll-margin-top: 72px;
      border-color: var(--agi-ext-border-strong);
      border-radius: 16px;
      background: color-mix(in srgb, var(--agi-ext-surface) 92%, var(--agi-ext-bg));
      box-shadow: 0 10px 30px color-mix(in srgb, black 5%, transparent);
    }

    .opt-section-header {
      padding: 19px 22px 15px;
      border-bottom-color: var(--agi-ext-border);
    }

    .opt-section-title {
      color: var(--agi-ext-text);
      font-size: 17px;
      font-weight: 620;
      letter-spacing: -0.02em;
      text-transform: none;
    }

    .opt-row {
      min-height: 68px;
      padding: 15px 22px;
      border-bottom-color: var(--agi-ext-border);
    }

    .opt-row-label { font-size: 13px; font-weight: 550; }
    .opt-row-hint { max-width: 680px; margin-top: 4px; font-size: 12px; line-height: 1.5; }

    .opt-toggle {
      width: 42px;
      height: 24px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 999px;
      background: var(--agi-ext-overlay);
    }

    .opt-toggle::after {
      width: 16px;
      height: 16px;
      top: 3px;
      left: 3px;
    }

    .opt-toggle:checked::after { transform: translateX(18px); }

    .opt-allowlist-body,
    .opt-bearer-body { padding: 17px 22px 20px; }

    .opt-allowlist-help,
    .opt-bearer-help { max-width: 720px; font-size: 12px; }

    .opt-allowlist-current-row { margin-top: 14px; }

    .opt-allowlist-item,
    kbd,
    .opt-field input,
    .opt-field textarea,
    .opt-field select,
    .opt-bearer-input {
      border-color: var(--agi-ext-border-strong);
      background: var(--agi-ext-bg);
    }

    .opt-allowlist-item { min-height: 38px; padding-inline: 12px; border-radius: 10px; }
    .opt-allowlist-toggle-btn,
    .opt-btn-danger,
    .opt-btn-primary {
      min-height: 36px;
      padding: 7px 14px;
      border-radius: 10px;
    }

    .opt-profile-grid {
      padding: 18px 22px;
      gap: 15px 18px;
    }

    .opt-field { gap: 7px; }
    .opt-field label { font-size: 11.5px; }
    .opt-field input,
    .opt-field textarea,
    .opt-field select,
    .opt-bearer-input {
      min-height: 40px;
      padding: 9px 11px;
      border-radius: 10px;
    }

    .opt-profile-actions { padding: 14px 22px 18px; }

    .opt-shortcuts-table td,
    .opt-shortcuts-table th {
      padding: 14px 22px;
      font-size: 12.5px;
    }

    kbd { min-width: 25px; padding: 3px 7px; border-radius: 7px; text-align: center; }
    .opt-link { font-size: 12px; text-decoration: none; }
    .opt-version { padding-top: 4px; opacity: 0.72; }

    @media (max-width: 900px) {
      .opt-shell { grid-template-columns: 204px minmax(0, 1fr); }
      .opt-page { padding: 34px 30px 52px; }
    }

    @media (max-width: 700px) {
      .opt-shell { display: block; }
      .opt-sidebar {
        position: sticky;
        z-index: 20;
        width: 100%;
        height: auto;
        flex-direction: row;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-right: 0;
        border-bottom: 1px solid var(--agi-ext-border);
        overflow: hidden;
      }
      .opt-brand { padding: 0 6px 0 0; }
      .opt-brand-name { display: none; }
      .opt-nav {
        flex: 1 1 auto;
        min-width: 0;
        flex-direction: row;
        gap: 4px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .opt-nav::-webkit-scrollbar { display: none; }
      .opt-nav-item { width: auto; min-height: 36px; padding-inline: 11px; white-space: nowrap; }
      .opt-nav-item.active { box-shadow: inset 0 -2px 0 var(--agi-ext-accent); }
      .opt-page { padding: 28px 16px 42px; }
      .opt-header { align-items: flex-start; }
      .opt-header-title { font-size: 23px; }
      .opt-header-account { min-height: 36px; padding-inline: 11px; }
      .opt-row,
      .opt-section-header,
      .opt-allowlist-body,
      .opt-bearer-body,
      .opt-profile-grid,
      .opt-profile-actions { padding-inline: 16px; }
    }

    @media (max-width: 420px) {
      .opt-sidebar {
        gap: 4px;
        padding-inline: 6px;
      }

      .opt-brand {
        flex: 0 0 22px;
        padding: 0;
      }

      .opt-brand-mark {
        width: 22px;
        height: 22px;
      }

      .opt-nav {
        gap: 1px;
      }

      .opt-nav-item {
        min-height: 34px;
        padding-inline: 5px;
        font-size: 10px;
        letter-spacing: -0.02em;
        text-align: center;
      }
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
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(SITE_ALLOWLIST_STORAGE_KEY, (result) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || 'Approved sites could not be read.'));
        return;
      }
      resolve(sanitizeApprovedSiteOrigins(result[SITE_ALLOWLIST_STORAGE_KEY]));
    });
  });
}

async function saveAllowlist(list: string[]): Promise<void> {
  await chrome.storage.local.set({
    [SITE_ALLOWLIST_STORAGE_KEY]: sanitizeApprovedSiteOrigins(list),
  });
}

// ── Build page ───────────────────────────────────────────────────────────────

function buildPage(): void {
  injectStyles();

  const shell = el('div', { class: 'opt-shell' });
  const sidebar = el('aside', { class: 'opt-sidebar', 'aria-label': 'Settings navigation' });
  const brand = el('div', { class: 'opt-brand' });
  brand.appendChild(
    el('img', {
      class: 'opt-brand-mark',
      src: chrome.runtime.getURL('icons/icon32.png'),
      alt: '',
      width: '28',
      height: '28',
    }),
  );
  brand.appendChild(el('span', { class: 'opt-brand-name' }, 'AGI'));
  sidebar.appendChild(brand);

  const nav = el('nav', { class: 'opt-nav' });
  const navItems: Array<{ label: string; target: string }> = [
    { label: 'Permissions', target: 'opt-permissions' },
    { label: 'Account', target: 'opt-account' },
    { label: 'Preferences', target: 'opt-preferences' },
    { label: 'Shortcuts', target: 'opt-shortcuts' },
    { label: 'Help', target: 'opt-help' },
  ];
  const navButtons: HTMLButtonElement[] = [];

  const scrollToSettingsSection = (target: string): void => {
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(target)
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const setActiveNavButton = (active: HTMLButtonElement): void => {
    for (const button of navButtons) {
      const selected = button === active;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    }
  };

  for (const [index, item] of navItems.entries()) {
    const navButton = el(
      'button',
      {
        class: `opt-nav-item${index === 0 ? ' active' : ''}`,
        type: 'button',
        'data-target': item.target,
        'aria-controls': item.target,
        ...(index === 0 ? { 'aria-current': 'location' } : {}),
      },
      item.label,
    ) as HTMLButtonElement;
    navButton.addEventListener('click', () => {
      scrollToSettingsSection(item.target);
      setActiveNavButton(navButton);
      navButton.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    });
    navButtons.push(navButton);
    nav.appendChild(navButton);
  }
  sidebar.appendChild(nav);

  const page = el('main', { class: 'opt-page' });

  // Header
  const header = el('div', { class: 'opt-header' });
  const headerText = el('div');
  headerText.appendChild(el('h1', { class: 'opt-header-title' }, 'AGI Chrome settings'));
  headerText.appendChild(
    el(
      'div',
      { class: 'opt-header-sub' },
      'Manage browser permissions, preferences, and account access.',
    ),
  );
  header.appendChild(headerText);
  const headerAccountButton = el(
    'button',
    { class: 'opt-header-account', type: 'button' },
    'Account',
  ) as HTMLButtonElement;
  headerAccountButton.addEventListener('click', () => {
    scrollToSettingsSection('opt-account');
  });
  header.appendChild(headerAccountButton);
  page.appendChild(header);

  // ── Section: Permissions ──────────────────────────────────────────────────

  const permSection = el('section', { class: 'opt-section', id: 'opt-permissions' });
  const permHeader = el('div', { class: 'opt-section-header' });
  permHeader.appendChild(el('h2', { class: 'opt-section-title' }, 'Permissions'));
  permSection.appendChild(permHeader);

  // Task notifications toggle
  const notifRow = el('div', { class: 'opt-row' });
  const notifLeft = el('div');
  notifLeft.appendChild(
    el('div', { class: 'opt-row-label', id: 'opt-notif-label' }, 'Task notifications'),
  );
  notifLeft.appendChild(
    el(
      'div',
      { class: 'opt-row-hint', id: 'opt-notif-description' },
      'Show a Chrome notification when a scheduled task fires.',
    ),
  );
  const notifStatus = el('div', {
    class: 'opt-row-hint',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  notifLeft.appendChild(notifStatus);
  notifRow.appendChild(notifLeft);

  const notifToggle = el('input', {
    type: 'checkbox',
    class: 'opt-toggle',
    id: 'opt-notif-toggle',
    'aria-labelledby': 'opt-notif-label',
    'aria-describedby': 'opt-notif-description',
  }) as HTMLInputElement;

  // Load saved preference (default true — matches user intent when they schedule tasks)
  chrome.storage.local.get({ agi_task_notifications: true }, (items) => {
    notifToggle.checked = items['agi_task_notifications'] !== false;
  });
  notifToggle.addEventListener('change', async () => {
    const next = notifToggle.checked;
    notifToggle.disabled = true;
    notifStatus.textContent = 'Saving…';
    try {
      await chrome.storage.local.set({ agi_task_notifications: next });
      notifStatus.textContent = next
        ? 'Task notifications enabled.'
        : 'Task notifications disabled.';
    } catch (err: unknown) {
      notifToggle.checked = !next;
      notifStatus.textContent = 'Could not save this preference. Please try again.';
      console.warn('[Options] Failed to save notif pref:', err);
    } finally {
      notifToggle.disabled = false;
    }
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
      'Approved origins can run AGI browser automation in their tab. The optional page assistant can also send up to 30,000 characters of redacted visible page text from an approved origin to AGI Managed Cloud. Add the current site, then reload it.',
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
  let currentSiteOrigin: string | null = null;
  currentRow.appendChild(currentOriginLabel);
  currentRow.appendChild(addBtn);
  allowlistBody.appendChild(currentRow);

  const allowlistUl = el('ul', { class: 'opt-allowlist-list', id: 'opt-allowlist-list' });
  const allowlistEmpty = el(
    'p',
    { class: 'opt-allowlist-empty', id: 'opt-allowlist-empty' },
    'No sites allowlisted yet.',
  );
  const allowlistStatus = el('p', {
    class: 'opt-save-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  allowlistBody.appendChild(allowlistUl);
  allowlistBody.appendChild(allowlistEmpty);
  allowlistBody.appendChild(allowlistStatus);

  function setAllowlistStatus(message: string, error = false): void {
    allowlistStatus.textContent = message;
    allowlistStatus.className = `opt-save-status${error ? ' error' : ''}`;
  }

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
        removeBtn.disabled = true;
        setAllowlistStatus(`Removing ${origin}…`);
        try {
          const list = await loadAllowlist();
          await saveAllowlist(list.filter((o) => o !== origin));
          await refreshAllowlist();
          setAllowlistStatus(`${origin} removed.`);
        } catch (error: unknown) {
          removeBtn.disabled = false;
          setAllowlistStatus(
            error instanceof Error ? error.message : 'Could not update approved sites.',
            true,
          );
        }
      });
      li.appendChild(originSpan);
      li.appendChild(removeBtn);
      allowlistUl.appendChild(li);
    }
    // Update add/remove button for the current origin
    const stored = await loadAllowlist();
    if (currentSiteOrigin) {
      const isAdded = stored.includes(currentSiteOrigin);
      addBtn.textContent = isAdded ? 'Remove' : 'Add';
      addBtn.className = isAdded ? 'opt-allowlist-toggle-btn remove' : 'opt-allowlist-toggle-btn';
      addBtn.disabled = false;
      addBtn.removeAttribute('title');
    } else {
      addBtn.textContent = 'Add';
      addBtn.className = 'opt-allowlist-toggle-btn';
      addBtn.disabled = true;
    }
  }

  // Populate the "current site" origin. The options page opens in its OWN
  // chrome-extension:// tab, so `{active, currentWindow}` would resolve to the
  // options page itself and Add would pollute the allowlist with the extension's
  // own origin. Query the active tab of every window and pick the first real
  // http(s) site instead — the page the user actually came from.
  //
  // `{active: true}` alone is not enough: with a SINGLE browser window the only
  // active tab IS this options page, it gets filtered out as chrome-extension://,
  // no site is found, and "Add" — the page's only site-permission control —
  // stays permanently disabled showing "—". Query every tab and fall back to the
  // most recently accessed http(s) one, which is the page the user came from.
  chrome.tabs.query({}, (tabs) => {
    currentSiteOrigin = selectApprovedSiteOrigin(tabs);
    if (currentSiteOrigin) {
      currentOriginLabel.textContent = currentSiteOrigin;
      addBtn.disabled = false;
    } else {
      // Explain the dash instead of leaving a dead control next to it.
      currentOriginLabel.textContent = 'No site open';
      addBtn.disabled = true;
      addBtn.title = 'Open a website in a tab, then reopen Options to approve it.';
    }
    void refreshAllowlist().catch((error: unknown) => {
      addBtn.disabled = true;
      setAllowlistStatus(
        error instanceof Error ? error.message : 'Approved sites could not be loaded.',
        true,
      );
    });
  });

  addBtn.addEventListener('click', async () => {
    const origin = normalizeApprovedSiteOrigin(currentSiteOrigin);
    if (!origin) return;
    addBtn.disabled = true;
    setAllowlistStatus('Saving approved sites…');
    try {
      const list = await loadAllowlist();
      const isAdded = list.includes(origin);
      if (isAdded) {
        await saveAllowlist(list.filter((o) => o !== origin));
      } else {
        list.push(origin);
        await saveAllowlist(list);
      }
      await refreshAllowlist();
      setAllowlistStatus(isAdded ? `${origin} removed.` : `${origin} approved.`);
    } catch (error: unknown) {
      addBtn.disabled = false;
      setAllowlistStatus(
        error instanceof Error ? error.message : 'Could not update approved sites.',
        true,
      );
    }
  });

  permSection.appendChild(allowlistBody);
  page.appendChild(permSection);

  // ── Section: Account ──────────────────────────────────────────────────────

  const accountSection = el('section', { class: 'opt-section', id: 'opt-account' });
  const accountHeader = el('div', { class: 'opt-section-header' });
  accountHeader.appendChild(el('h2', { class: 'opt-section-title' }, 'Account'));
  accountSection.appendChild(accountHeader);

  const renderAccountRow = (signedIn: boolean, unavailable = false, loading = false): void => {
    accountSection.querySelector('.opt-row')?.remove();
    const accountRow = el('div', { class: 'opt-row' });
    const accountLeft = el('div');

    // Resolve-in-progress: show a non-actionable row rather than asserting
    // "Sign in" at a user who is already signed in.
    if (loading) {
      accountLeft.appendChild(el('div', { class: 'opt-row-label' }, 'Account'));
      accountLeft.appendChild(el('div', { class: 'opt-row-hint' }, 'Checking your account…'));
      accountRow.appendChild(accountLeft);
      accountSection.appendChild(accountRow);
      return;
    }

    if (!signedIn) {
      accountLeft.appendChild(el('div', { class: 'opt-row-label' }, 'Sign in'));
      accountLeft.appendChild(
        el(
          'div',
          { class: 'opt-row-hint' },
          unavailable
            ? 'Account status is temporarily unavailable. Browser-local settings remain available.'
            : isClerkExtensionAuthConfigured()
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
      let signInAction: 'open' | 'check' = 'open';
      signInBtn.addEventListener('click', async () => {
        const action = signInAction;
        signInBtn.textContent = action === 'open' ? 'Opening…' : 'Checking…';
        signInBtn.disabled = true;
        try {
          if (action === 'open') {
            await openClerkSignIn();
            // Sign-in completes in another tab. Keep this one handler and
            // advance it to an explicit account re-check; stacking `onclick`
            // on top of this addEventListener made the second click perform
            // both actions at once.
            signInAction = 'check';
            signInBtn.textContent = 'Check sign-in';
            signInBtn.disabled = false;
            return;
          }

          await beginOptionsAccountRefresh(
            getAuthToken,
            ({ signedIn: s2, unavailable: u2, loading: l2 }) => renderAccountRow(s2, u2, l2),
          );
        } catch {
          signInBtn.textContent = action === 'open' ? 'Sign in' : 'Check sign-in';
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

  page.appendChild(accountSection);

  // ── Section: Autofill Profile ─────────────────────────────────────────────

  const profileSection = el('section', { class: 'opt-section', id: 'opt-preferences' });
  const profileHeader = el('div', { class: 'opt-section-header' });
  profileHeader.appendChild(el('h2', { class: 'opt-section-title' }, 'Autofill Profile'));
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
  const saveStatus = el(
    'span',
    {
      class: 'opt-save-status',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
    '',
  );
  profileActions.appendChild(saveProfileBtn);
  profileActions.appendChild(saveStatus);
  profileSection.appendChild(profileActions);
  let profileStatusTimer: ReturnType<typeof setTimeout> | null = null;

  // Load saved profile into inputs
  chrome.storage.local.get([AUTOFILL_PROFILE_KEY], (result) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      saveStatus.textContent = 'Could not load the saved profile.';
      saveStatus.className = 'opt-save-status error';
      return;
    }
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
    saveProfileBtn.disabled = true;
    if (profileStatusTimer !== null) {
      clearTimeout(profileStatusTimer);
      profileStatusTimer = null;
    }
    saveStatus.textContent = 'Saving…';
    saveStatus.className = 'opt-save-status';
    try {
      await chrome.storage.local.set({ [AUTOFILL_PROFILE_KEY]: profile });
      saveStatus.textContent = 'Saved';
      saveStatus.className = 'opt-save-status saved';
      profileStatusTimer = setTimeout(() => {
        saveStatus.textContent = '';
        saveStatus.className = 'opt-save-status';
        profileStatusTimer = null;
      }, 2000);
    } catch {
      saveStatus.textContent = 'Could not save this profile. Please try again.';
      saveStatus.className = 'opt-save-status error';
    } finally {
      saveProfileBtn.disabled = false;
    }
  });

  page.appendChild(profileSection);

  // Development-only escape hatch for local gateway testing. Production
  // bundles expose only the official Clerk Native API flow and never ask a
  // user to copy a session cookie out of DevTools.
  if (import.meta.env.DEV) {
    const bearerSection = el('section', { class: 'opt-section', id: 'opt-cloud-auth' });
    const bearerHeader = el('div', { class: 'opt-section-header' });
    bearerHeader.appendChild(el('h2', { class: 'opt-section-title' }, 'Computer Use — Cloud Auth'));
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

  const shortcutsSection = el('section', { class: 'opt-section', id: 'opt-shortcuts' });
  const shortcutsHeader = el('div', { class: 'opt-section-header' });
  shortcutsHeader.appendChild(el('h2', { class: 'opt-section-title' }, 'Keyboard Shortcuts'));
  shortcutsSection.appendChild(shortcutsHeader);

  const table = el('table', { class: 'opt-shortcuts-table' });
  const shortcutCaption = el(
    'caption',
    { class: 'opt-sr-only' },
    'Current Chrome keyboard shortcuts',
  );
  table.appendChild(shortcutCaption);
  const shortcutBody = document.createElement('tbody');
  table.appendChild(shortcutBody);
  const shortcutStatus = el(
    'p',
    {
      class: 'opt-save-status',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
    'Loading current shortcuts…',
  );
  const shortcutLabels: Readonly<Record<string, string>> = {
    _execute_action: 'Open side panel',
    capture_page: 'Capture page',
  };

  function appendShortcutRow(action: string, shortcut: string | undefined): void {
    const tr = document.createElement('tr');
    const tdAction = document.createElement('th');
    tdAction.scope = 'row';
    tdAction.textContent = action;
    const tdKeys = document.createElement('td');
    if (shortcut) {
      const keys = shortcut
        .split('+')
        .map((key) => key.trim())
        .filter(Boolean);
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
    } else {
      tdKeys.textContent = 'Not assigned';
    }
    tr.appendChild(tdAction);
    tr.appendChild(tdKeys);
    shortcutBody.appendChild(tr);
  }

  chrome.commands.getAll((commands) => {
    const runtimeError = chrome.runtime.lastError;
    shortcutBody.replaceChildren();
    if (runtimeError) {
      shortcutStatus.textContent = 'Current Chrome shortcuts could not be loaded.';
      shortcutStatus.className = 'opt-save-status error';
      return;
    }
    const commandByName = new Map(commands.map((command) => [command.name ?? '', command]));
    for (const [name, label] of Object.entries(shortcutLabels)) {
      appendShortcutRow(label, commandByName.get(name)?.shortcut);
    }
    shortcutStatus.textContent =
      'Change these bindings from Chrome’s Extensions → Keyboard shortcuts page.';
  });
  shortcutsSection.appendChild(table);
  shortcutsSection.appendChild(shortcutStatus);
  page.appendChild(shortcutsSection);

  // ── Section: Help ─────────────────────────────────────────────────────────
  //
  // The extension had no help affordance at all — neither the side panel nor
  // this page offered a route to documentation or support, so a stuck user's
  // only exit was to guess the marketing site. Every destination below is a
  // route that exists in `apps/web/app` today; do not add one that does not.

  const helpSection = el('section', { class: 'opt-section', id: 'opt-help' });
  const helpHeader = el('div', { class: 'opt-section-header' });
  helpHeader.appendChild(el('h2', { class: 'opt-section-title' }, 'Help'));
  helpSection.appendChild(helpHeader);

  const HELP_LINKS: Array<{ label: string; hint: string; path: string; cta: string }> = [
    {
      label: 'Help center',
      hint: 'Answers to the questions people ask most.',
      path: '/help',
      cta: 'Open',
    },
    {
      label: 'Documentation',
      hint: 'Guides for every surface, including this extension.',
      path: '/docs',
      cta: 'Open',
    },
    {
      label: 'Contact support',
      hint: 'Reach a person about your account.',
      path: '/support',
      cta: 'Open',
    },
  ];

  for (const link of HELP_LINKS) {
    const row = el('div', { class: 'opt-row' });
    const left = el('div');
    left.appendChild(el('div', { class: 'opt-row-label' }, link.label));
    left.appendChild(el('div', { class: 'opt-row-hint' }, link.hint));
    row.appendChild(left);
    row.appendChild(
      el(
        'a',
        {
          class: 'opt-link',
          href: `https://agiworkforce.com${link.path}?from=chrome-extension`,
          target: '_blank',
          rel: 'noreferrer noopener',
        },
        link.cta,
      ),
    );
    helpSection.appendChild(row);
  }

  page.appendChild(helpSection);

  // Version footer
  const ver = chrome.runtime.getManifest().version;
  page.appendChild(el('p', { class: 'opt-version' }, `AGI v${ver}`));

  shell.appendChild(sidebar);
  shell.appendChild(page);
  document.body.appendChild(shell);

  if (typeof IntersectionObserver === 'function') {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const activeTarget = visible.target.id;
        for (const button of navButtons) {
          const selected = button.dataset['target'] === activeTarget;
          button.classList.toggle('active', selected);
          if (selected) button.setAttribute('aria-current', 'location');
          else button.removeAttribute('aria-current');
        }
      },
      { rootMargin: '-18% 0px -65% 0px', threshold: [0, 0.25, 0.6] },
    );
    for (const item of navItems) {
      const section = document.getElementById(item.target);
      if (section) sectionObserver.observe(section);
    }
  }
  void beginOptionsAccountRefresh(
    getAuthToken,
    ({ signedIn, unavailable, loading }) => renderAccountRow(signedIn, unavailable, loading),
    () => console.warn('[Options] AGI account status is temporarily unavailable'),
  );
}

buildPage();
