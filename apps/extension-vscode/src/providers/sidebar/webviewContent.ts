/**
 * webviewContent.ts — Static HTML/CSS/JS template for the sidebar and chat-editor webviews.
 *
 * Extracted from sidebarProvider.ts so both SidebarProvider and ChatEditorPanel
 * can share the same rendering helpers without a circular dependency.
 */

import * as vscode from 'vscode';
import { MODEL_PICKER_OPTIONS } from '../../services/modelConstants';
import { AGENT_MODE_LABEL, EFFORT_LABEL, type AgentMode, type Effort } from '@agiworkforce/types';
import { agiVsCodeCssVars, cssVarsToString } from '@agiworkforce/design-tokens';

// ─── HTML helpers ─────────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Cryptographically-random nonce for the webview CSP.
 * Math.random() is a predictable PRNG — this uses Node's CSPRNG.
 * 24 bytes → 32 base64url chars.
 */
export function getNonce(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(24).toString('base64url');
}

/**
 * Generates the webview HTML.
 * Colors adapt to the active VS Code theme via --vscode-* variables with
 * AGI palette fallbacks (dark defaults). Light/HC themes work automatically.
 */
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
  initialMode: AgentMode,
  initialEffort: Effort,
  supportsEffort: boolean,
  meterCollapsed: boolean,
): string {
  // Build CSP-safe URIs for any local assets we might need
  const cspSource = webview.cspSource;
  const modelOptionsHtml = MODEL_PICKER_OPTIONS.map(
    (option) => `<option value="${option.id}">${escapeHtml(option.label)}</option>`,
  ).join('');
  const modeLabel = escapeHtml(AGENT_MODE_LABEL[initialMode]);
  const effortLabel = escapeHtml(EFFORT_LABEL[initialEffort]);
  const effortHidden = supportsEffort ? '' : ' style="display:none"';

  // Codicon font — copied to out/codicons/ by esbuild.js so it's included in the VSIX.
  const codiconCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'codicons', 'codicon.css'),
  );

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'nonce-${nonce}' ${cspSource};
             script-src 'nonce-${nonce}';
             img-src ${cspSource} https: data:;
             font-src ${cspSource};" />
  <title>AGI Workforce</title>
  <link rel="stylesheet" href="${codiconCssUri}" />
  <style nonce="${nonce}">
    :root {
      /* VS Code theme variables with AGI dark-mode fallbacks */
      ${cssVarsToString(agiVsCodeCssVars)}
      --bg-base: var(--agi-vscode-bg);
      --bg-elevated: var(--agi-vscode-surface);
      --bg-overlay: var(--agi-vscode-overlay);
      --accent-teal: var(--agi-vscode-button);
      --accent-terra: var(--agi-vscode-terra);
      --text-primary: var(--agi-vscode-text);
      --text-secondary: var(--agi-vscode-text-muted);
      --border: var(--agi-vscode-border);
      --radius-md: 8px;
      --radius-lg: 12px;
      --transition: cubic-bezier(0.16, 1, 0.3, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-base);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-elevated);
      flex-shrink: 0;
    }

    .header-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent-teal);
      letter-spacing: 0.3px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .provider-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.3px;
      padding: 2px 7px 2px 5px;
      border-radius: 10px;
      color: rgba(0, 0, 0, 0.75);
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.25s ease;
    }

    .provider-badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.4);
      flex-shrink: 0;
    }

    .header-actions {
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 14px;
      transition: color 0.15s var(--transition),
                  background 0.15s var(--transition);
    }
    .icon-btn:hover {
      color: var(--text-primary);
      background: var(--bg-overlay);
    }

    /* ── Messages ── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }

    #messages::-webkit-scrollbar { width: 4px; }
    #messages::-webkit-scrollbar-track { background: transparent; }
    #messages::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 2px;
    }

    .message {
      max-width: 100%;
      padding: 9px 12px;
      border-radius: var(--radius-md);
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message.user {
      background: var(--bg-overlay);
      align-self: flex-end;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .message.assistant {
      background: transparent;
      align-self: flex-start;
      color: var(--text-primary);
      border-left: 2px solid var(--accent-teal);
      padding-left: 10px;
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
    }

    .message.error {
      background: var(--agi-vscode-danger-bg);
      border: 1px solid var(--agi-vscode-danger-border);
      color: var(--agi-vscode-danger);
      align-self: stretch;
    }

    .message.system {
      text-align: center;
      color: var(--text-secondary);
      font-size: 11px;
      background: none;
      padding: 4px 0;
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 6px 0;
    }

    .typing-dot {
      width: 6px;
      height: 6px;
      background: var(--accent-teal);
      border-radius: 50%;
      animation: typing 1.2s ease-in-out infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }

    /* ── API key prompt ── */
    .api-key-banner {
      background: rgba(33, 128, 141, 0.12);
      border: 1px solid rgba(33, 128, 141, 0.3);
      border-radius: var(--radius-md);
      padding: 12px;
      text-align: center;
      margin: 12px;
      flex-shrink: 0;
    }

    .api-key-banner p {
      color: var(--text-secondary);
      margin-bottom: 10px;
      font-size: 12px;
      line-height: 1.5;
    }

    .api-key-input-row {
      display: flex;
      gap: 6px;
    }

    .api-key-input {
      flex: 1;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 12px;
      padding: 6px 10px;
      transition: border-color 0.15s;
    }
    .api-key-input:focus-visible {
      outline: 2px solid var(--agi-vscode-focus);
      outline-offset: 2px;
      border-color: var(--accent-teal);
    }

    .save-key-btn {
      background: var(--accent-teal);
      border: none;
      border-radius: 6px;
      color: var(--agi-vscode-button-text);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      transition: opacity 0.15s;
    }
    .save-key-btn:hover { opacity: 0.85; }

    /* ── Input area / composer (design-spec §7) ── */
    .input-area {
      background: var(--bg-base);
      padding: 8px 10px 10px;
      display: flex;
      flex-direction: column;
      gap: 0;
      flex-shrink: 0;
      position: relative;
    }

    /* Outer rounded composer card */
    .composer-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      overflow: visible;
      transition: border-color 0.15s var(--transition),
                  box-shadow 0.15s var(--transition);
    }
    .composer-card:focus-within {
      border-color: var(--accent-teal);
      box-shadow: 0 0 0 2px rgba(33, 128, 141, 0.18);
    }

    .model-row { display: none; } /* hidden — model is now in bottom controls row */

    .input-row {
      display: flex;
      gap: 0;
      align-items: flex-end;
      padding: 8px 10px 0;
    }

    #userInput {
      flex: 1;
      background: transparent;
      border: 0;
      outline: 0;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.5;
      min-height: 28px;
      max-height: 140px;
      padding: 0;
      resize: none;
    }
    #userInput::placeholder { color: var(--text-secondary); opacity: 0.7; }

    /* ── Bottom controls row ── */
    .composer-bottom {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px 6px;
    }

    /* Plus button */
    .plus-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 16px;
      height: 26px;
      width: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.12s var(--transition), color 0.12s var(--transition);
      line-height: 1;
    }
    .plus-btn:hover { background: var(--bg-overlay); color: var(--text-primary); }

    /* Model picker pill */
    .model-pill {
      background: var(--bg-overlay);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 10px;
      font-weight: 500;
      padding: 2px 7px;
      white-space: nowrap;
      max-width: 110px;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.12s var(--transition), color 0.12s var(--transition);
    }
    .model-pill:hover { background: var(--bg-overlay); color: var(--text-primary); }

    #sendBtn {
      background: var(--accent-terra);
      border: none;
      border-radius: 50%;
      color: var(--agi-vscode-button-text);
      cursor: pointer;
      font-size: 14px;
      height: 26px;
      width: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: auto;
      transition: opacity 0.15s var(--transition),
                  transform 0.1s var(--transition);
    }
    #sendBtn:hover:not(:disabled) { opacity: 0.88; transform: scale(1.05); }
    #sendBtn:disabled { opacity: 0.35; cursor: not-allowed; }
    #sendBtn.streaming { background: var(--bg-overlay); border: 1px solid var(--border); }

    /* Stop square icon when streaming */
    #sendBtn.streaming::before {
      content: '■';
      font-size: 10px;
    }
    /* Arrow icon when idle */
    #sendBtn:not(.streaming)::before {
      content: '↑';
      font-size: 14px;
      font-weight: 700;
    }

    /* ── Plus-menu popover ── */
    .plus-menu {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 10px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      min-width: 200px;
      z-index: 20;
      overflow: hidden;
    }
    .plus-menu.open { display: block; }

    .plus-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.1s;
    }
    .plus-menu-item:hover { background: var(--bg-overlay); color: var(--text-primary); }
    .plus-menu-item .pm-icon { font-size: 13px; flex-shrink: 0; }

    /* ── Code blocks ── */
    pre { background: #0d0d0d; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px; overflow-x: auto; margin: 8px 0; }
    code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 12px; }
    pre code { color: #e6edf3; }
    :not(pre) > code { background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 3px; color: #79c0ff; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    del { text-decoration: line-through; opacity: 0.6; }
    h2, h3, h4 { margin: 8px 0 4px; font-weight: 600; }
    h2 { font-size: 16px; } h3 { font-size: 14px; } h4 { font-size: 13px; }
    hr { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
    li { margin-left: 16px; list-style: disc; }
    blockquote { border-left: 2px solid var(--accent-teal); padding-left: 8px; color: var(--text-secondary); margin: 6px 0; }
    .code-block-wrapper { position: relative; margin: 8px 0; }
    .code-block-wrapper pre { margin: 0; }
    .code-lang { position: absolute; top: 4px; left: 8px; font-size: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
    .copy-btn { position: absolute; top: 4px; right: 4px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--text-secondary); font-size: 11px; padding: 2px 8px; cursor: pointer; opacity: 0; transition: opacity 0.15s; }
    .code-block-wrapper:hover .copy-btn { opacity: 1; }
    .copy-btn:hover { background: rgba(255,255,255,0.15); color: var(--text-primary); }

    /* ── Composer controls row (mode chip + effort chip + model chip) ── */
    .composer-controls {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }

    .mode-chip, .effort-chip, .model-chip {
      background: var(--bg-overlay);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 9px;
      transition: color 0.15s var(--transition),
                  background 0.15s var(--transition),
                  border-color 0.15s var(--transition);
      white-space: nowrap;
    }
    .mode-chip:hover, .effort-chip:hover, .model-chip:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .mode-chip.active {
      border-color: var(--accent-teal);
      color: var(--accent-teal);
    }

    .chip-separator {
      flex: 1;
    }

    /* ── Usage meter banner ── */
    .usage-meter-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-secondary);
      flex-shrink: 0;
      min-height: 30px;
      transition: background 0.15s var(--transition);
    }

    .usage-meter-banner.warn {
      background: rgba(218, 119, 86, 0.08);
      border-bottom-color: rgba(218, 119, 86, 0.2);
    }

    .usage-meter-collapsed {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 12px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .usage-meter-bar-wrap {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .usage-progress {
      flex: 1;
      height: 4px;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      overflow: hidden;
    }

    .usage-progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s var(--transition), background 0.4s var(--transition);
    }

    .usage-text {
      white-space: nowrap;
      flex-shrink: 0;
    }

    .usage-reset {
      white-space: nowrap;
      color: var(--text-secondary);
      opacity: 0.7;
      flex-shrink: 0;
    }

    .upgrade-btn {
      background: var(--accent-terra);
      border: none;
      border-radius: 8px;
      color: var(--agi-vscode-button-text);
      cursor: pointer;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
      padding: 2px 8px;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }
    .upgrade-btn:hover { opacity: 0.85; }

    .meter-dismiss-btn, .meter-restore-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 11px;
      padding: 0 2px;
      line-height: 1;
      transition: color 0.12s;
      flex-shrink: 0;
    }
    .meter-dismiss-btn:hover, .meter-restore-btn:hover { color: var(--text-primary); }

    .byok-icon, .local-icon {
      font-size: 12px;
      flex-shrink: 0;
    }

    /* ── @mention dropdown ── */
    .input-wrapper { position: relative; flex: 1; }
    .mention-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      max-height: 180px;
      overflow-y: auto;
      display: none;
      z-index: 10;
      margin-bottom: 4px;
    }
    .mention-dropdown.visible { display: block; }
    .mention-item {
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mention-item.selected, .mention-item:hover {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }

    /* ── Inline tool-call (design-spec §4) ── */
    .tool-call-stack {
      border-left: 1px solid var(--border);
      padding-left: 12px;
      margin-left: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 4px;
    }

    .tool-call {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .tool-call__bar {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 4px;
      cursor: pointer;
      user-select: none;
      border-radius: 6px;
      transition: background 120ms ease;
      color: var(--text-secondary);
      font-size: 12px;
    }
    .tool-call__bar:hover { background: var(--bg-overlay); }

    .tool-call__icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1;
    }
    .tool-call--pending .tool-call__icon { animation: tool-spin 1s linear infinite; }
    @keyframes tool-spin { to { transform: rotate(360deg); } }

    .tool-call--error .tool-call__bar { color: var(--agi-vscode-danger); }
    .tool-call--error .tool-call__icon { color: var(--agi-vscode-danger); }

    .tool-call__label { font-weight: 400; color: var(--text-secondary); flex-shrink: 0; }

    .tool-call__summary {
      color: var(--text-secondary);
      font-size: 11px;
      margin-left: 4px;
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.7;
    }

    .tool-call__chevron {
      width: 12px;
      height: 12px;
      color: var(--text-secondary);
      margin-left: auto;
      transition: transform 160ms ease;
      font-size: 10px;
      opacity: 0.6;
    }
    .tool-call--open .tool-call__chevron { transform: rotate(90deg); }

    .tool-call__body {
      display: none;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 11px;
      color: var(--text-primary);
      overflow-x: auto;
      max-height: 320px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin-left: 22px;
    }
    .tool-call--open .tool-call__body { display: block; }

    .tool-call-done {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
      padding: 2px 4px;
      margin-left: 8px;
      opacity: 0.8;
    }

    /* ── Empty state (design-spec §8) ── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 24px 12px 12px;
      text-align: center;
    }

    .empty-state-headline {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
      line-height: 1.4;
    }

    .prompt-chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px;
    }

    .prompt-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 30px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--bg-elevated);
      color: var(--text-secondary);
      font-size: 11px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .prompt-chip:hover { background: var(--bg-overlay); color: var(--text-primary); }
  </style>
</head>
<body>

  <!-- ── Header ── -->
  <div class="header">
    <div class="header-left">
      <span class="header-title">AGI Workforce</span>
      <span class="provider-badge" id="providerBadge" style="display:none">
        <span class="provider-badge-dot" id="providerBadgeDot"></span>
        <span id="providerBadgeText"></span>
      </span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="actionsBtn" title="Actions">≡</button>
    </div>
  </div>

  <!-- ── Usage meter banner ── -->
  <div class="usage-meter-banner" id="usageMeterBanner" style="display:none">
    <span class="byok-icon codicon codicon-key" id="meterByokIcon" style="display:none" aria-hidden="true"></span>
    <span class="local-icon codicon codicon-vm" id="meterLocalIcon" style="display:none" aria-hidden="true"></span>
    <div class="usage-meter-bar-wrap" id="meterBarWrap" style="display:none">
      <div class="usage-progress">
        <div class="usage-progress-fill" id="meterFill" style="width:0%;background:var(--agi-vscode-button)"></div>
      </div>
    </div>
    <span class="usage-text" id="meterText"></span>
    <span class="usage-reset" id="meterReset"></span>
    <button class="upgrade-btn" id="upgradeBtn" style="display:none">Upgrade</button>
    <button class="meter-dismiss-btn" id="meterDismissBtn" title="Collapse meter">&#215;</button>
  </div>
  <!-- ── Usage meter collapsed pill ── -->
  <div class="usage-meter-collapsed" id="usageMeterCollapsed" style="display:none">
    <button class="meter-restore-btn" id="meterRestoreBtn" title="Show usage meter">&#9660; Usage</button>
  </div>

  <!-- ── API key banner (hidden when key is present) ── -->
  <div class="api-key-banner" id="apiKeyBanner" style="display:none">
    <p>Enter your AGI Workforce API key to start chatting.<br/>
       Get one at <strong>agiworkforce.com</strong></p>
    <div class="api-key-input-row">
      <input type="password" class="api-key-input" id="apiKeyInput"
             placeholder="sk-agi-…" autocomplete="off" spellcheck="false" />
      <button class="save-key-btn" id="saveKeyBtn">Save</button>
    </div>
  </div>

  <!-- ── Messages ── -->
  <div id="messages">
    <div class="empty-state" id="emptyState">
      <div class="empty-state-headline">Ask about your code</div>
      <div class="prompt-chips">
        <button class="prompt-chip" data-prompt="/explain selected code">&lt;/&gt; Explain</button>
        <button class="prompt-chip" data-prompt="/fix ">&gt;_ Fix</button>
        <button class="prompt-chip" data-prompt="/tests ">&#10003; Tests</button>
      </div>
    </div>
  </div>

  <!-- ── Input ── -->
  <div class="input-area">
    <!-- Hidden model select (keeps JS working; pill shows selected label) -->
    <select class="model-row" id="modelSelect" aria-label="Model" style="display:none">
      ${modelOptionsHtml}
    </select>

    <!-- Plus-menu popover -->
    <div class="plus-menu" id="plusMenu" role="menu" aria-label="Attach or use tools">
      <div class="plus-menu-item" id="plusMenuUpload" role="menuitem" tabindex="0">
        <span class="pm-icon codicon codicon-file-add" aria-hidden="true"></span>&nbsp;Add file or image
      </div>
      <div class="plus-menu-item" id="plusMenuPlanMode" role="menuitem" tabindex="0">
        <span class="pm-icon codicon codicon-checklist" aria-hidden="true"></span>&nbsp;Plan mode
      </div>
    </div>

    <!-- Composer card -->
    <div class="composer-card">
      <div class="input-row">
        <div class="input-wrapper">
          <div class="mention-dropdown" id="mentionDropdown"></div>
          <textarea
            id="userInput"
            placeholder="Ask about your code…"
            rows="1"
            spellcheck="true"
            aria-label="Chat input"
          ></textarea>
        </div>
      </div>
      <div class="composer-bottom">
        <button class="plus-btn" id="plusBtn" title="Attach or use tools" aria-haspopup="true" aria-expanded="false">+</button>
        <button class="model-pill" id="modelPill" title="Switch model">${escapeHtml(MODEL_PICKER_OPTIONS[0]?.label ?? 'Model')}</button>
        <button class="mode-chip" id="modeChip" title="Agent mode">${modeLabel}</button>
        <button class="effort-chip" id="effortChip" title="Reasoning effort"${effortHidden}>${effortLabel}</button>
        <button id="sendBtn" title="Send (Cmd+Enter)" aria-label="Send"></button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const messagesEl = document.getElementById('messages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const modelSelect = document.getElementById('modelSelect');
    const modelPill = document.getElementById('modelPill');
    const plusBtn = document.getElementById('plusBtn');
    const plusMenu = document.getElementById('plusMenu');
    const apiKeyBanner = document.getElementById('apiKeyBanner');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const actionsBtn = document.getElementById('actionsBtn');
    const mentionDropdown = document.getElementById('mentionDropdown');
    const providerBadgeEl = document.getElementById('providerBadge');
    const providerBadgeDotEl = document.getElementById('providerBadgeDot');
    const providerBadgeTextEl = document.getElementById('providerBadgeText');
    const modeChip = document.getElementById('modeChip');
    const effortChip = document.getElementById('effortChip');

    // ── Usage meter DOM refs ──────────────────────────────────────────────────
    const usageMeterBanner = document.getElementById('usageMeterBanner');
    const usageMeterCollapsed = document.getElementById('usageMeterCollapsed');
    const meterFill = document.getElementById('meterFill');
    const meterText = document.getElementById('meterText');
    const meterReset = document.getElementById('meterReset');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const meterDismissBtn = document.getElementById('meterDismissBtn');
    const meterRestoreBtn = document.getElementById('meterRestoreBtn');
    const meterBarWrap = document.getElementById('meterBarWrap');
    const meterByokIcon = document.getElementById('meterByokIcon');
    const meterLocalIcon = document.getElementById('meterLocalIcon');

    // Initial collapsed state (injected by extension host)
    var meterCollapsed = ${meterCollapsed ? 'true' : 'false'};

    // ── Provider badge helper ─────────────────────────────────────────────────
    function updateProviderBadge(providerLabel, brandColor) {
      if (!providerBadgeEl || !providerBadgeDotEl || !providerBadgeTextEl) return;
      providerBadgeEl.style.background = brandColor;
      providerBadgeDotEl.style.background = 'rgba(0,0,0,0.35)';
      providerBadgeTextEl.textContent = providerLabel;
      providerBadgeEl.style.display = 'inline-flex';
    }

    // ── Usage meter helpers ───────────────────────────────────────────────────
    function applyMeterCollapsed(collapsed) {
      meterCollapsed = collapsed;
      if (!usageMeterBanner || !usageMeterCollapsed) return;
      if (collapsed) {
        usageMeterBanner.style.display = 'none';
        usageMeterCollapsed.style.display = 'flex';
      } else {
        usageMeterCollapsed.style.display = 'none';
        // banner display is controlled by renderUsageMeter; show it
        usageMeterBanner.style.display = 'flex';
      }
    }

    function renderUsageMeter(payload) {
      if (!usageMeterBanner || !meterFill || !meterText || !meterReset || !upgradeBtn ||
          !meterBarWrap || !meterByokIcon || !meterLocalIcon) return;

      // Reset all conditional elements
      meterByokIcon.style.display = 'none';
      meterLocalIcon.style.display = 'none';
      meterBarWrap.style.display = 'none';
      upgradeBtn.style.display = 'none';
      usageMeterBanner.classList.remove('warn');

      if (payload.source === 'unbounded') {
        meterLocalIcon.style.display = 'inline';
        meterText.textContent = 'Local model — no quota tracking';
        meterReset.textContent = '';
      } else if (payload.source === 'user-api-key') {
        meterByokIcon.style.display = 'inline';
        meterText.textContent = 'Using your own API key — no usage limit from us';
        meterReset.textContent = '';
      } else {
        // managed-plan
        meterBarWrap.style.display = 'flex';
        var pct = payload.remaining !== null ? payload.remaining * 100 : 100;
        var usedPct = 100 - pct;
        var fillColor = pct < 20 ? 'var(--agi-vscode-terra)' : pct < 40 ? 'var(--vscode-editorWarning-foreground, #f59e0b)' : 'var(--agi-vscode-button)';
        meterFill.style.width = Math.max(0, Math.min(100, usedPct)) + '%';
        meterFill.style.background = fillColor;
        meterText.textContent = 'Usage: ' + (payload.usageLabel || '');
        meterReset.textContent = payload.resetsIn ? '· ' + payload.resetsIn : '';
        if (payload.showUpgrade) {
          upgradeBtn.style.display = 'inline-block';
          usageMeterBanner.classList.add('warn');
        }
      }

      // Apply collapsed state without hiding the banner if it should be visible
      if (meterCollapsed) {
        usageMeterBanner.style.display = 'none';
        usageMeterCollapsed.style.display = 'flex';
      } else {
        usageMeterBanner.style.display = 'flex';
        usageMeterCollapsed.style.display = 'none';
      }
    }

    // Dismiss (collapse) button
    if (meterDismissBtn) {
      meterDismissBtn.addEventListener('click', function() {
        applyMeterCollapsed(true);
        vscode.postMessage({ type: 'dismissUsageMeter' });
      });
    }

    // Restore (expand) button
    if (meterRestoreBtn) {
      meterRestoreBtn.addEventListener('click', function() {
        applyMeterCollapsed(false);
        vscode.postMessage({ type: 'restoreUsageMeter' });
      });
    }

    // Upgrade button — opens pricing page via extension host
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'upgradeClicked' });
      });
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let streaming = false;
    let mentionIndex = -1;
    let mentionStart = -1;
    let currentAssistantEl = null;
    let accumulatedContent = '';

    // ── Helpers ───────────────────────────────────────────────────────────────
    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function showTyping() {
      const div = document.createElement('div');
      div.className = 'typing-indicator';
      div.id = 'typingIndicator';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        div.appendChild(dot);
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
      const el = document.getElementById('typingIndicator');
      if (el) el.remove();
    }

    function setStreaming(value) {
      streaming = value;
      sendBtn.disabled = false;
      sendBtn.classList.toggle('streaming', value);
      userInput.disabled = value;
    }

    function autoResize() {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
    }

    // ── Markdown rendering ────────────────────────────────────────────────
    function renderMarkdown(text) {
      var bt = String.fromCharCode(96); // backtick char
      var bt3 = bt + bt + bt;
      var star = String.fromCharCode(42); // asterisk char
      // Escape HTML entities first (DOMPurify-lite approach)
      var html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      // Fenced code blocks with language label + copy button
      var codeBlockRe = new RegExp(bt3 + '(\\\\w*)?\\\\n([\\\\s\\\\S]*?)' + bt3, 'g');
      html = html.replace(codeBlockRe, function(m, lang, code) {
        var langLabel = lang ? '<span class="code-lang">' + lang + '</span>' : '';
        var copyBtn = '<button class="copy-btn" onclick="copyCode(this)" title="Copy">Copy</button>';
        return '<div class="code-block-wrapper">' + langLabel + copyBtn + '<pre><code>' + code.replace(/\\n$/, '') + '</code></pre></div>';
      });

      // Inline code
      var inlineCodeRe = new RegExp(bt + '([^' + bt + ']+?)' + bt, 'g');
      html = html.replace(inlineCodeRe, '<code>$1</code>');

      // Bold
      var boldRe = new RegExp(star + star + '(.+?)' + star + star, 'g');
      html = html.replace(boldRe, '<strong>$1</strong>');

      // Italic
      var italicRe = new RegExp(star + '(.+?)' + star, 'g');
      html = html.replace(italicRe, '<em>$1</em>');

      // Strikethrough
      html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

      // Headers
      html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
      html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

      // Horizontal rules
      html = html.replace(/^---$/gm, '<hr>');

      // Unordered lists
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

      // Block quotes
      html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

      // Newlines to <br> (but not inside code blocks)
      var splitRe = new RegExp('(<(?:pre|div class="code-block-wrapper")[\\\\s\\\\S]*?<\\\\/(?:pre|div)>)', 'g');
      var parts = html.split(splitRe);
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('<pre') && !parts[i].startsWith('<div class="code-block')) {
          parts[i] = parts[i].replace(/\\n/g, '<br>');
        }
      }
      html = parts.join('');

      return html;
    }

    // Copy code to clipboard
    function copyCode(btn) {
      var pre = btn.parentElement.querySelector('pre code');
      if (pre) {
        var text = pre.textContent || '';
        navigator.clipboard.writeText(text).then(function() {
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
        }).catch(function() {
          btn.textContent = 'Failed';
          setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
        });
      }
    }

    // ── HTML sanitizer (defense-in-depth for innerHTML) ──────────────────
    // VSCODE-05: extended to strip dangerous URI schemes from href/src/action.
    // Blocked schemes: command:, javascript:, vscode-resource:, data:
    // Allowed schemes: https:, http:, mailto:
    var SAFE_HREF_RE = /^(https?:|mailto:)/i;
    function sanitizeHtml(html) {
      var div = document.createElement('div');
      div.innerHTML = html;
      // Remove dangerous elements
      var dangerous = div.querySelectorAll('script,style,iframe,object,embed,form,link,meta,base');
      for (var i = 0; i < dangerous.length; i++) { dangerous[i].remove(); }
      // Process all remaining elements
      var all = div.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) {
        var el = all[j];
        var attrs = Array.from(el.attributes);
        for (var k = 0; k < attrs.length; k++) {
          var attrName = attrs[k].name.toLowerCase();
          var attrVal = attrs[k].value;
          // Remove event handler attributes (on*)
          if (/^on/i.test(attrName)) {
            el.removeAttribute(attrs[k].name);
            continue;
          }
          // VSCODE-05: sanitize URI-bearing attributes — href, src, action, formaction
          if (attrName === 'href' || attrName === 'src' || attrName === 'action' || attrName === 'formaction') {
            var trimmed = attrVal.trim();
            // Allow only safe schemes; strip everything else
            if (trimmed.length > 0 && !SAFE_HREF_RE.test(trimmed)) {
              el.removeAttribute(attrs[k].name);
            }
          }
        }
        // VSCODE-05: strip srcdoc from any element (mutation-XSS vector)
        if (el.hasAttribute('srcdoc')) {
          el.removeAttribute('srcdoc');
        }
      }
      return div.innerHTML;
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    function sendMessage() {
      if (streaming) {
        // Stop button — signal cancellation
        vscode.postMessage({ type: 'cancel' });
        return;
      }

      const text = userInput.value.trim();
      if (!text) return;

      hideEmptyState();
      addMessage('user', text);
      userInput.value = '';
      userInput.style.height = 'auto';

      showTyping();
      setStreaming(true);
      currentAssistantEl = null;
      accumulatedContent = '';

      vscode.postMessage({
        type: 'sendMessage',
        payload: { text, model: modelSelect.value }
      });
    }

    // ── Event listeners ───────────────────────────────────────────────────────
    sendBtn.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', (e) => {
      // @mention dropdown navigation
      if (mentionDropdown.classList.contains('visible')) {
        var items = mentionDropdown.querySelectorAll('.mention-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (mentionIndex < items.length - 1) {
            if (items[mentionIndex]) items[mentionIndex].classList.remove('selected');
            mentionIndex++;
            if (items[mentionIndex]) { items[mentionIndex].classList.add('selected'); items[mentionIndex].scrollIntoView({ block: 'nearest' }); }
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (mentionIndex > 0) {
            if (items[mentionIndex]) items[mentionIndex].classList.remove('selected');
            mentionIndex--;
            if (items[mentionIndex]) { items[mentionIndex].classList.add('selected'); items[mentionIndex].scrollIntoView({ block: 'nearest' }); }
          }
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          var sel = items[mentionIndex];
          if (sel) insertMention(sel.textContent);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          hideMentionDropdown();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    userInput.addEventListener('input', function() { autoResize(); detectMention(); });

    actionsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openActionSheet' });
    });

    // ── Plus-menu toggle ──────────────────────────────────────────────────────
    if (plusBtn && plusMenu) {
      plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        var isOpen = plusMenu.classList.contains('open');
        plusMenu.classList.toggle('open', !isOpen);
        plusBtn.setAttribute('aria-expanded', String(!isOpen));
      });
      document.addEventListener('click', () => {
        plusMenu.classList.remove('open');
        plusBtn.setAttribute('aria-expanded', 'false');
      });
      // "Add file" opens file picker via extension
      var plusMenuUpload = document.getElementById('plusMenuUpload');
      if (plusMenuUpload) {
        plusMenuUpload.addEventListener('click', () => {
          plusMenu.classList.remove('open');
          vscode.postMessage({ type: 'openFilePicker' });
        });
      }
      // "Plan mode" toggles mode chip
      var plusMenuPlanMode = document.getElementById('plusMenuPlanMode');
      if (plusMenuPlanMode) {
        plusMenuPlanMode.addEventListener('click', () => {
          plusMenu.classList.remove('open');
          vscode.postMessage({ type: 'openModePicker' });
        });
      }
    }

    // Model pill opens model picker
    if (modelPill) {
      modelPill.addEventListener('click', () => {
        vscode.postMessage({ type: 'openModelPicker' });
      });
    }

    modeChip.addEventListener('click', () => {
      vscode.postMessage({ type: 'openModePicker' });
    });

    effortChip.addEventListener('click', () => {
      vscode.postMessage({ type: 'openEffortPicker' });
    });

    saveKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (!key) return;
      vscode.postMessage({ type: 'setApiKey', payload: { key } });
      apiKeyInput.value = '';
    });

    apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveKeyBtn.click();
    });

    // ── Messages from extension ───────────────────────────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'token') {
        removeTyping();
        if (!currentAssistantEl) {
          currentAssistantEl = addMessage('assistant', '');
          accumulatedContent = '';
        }
        accumulatedContent += msg.payload.text;
        currentAssistantEl.textContent = accumulatedContent;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      else if (msg.type === 'done') {
        removeTyping();
        if (currentAssistantEl && accumulatedContent) {
          currentAssistantEl.innerHTML = sanitizeHtml(renderMarkdown(accumulatedContent));
        }
        finalizeToolCallStack();
        setStreaming(false);
        currentAssistantEl = null;
        accumulatedContent = '';
      }

      else if (msg.type === 'toolCallStart') {
        removeTyping();
        createToolCallEl(msg.payload.toolUseId, msg.payload.name);
      }

      else if (msg.type === 'toolCallDelta') {
        var tc = toolCallMap[msg.payload.toolUseId];
        if (tc) {
          tc.inputBuf += msg.payload.deltaJson;
          tc.summaryEl.textContent = tc.inputBuf.slice(0, 60);
          tc.bodyEl.textContent = tc.inputBuf;
        }
      }

      else if (msg.type === 'toolCallEnd') {
        var tcEnd = toolCallMap[msg.payload.toolUseId];
        if (tcEnd) {
          tcEnd.el.classList.remove('tool-call--pending');
          tcEnd.el.classList.add('tool-call--done');
          // Format JSON body if parseable
          try {
            var parsed = JSON.parse(tcEnd.inputBuf);
            tcEnd.bodyEl.textContent = JSON.stringify(parsed, null, 2);
          } catch (_) { /* leave as-is */ }
        }
      }

      else if (msg.type === 'error') {
        removeTyping();
        addMessage('error', msg.payload.message);
        setStreaming(false);
        currentAssistantEl = null;
      }

      else if (msg.type === 'apiKeyStatus') {
        apiKeyBanner.style.display = msg.payload.hasKey ? 'none' : 'flex';
        apiKeyBanner.style.flexDirection = 'column';
      }

      else if (msg.type === 'model') {
        const opt = modelSelect.querySelector('option[value="' + msg.payload.model + '"]');
        if (opt) {
          modelSelect.value = msg.payload.model;
          if (modelPill) modelPill.textContent = (opt as HTMLOptionElement).text;
        }
      }

      else if (msg.type === 'providerBadge') {
        updateProviderBadge(msg.payload.providerLabel, msg.payload.brandColor);
      }

      else if (msg.type === 'fileSearchResults') {
        showMentionResults(msg.payload.files);
      }

      else if (msg.type === 'conversationCleared') {
        messagesEl.innerHTML = '';
        var freshEmpty = document.createElement('div');
        freshEmpty.className = 'empty-state';
        freshEmpty.id = 'emptyState';
        freshEmpty.innerHTML = '<div class="empty-state-headline">Ask about your code</div>' +
          '<div class="prompt-chips">' +
          '<button class="prompt-chip" data-prompt="/explain selected code">&lt;/&gt; Explain</button>' +
          '<button class="prompt-chip" data-prompt="/fix ">&gt;_ Fix</button>' +
          '<button class="prompt-chip" data-prompt="/tests ">&#10003; Tests</button>' +
          '</div>';
        freshEmpty.querySelectorAll('.prompt-chip').forEach(function(chip) {
          chip.addEventListener('click', function() {
            var p = chip.dataset.prompt || '';
            if (p) { userInput.value = p; userInput.focus(); autoResize(); freshEmpty.style.display = 'none'; }
          });
        });
        messagesEl.appendChild(freshEmpty);
        emptyStateEl = freshEmpty;
        streaming = false;
        currentAssistantEl = null;
        toolCallStack = null;
        toolCallMap = {};
        setStreaming(false);
      }

      else if (msg.type === 'addUserMessage') {
        addMessage('user', msg.payload.text);
      }

      else if (msg.type === 'modeChanged') {
        if (modeChip) modeChip.textContent = msg.payload.mode.charAt(0).toUpperCase() + msg.payload.mode.slice(1);
      }

      else if (msg.type === 'effortChanged') {
        if (effortChip) {
          effortChip.textContent = msg.payload.effort.charAt(0).toUpperCase() + msg.payload.effort.slice(1);
          effortChip.style.display = msg.payload.supportsEffort ? '' : 'none';
        }
      }

      else if (msg.type === 'usageMeter') {
        renderUsageMeter(msg.payload);
      }
    });

    // ── @mention autocomplete ─────────────────────────────────────────────────
    function detectMention() {
      var val = userInput.value;
      var pos = userInput.selectionStart;
      var i = pos - 1;
      while (i >= 0 && val[i] !== '@' && val[i] !== ' ' && val[i] !== '\\n') { i--; }
      if (i >= 0 && val[i] === '@') {
        var query = val.substring(i + 1, pos);
        if (query.length > 0 && !/\\s/.test(query)) {
          mentionStart = i;
          vscode.postMessage({ type: 'fileSearch', payload: { query: query } });
          return;
        }
      }
      hideMentionDropdown();
    }

    function hideMentionDropdown() {
      mentionDropdown.className = 'mention-dropdown';
      mentionDropdown.innerHTML = '';
      mentionIndex = -1;
      mentionStart = -1;
    }

    function showMentionResults(files) {
      if (files.length === 0) { hideMentionDropdown(); return; }
      mentionDropdown.innerHTML = '';
      mentionIndex = 0;
      files.forEach(function(f, idx) {
        var item = document.createElement('div');
        item.className = 'mention-item' + (idx === 0 ? ' selected' : '');
        item.textContent = f;
        item.addEventListener('mousedown', function(e) {
          e.preventDefault();
          insertMention(f);
        });
        mentionDropdown.appendChild(item);
      });
      mentionDropdown.className = 'mention-dropdown visible';
    }

    function insertMention(file) {
      var val = userInput.value;
      var before = val.substring(0, mentionStart);
      var after = val.substring(userInput.selectionStart);
      userInput.value = before + '@' + file + ' ' + after;
      var newPos = mentionStart + file.length + 2;
      userInput.setSelectionRange(newPos, newPos);
      hideMentionDropdown();
      userInput.focus();
    }

    // ── Inline tool-call rendering (design-spec §4) ───────────────────────────
    var toolCallStack = null; // active .tool-call-stack container
    var toolCallMap = {}; // toolUseId → { el, bodyEl, inputBuf }

    var TOOL_ICONS = {
      bash: '$(terminal)', shell: '$(terminal)', run_command: '$(terminal)',
      read: '$(file)', read_file: '$(file)', file_read: '$(file)',
      write: '$(file-add)', write_file: '$(file-add)', create_file: '$(file-add)',
      edit: '$(edit)', edit_file: '$(edit)', apply_patch: '$(edit)',
      search: '$(search)', web_search: '$(search)', grep: '$(search)',
      web_fetch: '$(globe)', fetch: '$(globe)', browser: '$(globe)',
      list_dir: '$(folder)', fs_list: '$(folder)', list_files: '$(folder)',
      mcp: '$(plug)', tool: '$(plug)',
    };

    function getToolIcon(name) {
      var key = name.toLowerCase().replace(/[- ]/g, '_');
      return TOOL_ICONS[key] || '$(symbol-misc)';
    }

    function getToolLabel(name) {
      return name.replace(/_/g, ' ').replace(/\b[a-z]/g, function(c) { return c.toUpperCase(); });
    }

    function ensureToolCallStack() {
      if (toolCallStack) return toolCallStack;
      var stackEl = document.createElement('div');
      stackEl.className = 'tool-call-stack';
      messagesEl.appendChild(stackEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      toolCallStack = stackEl;
      return stackEl;
    }

    function createToolCallEl(toolUseId, name) {
      var stack = ensureToolCallStack();
      var icon = getToolIcon(name);
      var label = getToolLabel(name);

      var wrapper = document.createElement('div');
      wrapper.className = 'tool-call tool-call--pending';
      wrapper.dataset.id = toolUseId;

      var bar = document.createElement('div');
      bar.className = 'tool-call__bar';
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-expanded', 'false');

      var iconEl = document.createElement('span');
      var codiconName = icon.replace('$(', '').replace(')', '');
      iconEl.className = 'tool-call__icon codicon codicon-' + codiconName;
      iconEl.setAttribute('aria-hidden', 'true');

      var labelEl = document.createElement('span');
      labelEl.className = 'tool-call__label';
      labelEl.textContent = label;

      var summaryEl = document.createElement('span');
      summaryEl.className = 'tool-call__summary';

      var chevron = document.createElement('span');
      chevron.className = 'tool-call__chevron';
      chevron.textContent = '▶';

      bar.appendChild(iconEl);
      bar.appendChild(labelEl);
      bar.appendChild(summaryEl);
      bar.appendChild(chevron);

      var bodyEl = document.createElement('div');
      bodyEl.className = 'tool-call__body';

      wrapper.appendChild(bar);
      wrapper.appendChild(bodyEl);

      bar.addEventListener('click', function() {
        var isOpen = wrapper.classList.contains('tool-call--open');
        wrapper.classList.toggle('tool-call--open', !isOpen);
        bar.setAttribute('aria-expanded', String(!isOpen));
      });

      stack.appendChild(wrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      toolCallMap[toolUseId] = { el: wrapper, bodyEl: bodyEl, summaryEl: summaryEl, inputBuf: '' };
      return toolCallMap[toolUseId];
    }

    function finalizeToolCallStack() {
      if (!toolCallStack) return;
      var doneEl = document.createElement('div');
      doneEl.className = 'tool-call-done';
      doneEl.innerHTML = '<span class="codicon codicon-check" aria-hidden="true"></span> Done';
      toolCallStack.appendChild(doneEl);
      toolCallStack = null;
      toolCallMap = {};
    }

    // ── Empty-state prompt chips (design-spec §8) ────────────────────────────
    var emptyStateEl = document.getElementById('emptyState');
    function hideEmptyState() {
      if (emptyStateEl) { emptyStateEl.style.display = 'none'; }
    }
    document.querySelectorAll('.prompt-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var prompt = chip.dataset.prompt || '';
        if (!prompt) return;
        userInput.value = prompt;
        userInput.focus();
        autoResize();
        hideEmptyState();
      });
    });

    // ── Signal ready ──────────────────────────────────────────────────────────
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
