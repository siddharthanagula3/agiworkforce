import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getChromeSurfaceAvailability } from '../src/features/side-panel/surface-policy';

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
    expect(sidePanelSource).toContain("chips.classList.toggle('hidden', restrictedPage)");
  });

  it('cancels active cloud work before owner, new-chat, current-delete, and clear transitions', () => {
    expect(sidePanelSource.match(/cancelCurrentManagedStream\(false\)/g)).toHaveLength(4);
    expect(sidePanelSource).toContain('requestStreamCancellation(streamId)');
  });

  it('claims stream ownership before asynchronous page capture begins', () => {
    const branchStart = sidePanelSource.indexOf('if (slashCmd?.captureContext)');
    expect(
      sidePanelSource.indexOf('const streamId = beginManagedStream()', branchStart),
    ).toBeLessThan(sidePanelSource.indexOf('capturePageContext()', branchStart));
    expect(sidePanelSource).not.toContain('stream-${Date.now()}');
  });
});
