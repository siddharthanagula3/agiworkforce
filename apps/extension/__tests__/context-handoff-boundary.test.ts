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
      backgroundSource.indexOf(
        '/**\n * Public bridge:',
        backgroundSource.indexOf('chrome.runtime.onSuspend.addListener'),
      ),
    );

    expect(suspendBranch).not.toContain('.postMessage(');
    expect(suspendBranch).toContain('.disconnect()');
  });

  it('sends WebMCP metadata only through the authenticated native request path', () => {
    const webmcpBranch = backgroundSource.slice(
      backgroundSource.indexOf("case 'WEBMCP_TOOLS_CHANGED'"),
      backgroundSource.indexOf("case 'NLWEB_DETECTED'"),
    );
    const nativeStart = backgroundSource.indexOf('function sendAuthenticatedWebMCPNativeUpdate');
    const nativeEnd = backgroundSource.indexOf('function handleNativeMessage', nativeStart);
    const nativeBody = backgroundSource.slice(nativeStart, nativeEnd);

    expect(webmcpBranch).toContain('normalizeWebMCPToolsUpdate');
    expect(webmcpBranch).toContain('publishNormalizedWebMCPToolsUpdate');
    expect(webmcpBranch).toContain('currentTab.url !== senderTabUrl');
    expect(webmcpBranch).toContain('navigationGeneration !== currentWebMCPNavigationGeneration');
    expect(nativeBody).toContain('sendNativeRequest');
    expect(nativeBody).toContain('requireAuthenticatedSession: true');
    expect(nativeBody).toContain('tab_id: tabId');
    expect(nativeBody).toContain('sendAuthenticatedWebMCPNativeUpdate(tabId, cleared)');
    expect(nativeBody).not.toContain('nativePort.postMessage');
  });

  it('invalidates cached UI/native WebMCP metadata on every tab URL generation', () => {
    const discoveryBranch = backgroundSource.slice(
      backgroundSource.indexOf("case 'WEBMCP_DISCOVER_TOOLS'"),
      backgroundSource.indexOf("case 'WEBMCP_CALL_TOOL'"),
    );
    const tabUpdateBranch = backgroundSource.slice(
      backgroundSource.indexOf('chrome.tabs.onUpdated.addListener'),
      backgroundSource.indexOf('chrome.commands.onCommand.addListener'),
    );

    expect(discoveryBranch).toContain('pageGeneration');
    expect(discoveryBranch).toContain('targetAfter.url !== targetUrl');
    expect(tabUpdateBranch).toContain('invalidateWebMCPToolsForNavigation(tabId)');
  });
});
