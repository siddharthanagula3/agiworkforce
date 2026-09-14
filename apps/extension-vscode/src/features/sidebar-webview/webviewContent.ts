import * as vscode from 'vscode';
import { MODEL_LOCKED_HINT, getModelPickerOptionsForTier } from '../model-picker/modelConstants';
import { AGENT_MODE_LABEL, EFFORT_LABEL, type AgentMode, type Effort } from '@agiworkforce/types';
import { agiVsCodeCssVars, cssVarsToString } from '@agiworkforce/design-tokens';
import type { ComposerFollowUpBehavior } from '../../platform/config';
import { SURFACE_MENU_ITEMS } from '../surfaces/surfaceMenu';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getNonce(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(24).toString('base64url');
}

/**
 * COLOUR POLICY: geometry and the terra brand accent are AGI-owned; surfaces,
 * text, controls, focus, and state colours follow the host theme. The sidebar
 * sits directly above native History, Context, and Memory views, so pinning the
 * webview dark in a light or high-contrast host makes one product look like two
 * unrelated extensions. `agiVsCodeCssVars` remains the fallback for hosts that
 * omit a VS Code colour token.
 *
 * Stateful foreground/background pairs must still come from the same family.
 * Warning, error, diff, button, and focus colours therefore use matching host
 * tokens with complete AGI fallbacks rather than mixing a host background with
 * a fixed-palette foreground.
 */
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
  initialMode: AgentMode,
  initialEffort: Effort,
  supportsEffort: boolean,
  meterCollapsed: boolean,
  tier?: string,
  showOnboarding = false,
  initialFollowUpBehavior: ComposerFollowUpBehavior = 'queue',
): string {
  const cspSource = webview.cspSource;
  const modelOptionsHtml = getModelPickerOptionsForTier(tier)
    .map((option) => {
      const displayLabel = escapeHtml(option.label);
      if (option.availability !== 'live') {
        return `<option value="${option.id}" data-display-label="${displayLabel}" disabled>${displayLabel}, Coming soon</option>`;
      }
      if (!option.reachable) {
        return `<option value="${option.id}" data-display-label="${displayLabel}" disabled>${displayLabel}, ${escapeHtml(MODEL_LOCKED_HINT)}</option>`;
      }
      return `<option value="${option.id}" data-display-label="${displayLabel}">${displayLabel}</option>`;
    })
    .join('');
  const modeLabel = escapeHtml(AGENT_MODE_LABEL[initialMode]);
  const effortLabel = escapeHtml(EFFORT_LABEL[initialEffort]);
  const followUpBehaviorLiteral = initialFollowUpBehavior === 'steer' ? 'steer' : 'queue';

  const codiconCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'codicons', 'codicon.css'),
  );

  const renderJsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'render.js'),
  );

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'nonce-${nonce}' ${cspSource};
             script-src 'nonce-${nonce}' ${cspSource};
             img-src ${cspSource};
             font-src ${cspSource};" />
  <title>AGI Workforce</title>
  <link rel="stylesheet" href="${codiconCssUri}" />
  <style nonce="${nonce}">
    :root {
      /* Host theme first; AGI tokens are complete fallbacks for compatible IDEs. */
      ${cssVarsToString(agiVsCodeCssVars)}
      --bg-base: var(--vscode-sideBar-background, var(--agi-vscode-bg));
      --bg-elevated: var(--vscode-sideBarSectionHeader-background, var(--vscode-editorWidget-background, var(--agi-vscode-surface)));
      --bg-overlay: var(--vscode-dropdown-background, var(--agi-vscode-overlay));
      --accent-teal: var(--vscode-button-background, var(--agi-vscode-button));
      --accent-terra: var(--agi-vscode-terra);
      --accent-terra-foreground: var(--agi-vscode-button-text);
      --text-primary: var(--vscode-foreground, var(--agi-vscode-text));
      --text-secondary: var(--vscode-descriptionForeground, var(--agi-vscode-text-muted));
      --border: var(--vscode-panel-border, var(--vscode-widget-border, var(--agi-vscode-border)));
      --button-text: var(--vscode-button-foreground, var(--agi-vscode-button-text));
      --hover: var(--vscode-list-hoverBackground, var(--agi-vscode-hover));
      --success: var(--vscode-testing-iconPassed, var(--agi-vscode-success));
      --warning: var(--vscode-inputValidation-warningForeground, var(--vscode-editorWarning-foreground, var(--agi-vscode-warning)));
      --warning-bg: var(--vscode-inputValidation-warningBackground, var(--agi-vscode-warning-bg));
      --warning-border: var(--vscode-inputValidation-warningBorder, var(--agi-vscode-warning-border));
      --error: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground, var(--agi-vscode-danger)));
      --error-bg: var(--vscode-inputValidation-errorBackground, var(--agi-vscode-danger-bg));
      --error-border: var(--vscode-inputValidation-errorBorder, var(--agi-vscode-danger-border));
      --link: var(--vscode-textLink-foreground, var(--accent-teal));
      --link-active: var(--vscode-textLink-activeForeground, var(--link));
      --radius-md: 8px;
      --radius-lg: 12px;
      --transition: cubic-bezier(0.16, 1, 0.3, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-base);
      color: var(--text-primary);
      /* VSCX-15: follow the editor's own typography. A hardcoded stack ignored
         the user's font choice and, more importantly, their font *size*.
         which is an accessibility setting, not a preference. The literals stay
         as fallbacks for a host that does not define these. */
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-elevated);
      flex-shrink: 0;
    }

    .header-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }

    /* Brand mark, the 12-spoke AGI symbol, rendered mono. */
    .brand-mark {
      width: 18px;
      height: 18px;
      color: var(--text-primary);
      flex-shrink: 0;
      line-height: 0;
    }
    .brand-mark svg { display: block; width: 18px; height: 18px; }

    /* One stable trust-boundary identity. The boundary and provider used to be
       separate badges, which could briefly disagree while host messages arrived
       in different orders. This single surface is recomputed from both facts. */
    .session-identity {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2px;
      padding: 2px 8px;
      border-radius: 999px;
      color: var(--text-secondary);
      background: var(--bg-overlay);
      border: 1px solid var(--border);
      white-space: nowrap;
      min-width: 0;
      max-width: min(190px, 52vw);
      overflow: hidden;
      flex-shrink: 1;
    }
    .session-identity-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-teal);
      flex-shrink: 0;
    }
    /* Trust boundary carried on the pill as data-boundary, so the colour lives
       in CSS rather than in inline styles the script has to write. Managed
       cloud is the only boundary whose prompts leave the machine, so it is the
       only one tinted as a warning. */
    .session-identity[data-boundary='local'] .session-identity-dot {
      background: var(--success);
    }
    .session-identity[data-boundary='byok'] .session-identity-dot {
      background: var(--accent-teal);
    }
    .session-identity[data-boundary='cloud'] .session-identity-dot {
      background: var(--warning);
    }
    .session-identity[data-boundary='cloud'] {
      color: var(--warning);
      border-color: var(--warning-border);
      background: var(--warning-bg);
    }
    .session-identity[data-boundary='none'] .session-identity-dot {
      background: var(--text-secondary);
    }
    .session-identity-copy {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .header-actions {
      display: flex;
      gap: 2px;
      align-items: center;
      flex-shrink: 0;
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 7px;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s var(--transition),
                  background 0.15s var(--transition);
    }
    .icon-btn:hover {
      color: var(--text-primary);
      background: var(--bg-overlay);
    }

    .runtime-status {
      margin: 8px 10px 0;
      padding: 10px;
      /* VS Code input-validation tokens are designed for a thin input popup,
       * not a persistent sidebar card. Some host themes pair a saturated
       * yellow foreground with a pale green validation background, which made
       * this first-run blocker both visually loud and difficult to read. Keep
       * the host warning hue, but build the card on the normal sidebar surface
       * and use the regular foreground for explanatory copy. */
      border: 1px solid color-mix(in srgb, var(--warning) 42%, var(--border));
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--warning) 10%, var(--bg-elevated));
      color: var(--text-primary);
      display: none;
      flex-direction: column;
      gap: 5px;
      font-size: 11px;
      line-height: 1.4;
    }

    .runtime-status strong {
      font-size: 12px;
      color: var(--warning);
    }

    .runtime-status-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .runtime-status button {
      border: 0;
      border-radius: 5px;
      padding: 4px 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }

    .runtime-status button.runtime-status-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .runtime-status button[disabled] {
      cursor: default;
      opacity: 0.6;
    }

    /* ── First-run onboarding ── */
    .onboarding {
      position: fixed;
      inset: 44px 0 0;
      z-index: 50;
      min-height: 0;
      padding: clamp(14px, 4vw, 24px);
      overflow: auto;
      background: var(--vscode-sideBar-background, var(--bg-base));
    }
    .onboarding-shell {
      display: flex;
      flex-direction: column;
      width: min(100%, 560px);
      min-height: 100%;
      margin: 0 auto;
    }
    .onboarding-topline {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: clamp(18px, 5vh, 34px);
    }
    .onboarding-progress {
      color: var(--text-secondary);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .onboarding-dots {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .onboarding-dot {
      width: 18px;
      height: 3px;
      border: 0;
      border-radius: 99px;
      background: var(--border);
    }
    .onboarding-dot.active {
      background: var(--accent-teal);
    }
    .onboarding-step {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: flex-end;
      animation: onboarding-enter 180ms var(--transition);
    }
    .onboarding-step[hidden] {
      display: none;
    }
    @keyframes onboarding-enter {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .onboarding h2 {
      max-width: 430px;
      color: var(--text-primary);
      font-size: clamp(19px, 6vw, 28px);
      font-weight: 650;
      letter-spacing: -0.035em;
      line-height: 1.1;
    }
    /* The step heading takes focus only so a screen reader announces the new
       step; it is not tabbable, so a ring on it reads as a defect. */
    .onboarding h2:focus,
    .onboarding h2:focus-visible {
      outline: none;
    }
    .onboarding-lede {
      max-width: 490px;
      margin-top: 13px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.65;
    }
    .onboarding-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 14px;
    }
    .onboarding-link,
    .onboarding-button {
      border: 1px solid var(--border);
      border-radius: 7px;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
    }
    .onboarding-link {
      padding: 6px 9px;
      background: transparent;
      color: var(--text-primary);
    }
    .onboarding-link:hover,
    .onboarding-button--secondary:hover {
      background: var(--bg-overlay);
    }
    .onboarding-actions {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px;
      align-items: center;
      margin-top: clamp(22px, 6vh, 40px);
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .onboarding-button {
      min-height: 32px;
      padding: 7px 12px;
    }
    .onboarding-button--secondary {
      background: transparent;
      color: var(--text-primary);
    }
    .onboarding-button--primary {
      border-color: var(--accent-teal);
      background: var(--accent-teal);
      /* Both values are host button aliases, so they change as one pair. */
      color: var(--button-text);
    }
    .onboarding-button:disabled {
      cursor: not-allowed;
      opacity: 0.42;
    }
    .onboarding-skip {
      justify-self: center;
      padding: 5px 8px;
      border: 0;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font: inherit;
      font-size: 10.5px;
    }

    button:focus-visible,
    [role="menuitem"]:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, var(--accent-teal));
      outline-offset: 2px;
    }

    /* ── Messages ── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px 16px;
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
    .message.user[data-delivery-state] { border-style: dashed; }
    .message.user[data-delivery-state]::after {
      display: block;
      margin-top: 3px;
      color: var(--text-secondary);
      font-size: 9px;
      text-align: right;
    }
    .message.user[data-delivery-state='queued']::after { content: 'Queued'; }
    .message.user[data-delivery-state='running']::after { content: 'Running'; }
    .message.user[data-delivery-state='steered']::after { content: 'Steered'; }
    .message.user[data-delivery-state='failed'] {
      border-color: var(--error-border);
    }
    .message.user[data-delivery-state='failed']::after {
      content: 'Not sent';
      color: var(--error);
    }
    .message.user[data-delivery-state='cancelled']::after { content: 'Cancelled'; }

    .message.assistant {
      background: transparent;
      align-self: stretch;
      color: var(--text-primary);
      padding-inline: 2px;
    }

    .message.error {
      background: var(--error-bg);
      border: 1px solid var(--error-border);
      color: var(--error);
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

    /* ── Input area / composer (design-spec §7) ── */
    .input-area {
      background: var(--bg-base);
      padding: 8px 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 0;
      flex-shrink: 0;
      position: relative;
    }

    /* Outer rounded composer card */
    .composer-card {
      background: var(--vscode-input-background, var(--bg-elevated));
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: 14px;
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 84px;
      overflow: visible;
      transition: border-color 0.15s var(--transition);
    }
    .composer-card:focus-within {
      border-color: var(--vscode-focusBorder, var(--accent-teal));
    }

    .model-row { display: none; } /* hidden, model is now in bottom controls row */

    .input-row {
      display: flex;
      gap: 0;
      align-items: flex-end;
      padding: 11px 12px 0;
    }

    #userInput {
      /*
       * width:100%, NOT flex:1. The parent .input-wrapper is a block box
       * (position:relative, stacking the mention dropdown, this textarea and the
       * hint vertically), so a flex property here has nothing to resolve against
       * and the textarea silently falls back to its intrinsic cols width.
       * about 150px, leaving most of the composer dead space at every panel
       * width. Do not "fix" this by making the wrapper display:flex: that would
       * lay its three children out in a row.
       */
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
      background: transparent;
      border: 0;
      outline: 0;
      color: var(--text-primary);
      font-family: inherit;
      /* Follow the editor's configured size, matching :root above. A hardcoded
         13px ignored a user who had raised VS Code's font size for readability.
         in the one control they type into. */
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.5;
      min-height: 46px;
      max-height: 140px;
      padding: 0;
      resize: none;
    }
    #userInput::placeholder { color: var(--text-secondary); opacity: 0.7; }

    /* ── Bottom controls row ── */
    .composer-bottom {
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      padding: 4px 6px 6px;
    }

    /* Plus button */
    .plus-btn {
      background: none;
      border: none;
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 18px;
      height: 28px;
      width: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.12s var(--transition), color 0.12s var(--transition);
      line-height: 1;
    }
    .plus-btn:hover { background: var(--hover); color: var(--text-primary); }

    /* Model picker pill. The model name is the one word a user cannot infer
       from anywhere else in the composer, so it holds its width and the effort
       suffix and the mode chip give theirs up first. */
    .model-pill {
      display: inline-flex;
      align-items: center;
      background: none;
      border: none;
      border-radius: 999px;
      color: var(--text-secondary);
      cursor: pointer;
      flex-shrink: 1;
      font-size: 12px;
      font-weight: 500;
      height: 28px;
      padding: 0 6px;
      white-space: nowrap;
      min-width: 72px;
      max-width: 160px;
      overflow: hidden;
      transition: background 0.12s var(--transition), color 0.12s var(--transition);
    }
    .model-pill-name {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .model-pill-effort { flex-shrink: 0; }
    .model-pill:hover { background: var(--hover); color: var(--text-primary); }

    #sendBtn {
      background: var(--accent-terra);
      border: none;
      border-radius: 50%;
      color: var(--accent-terra-foreground);
      cursor: pointer;
      font-size: 14px;
      height: 28px;
      width: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: auto;
      transition: opacity 0.15s var(--transition),
                  transform 0.1s var(--transition),
                  width 0.15s var(--transition);
    }
    #sendBtn:hover:not(:disabled) { opacity: 0.88; transform: scale(1.05); }
    #sendBtn:disabled { opacity: 0.35; cursor: not-allowed; }
    #sendBtn::before {
      content: '↑';
      font-size: 14px;
      font-weight: 700;
    }
    #sendBtn.follow-up {
      width: auto;
      min-width: 58px;
      padding: 0 9px;
      border-radius: 13px;
      gap: 4px;
      font-size: 10px;
      font-weight: 700;
    }
    #sendBtn.follow-up::before { content: '+'; font-size: 13px; }
    #sendBtn .send-action-label { display: none; }
    #sendBtn.follow-up .send-action-label { display: inline; }

    #stopBtn {
      display: none;
      width: 26px;
      height: 26px;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 50%;
      color: var(--text-primary);
      background: var(--bg-overlay);
      cursor: pointer;
    }
    #stopBtn.visible { display: inline-flex; }
    #stopBtn::before { content: '■'; font-size: 9px; }
    #stopBtn:hover { border-color: var(--vscode-focusBorder); }

    .context-usage {
      display: none;
      min-width: 0;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .context-usage.visible { display: inline; }
    .context-usage.is-high { color: var(--warning); }
    .context-usage.is-critical { color: var(--error); }

    .follow-up-status {
      display: none;
      min-width: 0;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .follow-up-status.visible { display: inline; }
    .follow-up-status.error { color: var(--error); }

    /* ── Plus-menu popover ── */
    .plus-menu {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 10px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: 0 6px 20px var(--vscode-widget-shadow);
      width: min(300px, calc(100vw - 20px));
      z-index: 20;
      overflow: hidden;
      padding: 5px;
    }
    .plus-menu.open { display: block; }

    .plus-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.1s;
      width: 100%;
      border: 0;
      border-radius: 7px;
      background: transparent;
      text-align: left;
      font-family: inherit;
    }
    .plus-menu-item:hover { background: var(--bg-overlay); color: var(--text-primary); }
    .plus-menu-item[disabled] {
      cursor: default;
      opacity: 0.5;
    }
    .plus-menu-item[disabled]:hover { background: transparent; color: var(--text-secondary); }
    .plus-menu-item[aria-checked="true"] {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .plus-menu-item .pm-icon { font-size: 13px; flex-shrink: 0; }
    .plus-menu-label {
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      padding: 5px 8px 7px;
    }
    .plus-menu-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .plus-menu-title {
      color: var(--text-primary);
      font-weight: 500;
      line-height: 1.25;
    }
    .plus-menu-description {
      color: var(--text-secondary);
      font-size: 10px;
      line-height: 1.3;
    }
    .plus-menu-divider {
      border-top: 1px solid var(--border);
      margin: 5px 3px;
    }

    /* ── Model popover ── */
    .model-popover {
      display: none;
      position: absolute;
      right: 10px;
      bottom: calc(100% + 6px);
      width: min(320px, calc(100vw - 20px));
      /*
       * Bound by the viewport, not a fixed 360px. The popover opens UPWARD from
       * the composer, so in a short sidebar (a split editor, a small window) a
       * fixed 360px box extended past the top edge: overflow-y scrolled the
       * content INSIDE the box, but the box itself was clipped, so the first
       * models in the list were unreachable.
       */
      max-height: min(360px, calc(100vh - 140px));
      overflow-y: auto;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: 0 10px 28px var(--vscode-widget-shadow);
      z-index: 24;
      padding: 6px;
    }
    .model-popover.open { display: block; }
    .model-popover__group {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 9px 8px 5px;
    }
    .model-popover__group-title {
      color: var(--text-secondary);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .model-popover__group-description {
      color: var(--text-secondary);
      font-size: 10px;
      font-weight: 400;
      line-height: 1.3;
    }
    .model-popover__option {
      width: 100%;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px;
      text-align: left;
      transition: background 0.12s var(--transition);
    }
    .model-popover__option:hover,
    .model-popover__option.is-active {
      background: var(--bg-overlay);
    }
    .model-popover__option.is-active {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .model-popover__option:disabled {
      cursor: default;
      opacity: 0.62;
    }
    .model-popover__option:disabled:hover { background: transparent; }
    .model-popover__label {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
    }
    .model-popover__description {
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.25;
    }
    .model-popover__empty {
      color: var(--text-secondary);
      font-size: 12px;
      padding: 10px;
    }

    /* ── Code blocks ── */
    /* Code blocks use the same host-derived surface/text aliases as the chat,
       with AGI fallbacks for compatible hosts that omit those colour tokens. */
    pre { background: var(--bg-overlay); border: 1px solid var(--border); border-radius: 6px; padding: 12px; overflow-x: auto; margin: 8px 0; }
    code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 12px; }
    pre code { color: var(--text-primary); }
    :not(pre) > code { background: var(--bg-overlay); padding: 2px 5px; border-radius: 3px; color: var(--text-primary); }
    strong { font-weight: 600; }
    em { font-style: italic; }
    del { text-decoration: line-through; opacity: 0.6; }
    h2, h3, h4 { margin: 8px 0 4px; font-weight: 600; }
    h2 { font-size: 16px; } h3 { font-size: 14px; } h4 { font-size: 13px; }
    hr { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
    li { margin-left: 16px; list-style: disc; }
    blockquote { border-left: 2px solid var(--accent-teal); padding-left: 8px; color: var(--text-secondary); margin: 6px 0; }
    .code-block-wrapper { position: relative; margin: 8px 0; }
    .code-block-wrapper pre { margin: 0; padding-top: 36px; }
    .code-block-actions { position: absolute; top: 5px; right: 5px; z-index: 1; display: flex; gap: 4px; }
    .code-lang { position: absolute; top: 4px; left: 8px; font-size: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
    .copy-btn, .apply-btn { background: var(--vscode-button-secondaryBackground, var(--bg-overlay)); border: 1px solid var(--border); border-radius: 4px; color: var(--vscode-button-secondaryForeground, var(--text-primary)); font-size: 11px; padding: 2px 8px; cursor: pointer; opacity: 0; transition: opacity 0.15s; }
    .code-block-wrapper:hover .copy-btn, .code-block-wrapper:hover .apply-btn { opacity: 1; }
    .copy-btn:focus-visible, .apply-btn:focus-visible { opacity: 1; }
    /* Hover keeps background and foreground on the same host/fallback aliases. */
    .copy-btn:hover { background: var(--hover); color: var(--text-primary); }
    .apply-btn { background: var(--vscode-button-background); border-color: transparent; color: var(--vscode-button-foreground); }
    .apply-btn:hover { background: var(--vscode-button-hoverBackground); }

    /* ── Composer controls row ── */
    .composer-controls {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }

    .controls-summary, .model-chip {
      background: none;
      border: none;
      border-radius: 999px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      height: 28px;
      padding: 0 8px;
      transition: color 0.15s var(--transition),
                  background 0.15s var(--transition);
      white-space: nowrap;
      min-width: 0;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .controls-summary:hover, .model-chip:hover {
      color: var(--text-primary);
      background: var(--hover);
    }
    .controls-summary {
      flex-shrink: 4;
      min-width: 36px;
      max-width: 120px;
      padding: 0 6px;
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
      /* Backstop: even with every child shrinking correctly, a pathological
       * string must clip inside the panel rather than force the whole webview
       * into horizontal scroll. */
      overflow: hidden;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-secondary);
      flex-shrink: 0;
      min-height: 30px;
      transition: background 0.15s var(--transition);
    }

    .usage-meter-banner.warn {
      /* Matched host warning aliases keep low-quota copy legible in every theme. */
      background: var(--warning-bg);
      border-bottom-color: var(--warning-border);
      color: var(--warning);
    }
    .usage-meter-banner.warn .usage-reset { color: inherit; opacity: 0.85; }

    .usage-bucket-list {
      list-style: none;
      margin: 0;
      padding: 4px 12px 8px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-secondary);
      flex-shrink: 0;
      overflow: hidden;
    }

    .usage-bucket-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
      padding: 2px 0;
    }

    .usage-bucket-row.binding { color: var(--text-primary); font-weight: 600; }

    .path-link {
      color: var(--link);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .path-link:hover,
    .path-link:focus-visible { color: var(--link-active); }

    .usage-credit-row {
      border-top: 1px solid var(--border);
      margin-top: 4px;
      padding-top: 4px;
    }

    .usage-credit-topup {
      background: none;
      border: none;
      color: var(--link);
      cursor: pointer;
      font: inherit;
      padding: 0 0 0 6px;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .usage-credit-topup:hover,
    .usage-credit-topup:focus-visible { color: var(--link-active); }

    .usage-bucket-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .usage-bucket-remaining { flex-shrink: 0; }

    .usage-bucket-reset {
      flex-shrink: 2;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0.7;
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
      background: var(--vscode-editorWidget-border);
      border-radius: 2px;
      overflow: hidden;
    }

    .usage-progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s var(--transition), background 0.4s var(--transition);
    }

    /*
     * The two text children MUST be allowed to shrink. They previously carried
     * flex-shrink:0 alongside white-space:nowrap, so at any sidebar narrower than
     * ~405px, including the 300px default, they held their full intrinsic width
     * and pushed the Upgrade button and the collapse × clean off the right edge.
     * That was worst in the .warn state, i.e. exactly when the upgrade CTA is the
     * point of the banner.
     *
     * flex-shrink:0 belongs on the icons and the two buttons below (which have
     * it), never on variable-length text. .usage-reset shrinks first because a
     * truncated reset time costs less than a truncated quota figure.
     */
    .usage-text {
      white-space: nowrap;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 1;
    }

    .usage-reset {
      white-space: nowrap;
      color: var(--text-secondary);
      opacity: 0.7;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 2;
    }

    .upgrade-btn {
      background: var(--accent-terra);
      border: none;
      border-radius: 8px;
      color: var(--accent-terra-foreground);
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
      /* Was padding 0 2px, giving a ~13px hit area. Pad to a 24px square.
         the minimum comfortable target, without changing the glyph size. */
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      min-height: 24px;
      padding: 0 4px;
      line-height: 1;
      transition: color 0.12s;
      flex-shrink: 0;
    }
    .meter-dismiss-btn:hover, .meter-restore-btn:hover { color: var(--text-primary); }


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
    .activity-group {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--bg-elevated);
      margin-bottom: 4px;
    }
    .activity-group__summary {
      display: grid;
      grid-template-columns: 16px auto minmax(0, 1fr) 12px;
      align-items: center;
      gap: 7px;
      width: 100%;
      min-height: 38px;
      padding: 7px 10px;
      border: 0;
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    .activity-group__summary:hover { background: var(--bg-overlay); }
    .activity-group__icon { color: var(--accent-teal); }
    .activity-group[data-status='working'] .activity-group__icon {
      animation: tool-spin 1s linear infinite;
    }
    .activity-group[data-status='error'] .activity-group__icon {
      color: var(--error);
    }
    .activity-group__title { font-size: 12px; font-weight: 600; }
    .activity-group__meta {
      min-width: 0;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .activity-group__chevron {
      color: var(--text-secondary);
      font-size: 10px;
      transition: transform 160ms ease;
    }
    .activity-group--collapsed .activity-group__chevron { transform: rotate(-90deg); }
    .activity-group__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0 8px 8px;
      border-top: 1px solid var(--border);
    }
    .activity-group--collapsed .activity-group__body { display: none; }
    .tool-call-stack { display: block; }

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
      width: 100%;
      border: 0;
      background: transparent;
      font-family: inherit;
      text-align: left;
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

    .tool-call--error .tool-call__bar { color: var(--error); }
    .tool-call--error .tool-call__icon { color: var(--error); }

    /* Tool names are arbitrary-length (MCP servers namespace them, e.g.
     * "mcp__filesystem__read_text_file"). flex-shrink:0 with no ellipsis forced
     * the whole row wider than the panel. The .progress-event variant below
     * already had the right pattern, this is the same rule, un-drifted. */
    .tool-call__label {
      font-weight: 400;
      color: var(--text-secondary);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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

    .tool-call__section + .tool-call__section {
      border-top: 1px solid var(--border);
      margin-top: 10px;
      padding-top: 10px;
    }
    .tool-call__section-label {
      color: var(--text-secondary);
      font-family: var(--vscode-font-family);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .tool-call__payload {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .progress-event .tool-call__label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .progress-event .tool-call__body {
      font-family: var(--vscode-font-family);
      white-space: normal;
      word-break: normal;
      line-height: 1.5;
    }

    /* ── Structured plan visualization ── */
    .plan-card {
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--bg-elevated);
      margin: 8px 0;
      overflow: hidden;
    }
    .plan-card__header {
      align-items: center;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 7px;
      min-height: 34px;
      padding: 0 10px;
    }
    .plan-card__title { color: var(--text-primary); font-size: 12px; font-weight: 600; }
    .plan-card__count { color: var(--text-secondary); font-size: 10px; margin-left: auto; }
    .plan-card__explanation {
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.4;
      margin: 0;
      padding: 9px 10px 2px;
    }
    .plan-card__list { list-style: none; margin: 0; padding: 7px; }
    .plan-card__step {
      align-items: flex-start;
      border-left: 2px solid transparent;
      border-radius: 5px;
      color: var(--text-primary);
      display: flex;
      font-size: 11px;
      gap: 7px;
      line-height: 1.4;
      margin: 0;
      padding: 5px 6px;
    }
    .plan-card__step--in-progress {
      background: var(--bg-overlay);
      border-left-color: var(--accent-teal);
    }
    .plan-card__step--completed { color: var(--text-secondary); }
    .plan-card__step--completed .plan-card__step-text { text-decoration: line-through; }
    .plan-card__status { color: var(--text-secondary); flex: 0 0 13px; text-align: center; }
    .plan-card__step--in-progress .plan-card__status { color: var(--accent-teal); }
    .plan-card__step--completed .plan-card__status { color: var(--success); }

    /* ── Empty state (design-spec §8) ── */
    .empty-state {
      position: relative;
      isolation: isolate;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 100%;
      padding: 32px 12px 20px;
      text-align: center;
    }

    .empty-state-mark {
      width: 28px;
      height: 28px;
      color: var(--text-secondary);
      opacity: 0.7;
      line-height: 0;
    }
    .empty-state-mark svg { width: 100%; height: 100%; }

    .empty-state-headline {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
      line-height: 1.3;
    }

    .empty-state-copy {
      max-width: 250px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    .empty-state--has-recents {
      justify-content: flex-start;
      padding-top: 12px;
    }
    .empty-state--has-recents .empty-state-mark { margin-top: auto; }
    .empty-state--has-recents .empty-state-copy { margin-bottom: auto; }

    .recent-chats {
      align-self: stretch;
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin-bottom: 8px;
      text-align: left;
    }

    .recent-chats-title {
      color: var(--text-secondary);
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 0 6px 4px;
    }

    .recent-chat-row {
      align-items: center;
      background: none;
      border: none;
      border-radius: var(--radius-md);
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 12px;
      gap: 8px;
      height: 28px;
      padding: 0 6px;
      text-align: left;
      width: 100%;
    }
    .recent-chat-row:hover { background: var(--hover); }

    .recent-chat-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .recent-chat-age {
      color: var(--text-secondary);
      flex: 0 0 auto;
      font-size: 12px;
    }

    .recent-chats-all {
      align-self: flex-start;
      background: none;
      border: none;
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      min-height: 24px;
      padding: 0 6px;
    }
    .recent-chats-all:hover { color: var(--text-primary); background: var(--hover); }

    /* ── Overflow menu ── */
    .header-menu-anchor { position: relative; display: inline-flex; }

    .actions-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 40;
      display: none;
      flex-direction: column;
      min-width: 208px;
      max-height: min(72vh, 460px);
      overflow-y: auto;
      padding: 4px;
      background: var(--bg-overlay);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: 0 6px 20px var(--vscode-widget-shadow);
    }
    .actions-menu.open { display: flex; }

    .actions-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 28px;
      padding: 0 8px;
      background: none;
      border: none;
      border-radius: 6px;
      color: var(--text-primary);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      text-align: left;
    }
    .actions-menu-item:hover,
    .actions-menu-item:focus-visible { background: var(--hover); outline: none; }
    .actions-menu-item .codicon { color: var(--text-secondary); }

    .actions-menu-separator {
      height: 1px;
      margin: 4px 6px;
      background: var(--border);
    }

    .actions-menu-account {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 8px 2px;
    }
    .actions-menu-account-name {
      color: var(--text-primary);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions-menu-account-plan { color: var(--text-secondary); font-size: 12px; }

    /* ── Sessions sheet ── */
    .sessions-sheet {
      position: absolute;
      inset: 0;
      z-index: 60;
      display: flex;
      flex-direction: column;
      background: var(--bg-base);
    }
    .sessions-sheet[hidden] { display: none; }

    .sessions-sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 44px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-elevated);
    }
    .sessions-sheet-title { font-size: 13px; font-weight: 600; }

    .sessions-sheet-toggle {
      display: flex;
      gap: 2px;
      margin: 8px 10px 0;
      padding: 2px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }
    .sessions-sheet-toggle button {
      flex: 1;
      min-height: 26px;
      background: none;
      border: none;
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }
    .sessions-sheet-toggle button[aria-selected='true'] {
      background: var(--hover);
      color: var(--text-primary);
    }

    .sessions-sheet-search {
      margin: 8px 10px 0;
      padding: 5px 8px;
      background: var(--vscode-input-background, var(--bg-elevated));
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: var(--radius-md);
      color: var(--vscode-input-foreground, var(--text-primary));
      font: inherit;
      font-size: 12px;
    }
    .sessions-sheet-search[hidden] { display: none; }

    .sessions-sheet-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 6px 12px;
    }

    .sessions-sheet-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 32px;
      padding: 0 8px;
      background: none;
      border: none;
      border-radius: var(--radius-md);
      color: var(--text-primary);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      text-align: left;
    }
    .sessions-sheet-row:hover { background: var(--hover); }
    .sessions-sheet-row-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sessions-sheet-row-age { color: var(--text-secondary); font-size: 12px; }
    .sessions-sheet-row-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--text-secondary);
      opacity: 0.6;
    }
    .sessions-sheet-empty {
      padding: 16px 10px;
      color: var(--text-secondary);
      font-size: 12px;
      text-align: center;
    }

    /* ── Slash commands ── */
    .slash-menu {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      z-index: 30;
      display: none;
      flex-direction: column;
      width: min(320px, 100%);
      max-height: 240px;
      overflow-y: auto;
      padding: 4px;
      background: var(--bg-overlay);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: 0 6px 20px var(--vscode-widget-shadow);
    }
    .slash-menu.open { display: flex; }

    .slash-menu-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      width: 100%;
      min-height: 28px;
      padding: 0 8px;
      background: none;
      border: none;
      border-radius: 6px;
      color: var(--text-primary);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      text-align: left;
    }
    .slash-menu-item:hover,
    .slash-menu-item:focus-visible { background: var(--hover); outline: none; }
    .slash-menu-item-name { font-weight: 600; }
    .slash-menu-item-description {
      color: var(--text-secondary);
      flex: 1;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .slash-menu-empty { padding: 8px; color: var(--text-secondary); font-size: 12px; }

    /* ── Composer status line ── */
    .composer-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 4px 0;
      color: var(--text-secondary);
      font-size: 12px;
    }

    .composer-status-route {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .composer-status-signin {
      margin-left: auto;
      padding: 0;
      border: 0;
      background: none;
      color: var(--vscode-textLink-foreground, var(--accent-teal));
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }
    .composer-status-signin[hidden] { display: none; }
    .composer-status-signin:hover { text-decoration: underline; }
    .plus-btn:disabled,
    .model-pill:disabled,
    .controls-summary:disabled {
      opacity: 0.42;
      cursor: not-allowed;
    }
    .plus-btn:disabled:hover,
    .model-pill:disabled:hover,
    .controls-summary:disabled:hover {
      color: var(--text-secondary);
      background: var(--bg-elevated);
    }

    /*
     * VS Code sidebars commonly render at 260–400 px. A single Controls summary
     * keeps mode and effort visible without pushing Send outside the composer.
     */
    @media (max-width: 480px) {
      .controls-summary { max-width: 70px; }
    }

    @media (max-width: 400px) {
      /* Effort is one click away in the same popover; the model name is not. */
      .model-pill-effort { display: none; }
    }

    @media (max-width: 340px) {
      .context-usage.visible { display: none; }
      .header { padding-inline: 8px; }
      .header-left { gap: 4px; max-width: calc(100% - 64px); overflow: hidden; }
      .header-actions { gap: 0; }
      .header-title { display: none; }
      .session-identity { max-width: calc(100vw - 108px); }
      .controls-summary { max-width: 54px; }
      .empty-state-copy { max-width: 230px; }
    }

    @media (max-width: 380px) {
      /* Follow-up Send grows into a worded control and sits beside Stop. Keep
         the confirmed model visible; mode/effort stays one click away and its
         current state returns as soon as streaming ends. */
      .composer-card.is-streaming .controls-summary { display: none; }
    }

    @media (max-width: 280px) {
      /* Both chips stay reachable: min-width keeps each clickable and the mode
         chip gives up its width four times faster than the model name. */
      .controls-summary { max-width: 46px; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
      }
    }

    @media (forced-colors: active) {
      .header,
      .composer-card,
      .plus-menu,
      .model-popover,
      .activity-group,
      .session-identity {
        border-color: CanvasText;
      }
      #sendBtn {
        forced-color-adjust: none;
        color: HighlightText;
        background: Highlight;
      }
      .session-identity[data-boundary] {
        forced-color-adjust: none;
        color: CanvasText;
        background: Canvas;
        border-color: CanvasText;
      }
      .session-identity[data-boundary] .session-identity-dot {
        background: CanvasText;
      }
      button:focus-visible,
      textarea:focus-visible {
        outline: 2px solid Highlight;
        outline-offset: 2px;
      }
    }

    /* ── Composer drag-drop overlay + attachment strip (2026-05-21 P0 #3) ── */
    .composer-card.dragover {
      border-color: var(--accent-teal);
      box-shadow: 0 0 0 2px var(--vscode-focusBorder);
    }

    .attachment-strip {
      display: none;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 10px 0;
    }
    .attachment-strip.visible { display: flex; }

    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 220px;
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--bg-overlay);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .attachment-chip.uploading { opacity: 0.65; }
    .attachment-chip.queued { opacity: 0.72; border-style: dashed; }
    .attachment-chip.failed {
      color: var(--error);
      border-color: var(--error-border);
      background: var(--error-bg);
    }
    .attachment-chip .codicon {
      font-size: 12px;
      flex-shrink: 0;
    }
    .attachment-chip__name {
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1 1 auto;
    }
    .attachment-chip__remove {
      background: none;
      border: 0;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 0;
      font-size: 13px;
      line-height: 1;
      flex-shrink: 0;
    }
    .attachment-chip__remove:hover { color: var(--text-primary); }

    .browse-context-strip {
      display: flex;
      padding: 6px 10px 0;
    }
    .browse-context-strip[hidden] { display: none; }
    .browse-context-strip .attachment-chip { max-width: 100%; }
  </style>
