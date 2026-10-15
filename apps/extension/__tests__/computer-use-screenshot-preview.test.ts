import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { settleAutomationAttempt, startAutomationAttempt } from '@agiworkforce/types';
import {
  buildComputerUsePanel,
  type ComputerUsePanelAPI,
} from '../src/features/side-panel/computerUsePanel';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxDAAAAAASUVORK5CYII=';
const dataUrl = `data:image/png;base64,${png}`;
let panel: ComputerUsePanelAPI;
let open: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

function outcome(claim: 'succeeded' | 'refused' | 'failed', passed = true) {
  return settleAutomationAttempt(
    startAutomationAttempt({
      runId: 'screenshot-run',
      action: 'screenshot',
      surface: 'extension',
      sessionKind: 'user-chrome',
    }),
    claim === 'succeeded'
      ? { claim, verification: { check: 'The capture returned image bytes.', passed } }
      : {
          claim,
          reason:
            claim === 'refused' ? 'Screenshot capture was skipped.' : 'Screenshot capture failed.',
        },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  vi.stubGlobal('chrome', {
    i18n: { getMessage: (key: string) => key },
    runtime: {
      lastError: undefined,
      sendMessage: vi.fn(async () => ({ success: true, running: false })),
    },
    storage: {
      local: {
        get: vi.fn((_key, callback?: (items: Record<string, unknown>) => void) => {
          callback?.({});
          return Promise.resolve({});
        }),
        set: vi.fn(async () => undefined),
      },
    },
  });
  createObjectURL = vi.fn(() => 'blob:screenshot-preview');
  revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  open = vi.fn();
  vi.spyOn(window, 'open').mockImplementation(open);
  panel = buildComputerUsePanel();
  document.body.appendChild(panel.panelEl);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('computer-use screenshot result previews', () => {
  it('renders a captured screenshot step as a preview image without image bytes in visible text', () => {
    panel.appendStep({ kind: 'screenshot', stepNumber: 1, screenshotDataUrl: dataUrl });
    expect(panel.panelEl.querySelector('.sp-cu-screenshot img')?.getAttribute('src')).toBe(dataUrl);
    expect(panel.panelEl.textContent).not.toContain(png);
  });

  it('uses a named native button that can receive keyboard focus and opens the in-panel viewer', () => {
    panel.appendStep({ kind: 'screenshot', stepNumber: 1, screenshotDataUrl: dataUrl });
    const button = panel.panelEl.querySelector<HTMLButtonElement>('button.sp-cu-screenshot')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('spMediaViewerOpen');
    button.focus();
    expect(document.activeElement).toBe(button);
    button.click();
    const viewer = document.querySelector<HTMLElement>('.sp-media-viewer')!;
    expect(viewer.getAttribute('role')).toBe('dialog');
    expect(viewer.querySelector('img')?.getAttribute('src')).toBe(dataUrl);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.sp-media-viewer')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps a plain denied capture reason readable', () => {
    panel.appendStep({
      kind: 'tool_result',
      stepNumber: 1,
      toolName: 'screenshot',
      toolResult: 'Action skipped, no approval received.',
      actionOutcome: outcome('refused'),
    });
    expect(panel.panelEl.querySelector('.sp-cu-step-detail')?.textContent).toBe(
      'Action skipped, no approval received.',
    );
    expect(panel.panelEl.querySelector('.sp-cu-screenshot')).toBeNull();
  });

  it.each([
    'data:image/png;base64,invalid" onerror="alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'javascript:alert(1)',
    `data:text/html;base64,${png}`,
  ])('shows no preview for a screenshot URL that is not a png or jpeg data URL: %s', (url) => {
    panel.appendStep({ kind: 'screenshot', stepNumber: 1, screenshotDataUrl: url });
    expect(panel.panelEl.querySelector('.sp-cu-screenshot')).toBeNull();
    expect(panel.panelEl.textContent).not.toContain('alert(1)');
  });
});
