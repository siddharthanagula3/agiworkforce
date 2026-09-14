import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getChromeSurfaceAvailability,
  isRestrictedPageUrl,
} from '../src/features/side-panel/surface-policy';

const sidePanelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

describe('Chrome side-panel surface ownership', () => {
  it('keeps Managed Cloud chat available when Desktop is disconnected', () => {
    expect(getChromeSurfaceAvailability({ nativeConnected: false, restrictedPage: false })).toEqual(
      { chat: true, pageContext: true, nativeTools: false },
    );
  });

  it('keeps chat available on restricted browser pages without claiming page context', () => {
    expect(getChromeSurfaceAvailability({ nativeConnected: false, restrictedPage: true })).toEqual({
      chat: true,
      pageContext: false,
      nativeTools: false,
    });
  });

  it('enables native browser mechanics independently of Managed Cloud chat', () => {
    expect(getChromeSurfaceAvailability({ nativeConnected: true, restrictedPage: false })).toEqual({
      chat: true,
      pageContext: true,
      nativeTools: true,
    });
  });

  it('uses the surface policy without disabling cloud chat for native status', () => {
    expect(sidePanelSource).toContain('getChromeSurfaceAvailability');
    expect(sidePanelSource).not.toContain('sendBtnEl.disabled = offline');
    expect(sidePanelSource).not.toContain('Start the AGI desktop app to enable chat');
  });

  it('shows an honest restricted-page notice while leaving Managed Cloud chat available', () => {
    const blockedStateStart = sidePanelSource.indexOf('function setBlockedState');
    const refreshStart = sidePanelSource.indexOf('function refreshPageHostname', blockedStateStart);
    const blockedStateSource = sidePanelSource.slice(blockedStateStart, refreshStart);

    expect(blockedStateSource).toContain("if (blocked) {\n    blockedEl.classList.add('visible')");
    expect(sidePanelSource).toContain("role: 'status'");
    expect(sidePanelSource).toContain('You can still chat');
  });

  it('cancels active cloud work before owner, new-chat, and current-delete transitions', () => {
    expect(sidePanelSource.match(/cancelCurrentManagedStream\(false\)/g)).toHaveLength(3);
    expect(sidePanelSource).toContain('requestStreamCancellation(streamId)');
  });

  it('claims stream ownership before asynchronous page capture begins', () => {
    const branchStart = sidePanelSource.indexOf('if (slashCmd?.captureContext)');
    expect(
      sidePanelSource.indexOf('const streamId = beginManagedStream(_ctx.quickMode)', branchStart),
    ).toBeLessThan(sidePanelSource.indexOf('capturePageContext()', branchStart));
    expect(sidePanelSource).not.toContain('stream-${Date.now()}');
  });
});

describe('isRestrictedPageUrl', () => {
  it('flags every page Chrome refuses to let extensions read', () => {
    for (const url of [
      'chrome://version',
      'chrome://newtab/',
      'chrome-extension://abc/src/side_panel.html',
      'chrome-untrusted://new-tab-page/',
      'devtools://devtools/bundled/inspector.html',
      'edge://settings',
      'about:blank',
      'view-source:https://example.com/',
      'file:///Users/me/report.html',
      'data:text/html,hi',
      'https://chromewebstore.google.com/detail/agi/abcdefghijklmnop',
      'https://chrome.google.com/webstore/detail/agi/abcdefghijklmnop',
    ]) {
      expect(isRestrictedPageUrl(url), url).toBe(true);
    }
  });

  it('leaves ordinary sites, an empty url and the web app alone', () => {
    for (const url of [
      '',
      'https://example.com/article',
      'http://localhost:3000/',
      'https://agiworkforce.com/chat',
    ]) {
      expect(isRestrictedPageUrl(url), url).toBe(false);
    }
  });
});
