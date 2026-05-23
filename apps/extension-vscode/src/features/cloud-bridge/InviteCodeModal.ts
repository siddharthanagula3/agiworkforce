/**
 * InviteCodeModal.ts — VS Code webview panel port of desktop InviteCodeModal.
 *
 * Two tabs: "Enter invitation code" (default) and "Join waitlist".
 * Uses var(--vscode-*) theme tokens only — no hardcoded colors.
 * Brand string: "AGI" (LC-03).
 */

import * as vscode from 'vscode';
import { redeemInviteCode, joinWaitlist } from '../../lib/waitlistService';
import { friendlyInviteError } from './friendlyError';
import type { InviteCodeModalProps, InviteCodeTab } from './types';

let _panel: vscode.WebviewPanel | undefined;

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

function getModalHtml(nonce: string, defaultTab: InviteCodeTab): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cloud features — AGI</title>
<style nonce="${nonce}">
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px;
    max-width: 480px;
    margin: 0 auto;
  }

  h1 {
    font-size: 1.2em;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--vscode-foreground);
  }

  .description {
    font-size: 0.875em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 20px;
    line-height: 1.5;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border);
    margin-bottom: 20px;
    gap: 0;
  }

  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 8px 16px;
    cursor: pointer;
    color: var(--vscode-tab-inactiveForeground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    margin-bottom: -1px;
    transition: color 0.1s;
  }

  .tab-btn:hover {
    color: var(--vscode-tab-activeForeground);
    background: var(--vscode-tab-hoverBackground);
  }

  .tab-btn.active {
    color: var(--vscode-tab-activeForeground);
    border-bottom-color: var(--vscode-focusBorder);
  }

  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  label {
    display: block;
    font-size: 0.875em;
    color: var(--vscode-foreground);
    margin-bottom: 6px;
    font-weight: 500;
  }

  input[type="text"], input[type="email"] {
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 2px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    outline: none;
    margin-bottom: 16px;
  }

  input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .field { margin-bottom: 16px; }
  .field label { margin-bottom: 4px; }
  .field input { margin-bottom: 0; }

  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 16px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    border-radius: 2px;
    width: 100%;
  }

  button.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }

  button.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .link-btn {
    background: transparent;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: 0.875em;
    padding: 0;
    text-decoration: underline;
  }

  .link-btn:hover { color: var(--vscode-textLink-activeForeground); }

  .error-msg {
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-editorError-foreground));
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-editorError-foreground));
    padding: 6px 8px;
    border-radius: 2px;
    font-size: 0.875em;
    margin-bottom: 12px;
    display: none;
  }

  .success-msg {
    color: var(--vscode-testing-iconPassed, var(--vscode-terminal-ansiGreen));
    background: var(--vscode-diffEditor-insertedTextBackground);
    border: 1px solid var(--vscode-testing-iconPassed, var(--vscode-terminal-ansiGreen));
    padding: 6px 8px;
    border-radius: 2px;
    font-size: 0.875em;
    margin-bottom: 12px;
    display: none;
  }

  .switch-hint {
    margin-top: 12px;
    font-size: 0.875em;
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--vscode-button-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 4px;
    display: none;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<h1>Cloud features</h1>
<p class="description">Cloud features are gated for v1. Join the waitlist, or enter your
invitation code below to unlock cloud routing. AGI will route your requests through one of:
BYOK (your provider key), Groq (free tier, US-routed), OpenRouter, or DeepSeek (with explicit
data-residency disclosure).</p>

<div class="tabs">
  <button class="tab-btn${defaultTab === 'invite' ? ' active' : ''}" id="tabInvite">Enter invitation code</button>
  <button class="tab-btn${defaultTab === 'waitlist' ? ' active' : ''}" id="tabWaitlist">Join waitlist</button>
</div>

<!-- Tab 1: Invite code -->
<div class="tab-panel${defaultTab === 'invite' ? ' active' : ''}" id="panelInvite">
  <div id="inviteError" class="error-msg"></div>
  <div id="inviteSuccess" class="success-msg"></div>
  <div class="field">
    <label for="inviteCode">Invitation code</label>
    <input type="text" id="inviteCode" placeholder="e.g. ABC123" autocomplete="off"
           spellcheck="false" maxlength="32" />
  </div>
  <button class="primary" id="redeemBtn" disabled>
    <span class="spinner" id="redeemSpinner"></span>Unlock cloud
  </button>
  <p class="switch-hint">
    Don't have a code? <button class="link-btn" id="switchToWaitlist">Join the waitlist</button>
  </p>
</div>

<!-- Tab 2: Waitlist -->
<div class="tab-panel${defaultTab === 'waitlist' ? ' active' : ''}" id="panelWaitlist">
  <div id="waitlistError" class="error-msg"></div>
  <div id="waitlistSuccess" class="success-msg"></div>
  <div class="field">
    <label for="waitlistEmail">Email <span aria-hidden="true">*</span></label>
    <input type="email" id="waitlistEmail" placeholder="you@example.com" autocomplete="email" />
  </div>
  <div class="field">
    <label for="waitlistName">Name (optional)</label>
    <input type="text" id="waitlistName" placeholder="Your name" autocomplete="name" />
  </div>
  <button class="primary" id="waitlistBtn" disabled>
    <span class="spinner" id="waitlistSpinner"></span>Join waitlist
  </button>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  // ── Tab switching ──────────────────────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab' + tab).classList.add('active');
    document.getElementById('panel' + tab).classList.add('active');
  }

  document.getElementById('tabInvite').addEventListener('click', () => switchTab('Invite'));
  document.getElementById('tabWaitlist').addEventListener('click', () => switchTab('Waitlist'));
  document.getElementById('switchToWaitlist').addEventListener('click', () => switchTab('Waitlist'));

  // ── Invite code tab ────────────────────────────────────────────────────────
  const inviteInput = document.getElementById('inviteCode');
  const redeemBtn = document.getElementById('redeemBtn');
  const redeemSpinner = document.getElementById('redeemSpinner');
  const inviteError = document.getElementById('inviteError');
  const inviteSuccess = document.getElementById('inviteSuccess');

  inviteInput.addEventListener('input', () => {
    inviteInput.value = inviteInput.value.toUpperCase();
    redeemBtn.disabled = inviteInput.value.trim().length < 6;
  });

  redeemBtn.addEventListener('click', () => {
    const code = inviteInput.value.trim();
    if (code.length < 6) return;
    inviteError.style.display = 'none';
    inviteSuccess.style.display = 'none';
    redeemBtn.disabled = true;
    redeemSpinner.style.display = 'inline-block';
    vscode.postMessage({ type: 'redeemInviteCode', code });
  });

  // ── Waitlist tab ───────────────────────────────────────────────────────────
  const emailInput = document.getElementById('waitlistEmail');
  const nameInput = document.getElementById('waitlistName');
  const waitlistBtn = document.getElementById('waitlistBtn');
  const waitlistSpinner = document.getElementById('waitlistSpinner');
  const waitlistError = document.getElementById('waitlistError');
  const waitlistSuccess = document.getElementById('waitlistSuccess');

  const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

  emailInput.addEventListener('input', () => {
    waitlistBtn.disabled = !EMAIL_RE.test(emailInput.value.trim());
  });

  waitlistBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();
    if (!EMAIL_RE.test(email)) return;
    waitlistError.style.display = 'none';
    waitlistSuccess.style.display = 'none';
    waitlistBtn.disabled = true;
    waitlistSpinner.style.display = 'inline-block';
    vscode.postMessage({ type: 'joinWaitlist', email, name: nameInput.value.trim() });
  });

  // ── Messages from extension host ──────────────────────────────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'redeemResult':
        redeemSpinner.style.display = 'none';
        if (msg.success) {
          inviteSuccess.textContent = 'Cloud unlocked!';
          inviteSuccess.style.display = 'block';
          inviteInput.disabled = true;
        } else {
          inviteError.textContent = msg.error ?? 'An error occurred.';
          inviteError.style.display = 'block';
          redeemBtn.disabled = false;
        }
        break;
      case 'waitlistResult':
        waitlistSpinner.style.display = 'none';
        if (msg.success) {
          waitlistSuccess.textContent = "You’re on the list!";
          waitlistSuccess.style.display = 'block';
          emailInput.disabled = true;
          nameInput.disabled = true;
        } else {
          waitlistError.textContent = msg.error ?? 'An error occurred.';
          waitlistError.style.display = 'block';
          waitlistBtn.disabled = false;
        }
        break;
    }
  });
