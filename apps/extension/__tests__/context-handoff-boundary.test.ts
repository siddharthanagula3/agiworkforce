import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backgroundSource = readFileSync(resolve(process.cwd(), 'src/background.ts'), 'utf8');
const contentSource = readFileSync(resolve(process.cwd(), 'src/content.ts'), 'utf8');

describe('Chrome explicit context-handoff boundary', () => {
  it('never transfers selected context directly from a context-menu click', () => {
    const askBranch = backgroundSource.slice(
      backgroundSource.indexOf("info.menuItemId === 'ask-agi-workforce'"),
      backgroundSource.indexOf("info.menuItemId === 'explain-selection'"),
    );

    expect(askBranch).not.toContain('sendNativeMessage');
    expect(askBranch).toContain('createSelectionContextHandoff');
  });

  it('requires extension-page approval before the native selected-text request', () => {
    const approvalBranch = backgroundSource.slice(
      backgroundSource.indexOf("case 'APPROVE_CONTEXT_HANDOFF'"),
      backgroundSource.indexOf("case 'CANCEL_CONTEXT_HANDOFF'"),
    );

    expect(approvalBranch).toContain('toApprovedNativeSelectionMessage');
    expect(approvalBranch).toContain('requireAuthenticatedSession: true');
  });

  it('does not perform implicit page-context transfer on readiness or navigation', () => {
    expect(backgroundSource).not.toContain('syncTabContextWithDesktop');
    expect(contentSource).not.toContain('syncPageContext(');
  });
});

describe('Chrome native-session integrity boundary', () => {
  it('allows an unsigned response only for the initial connect negotiation', () => {
    expect(backgroundSource).toContain('allowUnsignedResponse: isConnectRequest');
    expect(backgroundSource).toContain('if (!request.allowUnsignedResponse)');
  });

  it('refuses every post-connect request when the host did not negotiate a session secret', () => {
    expect(backgroundSource).toContain('if (!isConnectRequest && !activeSessionSecret)');
    expect(backgroundSource).toContain('Native host did not negotiate an authenticated session');
    expect(backgroundSource).not.toContain('continuing without HMAC envelope verification');
  });

  it('never emits an unsigned native request while the service worker suspends', () => {
    const suspendBranch = backgroundSource.slice(
      backgroundSource.indexOf('chrome.runtime.onSuspend.addListener'),
      backgroundSource.indexOf('/**\n * Public bridge:', backgroundSource.indexOf('chrome.runtime.onSuspend.addListener')),
    );

    expect(suspendBranch).not.toContain('.postMessage(');
    expect(suspendBranch).toContain('.disconnect()');
  });
});