</head>
<body>

  <!-- The real AGI mark: 12 spokes, rendered mono via currentColor. -->
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="agimark" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <line x1="12" y1="7.40" x2="12" y2="3.00"/><line x1="14.30" y1="8.02" x2="16.50" y2="4.21"/>
      <line x1="15.98" y1="9.70" x2="19.79" y2="7.50"/><line x1="16.60" y1="12.00" x2="21.00" y2="12.00"/>
      <line x1="15.98" y1="14.30" x2="19.79" y2="16.50"/><line x1="14.30" y1="15.98" x2="16.50" y2="19.79"/>
      <line x1="12.00" y1="16.60" x2="12.00" y2="21.00"/><line x1="9.70" y1="15.98" x2="7.50" y2="19.79"/>
      <line x1="8.02" y1="14.30" x2="4.21" y2="16.50"/><line x1="7.40" y1="12.00" x2="3.00" y2="12.00"/>
      <line x1="8.02" y1="9.70" x2="4.21" y2="7.50"/><line x1="9.70" y1="8.02" x2="7.50" y2="4.21"/>
    </g>
  </symbol></svg>

  <!-- ── Header ── -->
  <div class="header">
    <div class="header-left">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#agimark"/></svg></span>
      <span class="header-title">AGI</span>
      <span
        class="session-identity"
        id="sessionIdentity"
        role="status"
        aria-live="polite"
        style="display:none"
      >
        <span class="session-identity-dot" aria-hidden="true"></span>
        <span class="session-identity-copy">
          <span id="sessionBoundaryLabel"></span><span id="sessionIdentitySeparator" hidden> · </span><span id="sessionProviderLabel"></span>
        </span>
      </span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="newChatBtn" title="New chat" aria-label="New chat">
        <span class="codicon codicon-add" aria-hidden="true"></span>
      </button>
      <button class="icon-btn" id="sessionsBtn" title="Sessions" aria-label="Sessions">
        <span class="codicon codicon-history" aria-hidden="true"></span>
      </button>
      <span class="header-menu-anchor">
        <button
          class="icon-btn"
          id="actionsBtn"
          title="More"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded="false"
        >
          <span class="codicon codicon-ellipsis" aria-hidden="true"></span>
        </button>
        <div class="actions-menu" id="actionsMenu" role="menu" aria-label="AGI Workforce surfaces">
          ${SURFACE_MENU_ITEMS.filter((item) => item.id !== 'account')
            .map(
              (item) => `<button
            type="button"
            class="actions-menu-item"
            role="menuitem"
            data-surface="${item.id}"
          >
            <span class="codicon codicon-${item.icon}" aria-hidden="true"></span>
            <span>${escapeHtml(item.label)}</span>
          </button>`,
            )
            .join('')}
          <div class="actions-menu-separator" role="separator"></div>
          <div class="actions-menu-account">
            <span class="actions-menu-account-name" id="menuAccountName">Not signed in</span>
            <span class="actions-menu-account-plan" id="menuAccountPlan">AGI Cloud account</span>
          </div>
          <button type="button" class="actions-menu-item" role="menuitem" id="menuAccountAction">
            <span class="codicon codicon-sign-in" aria-hidden="true"></span>
            <span id="menuAccountActionLabel">Sign in</span>
          </button>
          <button type="button" class="actions-menu-item" role="menuitem" data-surface="account">
            <span class="codicon codicon-account" aria-hidden="true"></span>
            <span>Account &amp; usage</span>
          </button>
        </div>
      </span>
    </div>
  </div>

  <section class="sessions-sheet" id="sessionsSheet" hidden aria-label="Sessions">
    <div class="sessions-sheet-head">
      <span class="sessions-sheet-title">Sessions</span>
      <button class="icon-btn" id="sessionsSheetClose" title="Close" aria-label="Close sessions">
        <span class="codicon codicon-close" aria-hidden="true"></span>
      </button>
    </div>
    <div class="sessions-sheet-toggle" role="tablist" aria-label="Session source">
      <button type="button" role="tab" id="sessionsTabLocal" aria-selected="true">Local</button>
      <button type="button" role="tab" id="sessionsTabCloud" aria-selected="false">Cloud</button>
    </div>
    <input
      class="sessions-sheet-search"
      id="sessionsSearch"
      type="search"
      placeholder="Search sessions"
      aria-label="Search sessions"
      hidden
    />
    <div class="sessions-sheet-list" id="sessionsSheetList" role="list"></div>
  </section>

  <section
    class="onboarding"
    id="onboarding"
    role="dialog"
    aria-modal="true"
    aria-labelledby="onboardingTitle"
    style="display:${showOnboarding ? 'flex' : 'none'}"
  >
    <div class="onboarding-shell">
      <div class="onboarding-topline">
        <span class="onboarding-progress" id="onboardingProgress">Step 1 of 4</span>
        <div class="onboarding-dots" aria-hidden="true">
          <span class="onboarding-dot active"></span>
          <span class="onboarding-dot"></span>
          <span class="onboarding-dot"></span>
          <span class="onboarding-dot"></span>
        </div>
      </div>

      <article class="onboarding-step" data-onboarding-step="0">
        <h2 id="onboardingTitle" tabindex="-1">Build with AGI in this repository.</h2>
        <p class="onboarding-lede" id="onboardingWorkspaceLede">
          Ask about code, edit through reviewable diffs, and run approved commands, all scoped to this workspace.
        </p>
        <div class="onboarding-inline-actions">
          <button type="button" class="onboarding-link" id="onboardingWorkspaceAction" hidden>Open folder</button>
        </div>
      </article>

      <article class="onboarding-step" data-onboarding-step="1" hidden>
        <h2 tabindex="-1">Foreground here. Background work follows you.</h2>
        <p class="onboarding-lede">
          Cloud runs started on any device appear in the Cloud Tasks view, where you can follow, approve, or stop them.
        </p>
      </article>

      <article class="onboarding-step" data-onboarding-step="2" hidden>
        <h2 tabindex="-1">Describe the intent. Inspect the change.</h2>
        <p class="onboarding-lede">
          Proposed code opens in VS Code's own diff view before you accept it.
        </p>
      </article>

      <article class="onboarding-step" data-onboarding-step="3" hidden>
        <h2 tabindex="-1">You choose authority. You verify the result.</h2>
        <p class="onboarding-lede">
          Ask, Auto, Plan, or Bypass sets how much a session may do on its own, and the header names the active trust boundary.
        </p>
        <div class="onboarding-inline-actions">
          <button type="button" class="onboarding-link" id="onboardingPermissionDocs">Permission docs</button>
          <button type="button" class="onboarding-link" id="onboardingPrivacySettings">Privacy &amp; data controls</button>
        </div>
      </article>

      <div class="onboarding-actions">
        <button type="button" class="onboarding-button onboarding-button--secondary" id="onboardingBack" disabled>Back</button>
        <button type="button" class="onboarding-skip" id="onboardingSkip">Skip intro</button>
        <button type="button" class="onboarding-button onboarding-button--primary" id="onboardingNext">Next</button>
      </div>
    </div>
  </section>

  <div class="runtime-status" id="runtimeStatus" role="status" aria-live="polite">
    <strong id="runtimeStatusTitle">Developer runtime needs setup</strong>
    <span id="runtimeStatusMessage">Checking the workspace developer runtime…</span>
    <div class="runtime-status-actions">
      <button type="button" id="runtimeSettingsBtn">Open setup</button>
      <button type="button" class="runtime-status-secondary" id="runtimeRetryBtn">Try again</button>
    </div>
  </div>

  <!-- ── Usage meter banner ── -->
  <div class="usage-meter-banner" id="usageMeterBanner" style="display:none">
    <span class="codicon codicon-cloud" id="meterCloudIcon" style="display:none" aria-hidden="true"></span>
    <div class="usage-meter-bar-wrap" id="meterBarWrap" style="display:none">
      <div
        class="usage-progress"
        id="meterProgress"
        role="progressbar"
        aria-label="AGI Managed Cloud plan usage"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="0"
      >
        <div class="usage-progress-fill" id="meterFill" style="width:0%;background:var(--accent-teal)"></div>
      </div>
    </div>
    <span class="usage-text" id="meterText"></span>
    <span class="usage-reset" id="meterReset"></span>
    <button class="upgrade-btn" id="upgradeBtn" style="display:none">Upgrade</button>
    <button class="meter-dismiss-btn" id="meterDismissBtn" title="Collapse meter" aria-label="Collapse usage meter">&#215;</button>
  </div>
  <!-- ── Per-limit usage breakdown ── -->
  <ul class="usage-bucket-list" id="meterBuckets" style="display:none" aria-label="Managed Cloud usage limits"></ul>
  <!-- ── Usage meter collapsed pill ── -->
  <div class="usage-meter-collapsed" id="usageMeterCollapsed" style="display:none">
    <button class="meter-restore-btn" id="meterRestoreBtn" title="Show usage details">&#9660; <span id="meterCollapsedLabel">Usage</span></button>
  </div>

  <!-- ── Messages ── -->
  <div id="messages" role="log" aria-live="polite" aria-relevant="additions">
    <div class="empty-state" id="emptyState">
      <div class="empty-state-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#agimark"/></svg></div>
      <div class="empty-state-headline" id="emptyStateHeadline">Build with AGI</div>
      <div class="empty-state-copy" id="emptyStateCopy">Ask about this workspace, edit files, run commands and tests.</div>
    </div>
  </div>

  <!-- ── Input ── -->
  <div class="input-area">
    <!-- Hidden model select (keeps JS working; pill shows selected label) -->
    <select class="model-row" id="modelSelect" aria-label="Model" style="display:none">
      ${modelOptionsHtml}
    </select>

    <!-- Plus-menu popover -->
    <div class="plus-menu" id="plusMenu" role="menu" aria-label="Attach or add context">
      <div class="plus-menu-label" id="plusMenuLabel">Add workspace context</div>
      <button type="button" class="plus-menu-item" id="plusMenuUpload" role="menuitem">
        <span class="pm-icon codicon codicon-files" aria-hidden="true"></span>
        <span class="plus-menu-copy">
          <span class="plus-menu-title">Workspace files</span>
          <span class="plus-menu-description">Pin files in this workspace's Context view</span>
        </span>
      </button>
      <button
        type="button"
        class="plus-menu-item"
        id="plusMenuBrowse"
        role="menuitemcheckbox"
        aria-checked="false"
      >
        <span class="pm-icon codicon codicon-globe" aria-hidden="true"></span>
        <span class="plus-menu-copy">
          <span class="plus-menu-title">Browse the web</span>
          <span class="plus-menu-description">CLI search · Local privacy mode refuses network</span>
        </span>
      </button>
      <button type="button" class="plus-menu-item" id="plusMenuPlanMode" role="menuitem">
        <span class="pm-icon codicon codicon-lightbulb" aria-hidden="true"></span>
        <span class="plus-menu-copy">
          <span class="plus-menu-title">Plan mode</span>
          <span class="plus-menu-description">Review an approach before edits</span>
        </span>
      </button>
      <div class="plus-menu-label">Attach from this window</div>
      <button type="button" class="plus-menu-item" data-context-kind="selection" role="menuitem">
        <span class="pm-icon codicon codicon-selection" aria-hidden="true"></span>
        <span class="plus-menu-copy">
          <span class="plus-menu-title">Selection</span>
          <span class="plus-menu-description"></span>
        </span>
      </button>
      <button type="button" class="plus-menu-item" data-context-kind="open-files" role="menuitem">
        <span class="pm-icon codicon codicon-files" aria-hidden="true"></span>
        <span class="plus-menu-copy">
          <span class="plus-menu-title">Open editors</span>
          <span class="plus-menu-description"></span>
        </span>
      </button>
      <button type="button" class="plus-menu-item" data-context-kind="problems" role="menuitem">
        <span class="pm-icon codicon codicon-warning" aria-hidden="true"></span>
        <span class="plus-menu-copy">
          <span class="plus-menu-title">Problems</span>
          <span class="plus-menu-description"></span>
        </span>
      </button>
      <button type="button" class="plus-menu-item" data-context-kind="git-diff" role="menuitem">
        <span class="pm-icon codicon codicon-git-compare" aria-hidden="true"></span>
        <span class="plus-menu-copy">
          <span class="plus-menu-title">Git changes</span>
          <span class="plus-menu-description"></span>
        </span>
      </button>
    </div>

    <!-- Model picker popover -->
    <div class="model-popover" id="modelPopover" role="menu" aria-label="Select model"></div>

    <!-- Composer card -->
    <div class="composer-card" id="composerCard">
      <div
        class="browse-context-strip"
        id="projectContextStrip"
        role="list"
        aria-label="Active project"
        hidden
      >
        <span class="attachment-chip" role="listitem">
          <span class="codicon codicon-folder" aria-hidden="true"></span>
          <span class="attachment-chip__name" id="projectContextName"></span>
          <button
            type="button"
            class="attachment-chip__remove"
            id="projectContextRemove"
            aria-label="Stop using this project"
          >&#215;</button>
        </span>
      </div>
      <div
        class="browse-context-strip"
        id="browseContextStrip"
        role="list"
        aria-label="Web browsing context"
        hidden
      >
        <span class="attachment-chip" role="listitem">
          <span class="codicon codicon-globe" aria-hidden="true"></span>
          <span class="attachment-chip__name">Browse the web for current sources</span>
          <button
            type="button"
            class="attachment-chip__remove"
            id="browseContextRemove"
            aria-label="Remove web browsing"
          >&#215;</button>
        </span>
      </div>
      <!-- Attachment chips strip, populated by drag-drop / paste / +menu -->
      <div class="attachment-strip" id="attachmentStrip" role="list" aria-label="Pending attachments"></div>
      <div class="input-row">
        <div class="input-wrapper">
          <div class="mention-dropdown" id="mentionDropdown" role="listbox" aria-label="Workspace file suggestions"></div>
          <textarea
            id="userInput"
            placeholder="Ask AGI to do anything…"
            rows="1"
            spellcheck="true"
            aria-label="Chat input"
            aria-autocomplete="list"
            aria-controls="mentionDropdown"
            aria-expanded="false"
          ></textarea>
        </div>
      </div>
      <div class="composer-bottom">
        <button class="plus-btn" id="plusBtn" title="Attach or use tools" aria-label="Attach or use tools" aria-haspopup="menu" aria-expanded="false">+</button>
        <button class="plus-btn" id="slashBtn" title="Commands" aria-label="Commands" aria-haspopup="menu" aria-expanded="false">/</button>
        <button class="model-pill" id="modelPill" title="Model" aria-haspopup="menu" aria-expanded="false">Auto</button>
        <button class="controls-summary" id="controlsSummary" title="Mode and reasoning effort" aria-label="Mode and reasoning effort">${modeLabel} · ${effortLabel}</button>
        <span class="context-usage" id="contextUsage"></span>
        <span class="follow-up-status" id="followUpStatus" role="status" aria-live="polite"></span>
        <button id="stopBtn" title="Stop response" aria-label="Stop response"></button>
        <button id="sendBtn" title="Send (Enter)" aria-label="Send"><span class="send-action-label" id="sendActionLabel"></span></button>
      </div>
      <div class="slash-menu" id="slashMenu" role="menu" aria-label="Commands"></div>
    </div>
    <div class="composer-status">
      <span class="composer-status-route" id="composerStatus" role="status" aria-live="polite">
        <span id="composerStatusBoundary"></span>
        <span id="composerStatusSeparator" aria-hidden="true" hidden>·</span>
        <span id="composerStatusMode">${modeLabel}</span>
      </span>
      <button type="button" class="composer-status-signin" id="composerStatusSignIn" hidden>Sign in</button>
    </div>
  </div>

  <!-- Markdown rendering bundle (markdown-it + DOMPurify). Loaded before the
       inline script so window.agiRender is available when needed. -->
  <script nonce="${nonce}" src="${renderJsUri}"></script>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const messagesEl = document.getElementById('messages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const sendActionLabel = document.getElementById('sendActionLabel');
    const followUpStatus = document.getElementById('followUpStatus');
    const composerHint = document.getElementById('composerHint');
    const modelSelect = document.getElementById('modelSelect');
    const modelPill = document.getElementById('modelPill');
    const modelPopoverEl = document.getElementById('modelPopover');
    const plusBtn = document.getElementById('plusBtn');
    const plusMenu = document.getElementById('plusMenu');
    const plusMenuBrowse = document.getElementById('plusMenuBrowse');
    const browseContextStrip = document.getElementById('browseContextStrip');
    const projectContextStrip = document.getElementById('projectContextStrip');
    const projectContextName = document.getElementById('projectContextName');
    const projectContextRemove = document.getElementById('projectContextRemove');
    const browseContextRemove = document.getElementById('browseContextRemove');
    const actionsBtn = document.getElementById('actionsBtn');
    const actionsMenu = document.getElementById('actionsMenu');
    const menuAccountName = document.getElementById('menuAccountName');
    const menuAccountPlan = document.getElementById('menuAccountPlan');
    const menuAccountAction = document.getElementById('menuAccountAction');
    const menuAccountActionLabel = document.getElementById('menuAccountActionLabel');
    const newChatBtn = document.getElementById('newChatBtn');
    const sessionsBtn = document.getElementById('sessionsBtn');
    const sessionsSheet = document.getElementById('sessionsSheet');
    const sessionsSheetClose = document.getElementById('sessionsSheetClose');
    const sessionsSheetList = document.getElementById('sessionsSheetList');
    const sessionsSearch = document.getElementById('sessionsSearch');
    const sessionsTabLocal = document.getElementById('sessionsTabLocal');
    const sessionsTabCloud = document.getElementById('sessionsTabCloud');
    const slashBtn = document.getElementById('slashBtn');
    const slashMenu = document.getElementById('slashMenu');
    const composerStatusBoundary = document.getElementById('composerStatusBoundary');
    const composerStatusSeparator = document.getElementById('composerStatusSeparator');
    const composerStatusSignIn = document.getElementById('composerStatusSignIn');
    const composerStatusMode = document.getElementById('composerStatusMode');
    const mentionDropdown = document.getElementById('mentionDropdown');
    const sessionIdentity = document.getElementById('sessionIdentity');
    const sessionBoundaryLabel = document.getElementById('sessionBoundaryLabel');
    const sessionIdentitySeparator = document.getElementById('sessionIdentitySeparator');
    const sessionProviderLabel = document.getElementById('sessionProviderLabel');
    const controlsSummary = document.getElementById('controlsSummary');
    const contextUsageEl = document.getElementById('contextUsage');
    const runtimeStatusEl = document.getElementById('runtimeStatus');
    const runtimeStatusTitleEl = document.getElementById('runtimeStatusTitle');
    const runtimeStatusMessageEl = document.getElementById('runtimeStatusMessage');
    const runtimeSettingsBtn = document.getElementById('runtimeSettingsBtn');
    const runtimeRetryBtn = document.getElementById('runtimeRetryBtn');
    const onboardingEl = document.getElementById('onboarding');
    const onboardingSteps = Array.from(document.querySelectorAll('[data-onboarding-step]'));
    const onboardingDots = Array.from(document.querySelectorAll('.onboarding-dot'));
    const onboardingProgress = document.getElementById('onboardingProgress');
    const onboardingBack = document.getElementById('onboardingBack');
    const onboardingNext = document.getElementById('onboardingNext');
    const onboardingSkip = document.getElementById('onboardingSkip');
    const onboardingPermissionDocs = document.getElementById('onboardingPermissionDocs');
    const onboardingPrivacySettings = document.getElementById('onboardingPrivacySettings');
    const onboardingWorkspaceLede = document.getElementById('onboardingWorkspaceLede');
    const onboardingWorkspaceAction = document.getElementById('onboardingWorkspaceAction');

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
    const meterProgress = document.getElementById('meterProgress');
    const meterCollapsedLabel = document.getElementById('meterCollapsedLabel');
    const meterCloudIcon = document.getElementById('meterCloudIcon');
    const meterBuckets = document.getElementById('meterBuckets');

    // Initial collapsed state (injected by extension host)
    var meterCollapsed = ${meterCollapsed ? 'true' : 'false'};
    var activeRuntimeSource = null;
    // Plan usage and the runtime trust boundary have different authorities.
    // The account usage endpoint can describe the signed-in account, but only
    // ThreadSummary.trustMode from the CLI proves whether this developer session is Local,
    // BYOK, or Managed Cloud. Keep the header neutral until that summary arrives.
    var sessionBoundaryAuthoritative = false;
    var activeAccountIdentity = null;
    var activeAccountStatus = 'loading';
    var activeProviderIdentity = '';
    var activeMode = '${initialMode}';
    var activeEffort = '${initialEffort}';
    var activeSupportsEffort = ${supportsEffort ? 'true' : 'false'};
    var runtimeBlock = null;
    var lastUsageMeterPayload = null;
    var onboardingStep = 0;

    // ── First-run onboarding helpers ──────────────────────────────────────────
    function renderOnboardingStep(shouldFocus) {
      if (!onboardingEl || onboardingSteps.length === 0) return;
      onboardingStep = Math.max(0, Math.min(onboardingSteps.length - 1, onboardingStep));
      onboardingSteps.forEach(function(step, index) {
        step.hidden = index !== onboardingStep;
      });
      onboardingDots.forEach(function(dot, index) {
        dot.classList.toggle('active', index === onboardingStep);
      });
      if (onboardingProgress) {
        onboardingProgress.textContent = 'Step ' + (onboardingStep + 1) + ' of ' + onboardingSteps.length;
      }
      if (onboardingBack) onboardingBack.disabled = onboardingStep === 0;
      if (onboardingNext) {
        onboardingNext.textContent =
          onboardingStep === onboardingSteps.length - 1 ? 'Start using AGI' : 'Next';
      }
      var heading = onboardingSteps[onboardingStep].querySelector('h2');
      if (heading) {
        heading.id = 'onboardingStepTitle' + onboardingStep;
        onboardingEl.setAttribute('aria-labelledby', heading.id);
        if (shouldFocus) heading.focus();
      }
    }

    function setOnboardingVisible(visible) {
      if (!onboardingEl) return;
      onboardingEl.style.display = visible ? 'flex' : 'none';
      onboardingEl.setAttribute('aria-hidden', String(!visible));
      [
        messagesEl,
        document.querySelector('.input-area'),
        document.querySelector('.header-actions'),
        runtimeStatusEl,
        usageMeterBanner,
        usageMeterCollapsed,
      ].forEach(function(element) {
        if (element) element.inert = visible;
      });
      if (visible) {
        onboardingStep = 0;
        renderOnboardingStep(true);
      } else if (userInput) {
        userInput.focus();
      }
    }

    function onboardingFocusableElements() {
      if (!onboardingEl) return [];
      return Array.prototype.slice.call(
        onboardingEl.querySelectorAll(
          'button:not([disabled]):not([hidden]), [href]:not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])',
        ),
      ).filter(function(element) {
        return element.getAttribute('aria-hidden') !== 'true' && element.closest('[hidden]') === null;
      });
    }

    function completeOnboarding() {
      setOnboardingVisible(false);
      vscode.postMessage({ type: 'completeOnboarding' });
    }

    function renderOnboardingWorkspaceState(status) {
      if (onboardingSteps.length === 0) return;
      var heading = onboardingSteps[0].querySelector('h2');
      if (!heading || !onboardingWorkspaceLede || !onboardingWorkspaceAction) return;
      if (status === 'workspace-required') {
        heading.textContent = 'Open a workspace to begin.';
        onboardingWorkspaceLede.textContent =
          'Choose a folder before AGI can read project context, attach files, or propose reviewable changes.';
        onboardingWorkspaceAction.textContent = 'Open folder';
        onboardingWorkspaceAction.hidden = false;
      } else if (status === 'workspace-untrusted') {
        heading.textContent = 'Review this workspace first.';
        onboardingWorkspaceLede.textContent =
          'AGI keeps project files and tools disabled while VS Code is in Restricted Mode.';
        onboardingWorkspaceAction.textContent = 'Manage trust';
        onboardingWorkspaceAction.hidden = false;
      } else if (status === 'unavailable') {
        heading.textContent = 'Connect the developer runtime.';
        onboardingWorkspaceLede.textContent =
          'This workspace is open, but the local AGI runtime is not ready yet.';
        onboardingWorkspaceAction.textContent = 'Open runtime setup';
        onboardingWorkspaceAction.hidden = false;
      } else {
        heading.textContent = 'Build with AGI in this repository.';
        onboardingWorkspaceLede.textContent =
          'Ask about code, edit through reviewable diffs, and run approved commands, all scoped to this workspace.';
        onboardingWorkspaceAction.hidden = true;
      }
    }

    if (onboardingBack) {
      onboardingBack.addEventListener('click', function() {
        if (onboardingStep === 0) return;
        onboardingStep -= 1;
        renderOnboardingStep(true);
      });
    }
    if (onboardingNext) {
      onboardingNext.addEventListener('click', function() {
        if (onboardingStep === onboardingSteps.length - 1) {
          completeOnboarding();
          return;
        }
        onboardingStep += 1;
        renderOnboardingStep(true);
      });
    }
    if (onboardingSkip) onboardingSkip.addEventListener('click', completeOnboarding);
    if (onboardingPermissionDocs) {
      onboardingPermissionDocs.addEventListener('click', function() {
        vscode.postMessage({ type: 'openPermissionDocs' });
      });
    }
    if (onboardingPrivacySettings) {
      onboardingPrivacySettings.addEventListener('click', function() {
        vscode.postMessage({ type: 'openPrivacySettings' });
      });
    }
    if (onboardingWorkspaceAction) {
      onboardingWorkspaceAction.addEventListener('click', function() {
        vscode.postMessage({
          type: runtimeBlock === 'workspace-required'
            ? 'openWorkspace'
            : runtimeBlock === 'workspace-untrusted'
              ? 'manageWorkspaceTrust'
              : 'openSettings'
        });
      });
    }
    if (onboardingEl) {
      onboardingEl.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') completeOnboarding();
        if (event.key !== 'Tab') return;
        // The screen-reader contract says this is a modal dialog. The inert state
        // protects the rest of the sidebar, but it does not cycle focus back
        // to the dialog's first/last control when keyboard users reach an end.
        var focusable = onboardingFocusableElements();
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    }

    // ── Usage meter helpers ───────────────────────────────────────────────────
    function applyMeterCollapsed(collapsed) {
      meterCollapsed = collapsed;
      if (meterBuckets && meterBuckets.childElementCount > 0) {
        meterBuckets.style.display = collapsed ? 'none' : 'block';
      }
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

    // Trust boundary shown in the header pill. Local / BYOK / Managed Cloud are
    // separate boundaries. Account usage may prepare presentation data, but the
    // pill names one only after the CLI reports the authoritative session route.
    // Managed Cloud is the only route that leaves the machine, so it is the only
    // one styled as a warning.
    var SESSION_IDENTITY_BY_SOURCE = {
      'unbounded': { label: 'Local', boundary: 'local', showProvider: false, title: 'Workspace-local runtime - nothing leaves this machine' },
      'user-api-key': { label: 'Your key', boundary: 'byok', showProvider: true, title: 'Your own API key - requests go straight to the provider' },
      'managed-plan': { label: 'Managed', boundary: 'cloud', showProvider: false, title: 'AGI Managed Cloud - prompts are sent to AGI infrastructure' },
      'managed-unavailable': { label: 'Cloud unavailable', boundary: 'none', showProvider: false, title: 'The signed-in AGI plan does not currently include Managed Cloud developer access' },
      'runtime-unavailable': { label: 'Runtime unavailable', boundary: 'none', showProvider: false, title: 'Connect the workspace-scoped AGI CLI before selecting a Local, your-key, or Managed Cloud boundary' },
    };

    function renderSessionIdentity() {
      if (!sessionIdentity || !sessionBoundaryLabel || !sessionProviderLabel ||
          !sessionIdentitySeparator || !activeRuntimeSource) return;
      if (runtimeBlock === 'workspace-required') {
        renderNoWorkspaceIdentity();
        return;
      }
      if (runtimeBlock === 'workspace-untrusted') {
        renderBlockedWorkspaceIdentity();
        return;
      }
      if (!sessionBoundaryAuthoritative) {
        // Naming a route the CLI has not confirmed would be a claim about where
        // the prompt goes. Say nothing until the session summary arrives.
        sessionBoundaryLabel.textContent = '';
        sessionProviderLabel.textContent = '';
        sessionIdentitySeparator.hidden = true;
        sessionIdentity.setAttribute('data-boundary', 'none');
        sessionIdentity.removeAttribute('title');
        sessionIdentity.removeAttribute('aria-label');
        sessionIdentity.style.display = 'none';
        return;
      }
      // An unrecognised source falls back to the cloud label on purpose: never
      // claim "Local" for a boundary this webview cannot identify.
      var spec = SESSION_IDENTITY_BY_SOURCE[activeRuntimeSource] || SESSION_IDENTITY_BY_SOURCE['managed-plan'];
      var showProviderIdentity = spec.showProvider;
      sessionBoundaryLabel.textContent = spec.label;
      sessionProviderLabel.textContent = showProviderIdentity ? activeProviderIdentity : '';
      sessionIdentitySeparator.hidden = !showProviderIdentity || !activeProviderIdentity;
      sessionIdentity.setAttribute('data-boundary', spec.boundary);
      var title = spec.title;
      if (activeProviderIdentity && activeRuntimeSource !== 'runtime-unavailable') {
        title += ' · Provider: ' + activeProviderIdentity;
      }
      if (activeAccountIdentity &&
          (activeRuntimeSource === 'managed-plan' || activeRuntimeSource === 'managed-unavailable')) {
        title += ' · Account: ' + activeAccountIdentity.displayName;
        if (activeAccountIdentity.email) title += ' (' + activeAccountIdentity.email + ')';
        title += ' · ' + activeAccountIdentity.planName + ' plan';
      } else if (activeAccountIdentity && activeRuntimeSource === 'user-api-key') {
        title += ' · AGI Cloud sign-in: ' + activeAccountIdentity.displayName +
          ' (not used for provider billing)';
      }
      sessionIdentity.title = title;
      sessionIdentity.setAttribute('aria-label', spec.label +
        (showProviderIdentity && activeProviderIdentity ? ' using ' + activeProviderIdentity : '') + '. ' + title);
      sessionIdentity.style.display = 'inline-flex';
      renderComposerStatus(spec.label);
    }

    function renderNoWorkspaceIdentity() {
      if (!sessionIdentity || !sessionBoundaryLabel || !sessionProviderLabel ||
          !sessionIdentitySeparator) return;
      sessionBoundaryLabel.textContent = 'No workspace';
      sessionProviderLabel.textContent = '';
      sessionIdentitySeparator.hidden = true;
      sessionIdentity.setAttribute('data-boundary', 'none');
      sessionIdentity.title =
        'Open a workspace before choosing a Local, BYOK, or Managed Cloud developer-session boundary.';
      sessionIdentity.setAttribute('aria-label', sessionIdentity.title);
      sessionIdentity.style.display = 'inline-flex';
    }

    function renderBlockedWorkspaceIdentity() {
      if (!sessionIdentity || !sessionBoundaryLabel || !sessionProviderLabel ||
          !sessionIdentitySeparator) return;
      sessionBoundaryLabel.textContent = 'Restricted workspace';
      sessionProviderLabel.textContent = '';
      sessionIdentitySeparator.hidden = true;
      sessionIdentity.setAttribute('data-boundary', 'none');
      sessionIdentity.title =
        'Workspace Trust is required before a Local, BYOK, or Managed Cloud developer session can access this project.';
      sessionIdentity.setAttribute('aria-label', sessionIdentity.title);
      sessionIdentity.style.display = 'inline-flex';
    }

    function updateProviderBadge(providerLabel) {
      activeProviderIdentity = providerLabel || '';
      renderSessionIdentity();
    }

    function updateRuntimePill(source) {
      // Runtime/account messages can arrive in either order after reload. Once
      // the host has declared this workspace runtime unavailable, a stale model
      // or meter event must not replace that honest state with a usable Local,
      // BYOK, or Managed Cloud claim.
      if (runtimeBlock !== null && source !== 'runtime-unavailable') return;
      activeRuntimeSource = source;
      renderSessionIdentity();
    }

    function applyAuthoritativeSessionBoundary(trustMode, provider) {
      sessionBoundaryAuthoritative = true;
      activeProviderIdentity = provider || '';
      updateRuntimePill(trustMode === 'local'
        ? 'unbounded'
        : trustMode === 'byok'
          ? 'user-api-key'
          : 'managed-plan');
    }

    function resetAuthoritativeSessionBoundary() {
      sessionBoundaryAuthoritative = false;
      renderSessionIdentity();
    }

    function renderUsageBuckets(payload) {
      if (!meterBuckets) return;
      meterBuckets.textContent = '';
      var rows = (payload && payload.buckets) || [];
      var emptyLabel = (payload && payload.bucketsEmptyLabel) || null;
      var credits = (payload && payload.credits) || null;
      if (rows.length === 0 && emptyLabel === null && credits === null) {
        meterBuckets.style.display = 'none';
        return;
      }
      if (rows.length === 0) {
        var emptyItem = document.createElement('li');
        emptyItem.className = 'usage-bucket-row';
        emptyItem.textContent = emptyLabel;
        meterBuckets.appendChild(emptyItem);
      } else {
        rows.forEach(function(row) {
          var item = document.createElement('li');
          item.className = row.binding ? 'usage-bucket-row binding' : 'usage-bucket-row';
          var label = document.createElement('span');
          label.className = 'usage-bucket-label';
          label.textContent = row.label;
          var remaining = document.createElement('span');
          remaining.className = 'usage-bucket-remaining';
          remaining.textContent = row.remainingLabel;
          var reset = document.createElement('span');
          reset.className = 'usage-bucket-reset';
          reset.textContent = row.resetsIn || 'No reset pending';
          item.appendChild(label);
          item.appendChild(remaining);
          item.appendChild(reset);
          meterBuckets.appendChild(item);
        });
      }
      if (credits !== null) {
        var creditItem = document.createElement('li');
        creditItem.className = 'usage-bucket-row usage-credit-row';
        var creditLabel = document.createElement('span');
        creditLabel.className = 'usage-bucket-label';
        creditLabel.textContent = credits.label;
        var creditBalance = document.createElement('span');
        creditBalance.className = 'usage-bucket-remaining';
        creditBalance.textContent = credits.balanceLabel;
        var creditSpendability = document.createElement('span');
        creditSpendability.className = 'usage-bucket-reset';
        creditSpendability.textContent = credits.spendabilityLabel;
        var creditTopUp = document.createElement('button');
        creditTopUp.type = 'button';
        creditTopUp.className = 'usage-credit-topup';
        creditTopUp.textContent = credits.topUpLabel;
        creditTopUp.addEventListener('click', function() {
          vscode.postMessage({ type: 'manageBilling' });
        });
        creditItem.appendChild(creditLabel);
        creditItem.appendChild(creditBalance);
        creditItem.appendChild(creditSpendability);
        creditItem.appendChild(creditTopUp);
        meterBuckets.appendChild(creditItem);
      }
      meterBuckets.style.display = meterCollapsed ? 'none' : 'block';
    }

    function renderUsageMeter(payload) {
      lastUsageMeterPayload = payload;
      if (runtimeBlock !== null) {
        if (usageMeterBanner) usageMeterBanner.style.display = 'none';
        if (usageMeterCollapsed) usageMeterCollapsed.style.display = 'none';
        renderUsageBuckets(null);
        if (runtimeBlock === 'workspace-required') renderNoWorkspaceIdentity();
        else if (runtimeBlock === 'workspace-untrusted') renderBlockedWorkspaceIdentity();
        else updateRuntimePill('runtime-unavailable');
        return;
      }
      if (!sessionBoundaryAuthoritative && activeAccountStatus !== 'expired') {
        updateRuntimePill(payload.managedDeveloperEligible === false
          ? 'managed-unavailable'
          : payload.source);
      }

      if (!usageMeterBanner || !meterFill || !meterText || !meterReset || !upgradeBtn ||
          !meterBarWrap || !meterCloudIcon) return;

      var bucketsPayload = null;

      // Reset all conditional elements
      meterCloudIcon.style.display = 'none';
      meterBarWrap.style.display = 'none';
      upgradeBtn.style.display = 'none';
      usageMeterBanner.classList.remove('warn');
      upgradeBtn.textContent = 'Upgrade';
      upgradeBtn.dataset.action = 'upgrade';
      if (meterCollapsedLabel) meterCollapsedLabel.textContent = 'Usage';

      if (activeAccountStatus === 'expired') {
        meterText.textContent = 'AGI Cloud session expired';
        meterReset.textContent = '· Local and provider BYOK remain available';
        upgradeBtn.textContent = 'Sign in again';
        upgradeBtn.dataset.action = 'account';
        upgradeBtn.style.display = 'inline-block';
        usageMeterBanner.classList.add('warn');
        if (meterCollapsedLabel) meterCollapsedLabel.textContent = 'Account needs attention';
      } else if (payload.managedDeveloperEligible === false && payload.accountPlanTier) {
        meterCloudIcon.style.display = 'inline';
        var planLabel = payload.accountPlanTier.charAt(0).toUpperCase() + payload.accountPlanTier.slice(1).replace(/_/g, ' ');
        var paidPlanNeedsAttention = ['pro', 'max', 'max_15x', 'team', 'enterprise'].includes(payload.accountPlanTier);
        meterText.textContent = paidPlanNeedsAttention
          ? planLabel + ' subscription needs attention · Managed Cloud paused'
          : planLabel + ' account · Managed developer access requires Pro or above';
        meterReset.textContent = '· Local and provider BYOK remain available';
        upgradeBtn.textContent = paidPlanNeedsAttention ? 'Manage billing' : 'Upgrade';
        upgradeBtn.dataset.action = paidPlanNeedsAttention ? 'billing' : 'upgrade';
        upgradeBtn.style.display = 'inline-block';
        usageMeterBanner.classList.add('warn');
        if (meterCollapsedLabel) meterCollapsedLabel.textContent = paidPlanNeedsAttention
          ? 'Billing needs attention'
          : 'Upgrade for Cloud';
      } else if (payload.source === 'unbounded' || payload.source === 'user-api-key') {
        // Neither route has an AGI quota, so the meter has nothing to meter.
        // The route itself is named in the header chip and the composer status
        // line, and the billing consequence lives in Account & usage.
        usageMeterBanner.style.display = 'none';
        usageMeterCollapsed.style.display = 'none';
        renderUsageBuckets(null);
        return;
      } else {
        // managed-plan
        bucketsPayload = payload;
        meterBarWrap.style.display = payload.remaining !== null ? 'flex' : 'none';
        var pct = payload.remaining !== null ? payload.remaining * 100 : 100;
        var usedPct = 100 - pct;
        var fillColor = pct < 20 ? 'var(--agi-vscode-terra)' : pct < 40 ? 'var(--warning)' : 'var(--accent-teal)';
        meterFill.style.width = Math.max(0, Math.min(100, usedPct)) + '%';
        meterFill.style.background = fillColor;
        if (meterProgress) {
          meterProgress.setAttribute('aria-valuenow', String(Math.round(usedPct)));
          meterProgress.setAttribute('aria-valuetext', Math.round(usedPct) + '% of plan usage used');
        }
        var exhausted = payload.remaining !== null && payload.remaining <= 0;
        meterText.textContent = exhausted
          ? 'Managed Cloud quota exhausted'
          : 'Usage: ' + (payload.usageLabel || 'Managed usage unavailable');
        meterReset.textContent = payload.resetsIn ? '· ' + payload.resetsIn : '';
        if (exhausted && meterCollapsedLabel) meterCollapsedLabel.textContent = 'Quota exhausted';
        if (payload.showUpgrade) {
          upgradeBtn.style.display = 'inline-block';
          usageMeterBanner.classList.add('warn');
        }
      }

      renderUsageBuckets(bucketsPayload);

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

    if (runtimeSettingsBtn) {
      runtimeSettingsBtn.addEventListener('click', function() {
        vscode.postMessage({
          type: runtimeBlock === 'workspace-required'
            ? 'openWorkspace'
            : runtimeBlock === 'workspace-untrusted'
              ? 'manageWorkspaceTrust'
              : 'openSettings'
        });
      });
    }

    if (runtimeRetryBtn) {
      runtimeRetryBtn.addEventListener('click', function() {
        if (runtimeRetryBtn.disabled) return;
        vscode.postMessage({ type: 'retryRuntime' });
      });
    }

    // Upgrade button, opens pricing page via extension host
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', function() {
        vscode.postMessage({
          type: upgradeBtn.dataset.action === 'account'
            ? 'openAccount'
            : upgradeBtn.dataset.action === 'billing'
              ? 'manageBilling'
              : 'upgradeClicked'
        });
      });
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let streaming = false;
    let mentionIndex = -1;
    let mentionStart = -1;
    let pendingFileReferences = [];
    let activePlanCard = null;
    let currentAssistantEl = null;
    let accumulatedContent = '';
    let pendingAttachmentCount = 0;
    let browseWebEnabled = false;
    let followUpBehavior = '${followUpBehaviorLiteral}';
    let followUpStatusTimer = null;
    let clientMessageSeq = 0;
    let activeQueuedClientMessageId = null;

    function syncComposerAvailability() {
      var blocked = runtimeBlock !== null;
      userInput.disabled = blocked;
      if (plusBtn) plusBtn.disabled = blocked;
      if (modelPill) modelPill.disabled = blocked;
      if (controlsSummary) controlsSummary.disabled = blocked;
      sendBtn.disabled = blocked;
      if (blocked) {
        closeModelPopover();
        if (plusMenu) plusMenu.classList.remove('open');
        setBrowseWebEnabled(false);
      }
    }

    function setRuntimeRetryBusy(busy) {
      if (!runtimeRetryBtn) return;
      runtimeRetryBtn.disabled = busy;
      runtimeRetryBtn.textContent = busy ? 'Checking…' : 'Try again';
    }

    function renderRuntimeProbing() {
      if (!runtimeStatusEl || !runtimeStatusTitleEl || !runtimeStatusMessageEl) return;
      runtimeStatusTitleEl.textContent = 'Checking the developer runtime…';
      runtimeStatusMessageEl.textContent =
        'Starting the AGI CLI and asking it which models this workspace can reach.';
      runtimeStatusEl.style.display = 'flex';
      setRuntimeRetryBusy(true);
    }

    function renderRuntimeAvailability(status, message) {
      if (status === 'probing') {
        renderRuntimeProbing();
        return;
      }
      setRuntimeRetryBusy(false);
      runtimeBlock = status === 'ready' ? null : status;
      renderOnboardingWorkspaceState(status);
      var headline = document.getElementById('emptyStateHeadline');
      var copy = document.getElementById('emptyStateCopy');
      if (status === 'ready') {
        runtimeStatusEl.style.display = 'none';
        if (headline) headline.textContent = 'Build with AGI';
        if (copy) copy.textContent =
          'Ask about this workspace, edit files, run commands and tests.';
        if (lastUsageMeterPayload) renderUsageMeter(lastUsageMeterPayload);
      } else {
        var workspaceRequired = status === 'workspace-required';
        var workspaceUntrusted = status === 'workspace-untrusted';
        runtimeStatusTitleEl.textContent = workspaceRequired
          ? 'Open a workspace to begin'
          : workspaceUntrusted
            ? 'Workspace is in Restricted Mode'
            : 'Developer runtime needs setup';
        runtimeStatusMessageEl.textContent = message || (workspaceRequired
          ? 'Open a folder or workspace to begin.'
          : workspaceUntrusted
            ? 'Trust this workspace before AGI can use project files or tools.'
            : 'The AGI CLI is unavailable.');
        runtimeSettingsBtn.textContent = workspaceRequired
          ? 'Open folder'
          : workspaceUntrusted
            ? 'Manage trust'
            : 'Open setup';
        runtimeStatusEl.style.display = 'flex';
        if (headline) headline.textContent = workspaceRequired
          ? 'Open a workspace'
          : workspaceUntrusted
            ? 'Review this workspace first'
            : 'Connect the developer runtime';
        if (copy) copy.textContent = workspaceRequired
          ? 'Choose a folder to establish the developer-session scope.'
          : workspaceUntrusted
            ? 'Project context and tools stay disabled until you trust this workspace.'
            : 'No workspace prompt will be sent until the protocol-7 runtime connects.';
        if (usageMeterBanner) usageMeterBanner.style.display = 'none';
        if (usageMeterCollapsed) usageMeterCollapsed.style.display = 'none';
        renderUsageBuckets(null);
        if (workspaceRequired) renderNoWorkspaceIdentity();
        if (workspaceUntrusted) renderBlockedWorkspaceIdentity();
        if (!workspaceRequired && !workspaceUntrusted) updateRuntimePill('runtime-unavailable');
      }
      userInput.placeholder = runtimeBlock === 'workspace-required'
        ? 'Open a workspace to start chatting'
        : runtimeBlock === 'workspace-untrusted'
          ? 'Trust this workspace to start chatting'
          : runtimeBlock === 'unavailable'
            ? 'Set up the developer runtime to start chatting'
            : 'Ask AGI to do anything…';
      syncComposerAvailability();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function capitalizeControl(value) {
      return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
    }

    var currentModelLabel = 'Auto';
    function renderModelPill() {
      if (!modelPill) return;
      var effort = capitalizeControl(activeEffort);
      var effortShort = effort === 'Medium' ? 'Med' : effort;
      var nameEl = document.createElement('span');
      nameEl.className = 'model-pill-name';
      nameEl.textContent = currentModelLabel;
      modelPill.replaceChildren(nameEl);
      if (activeSupportsEffort && effortShort) {
        var effortEl = document.createElement('span');
        effortEl.className = 'model-pill-effort';
        effortEl.textContent = ' · ' + effortShort;
        modelPill.appendChild(effortEl);
      }
      modelPill.title = activeSupportsEffort && effortShort
        ? currentModelLabel + ' · ' + effortShort + ' effort'
        : currentModelLabel;
    }

    function renderControlsSummary() {
      if (!controlsSummary) return;
      var mode = capitalizeControl(activeMode);
      var effort = capitalizeControl(activeEffort);
      controlsSummary.textContent = mode;
      renderModelPill();
      var fullLabel = 'Controls: ' + mode + ' mode' +
        (activeSupportsEffort ? ', ' + effort + ' effort' : ', effort unavailable for this model');
      controlsSummary.title = fullLabel;
      controlsSummary.setAttribute('aria-label', fullLabel);
      renderComposerStatus(null);
    }

    function formatContextTokens(count) {
      if (count < 1000) return String(count);
      if (count < 1000000) return (count / 1000).toFixed(count < 10000 ? 1 : 0) + 'k';
      return (count / 1000000).toFixed(1) + 'M';
    }

    function clearContextUsage() {
      if (!contextUsageEl) return;
      contextUsageEl.textContent = '';
      contextUsageEl.className = 'context-usage';
      contextUsageEl.removeAttribute('title');
    }

    function renderContextUsage(usedTokens, contextWindow) {
      if (!contextUsageEl) return;
      if (typeof usedTokens !== 'number' || !isFinite(usedTokens) || usedTokens <= 0) {
        clearContextUsage();
        return;
      }
      var used = formatContextTokens(usedTokens);
      if (typeof contextWindow !== 'number' || !isFinite(contextWindow) || contextWindow <= 0) {
        contextUsageEl.textContent = used + ' tok';
        contextUsageEl.className = 'context-usage visible';
        contextUsageEl.title = 'Last turn used ' + usedTokens.toLocaleString() +
          ' tokens. The context window for this model is not known here.';
        return;
      }
      var pct = Math.min(100, Math.round((usedTokens / contextWindow) * 100));
      contextUsageEl.textContent = used + ' / ' + formatContextTokens(contextWindow);
      contextUsageEl.className = 'context-usage visible' +
        (pct >= 90 ? ' is-critical' : pct >= 75 ? ' is-high' : '');
      contextUsageEl.title = 'Context after the last turn: ' + usedTokens.toLocaleString() +
        ' of ' + contextWindow.toLocaleString() + ' tokens (' + pct + '%)';
    }

    function mountEmptyState() {
      var mounted = document.createElement('div');
      mounted.className = 'empty-state';
      mounted.id = 'emptyState';
      mounted.innerHTML = '<div class="empty-state-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#agimark"></use></svg></div>' +
        '<div class="empty-state-headline" id="emptyStateHeadline">Build with AGI</div>' +
        '<div class="empty-state-copy" id="emptyStateCopy">Ask about this workspace, edit files, run commands and tests.</div>';
      messagesEl.appendChild(mounted);
      emptyStateEl = mounted;
    }

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    renderControlsSummary();

    function userMessageById(id) {
      if (!id) return null;
      var messages = messagesEl.querySelectorAll('.message.user[data-client-message-id]');
      for (var i = 0; i < messages.length; i++) {
        if (messages[i].getAttribute('data-client-message-id') === id) return messages[i];
      }
      return null;
    }

    function setUserMessageState(id, state) {
      var message = userMessageById(id);
      if (!message) return;
      if (state) message.setAttribute('data-delivery-state', state);
      else message.removeAttribute('data-delivery-state');
    }

    function setBrowseWebEnabled(enabled) {
      browseWebEnabled = Boolean(enabled);
      if (plusMenuBrowse) {
        plusMenuBrowse.setAttribute('aria-checked', String(browseWebEnabled));
      }
      if (browseContextStrip) browseContextStrip.hidden = !browseWebEnabled;
    }

    function setActiveProject(name) {
      var label = typeof name === 'string' ? name.trim() : '';
      if (projectContextName) projectContextName.textContent = label;
      if (projectContextStrip) projectContextStrip.hidden = label === '';
    }

    function showTyping() {
      const div = document.createElement('div');
      div.className = 'typing-indicator';
      div.id = 'typingIndicator';
      div.setAttribute('role', 'status');
      div.setAttribute('aria-label', 'AGI is responding');
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
      if (composerCard) composerCard.classList.toggle('is-streaming', value);
      sendBtn.disabled = runtimeBlock !== null;
      sendBtn.classList.toggle('follow-up', value);
      var actionLabel = followUpBehavior === 'steer' ? 'Steer' : 'Queue';
      if (sendActionLabel) sendActionLabel.textContent = value ? actionLabel : '';
      sendBtn.setAttribute('aria-label', value ? actionLabel + ' follow-up' : 'Send');
      sendBtn.setAttribute(
        'title',
        value
          ? actionLabel + ' follow-up (Enter) · ' + (followUpBehavior === 'steer' ? 'Queue' : 'Steer') + ' once (Cmd/Ctrl+Enter)'
          : 'Send (Enter)'
      );
      if (stopBtn) stopBtn.classList.toggle('visible', value);
      userInput.disabled = runtimeBlock !== null;
      if (composerHint) {
        composerHint.innerHTML = value
          ? '<kbd>Enter</kbd> to ' + actionLabel.toLowerCase() + ' · <kbd>Cmd/Ctrl+Enter</kbd> to ' +
              (followUpBehavior === 'steer' ? 'queue' : 'steer') + ' once · <kbd>Shift+Enter</kbd> for newline'
          : '<kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline';
      }
    }

    function showFollowUpStatus(message, kind, sticky) {
      if (!followUpStatus) return;
      window.clearTimeout(followUpStatusTimer);
      followUpStatus.textContent = message || '';
      followUpStatus.classList.toggle('visible', Boolean(message));
      followUpStatus.classList.toggle('error', kind === 'error');
      if (message && !sticky) {
        followUpStatusTimer = window.setTimeout(function() {
          followUpStatus.textContent = '';
          followUpStatus.classList.remove('visible', 'error');
        }, 2600);
      }
    }

    function autoResize() {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
    }

    function closeModelPopover() {
      if (!modelPopoverEl) return;
      modelPopoverEl.classList.remove('open');
      if (modelPill) modelPill.setAttribute('aria-expanded', 'false');
    }

    function openModelLoading() {
      if (!modelPopoverEl) return;
      modelPopoverEl.innerHTML = '';
      var loading = document.createElement('div');
      loading.className = 'model-popover__empty';
      loading.setAttribute('role', 'status');
      loading.textContent = 'Checking available models…';
      modelPopoverEl.appendChild(loading);
      modelPopoverEl.classList.add('open');
      if (modelPill) modelPill.setAttribute('aria-expanded', 'true');
    }

    function fallbackModelGroups() {
      var models = [];
      if (modelSelect) {
        var options = modelSelect.querySelectorAll('option');
        for (var i = 0; i < options.length; i++) {
          if (options[i].disabled) continue;
          models.push({
            id: options[i].value,
            label: options[i].textContent || options[i].value,
            description: ''
          });
        }
      }
      return models.length > 0 ? [{
        label: 'Availability resolving',
        description: 'The host validates routing before selection',
        boundary: 'unavailable',
        models: models
      }] : [];
    }

    function openModelPopover(groups, currentModel) {
      if (!modelPopoverEl) return;
      var safeGroups = Array.isArray(groups) && groups.length > 0 ? groups : fallbackModelGroups();
      modelPopoverEl.innerHTML = '';

      if (safeGroups.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'model-popover__empty';
        empty.textContent = 'No models available';
        modelPopoverEl.appendChild(empty);
      }

      for (var groupIndex = 0; groupIndex < safeGroups.length; groupIndex++) {
        var group = safeGroups[groupIndex];
        if (!group || !Array.isArray(group.models) || group.models.length === 0) continue;

        var groupLabel = document.createElement('div');
        groupLabel.className = 'model-popover__group';
        if (group.boundary) groupLabel.dataset.boundary = group.boundary;
        var groupTitle = document.createElement('span');
        groupTitle.className = 'model-popover__group-title';
        groupTitle.textContent = group.label || 'Models';
        groupLabel.appendChild(groupTitle);
        if (group.description) {
          var groupDescription = document.createElement('span');
          groupDescription.className = 'model-popover__group-description';
          groupDescription.textContent = group.description;
          groupLabel.appendChild(groupDescription);
        }
        modelPopoverEl.appendChild(groupLabel);

        for (var modelIndex = 0; modelIndex < group.models.length; modelIndex++) {
          var model = group.models[modelIndex];
          if (!model || !model.id) continue;

          var option = document.createElement('button');
          option.type = 'button';
          option.className = 'model-popover__option' + (model.id === currentModel ? ' is-active' : '');
          option.setAttribute('role', 'menuitemradio');
          option.setAttribute('aria-checked', String(model.id === currentModel));
          option.dataset.modelId = model.id;
          option.disabled = Boolean(model.disabled);
          if (model.disabled) option.setAttribute('aria-disabled', 'true');

          var label = document.createElement('span');
          label.className = 'model-popover__label';
          label.textContent = model.label || model.id;
          option.appendChild(label);

          if (model.description) {
            var description = document.createElement('span');
            description.className = 'model-popover__description';
            description.textContent = model.description;
            option.appendChild(description);
          }

          option.addEventListener('click', function(event) {
            if (event.currentTarget.disabled) return;
            var target = event.currentTarget;
            var modelId = target && target.dataset ? target.dataset.modelId : '';
            if (!modelId) return;
            // The privileged host re-checks tier/provider reachability. Keep
            // the last confirmed pill until its canonical model event lands;
            // otherwise a rejected selection is displayed as active.
            closeModelPopover();
            vscode.postMessage({ type: 'selectModel', payload: { modelId: modelId } });
          });

          modelPopoverEl.appendChild(option);
        }
      }

      modelPopoverEl.classList.add('open');
      if (modelPill) modelPill.setAttribute('aria-expanded', 'true');
      // Land on the current model so arrow keys start somewhere meaningful.
      var options = menuItemsOf(modelPopoverEl);
      var activeIndex = options.findIndex(function (option) {
        return option.getAttribute('aria-checked') === 'true';
      });
      focusMenuItem(modelPopoverEl, activeIndex >= 0 ? activeIndex : 0);
    }

    // ── Markdown rendering, delegated to window.agiRender ────────────────
    // The bundled out/webview/render.js defines window.agiRender(text) via
    // markdown-it + DOMPurify. If for any reason it failed to load, fall
    // back to plain text (no markdown), never raw innerHTML of LLM output.
    // Audit PR-2A (F-02, F-10).
    function renderAssistant(text) {
      if (typeof window.agiRender === 'function') {
        return window.agiRender(text);
      }
      // Fallback: escape + preserve newlines. No markdown formatting.
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\\n/g, '<br>');
    }

    // Path references inside rendered output are spans, not anchors, because
    // the sanitizer only allows http/mailto hrefs. One delegated listener
    // covers every message without rebinding as transcripts grow.
    function postPathReference(el) {
      var path = el.getAttribute('data-path');
      if (!path) return;
      var payload = { path: path };
      var line = parseInt(el.getAttribute('data-line') || '', 10);
      if (line > 0) payload.line = line;
      var column = parseInt(el.getAttribute('data-column') || '', 10);
      if (column > 0) payload.column = column;
      vscode.postMessage({ type: 'openPathReference', payload: payload });
    }

    document.addEventListener('click', function(ev) {
      var target = ev.target;
      var link = target && target.closest ? target.closest('.path-link') : null;
      if (!link) return;
      ev.preventDefault();
      postPathReference(link);
    });

    document.addEventListener('keydown', function(ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var target = ev.target;
      var link = target && target.closest ? target.closest('.path-link') : null;
      if (!link) return;
      ev.preventDefault();
      postPathReference(link);
    });

    // Attach code-action handlers after sanitized HTML is in the DOM. A
    // WeakSet prevents duplicate listeners without adding data attributes to
    // model-rendered content.
    var boundCodeActionButtons = new WeakSet();
    var pendingApplyButton = null;

    function settleApplyButton(label, title) {
      var button = pendingApplyButton;
      pendingApplyButton = null;
      if (!button) return;
      button.disabled = false;
      button.textContent = label;
      button.title = title || '';
      setTimeout(function() {
        if (button.textContent === label) {
          button.textContent = 'Apply';
          button.title = '';
        }
      }, 2000);
    }

    function getCodeBlock(button) {
      var wrapper = button && button.closest ? button.closest('.code-block-wrapper') : null;
      return wrapper ? wrapper.querySelector('pre code') : null;
    }

    function getCodeLanguage(codeEl) {
      if (!codeEl || !codeEl.classList) return '';
      for (var i = 0; i < codeEl.classList.length; i++) {
        var className = codeEl.classList.item(i) || '';
        if (className.indexOf('language-') === 0) {
          return className.slice('language-'.length);
        }
      }
      return '';
    }

    function bindCodeBlockActions(rootEl) {
      if (!rootEl) return;
      var btns = rootEl.querySelectorAll('.copy-btn, .apply-btn');
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        if (boundCodeActionButtons.has(btn)) continue;
        boundCodeActionButtons.add(btn);
        btn.addEventListener('click', function(ev) {
          var b = ev.currentTarget;
          var codeEl = getCodeBlock(b);
          if (!codeEl) return;
          var text = codeEl.textContent || '';
          if (b.classList.contains('apply-btn')) {
            if (pendingApplyButton && pendingApplyButton !== b) {
              settleApplyButton('Failed', 'A newer diff proposal replaced this request.');
            }
            pendingApplyButton = b;
            b.disabled = true;
            b.textContent = 'Opening…';
            vscode.postMessage({
              type: 'proposeDiff',
              payload: {
                code: text,
                language: getCodeLanguage(codeEl)
              }
            });
            return;
          }
          if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            b.textContent = 'Failed';
            setTimeout(function() { b.textContent = 'Copy'; }, 1500);
            return;
          }
          navigator.clipboard.writeText(text).then(function() {
            b.textContent = 'Copied!';
            setTimeout(function() { b.textContent = 'Copy'; }, 1500);
          }).catch(function() {
            b.textContent = 'Failed';
            setTimeout(function() { b.textContent = 'Copy'; }, 1500);
          });
        });
      }
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    function sendMessage(oneTurnBehavior) {
      if (runtimeBlock !== null) return;
      const isFollowUp = streaming;
      const typedText = userInput.value.trim();
      const text = typedText || (pendingAttachmentCount === 1
        ? 'Please analyze the attached file.'
        : pendingAttachmentCount > 1
          ? 'Please analyze the attached files.'
          : '');
      if (!text) return;

      hideEmptyState();
      var clientMessageId = 'msg-' + Date.now() + '-' + (++clientMessageSeq);
      var userMessageEl = addMessage('user', text);
      userMessageEl.setAttribute('data-client-message-id', clientMessageId);
      if (isFollowUp) userMessageEl.setAttribute('data-delivery-state', 'queued');
      userInput.value = '';
      userInput.style.height = 'auto';

      if (!isFollowUp) {
        showTyping();
        setStreaming(true);
        currentAssistantEl = null;
        accumulatedContent = '';
        activePlanCard = null;
      }

      var activeFileReferences = pendingFileReferences
        .filter(function(ref) { return text.indexOf(ref.token) !== -1; })
        .map(function(ref) { return ref.reference; });
      var sendPayload = {
        text: text,
        browseWeb: browseWebEnabled,
        clientMessageId: clientMessageId
      };
      if (activeFileReferences.length > 0) sendPayload.references = activeFileReferences;
      if (isFollowUp) {
        sendPayload.followUpBehavior =
          oneTurnBehavior === 'queue' || oneTurnBehavior === 'steer'
            ? oneTurnBehavior
            : followUpBehavior;
      }
      vscode.postMessage({ type: 'sendMessage', payload: sendPayload });
      pendingFileReferences = [];
      setBrowseWebEnabled(false);
    }

    // ── Event listeners ───────────────────────────────────────────────────────
    sendBtn.addEventListener('click', function() { sendMessage(); });
    if (stopBtn) {
      stopBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'cancel' });
      });
    }

    userInput.addEventListener('keydown', (e) => {
      // @mention dropdown navigation
      if (mentionDropdown.classList.contains('visible')) {
        var items = mentionDropdown.querySelectorAll('.mention-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (mentionIndex < items.length - 1) {
            updateMentionSelection(items, mentionIndex + 1);
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (mentionIndex > 0) {
            updateMentionSelection(items, mentionIndex - 1);
          }
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          var sel = items[mentionIndex];
          if (sel && sel._mentionReference) insertMention(sel._mentionReference);
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
        var oneTurnBehavior = streaming && (e.metaKey || e.ctrlKey)
          ? (followUpBehavior === 'steer' ? 'queue' : 'steer')
          : undefined;
        sendMessage(oneTurnBehavior);
      }
    });

    userInput.addEventListener('input', function() { autoResize(); detectMention(); });

    function closeActionsMenu() {
      if (!actionsMenu) return;
      actionsMenu.classList.remove('open');
      actionsBtn.setAttribute('aria-expanded', 'false');
    }

    if (actionsMenu) {
      actionsBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        var isOpen = actionsMenu.classList.contains('open');
        actionsMenu.classList.toggle('open', !isOpen);
        actionsBtn.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) focusMenuItem(actionsMenu, 0);
      });
      wireMenuKeyboard(actionsMenu, actionsBtn, closeActionsMenu);
      document.addEventListener('click', closeActionsMenu);
      actionsMenu.addEventListener('click', function (event) {
        event.stopPropagation();
      });
      var surfaceItems = actionsMenu.querySelectorAll('[data-surface]');
      for (var si = 0; si < surfaceItems.length; si++) {
        surfaceItems[si].addEventListener('click', function (event) {
          var surfaceId = event.currentTarget.dataset.surface;
          closeActionsMenu();
          if (surfaceId === 'sessions') {
            openSessionsSheet();
            return;
          }
          vscode.postMessage({ type: 'openSurface', payload: { surfaceId: surfaceId } });
        });
      }
      if (menuAccountAction) {
        menuAccountAction.addEventListener('click', function () {
          closeActionsMenu();
          vscode.postMessage({ type: 'openSurface', payload: { surfaceId: accountSignedIn ? 'signOut' : 'signIn' } });
        });
      }
    }

    if (newChatBtn) {
      newChatBtn.addEventListener('click', () => {
        invalidateAttachmentBatches();
        vscode.postMessage({ type: 'newChat' });
      });
    }

    // ── Popover keyboard support (VSCX-14) ────────────────────────────────────
    // These containers claim role="menu", which tells a screen-reader user that
    // arrow keys move between items and Escape closes. Neither was implemented,
    // so the markup described navigation the widget did not have and keyboard
    // users could not reach the items at all.
    function menuItemsOf(container) {
      // The model popover uses menuitemradio; a selector limited to menuitem
      // would silently skip every entry in it.
      return Array.prototype.slice.call(
        container.querySelectorAll(
          '[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled]),[role="menuitemcheckbox"]:not([disabled])',
        ),
      );
    }

    function focusMenuItem(container, index) {
      var items = menuItemsOf(container);
      if (items.length === 0) return;
      var bounded = ((index % items.length) + items.length) % items.length;
      items.forEach(function (item, i) {
        // Roving tabindex: exactly one item is tabbable at a time, so Tab
        // leaves the menu rather than walking every entry.
        item.setAttribute('tabindex', i === bounded ? '0' : '-1');
      });
      items[bounded].focus();
    }

    function wireMenuKeyboard(container, opener, close) {
      container.addEventListener('keydown', function (e) {
        var items = menuItemsOf(container);
        if (items.length === 0) return;
        var current = items.indexOf(document.activeElement);

        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
          if (opener) opener.focus();
          return;
        }
        if (e.key === 'Tab') {
          close();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusMenuItem(container, current + 1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusMenuItem(container, current <= 0 ? items.length - 1 : current - 1);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          focusMenuItem(container, 0);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          focusMenuItem(container, items.length - 1);
        }
      });
    }

    // ── Sessions sheet ────────────────────────────────────────────────────────
    var sessionsSource = 'local';
    var sessionsRows = [];
    var sessionsUnavailable = null;
    var accountSignedIn = false;

    function renderSessionsRows() {
      if (!sessionsSheetList) return;
      sessionsSheetList.replaceChildren();
      var query = (sessionsSearch && !sessionsSearch.hidden ? sessionsSearch.value : '')
        .trim()
        .toLowerCase();
      var visible = query === ''
        ? sessionsRows
        : sessionsRows.filter(function (row) {
            return row.title.toLowerCase().indexOf(query) !== -1;
          });
      if (sessionsUnavailable) {
        var notice = document.createElement('div');
        notice.className = 'sessions-sheet-empty';
        notice.textContent = sessionsUnavailable;
        sessionsSheetList.appendChild(notice);
        return;
      }
      if (visible.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'sessions-sheet-empty';
        empty.textContent = sessionsSource === 'local'
          ? 'No developer sessions in this workspace yet'
          : 'No cloud chats yet';
        sessionsSheetList.appendChild(empty);
        return;
      }
      for (var i = 0; i < visible.length; i++) {
        (function (row) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'sessions-sheet-row';
          button.setAttribute('role', 'listitem');
          button.title = row.title;
          var title = document.createElement('span');
          title.className = 'sessions-sheet-row-title';
          title.textContent = row.title;
          var age = document.createElement('span');
          age.className = 'sessions-sheet-row-age';
          age.textContent = row.age;
          var dot = document.createElement('span');
          dot.className = 'sessions-sheet-row-dot';
          dot.setAttribute('aria-hidden', 'true');
          var source = document.createElement('span');
          source.className = 'sessions-sheet-row-age';
          source.textContent = row.sourceLabel;
          button.appendChild(title);
          button.appendChild(age);
          button.appendChild(dot);
          button.appendChild(source);
          button.addEventListener('click', function () {
            closeSessionsSheet();
            vscode.postMessage({
              type: 'openSessionRow',
              payload: { id: row.id, source: row.source },
            });
          });
          sessionsSheetList.appendChild(button);
        })(visible[i]);
      }
    }

    function requestSessions(source) {
      sessionsSource = source;
      sessionsRows = [];
      sessionsUnavailable = null;
      if (sessionsTabLocal) sessionsTabLocal.setAttribute('aria-selected', String(source === 'local'));
      if (sessionsTabCloud) sessionsTabCloud.setAttribute('aria-selected', String(source === 'cloud'));
      renderSessionsRows();
      vscode.postMessage({ type: 'requestSessions', payload: { source: source } });
    }

    function openSessionsSheet() {
      if (!sessionsSheet) return;
      sessionsSheet.hidden = false;
      requestSessions(sessionsSource);
      if (sessionsSheetClose) sessionsSheetClose.focus();
    }

    function closeSessionsSheet() {
      if (!sessionsSheet) return;
      sessionsSheet.hidden = true;
      if (sessionsSearch) sessionsSearch.value = '';
      if (sessionsBtn) sessionsBtn.focus();
    }

    if (sessionsBtn) sessionsBtn.addEventListener('click', openSessionsSheet);
    if (sessionsSheetClose) sessionsSheetClose.addEventListener('click', closeSessionsSheet);
    if (sessionsTabLocal) {
      sessionsTabLocal.addEventListener('click', function () { requestSessions('local'); });
    }
    if (sessionsTabCloud) {
      sessionsTabCloud.addEventListener('click', function () { requestSessions('cloud'); });
    }
    if (sessionsSearch) sessionsSearch.addEventListener('input', renderSessionsRows);
    if (sessionsSheet) {
      sessionsSheet.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSessionsSheet();
        }
      });
    }

    // ── Slash commands ────────────────────────────────────────────────────────
    var slashCommands = [];
    var slashRequested = false;

    function closeSlashMenu() {
      if (!slashMenu) return;
      slashMenu.classList.remove('open');
      if (slashBtn) slashBtn.setAttribute('aria-expanded', 'false');
    }

    function renderSlashMenu(filter) {
      if (!slashMenu) return;
      slashMenu.replaceChildren();
      var needle = (filter || '').toLowerCase();
      var visible = slashCommands.filter(function (entry) {
        return needle === '' || entry.name.toLowerCase().indexOf(needle) === 0;
      });
      if (visible.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'slash-menu-empty';
        empty.textContent = slashCommands.length === 0 ? 'Loading commands…' : 'No matching command';
        slashMenu.appendChild(empty);
        return;
      }
      for (var i = 0; i < visible.length; i++) {
        (function (entry) {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'slash-menu-item';
          item.setAttribute('role', 'menuitem');
          var name = document.createElement('span');
          name.className = 'slash-menu-item-name';
          name.textContent = entry.name;
          item.appendChild(name);
          if (entry.description) {
            var description = document.createElement('span');
            description.className = 'slash-menu-item-description';
            description.textContent = entry.description;
            item.appendChild(description);
          }
          item.addEventListener('click', function () {
            closeSlashMenu();
            if (userInput.value.trim().indexOf('/') === 0) {
              userInput.value = '';
              autoResize();
            }
            vscode.postMessage({ type: 'runSlashCommand', payload: { name: entry.name } });
          });
          slashMenu.appendChild(item);
        })(visible[i]);
      }
    }

    function openSlashMenu(filter) {
      if (!slashMenu) return;
      slashMenu.classList.add('open');
      if (slashBtn) slashBtn.setAttribute('aria-expanded', 'true');
      renderSlashMenu(filter);
      if (!slashRequested) {
        slashRequested = true;
        vscode.postMessage({ type: 'requestSlashCommands' });
      }
    }

    if (slashBtn && slashMenu) {
      slashBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        if (slashMenu.classList.contains('open')) {
          closeSlashMenu();
          return;
        }
        openSlashMenu('');
        focusMenuItem(slashMenu, 0);
      });
      wireMenuKeyboard(slashMenu, slashBtn, closeSlashMenu);
      slashMenu.addEventListener('click', function (event) { event.stopPropagation(); });
      document.addEventListener('click', closeSlashMenu);
      userInput.addEventListener('input', function () {
        var value = userInput.value;
        if (value.indexOf('/') === 0 && value.indexOf(' ') === -1) {
          openSlashMenu(value);
          return;
        }
        closeSlashMenu();
      });
    }

    function renderMenuAccount() {
      accountSignedIn = activeAccountStatus === 'signed-in';
      if (menuAccountName) {
        menuAccountName.textContent = accountSignedIn
          ? (activeAccountIdentity && (activeAccountIdentity.email || activeAccountIdentity.displayName)) || 'Signed in'
          : activeAccountStatus === 'expired'
            ? 'Session expired'
            : 'Not signed in';
      }
      if (menuAccountPlan) {
        menuAccountPlan.textContent = accountSignedIn && activeAccountIdentity
          ? activeAccountIdentity.planName + ' plan'
          : 'AGI Cloud account';
      }
      if (menuAccountActionLabel) {
        menuAccountActionLabel.textContent = accountSignedIn ? 'Sign out' : 'Sign in';
      }
      if (menuAccountAction) {
        var icon = menuAccountAction.querySelector('.codicon');
        if (icon) icon.className = 'codicon codicon-' + (accountSignedIn ? 'sign-out' : 'sign-in');
      }
      if (composerStatusSignIn) composerStatusSignIn.hidden = accountSignedIn;
    }

    // ── Composer status line ──────────────────────────────────────────────────
    function renderComposerStatus(boundaryLabel) {
      if (composerStatusBoundary && boundaryLabel) {
        composerStatusBoundary.textContent = boundaryLabel;
      }
      if (composerStatusSeparator && composerStatusBoundary) {
        composerStatusSeparator.hidden = composerStatusBoundary.textContent === '';
      }
      if (composerStatusMode) composerStatusMode.textContent = capitalizeControl(activeMode);
    }

    if (composerStatusSignIn) {
      composerStatusSignIn.addEventListener('click', function () {
        vscode.postMessage({ type: 'openSurface', payload: { surfaceId: 'signIn' } });
      });
    }

    // ── Plus-menu toggle ──────────────────────────────────────────────────────
    if (plusBtn && plusMenu) {
      var closePlusMenu = function () {
        plusMenu.classList.remove('open');
        plusBtn.setAttribute('aria-expanded', 'false');
      };

      plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeModelPopover();
        var isOpen = plusMenu.classList.contains('open');
        plusMenu.classList.toggle('open', !isOpen);
        plusBtn.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) {
          // Availability is whatever the window holds right now, so it is read
          // on every open rather than cached from the last one.
          vscode.postMessage({ type: 'requestContextMenuState' });
          focusMenuItem(plusMenu, 0);
        }
      });
      plusBtn.addEventListener('keydown', function (e) {
        // Opening with the keyboard should land on the first item, which is
        // what role="menu" already promises.
        if (e.key === 'ArrowDown' && plusMenu.classList.contains('open')) {
          e.preventDefault();
          focusMenuItem(plusMenu, 0);
        }
      });
      wireMenuKeyboard(plusMenu, plusBtn, closePlusMenu);
      document.addEventListener('click', () => {
        closePlusMenu();
      });
      // "Add file" opens file picker via extension
      var plusMenuUpload = document.getElementById('plusMenuUpload');
      if (plusMenuUpload) {
        plusMenuUpload.addEventListener('click', () => {
          closePlusMenu();
          vscode.postMessage({ type: 'openFilePicker' });
        });
      }
      if (plusMenuBrowse) {
        plusMenuBrowse.addEventListener('click', () => {
          plusMenu.classList.remove('open');
          plusBtn.setAttribute('aria-expanded', 'false');
          setBrowseWebEnabled(!browseWebEnabled);
          userInput.focus();
        });
      }
      var contextItems = plusMenu.querySelectorAll('[data-context-kind]');
      for (var ci = 0; ci < contextItems.length; ci++) {
        contextItems[ci].addEventListener('click', function(ev) {
          var item = ev.currentTarget;
          if (item.disabled) return;
          closePlusMenu();
          vscode.postMessage({
            type: 'attachContext',
            payload: { kind: item.getAttribute('data-context-kind') }
          });
          userInput.focus();
        });
      }

      // The menu label and action both open the agent-mode picker.
      var plusMenuAgentMode = document.getElementById('plusMenuPlanMode');
      if (plusMenuAgentMode) {
        plusMenuAgentMode.addEventListener('click', () => {
          closePlusMenu();
          vscode.postMessage({ type: 'setMode', payload: { mode: 'plan' } });
        });
      }
    }

    if (browseContextRemove) {
      browseContextRemove.addEventListener('click', function() {
        setBrowseWebEnabled(false);
        userInput.focus();
      });
    }

    if (projectContextRemove) {
      projectContextRemove.addEventListener('click', function() {
        setActiveProject(null);
        vscode.postMessage({ type: 'clearActiveProject' });
        userInput.focus();
      });
    }

    // Model pill opens inline model popover (v3)
    if (modelPill) {
      modelPill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (modelPopoverEl && modelPopoverEl.classList.contains('open')) {
          closeModelPopover();
        } else {
          if (plusMenu) {
            plusMenu.classList.remove('open');
            if (plusBtn) plusBtn.setAttribute('aria-expanded', 'false');
          }
          openModelLoading();
          vscode.postMessage({ type: 'openModelPopover' });
        }
      });
      modelPill.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modelPopoverEl && modelPopoverEl.classList.contains('open')) {
          e.preventDefault();
          closeModelPopover();
          modelPill.focus();
        }
      });
    }

    if (modelPopoverEl) {
      wireMenuKeyboard(modelPopoverEl, modelPill, closeModelPopover);
      modelPopoverEl.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      document.addEventListener('click', closeModelPopover);
    }

    if (controlsSummary) {
      controlsSummary.addEventListener('click', () => {
        vscode.postMessage({ type: 'openActionSheet', payload: { scope: 'composer' } });
      });
    }

    // ── Composer drag-drop + paste-image (P0 #3, 2026-05-21) ──────────────────
    var composerCard = document.getElementById('composerCard');
    var attachmentStrip = document.getElementById('attachmentStrip');
    // Local ledger: name → chipElement for "uploading" state. The host owns
    // the durable attachment list via addToContext; this strip is purely a
    // visual confirmation that the drop/paste was received.
    var pendingAttachmentChips = {};
    var attachmentBatchSeq = 0;
    var attachmentGeneration = 0;

    // The host's attachFiles Zod ceiling, in decimal bytes. A larger bound
    // here is not a looser limit, it is a dropped batch: the schema rejects
    // the whole message, so the sibling files lose their ack and their chips
    // never leave "uploading".
    var MAX_ATTACHMENT_BYTES = 10000000;

    function invalidateAttachmentBatches() {
      attachmentGeneration++;
      var batches = Object.keys(pendingAttachmentChips);
      for (var batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        var entries = pendingAttachmentChips[batches[batchIndex]] || [];
        for (var entryIndex = 0; entryIndex < entries.length; entryIndex++) {
          entries[entryIndex].chip.remove();
        }
      }
      pendingAttachmentChips = {};
      renderAttachmentStrip();
    }

    function renderAttachmentStrip() {
      if (!attachmentStrip) return;
      attachmentStrip.classList.toggle(
        'visible',
        attachmentStrip.children.length > 0,
      );
    }

    function attachmentChipById(id) {
      if (!attachmentStrip || !id) return null;
      var chips = attachmentStrip.querySelectorAll('[data-attachment-id]');
      for (var i = 0; i < chips.length; i++) {
        if (chips[i].getAttribute('data-attachment-id') === id) return chips[i];
      }
      return null;
    }

    function markAttachmentsQueued(ids) {
      for (var i = 0; i < ids.length; i++) {
        var chip = attachmentChipById(ids[i]);
        if (!chip || chip.getAttribute('data-queued') === '1') continue;
        chip.setAttribute('data-queued', '1');
        chip.classList.add('queued');
        if (pendingAttachmentCount > 0) pendingAttachmentCount--;
      }
    }

    function releaseAttachments(ids) {
      for (var i = 0; i < ids.length; i++) {
        var chip = attachmentChipById(ids[i]);
        if (!chip || chip.getAttribute('data-queued') !== '1') continue;
        chip.removeAttribute('data-queued');
        chip.classList.remove('queued');
        pendingAttachmentCount++;
      }
    }

    function consumeAttachments(ids) {
      for (var i = 0; i < ids.length; i++) {
        var chip = attachmentChipById(ids[i]);
        if (!chip) continue;
        if (chip.getAttribute('data-queued') !== '1' && pendingAttachmentCount > 0) {
          pendingAttachmentCount--;
        }
        chip.remove();
      }
      renderAttachmentStrip();
    }

    function makeAttachmentChip(name, state) {
      var chip = document.createElement('span');
      chip.className = 'attachment-chip' + (state ? ' ' + state : '');
      chip.setAttribute('role', 'listitem');

      var icon = document.createElement('span');
      icon.className = 'codicon codicon-file';
      icon.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className = 'attachment-chip__name';
      label.textContent = name;

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'attachment-chip__remove';
      removeBtn.setAttribute('aria-label', 'Remove attachment');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', function() {
        var attachId = chip.getAttribute('data-attachment-id');
        if (attachId) {
          // Host owns the pending file: removal must delete it there too.
          vscode.postMessage({ type: 'removePendingAttachment', payload: { id: attachId } });
          if (chip.getAttribute('data-queued') !== '1' && pendingAttachmentCount > 0) {
            pendingAttachmentCount--;
          }
        } else if (chip.classList.contains('uploading')) {
          // No host id yet, defer the removal until attachFilesAck assigns one.
          chip.setAttribute('data-remove-requested', '1');
          return;
        }
        chip.remove();
        renderAttachmentStrip();
      });

      chip.appendChild(icon);
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      return chip;
    }

    function readFileAsDataUrl(file) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(String(reader.result || '')); };
        reader.onerror = function() { reject(new Error('read failed')); };
        reader.readAsDataURL(file);
      });
    }

    function acceptIncomingFiles(fileList) {
      if (!fileList || fileList.length === 0) return;
      var files = Array.from(fileList).slice(0, 8);

      // Render uploading chips immediately so the user sees the drop landed.
      var batchKey = 'batch_' + (++attachmentBatchSeq);
      var batchGeneration = attachmentGeneration;
      pendingAttachmentChips[batchKey] = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f) continue;
        if (f.size > MAX_ATTACHMENT_BYTES) {
          var failChip = makeAttachmentChip(f.name + ' (too large)', 'failed');
          if (attachmentStrip) attachmentStrip.appendChild(failChip);
          continue;
        }
        var chip = makeAttachmentChip(f.name, 'uploading');
        if (attachmentStrip) attachmentStrip.appendChild(chip);
        pendingAttachmentChips[batchKey].push({ name: f.name, chip: chip });
      }
      renderAttachmentStrip();

      // Read all files in parallel, then post a single attachFiles message.
      Promise.all(files.map(function(f) {
        if (!f || f.size > MAX_ATTACHMENT_BYTES) return null;
        return readFileAsDataUrl(f).then(function(dataUrl) {
          return {
            name: f.name || 'attachment',
            mimeType: f.type || 'application/octet-stream',
            sizeBytes: f.size || 0,
            dataUrl: dataUrl,
          };
        }).catch(function() { return null; });
      })).then(function(results) {
        if (batchGeneration !== attachmentGeneration) {
          var staleEntries = pendingAttachmentChips[batchKey] || [];
          for (var staleIndex = 0; staleIndex < staleEntries.length; staleIndex++) {
            staleEntries[staleIndex].chip.remove();
          }
          delete pendingAttachmentChips[batchKey];
          renderAttachmentStrip();
          return;
        }
        var payload = results.filter(function(entry) { return entry !== null; });
        if (payload.length === 0) {
          // Mark every uploading chip in this batch as failed.
          var entries = pendingAttachmentChips[batchKey] || [];
          for (var j = 0; j < entries.length; j++) {
            entries[j].chip.classList.remove('uploading');
            entries[j].chip.classList.add('failed');
          }
          delete pendingAttachmentChips[batchKey];
          return;
        }
        vscode.postMessage({ type: 'attachFiles', payload: { files: payload } });
      });
    }

    if (composerCard) {
      composerCard.addEventListener('dragover', function(e) {
        if (!e.dataTransfer || !e.dataTransfer.types) return;
        if (Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
        e.preventDefault();
        composerCard.classList.add('dragover');
      });
      composerCard.addEventListener('dragleave', function(e) {
        // Only clear when the cursor leaves the card, not when crossing
        // a nested child element.
        if (composerCard.contains(e.relatedTarget)) return;
        composerCard.classList.remove('dragover');
      });
      composerCard.addEventListener('drop', function(e) {
        if (!e.dataTransfer) return;
        e.preventDefault();
        composerCard.classList.remove('dragover');
        acceptIncomingFiles(e.dataTransfer.files);
      });
    }

    // Paste handler on the textarea, captures clipboard images (e.g. screenshot
    // from grim/Snipping Tool) without inserting the binary blob into the input.
    userInput.addEventListener('paste', function(e) {
      var items = e.clipboardData ? e.clipboardData.items : null;
      if (!items) return;
      var pasted = [];
      for (var k = 0; k < items.length; k++) {
        var item = items[k];
        if (!item) continue;
        if (item.kind === 'file') {
          var file = item.getAsFile();
          if (file) pasted.push(file);
        }
      }
      if (pasted.length > 0) {
        e.preventDefault();
        acceptIncomingFiles(pasted);
      }
    });

    // ── Messages from extension ───────────────────────────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'turnStarted') {
        removeTyping();
        showTyping();
        setStreaming(true);
        currentAssistantEl = null;
        accumulatedContent = '';
        activePlanCard = null;
        activeQueuedClientMessageId = msg.payload.clientMessageId;
        if (!userMessageById(activeQueuedClientMessageId)) {
          var restoredQueuedUser = addMessage('user', msg.payload.text || 'Queued follow-up');
          restoredQueuedUser.setAttribute('data-client-message-id', activeQueuedClientMessageId);
        }
        setUserMessageState(activeQueuedClientMessageId, 'running');
        showFollowUpStatus(
          msg.payload.queueRemaining > 0
            ? 'Starting queued follow-up · ' + msg.payload.queueRemaining + ' waiting'
            : 'Starting queued follow-up',
          'queued',
          msg.payload.queueRemaining > 0
        );
      }

      else if (msg.type === 'token') {
        removeTyping();
        if (!currentAssistantEl) {
          currentAssistantEl = addMessage('assistant', '');
          accumulatedContent = '';
        }
        accumulatedContent += msg.payload.text;
        // Render markdown incrementally so there is no raw-markdown → HTML
        // flash at stream completion. renderAssistant falls back to escaped
        // plain text if window.agiRender is not yet loaded.
        currentAssistantEl.innerHTML = renderAssistant(accumulatedContent);
        bindCodeBlockActions(currentAssistantEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      else if (msg.type === 'done') {
        removeTyping();
        if (currentAssistantEl && accumulatedContent) {
          // Content is already rendered; re-render once to ensure the final
          // token is flushed, then bind actions on any code blocks.
          currentAssistantEl.innerHTML = renderAssistant(accumulatedContent);
          bindCodeBlockActions(currentAssistantEl);
        }
        finalizeToolCallStack();
        if (msg.payload && msg.payload.providerLabel) {
          updateProviderBadge(msg.payload.providerLabel, msg.payload.brandColor || 'var(--border)');
        }
        setStreaming(false);
        if (activeQueuedClientMessageId) {
          setUserMessageState(activeQueuedClientMessageId, '');
          activeQueuedClientMessageId = null;
        }
        currentAssistantEl = null;
        accumulatedContent = '';
      }

      else if (msg.type === 'contextUsage') {
        renderContextUsage(msg.payload.usedTokens, msg.payload.contextWindow);
      }

      else if (msg.type === 'progressUpdate') {
        removeTyping();
        upsertProgressEl(
          msg.payload.progressId,
          msg.payload.summary,
          msg.payload.detail,
          msg.payload.status
        );
      }

      else if (msg.type === 'planUpdate') {
        removeTyping();
        upsertPlanCard(msg.payload);
      }

      else if (msg.type === 'toolCallStart') {
        removeTyping();
        createToolCallEl(
          msg.payload.toolUseId,
          msg.payload.name,
          msg.payload.category,
          msg.payload.summary,
          msg.payload.input
        );
      }

      else if (msg.type === 'toolCallEnd') {
        var tcEnd = toolCallMap[msg.payload.toolUseId];
        if (tcEnd) {
          tcEnd.el.classList.remove('tool-call--pending');
          tcEnd.el.classList.add(msg.payload.isError ? 'tool-call--error' : 'tool-call--done');
          if (msg.payload.isError) toolCallStackHasError = true;
          tcEnd.responseEl.textContent = formatToolPayload(msg.payload.output);
          tcEnd.responseSection.style.display = '';
          if (typeof msg.payload.elapsedMs === 'number') {
            tcEnd.summaryEl.textContent += ' · ' + formatElapsedMs(msg.payload.elapsedMs);
          }
          updateActivitySummary(tcEnd.summaryEl.textContent, false);
        }
      }

      else if (msg.type === 'error') {
        removeTyping();
        if (toolCallStack) {
          toolCallStackHasError = true;
          finalizeToolCallStack();
        }
        addMessage('error', msg.payload.message);
        setStreaming(false);
        if (activeQueuedClientMessageId) {
          setUserMessageState(activeQueuedClientMessageId, 'failed');
          activeQueuedClientMessageId = null;
        }
        currentAssistantEl = null;
      }

      else if (msg.type === 'sessionNotice') {
        addMessage('system', msg.payload.message);
      }

      else if (msg.type === 'conversationBoundaryChanged') {
        var boundaryUser = userMessageById(msg.payload.clientMessageId);
        messagesEl.replaceChildren();
        addMessage('system', msg.payload.message);
        if (boundaryUser) {
          messagesEl.appendChild(boundaryUser);
        } else {
          boundaryUser = addMessage('user', msg.payload.text || 'Continue in the new session');
          boundaryUser.setAttribute('data-client-message-id', msg.payload.clientMessageId);
        }
        emptyStateEl = null;
        currentAssistantEl = null;
        accumulatedContent = '';
        activePlanCard = null;
        if (streaming) showTyping();
      }

      else if (msg.type === 'followUpStatus') {
        markAttachmentsQueued(msg.payload.attachmentIds || []);
        if (msg.payload.kind === 'steered') {
          setUserMessageState(msg.payload.clientMessageId, 'steered');
        } else if (msg.payload.kind === 'cancelled') {
          setUserMessageState(msg.payload.clientMessageId, 'cancelled');
        } else if (msg.payload.kind === 'error') {
          setUserMessageState(msg.payload.clientMessageId, 'failed');
        } else {
          setUserMessageState(msg.payload.clientMessageId, 'queued');
        }
        showFollowUpStatus(
          msg.payload.message,
          msg.payload.kind,
          msg.payload.kind === 'queued' || msg.payload.kind === 'queue-fallback'
        );
      }

      else if (msg.type === 'followUpBehavior') {
        followUpBehavior = msg.payload.behavior === 'steer' ? 'steer' : 'queue';
        setStreaming(streaming);
      }

      else if (msg.type === 'model') {
        // A model choice can cause the CLI to establish a different provider
        // boundary. Do not carry the previous session's trust label forward
        // while that next route is unresolved.
        resetAuthoritativeSessionBoundary();
        // Match by comparing option.value directly rather than building a CSS
        // selector via string concat, a model id containing a quote/"]" would
        // throw a SyntaxError and break model display (audit 218 L1726).
        let opt = null;
        for (const o of modelSelect.options) {
          if (o.value === msg.payload.model) { opt = o; break; }
        }
        if (opt) {
          modelSelect.value = msg.payload.model;
          currentModelLabel = opt.dataset.displayLabel || opt.text; renderModelPill();
        } else if (modelPill) {
          currentModelLabel = msg.payload.model; renderModelPill();
        }
      }

      else if (msg.type === 'modelPickerData') {
        var payload = msg.payload || {};
        openModelPopover(payload.groups || [], payload.currentModel || modelSelect.value);
      }

      else if (msg.type === 'providerBadge') {
        updateProviderBadge(msg.payload.providerLabel);
      }

      else if (msg.type === 'sessionBoundary') {
        applyAuthoritativeSessionBoundary(msg.payload.trustMode, msg.payload.provider);
      }

      else if (msg.type === 'runtimeStatus') {
        if (!runtimeStatusEl || !runtimeStatusTitleEl || !runtimeStatusMessageEl || !runtimeSettingsBtn) return;
        renderRuntimeAvailability(msg.payload.status, msg.payload.message);
      }

      else if (msg.type === 'accountStatus') {
        activeAccountStatus = msg.payload.status || 'signed-out';
        activeAccountIdentity = msg.payload.identity || null;
        renderMenuAccount();
        if (lastUsageMeterPayload) renderUsageMeter(lastUsageMeterPayload);
        if (activeRuntimeSource) updateRuntimePill(activeRuntimeSource);
      }

      else if (msg.type === 'sessionsList') {
        if (msg.payload.source === sessionsSource) {
          sessionsRows = msg.payload.rows || [];
          sessionsUnavailable = msg.payload.unavailable || null;
          if (sessionsSearch) sessionsSearch.hidden = sessionsRows.length <= 10;
          renderSessionsRows();
        }
      }

      else if (msg.type === 'slashCommands') {
        slashCommands = msg.payload.items || [];
        if (slashMenu && slashMenu.classList.contains('open')) {
          renderSlashMenu(userInput.value.indexOf('/') === 0 ? userInput.value : '');
        }
      }

      else if (msg.type === 'showOnboarding') {
        setOnboardingVisible(true);
      }

      else if (msg.type === 'hideOnboarding') {
        setOnboardingVisible(false);
      }

      else if (msg.type === 'fileSearchResults') {
        showMentionResults(msg.payload.files);
      }

      else if (msg.type === 'composerDraft') {
        userInput.value = msg.payload.text || '';
        pendingFileReferences = (msg.payload.references || []).map(function(reference) {
          var range = reference.range;
          var endLine = range && range.endCharacter === 0 && range.endLine > range.startLine
            ? range.endLine
            : range ? range.endLine + 1 : 0;
          var suffix = range ? '#L' + (range.startLine + 1) + '-L' + endLine : '';
          return { token: '@' + reference.path + suffix, reference: reference };
        });
        autoResize();
        userInput.focus();
      }

      else if (msg.type === 'conversationLoaded') {
        clearContextUsage();
        applyAuthoritativeSessionBoundary(msg.payload.trustMode, msg.payload.provider);
        invalidateAttachmentBatches();
        messagesEl.innerHTML = '';
        activePlanCard = null;
        toolCallStack = null;
        toolCallList = null;
        activitySummaryButton = null;
        activityIcon = null;
        activityMeta = null;
        toolCallMap = {};
        progressMap = {};
        currentAssistantEl = null;
        activeQueuedClientMessageId = null;
        accumulatedContent = '';
        removeTyping();
        setStreaming(false);
        showFollowUpStatus('', '', false);
        pendingAttachmentCount = 0;
        if (attachmentStrip) attachmentStrip.replaceChildren();
        renderAttachmentStrip();
        for (var historyIndex = 0; historyIndex < msg.payload.messages.length; historyIndex++) {
          var historyMessage = msg.payload.messages[historyIndex];
          if (!historyMessage) continue;
          if (historyMessage.role === 'assistant') {
            var assistantHistoryEl = addMessage('assistant', '');
            assistantHistoryEl.innerHTML = renderAssistant(historyMessage.text || '');
            bindCodeBlockActions(assistantHistoryEl);
          } else if (historyMessage.role === 'user') {
            addMessage('user', historyMessage.text || '');
          }
        }
        if (messagesEl.childElementCount === 0) {
          // A session the CLI created can resume with nothing to replay. An
          // empty panel says nothing; the empty state at least names the view.
          mountEmptyState();
          syncRecentChats();
        } else {
          emptyStateEl = null;
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      else if (msg.type === 'recentConversations') {
        recentChats = msg.payload;
        syncRecentChats();
      }

      else if (msg.type === 'activeProject') {
        setActiveProject(msg.payload && msg.payload.name);
      }

      else if (msg.type === 'conversationCleared') {
        clearContextUsage();
        resetAuthoritativeSessionBoundary();
        invalidateAttachmentBatches();
        messagesEl.innerHTML = '';
        activePlanCard = null;
        mountEmptyState();
        syncRecentChats();
        streaming = false;
        currentAssistantEl = null;
        activeQueuedClientMessageId = null;
        toolCallStack = null;
        toolCallList = null;
        activitySummaryButton = null;
        activityIcon = null;
        activityMeta = null;
        toolCallMap = {};
        progressMap = {};
        setStreaming(false);
        syncComposerAvailability();
        showFollowUpStatus('', '', false);
        pendingAttachmentCount = 0;
        if (attachmentStrip) attachmentStrip.replaceChildren();
        renderAttachmentStrip();
      }

      else if (msg.type === 'addUserMessage') {
        addMessage('user', msg.payload.text);
      }

      else if (msg.type === 'modeChanged') {
        activeMode = msg.payload.mode;
        renderControlsSummary();
      }

      else if (msg.type === 'effortChanged') {
        activeEffort = msg.payload.effort;
        activeSupportsEffort = Boolean(msg.payload.supportsEffort);
        renderControlsSummary();
      }

      else if (msg.type === 'usageMeter') {
        renderUsageMeter(msg.payload);
      }

      else if (msg.type === 'diffProposed') {
        settleApplyButton(
          'Review opened',
          'Review the proposed change in ' + (msg.payload.filePath || 'the active editor') + '.'
        );
      }

      else if (msg.type === 'diffProposalFailed') {
        settleApplyButton('Failed', msg.payload.message || 'Could not open the proposed diff.');
      }

      else if (msg.type === 'contextMenuState') {
        var stateItems = (msg.payload && msg.payload.items) || [];
        for (var si = 0; si < stateItems.length; si++) {
          var state = stateItems[si] || {};
          var button = document.querySelector('[data-context-kind="' + state.kind + '"]');
          if (!button) continue;
          button.disabled = !state.available;
          button.setAttribute('aria-disabled', String(!state.available));
          var description = button.querySelector('.plus-menu-description');
          if (description) description.textContent = state.detail || '';
        }
      }

      else if (msg.type === 'contextAttached') {
        if (attachmentStrip) {
          var contextChip = makeAttachmentChip(msg.payload.name, '');
          contextChip.setAttribute('data-attachment-id', msg.payload.id);
          attachmentStrip.appendChild(contextChip);
          pendingAttachmentCount++;
          renderAttachmentStrip();
        }
      }

      else if (msg.type === 'attachFilesAck') {
        // The host accepted each file into its pending-attachment list.
        // Transition uploading chips → success (carrying the host id so the
        // X can truly remove the pending file), mark skipped → failed.
        var ack = msg.payload || { added: [], skipped: [] };
        pendingAttachmentCount += (ack.added || []).length;
        var skippedByName = {};
        for (var s = 0; s < (ack.skipped || []).length; s++) {
          skippedByName[(ack.skipped[s] || {}).name] = (ack.skipped[s] || {}).reason || 'failed';
        }
        var addedIdsByName = {};
        for (var a = 0; a < (ack.added || []).length; a++) {
          var addedEntry = ack.added[a] || {};
          if (!addedIdsByName[addedEntry.name]) addedIdsByName[addedEntry.name] = [];
          addedIdsByName[addedEntry.name].push(addedEntry.id);
        }
        var allChips = attachmentStrip ? attachmentStrip.querySelectorAll('.attachment-chip.uploading') : [];
        for (var c = 0; c < allChips.length; c++) {
          var chipEl = allChips[c];
          var nameEl = chipEl.querySelector('.attachment-chip__name');
          var attachName = nameEl ? (nameEl.textContent || '') : '';
          if (skippedByName[attachName]) {
            chipEl.classList.remove('uploading');
            chipEl.classList.add('failed');
            if (nameEl) nameEl.textContent = attachName + ' (' + skippedByName[attachName] + ')';
          } else {
            chipEl.classList.remove('uploading');
            var idQueue = addedIdsByName[attachName];
            var attachId = idQueue && idQueue.length > 0 ? idQueue.shift() : '';
            if (attachId && chipEl.getAttribute('data-remove-requested') === '1') {
              // The user dismissed this chip while it was still uploading:
              // honour it now that the host id exists.
              vscode.postMessage({ type: 'removePendingAttachment', payload: { id: attachId } });
              if (pendingAttachmentCount > 0) pendingAttachmentCount--;
              chipEl.remove();
            } else if (attachId) {
              chipEl.setAttribute('data-attachment-id', attachId);
            }
          }
        }
        renderAttachmentStrip();
      }

      else if (msg.type === 'attachmentsConsumed') {
        consumeAttachments(msg.payload.ids || []);
      }

      else if (msg.type === 'attachmentsReleased') {
        releaseAttachments(msg.payload.ids || []);
      }

      else if (msg.type === 'rewindComplete') {
        // Remove last assistant bubble then last user bubble from the DOM
        var allMsgs = messagesEl.querySelectorAll('.message');
        var toRemove = [];
        for (var r = allMsgs.length - 1; r >= 0 && toRemove.length < 2; r--) {
          var cls = allMsgs[r].className;
          if (cls.indexOf('assistant') !== -1 || cls.indexOf('user') !== -1) {
            toRemove.push(allMsgs[r]);
          }
        }
        toRemove.forEach(function(el) { el.remove(); });
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
      userInput.setAttribute('aria-expanded', 'false');
      userInput.removeAttribute('aria-activedescendant');
    }

    function updateMentionSelection(items, nextIndex) {
      mentionIndex = nextIndex;
      for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
        var selected = itemIndex === mentionIndex;
        items[itemIndex].classList.toggle('selected', selected);
        items[itemIndex].setAttribute('aria-selected', String(selected));
      }
      var activeItem = items[mentionIndex];
      if (activeItem) {
        userInput.setAttribute('aria-activedescendant', activeItem.id);
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }

    function showMentionResults(files) {
      if (files.length === 0) { hideMentionDropdown(); return; }
      mentionDropdown.innerHTML = '';
      mentionIndex = 0;
      files.forEach(function(f, idx) {
        var item = document.createElement('div');
        item.className = 'mention-item' + (idx === 0 ? ' selected' : '');
        item.id = 'mention-option-' + idx;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(idx === 0));
        item.textContent = f.label;
        item._mentionReference = f;
        item.addEventListener('mousedown', function(e) {
          e.preventDefault();
          insertMention(f);
        });
        mentionDropdown.appendChild(item);
      });
      mentionDropdown.className = 'mention-dropdown visible';
      userInput.setAttribute('aria-expanded', 'true');
      userInput.setAttribute('aria-activedescendant', 'mention-option-0');
    }

    function insertMention(file) {
      var val = userInput.value;
      var before = val.substring(0, mentionStart);
      var after = val.substring(userInput.selectionStart);
      var referencedEndLine = file.range && file.range.endCharacter === 0 && file.range.endLine > file.range.startLine
        ? file.range.endLine
        : file.range ? file.range.endLine + 1 : 0;
      var lineSuffix = file.range
        ? '#L' + (file.range.startLine + 1) + '-L' + referencedEndLine
        : '';
      var token = '@' + file.path + lineSuffix;
      userInput.value = before + token + ' ' + after;
      pendingFileReferences.push({
        token: token,
        reference: { path: file.path, range: file.range }
      });
      var newPos = mentionStart + token.length + 1;
      userInput.setSelectionRange(newPos, newPos);
      hideMentionDropdown();
      userInput.focus();
    }

    // ── Inline tool-call rendering (design-spec §4) ───────────────────────────
    var toolCallStack = null; // active .activity-group container
    var toolCallList = null;
    var activitySummaryButton = null;
    var activityIcon = null;
    var activityMeta = null;
    var toolCallMap = {}; // toolUseId → inline disclosure state
    var progressMap = {}; // progressId → inline disclosure state
    var toolCallStackHasError = false;

    function upsertPlanCard(plan) {
      if (!activePlanCard) {
        var card = document.createElement('section');
        card.className = 'plan-card';
        card.setAttribute('aria-label', 'Current plan');

        var header = document.createElement('div');
        header.className = 'plan-card__header';
        var icon = document.createElement('span');
        icon.className = 'codicon codicon-checklist';
        icon.setAttribute('aria-hidden', 'true');
        var title = document.createElement('span');
        title.className = 'plan-card__title';
        title.textContent = 'Plan';
        var count = document.createElement('span');
        count.className = 'plan-card__count';
        header.appendChild(icon);
        header.appendChild(title);
        header.appendChild(count);

        var explanation = document.createElement('p');
        explanation.className = 'plan-card__explanation';
        var list = document.createElement('ol');
        list.className = 'plan-card__list';
        card.appendChild(header);
        card.appendChild(explanation);
        card.appendChild(list);
        messagesEl.appendChild(card);
        activePlanCard = { card: card, count: count, explanation: explanation, list: list };
      }

      var steps = Array.isArray(plan.plan) ? plan.plan : [];
      var completed = steps.filter(function(item) { return item.status === 'completed'; }).length;
      activePlanCard.count.textContent = completed + '/' + steps.length + ' complete';
      activePlanCard.explanation.textContent = plan.explanation || '';
      activePlanCard.explanation.hidden = !plan.explanation;
      activePlanCard.list.textContent = '';

      if (steps.length === 0) {
        var empty = document.createElement('li');
        empty.className = 'plan-card__step';
        empty.textContent = 'No plan steps yet.';
        activePlanCard.list.appendChild(empty);
      } else {
        steps.forEach(function(item) {
          var row = document.createElement('li');
          var statusClass = item.status.replace('_', '-');
          row.className = 'plan-card__step plan-card__step--' + statusClass;
          var statusLabel = item.status === 'completed'
            ? 'Completed'
            : item.status === 'in_progress' ? 'In progress' : 'Pending';
          row.setAttribute('aria-label', statusLabel + ': ' + item.step);
          var status = document.createElement('span');
          status.className = 'plan-card__status';
          status.setAttribute('aria-hidden', 'true');
          status.textContent = item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '→' : '○';
          var text = document.createElement('span');
          text.className = 'plan-card__step-text';
          text.textContent = item.step;
          row.appendChild(status);
          row.appendChild(text);
          activePlanCard.list.appendChild(row);
        });
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

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

    function getToolIcon(name, category) {
      if (category === 'web-search') return '$(search)';
      if (category === 'web-fetch' || category === 'computer-use') return '$(globe)';
      if (category === 'shell' || category === 'code-execution') return '$(terminal)';
      if (category === 'filesystem') return '$(file)';
      if (category === 'skill') return '$(book)';
      if (category === 'mcp' || category === 'connector') return '$(plug)';
      var key = name.toLowerCase().replace(/[- ]/g, '_');
      return TOOL_ICONS[key] || '$(symbol-misc)';
    }

    function getToolLabel(name) {
      return name.replace(/_/g, ' ').replace(/\\b[a-z]/g, function(c) { return c.toUpperCase(); });
    }

    function formatToolPayload(value) {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value, null, 2); }
      catch (_) { return String(value); }
    }

    function formatElapsedMs(value) {
      if (value < 1000) return value + ' ms';
      return (value / 1000).toFixed(value < 10000 ? 1 : 0) + ' s';
    }

    function updateActivitySummary(latestSummary, terminal) {
      if (!toolCallStack || !activityMeta || !activitySummaryButton || !activityIcon || !toolCallList) return;
      var total = toolCallList.querySelectorAll('.tool-call').length;
      var running = toolCallList.querySelectorAll('.tool-call--pending').length;
      var errors = toolCallList.querySelectorAll('.tool-call--error').length;
      var completed = Math.max(0, total - running - errors);
      var parts = [total + (total === 1 ? ' action' : ' actions')];
      if (terminal) {
        parts.push(
          errors > 0
            ? errors + (errors === 1 ? ' error' : ' errors')
            : toolCallStackHasError
              ? 'Completed with errors'
              : 'Done'
        );
      } else {
        if (running > 0) parts.push(running + ' running');
        if (completed > 0) parts.push(completed + ' done');
        if (errors > 0) parts.push(errors + (errors === 1 ? ' error' : ' errors'));
      }
      if (latestSummary) parts.push(latestSummary);
      activityMeta.textContent = parts.join(' · ');
      var status = terminal ? (errors > 0 || toolCallStackHasError ? 'error' : 'done') : 'working';
      toolCallStack.dataset.status = status;
      activityIcon.className = 'activity-group__icon codicon codicon-' +
        (status === 'error' ? 'error' : status === 'done' ? 'check' : 'loading');
      activitySummaryButton.setAttribute(
        'aria-label',
        'Activity, ' + parts.join(', ') + '. ' +
          (activitySummaryButton.getAttribute('aria-expanded') === 'true' ? 'Collapse details' : 'Expand details')
      );
    }

    function ensureToolCallStack() {
      if (toolCallStack && toolCallList) return toolCallList;
      toolCallStackHasError = false;
      var stackEl = document.createElement('section');
      stackEl.className = 'activity-group tool-call-stack';
      stackEl.dataset.status = 'working';
      stackEl.setAttribute('aria-label', 'Activity');

      var summaryButton = document.createElement('button');
      summaryButton.type = 'button';
      summaryButton.className = 'activity-group__summary';
      summaryButton.setAttribute('aria-expanded', 'true');
      var iconEl = document.createElement('span');
      iconEl.className = 'activity-group__icon codicon codicon-loading';
      iconEl.setAttribute('aria-hidden', 'true');
      var titleEl = document.createElement('span');
      titleEl.className = 'activity-group__title';
      titleEl.textContent = 'Activity';
      var metaEl = document.createElement('span');
      metaEl.className = 'activity-group__meta';
      metaEl.textContent = 'Starting…';
      var chevronEl = document.createElement('span');
      chevronEl.className = 'activity-group__chevron';
      chevronEl.textContent = '▼';
      chevronEl.setAttribute('aria-hidden', 'true');
      summaryButton.appendChild(iconEl);
      summaryButton.appendChild(titleEl);
      summaryButton.appendChild(metaEl);
      summaryButton.appendChild(chevronEl);

      var listEl = document.createElement('div');
      listEl.className = 'activity-group__body';
      summaryButton.addEventListener('click', function() {
        var collapsed = stackEl.classList.toggle('activity-group--collapsed');
        summaryButton.setAttribute('aria-expanded', String(!collapsed));
        updateActivitySummary('', stackEl.dataset.status !== 'working');
      });
      stackEl.appendChild(summaryButton);
      stackEl.appendChild(listEl);
      messagesEl.appendChild(stackEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      toolCallStack = stackEl;
      toolCallList = listEl;
      activitySummaryButton = summaryButton;
      activityIcon = iconEl;
      activityMeta = metaEl;
      return listEl;
    }

    function createToolCallEl(toolUseId, name, category, summary, input) {
      var stack = ensureToolCallStack();
      var icon = getToolIcon(name, category);
      var label = getToolLabel(name);

      var wrapper = document.createElement('div');
      wrapper.className = 'tool-call tool-call--pending';
      wrapper.dataset.id = toolUseId;

      var bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'tool-call__bar';
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
      summaryEl.textContent = summary || '';

      var chevron = document.createElement('span');
      chevron.className = 'tool-call__chevron';
      chevron.textContent = '▶';

      bar.appendChild(iconEl);
      bar.appendChild(labelEl);
      bar.appendChild(summaryEl);
      bar.appendChild(chevron);

      var bodyEl = document.createElement('div');
      bodyEl.className = 'tool-call__body';

      var requestSection = document.createElement('div');
      requestSection.className = 'tool-call__section';
      var requestLabel = document.createElement('div');
      requestLabel.className = 'tool-call__section-label';
      requestLabel.textContent = 'Request';
      var requestEl = document.createElement('pre');
      requestEl.className = 'tool-call__payload';
      requestEl.textContent = formatToolPayload(input);
      requestSection.appendChild(requestLabel);
      requestSection.appendChild(requestEl);

      var responseSection = document.createElement('div');
      responseSection.className = 'tool-call__section';
      responseSection.style.display = 'none';
      var responseLabel = document.createElement('div');
      responseLabel.className = 'tool-call__section-label';
      responseLabel.textContent = 'Response';
      var responseEl = document.createElement('pre');
      responseEl.className = 'tool-call__payload';
      responseSection.appendChild(responseLabel);
      responseSection.appendChild(responseEl);

      bodyEl.appendChild(requestSection);
      bodyEl.appendChild(responseSection);

      wrapper.appendChild(bar);
      wrapper.appendChild(bodyEl);

      bar.addEventListener('click', function() {
        var isOpen = wrapper.classList.contains('tool-call--open');
        wrapper.classList.toggle('tool-call--open', !isOpen);
        bar.setAttribute('aria-expanded', String(!isOpen));
      });

      stack.appendChild(wrapper);
      updateActivitySummary(summary || label, false);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      toolCallMap[toolUseId] = {
        el: wrapper,
        bodyEl: bodyEl,
        summaryEl: summaryEl,
        requestEl: requestEl,
        responseEl: responseEl,
        responseSection: responseSection
      };
      return toolCallMap[toolUseId];
    }

    function upsertProgressEl(progressId, summary, detail, status) {
      var existing = progressMap[progressId];
      if (!existing) {
        var stack = ensureToolCallStack();
        var wrapper = document.createElement('div');
        wrapper.className = 'tool-call progress-event';
        wrapper.dataset.id = progressId;

        var bar = document.createElement('button');
        bar.type = 'button';
        bar.className = 'tool-call__bar';
        bar.setAttribute('aria-expanded', 'false');

        var iconEl = document.createElement('span');
        iconEl.className = 'tool-call__icon codicon';
        iconEl.setAttribute('aria-hidden', 'true');

        var labelEl = document.createElement('span');
        labelEl.className = 'tool-call__label';

        var chevron = document.createElement('span');
        chevron.className = 'tool-call__chevron';
        chevron.textContent = '▶';

        var bodyEl = document.createElement('div');
        bodyEl.className = 'tool-call__body progress-event__body';

        bar.appendChild(iconEl);
        bar.appendChild(labelEl);
        bar.appendChild(chevron);
        wrapper.appendChild(bar);
        wrapper.appendChild(bodyEl);

        bar.addEventListener('click', function() {
          if (!bodyEl.textContent) return;
          var isOpen = wrapper.classList.contains('tool-call--open');
          wrapper.classList.toggle('tool-call--open', !isOpen);
          bar.setAttribute('aria-expanded', String(!isOpen));
        });

        stack.appendChild(wrapper);
        existing = progressMap[progressId] = {
          el: wrapper,
          barEl: bar,
          iconEl: iconEl,
          labelEl: labelEl,
          chevronEl: chevron,
          bodyEl: bodyEl
        };
      }

      existing.labelEl.textContent = summary;
      existing.bodyEl.textContent = detail || '';
      existing.chevronEl.style.display = detail ? '' : 'none';
      existing.el.classList.remove('tool-call--pending', 'tool-call--done', 'tool-call--error');
      existing.iconEl.className = 'tool-call__icon codicon';
      if (status === 'running') {
        existing.el.classList.add('tool-call--pending');
        existing.iconEl.classList.add('codicon-loading');
      } else if (status === 'failed') {
        toolCallStackHasError = true;
        existing.el.classList.add('tool-call--error');
        existing.iconEl.classList.add('codicon-error');
      } else {
        existing.el.classList.add('tool-call--done');
        existing.iconEl.classList.add('codicon-check');
      }
      updateActivitySummary(summary, false);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return existing;
    }

    function finalizeToolCallStack() {
      if (!toolCallStack) return;
      toolCallStack.classList.add('activity-group--collapsed');
      if (activitySummaryButton) activitySummaryButton.setAttribute('aria-expanded', 'false');
      updateActivitySummary('', true);
      toolCallStack = null;
      toolCallList = null;
      activitySummaryButton = null;
      activityIcon = null;
      activityMeta = null;
      toolCallMap = {};
      progressMap = {};
      toolCallStackHasError = false;
    }

    var emptyStateEl = document.getElementById('emptyState');
    function hideEmptyState() {
      if (emptyStateEl) { emptyStateEl.style.display = 'none'; }
    }

    var recentChats = { conversations: [], total: 0 };

    function buildRecentChatRow(conversation) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'recent-chat-row';
      row.title = conversation.title;
      var title = document.createElement('span');
      title.className = 'recent-chat-title';
      title.textContent = conversation.title;
      var age = document.createElement('span');
      age.className = 'recent-chat-age';
      age.textContent = conversation.age;
      row.appendChild(title);
      row.appendChild(age);
      row.addEventListener('click', function() {
        vscode.postMessage({
          type: 'openRecentConversation',
          payload: { threadId: conversation.id },
        });
      });
      return row;
    }

    function syncRecentChats() {
      if (!emptyStateEl) return;
      var mounted = emptyStateEl.querySelector('.recent-chats');
      if (mounted) mounted.parentNode.removeChild(mounted);
      emptyStateEl.classList.toggle(
        'empty-state--has-recents',
        recentChats.conversations.length > 0,
      );
      if (recentChats.conversations.length === 0) return;
      var block = document.createElement('div');
      block.className = 'recent-chats';
      var heading = document.createElement('div');
      heading.className = 'recent-chats-title';
      heading.textContent = 'Sessions';
      block.appendChild(heading);
      for (var i = 0; i < recentChats.conversations.length; i++) {
        block.appendChild(buildRecentChatRow(recentChats.conversations[i]));
      }
      var viewAll = document.createElement('button');
      viewAll.type = 'button';
      viewAll.className = 'recent-chats-all';
      viewAll.textContent = 'View all';
      viewAll.setAttribute('aria-label', 'View all ' + recentChats.total + ' sessions');
      viewAll.addEventListener('click', function() {
        openSessionsSheet();
      });
      block.appendChild(viewAll);
      emptyStateEl.insertBefore(block, emptyStateEl.firstChild);
    }
    if (onboardingEl && onboardingEl.style.display !== 'none') {
      setOnboardingVisible(true);
    } else if (onboardingEl) {
      setOnboardingVisible(false);
    }

    // ── Signal ready ──────────────────────────────────────────────────────────
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