</script>
</body>
</html>`;
}

export async function openInviteCodeModal(
  context: vscode.ExtensionContext,
  props: InviteCodeModalProps,
): Promise<void> {
  const defaultTab = props.defaultTab ?? 'invite';

  if (_panel) {
    _panel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'agi-workforce.inviteCodeModal',
    'Cloud features — AGI',
    { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: false,
    },
  );

  _panel = panel;

  const nonce = getNonce();
  panel.webview.html = getModalHtml(nonce, defaultTab);

  const msgDisposable = panel.webview.onDidReceiveMessage(
    async (msg: { type: string; code?: string; email?: string; name?: string }) => {
      if (msg.type === 'redeemInviteCode' && msg.code) {
        const result = await redeemInviteCode(msg.code, props.source);
        if (result.success && result.inviteId) {
          void panel.webview.postMessage({ type: 'redeemResult', success: true });
          props.onRedeemed?.(result.inviteId);
          setTimeout(() => panel.dispose(), 1500);
        } else {
          const friendly = result.error ? friendlyInviteError(result.error) : 'An error occurred.';
          void panel.webview.postMessage({ type: 'redeemResult', success: false, error: friendly });
        }
      } else if (msg.type === 'joinWaitlist' && msg.email) {
        const entry: import('../../lib/waitlistService').WaitlistEntry = {
          email: msg.email,
          referralSource: props.source,
        };
        if (msg.name) entry.name = msg.name;
        const result = await joinWaitlist(entry);
        if (result.success) {
          void panel.webview.postMessage({ type: 'waitlistResult', success: true });
          props.onWaitlisted?.(msg.email);
          setTimeout(() => panel.dispose(), 2000);
        } else {
          void panel.webview.postMessage({
            type: 'waitlistResult',
            success: false,
            error: result.error ?? 'An error occurred.',
          });
        }
      }
    },
  );

  panel.onDidDispose(() => {
    msgDisposable.dispose();
    _panel = undefined;
  });
}
