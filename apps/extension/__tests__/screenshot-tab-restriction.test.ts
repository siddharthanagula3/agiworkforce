
import { describe, expect, it } from 'vitest';

interface ScreenshotResolution {
  resolvedTabId: number | undefined;
  resolvedWindowId: number | undefined;
}

interface SenderShape {
  tab?: { id?: number; windowId?: number };
}

function resolveCaptureTab(
  sender: SenderShape,
  msgTabId: number | undefined,
  msgWindowId: number | undefined,
  activeTab?: { id?: number; windowId?: number },
): ScreenshotResolution {
  if (sender.tab) {
    return { resolvedTabId: sender.tab.id, resolvedWindowId: sender.tab.windowId };
  }
  return {
    resolvedTabId: msgTabId ?? activeTab?.id,
    resolvedWindowId: msgWindowId ?? activeTab?.windowId,
  };
}

describe('H-09 CAPTURE_SCREENSHOT same-tab restriction for content scripts', () => {
  it('content-script sender captures its OWN tab, ignoring message tabId', () => {
    const sender: SenderShape = { tab: { id: 42, windowId: 7 } };
    const result = resolveCaptureTab(sender, 99, 99, { id: 100, windowId: 100 });
    expect(result.resolvedTabId).toBe(42);
    expect(result.resolvedWindowId).toBe(7);
  });

  it('content-script sender ignores active-tab fallback', () => {
    const sender: SenderShape = { tab: { id: 5, windowId: 1 } };
    const result = resolveCaptureTab(sender, undefined, undefined, {
      id: 999,
      windowId: 999,
    });
    expect(result.resolvedTabId).toBe(5);
    expect(result.resolvedWindowId).toBe(1);
  });
});

describe('H-09 CAPTURE_SCREENSHOT extension-page sender falls back to active tab', () => {
  it('side panel (no sender.tab) uses message tabId when provided', () => {
    const sender: SenderShape = {};
    const result = resolveCaptureTab(sender, 11, 22, undefined);
    expect(result.resolvedTabId).toBe(11);
    expect(result.resolvedWindowId).toBe(22);
  });

  it('side panel (no sender.tab, no message tabId) falls back to active tab', () => {
    const sender: SenderShape = {};
    const result = resolveCaptureTab(sender, undefined, undefined, {
      id: 77,
      windowId: 7,
    });
    expect(result.resolvedTabId).toBe(77);
    expect(result.resolvedWindowId).toBe(7);
  });
});
