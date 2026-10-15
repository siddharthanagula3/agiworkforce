import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { settleAutomationAttempt, startAutomationAttempt } from '@agiworkforce/types';
import {
  buildComputerUsePanel,
  type ComputerUsePanelAPI,
} from '../src/features/side-panel/computerUsePanel';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxDAAAAAASUVORK5CYII=';
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

function loaded(): HTMLButtonElement {
  const image = panel.panelEl.querySelector<HTMLImageElement>('.sp-cu-screenshot img')!;
  Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
  image.dispatchEvent(new Event('load'));
  return panel.panelEl.querySelector<HTMLButtonElement>('.sp-cu-screenshot button')!;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  vi.stubGlobal('chrome', {
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
  it('renders the verified capture receipt and human preview label without JSON or image bytes in visible text', () => {
    panel.appendStep({
      kind: 'tool_result',
      stepNumber: 1,
      toolName: 'screenshot',
      toolResult: JSON.stringify({
        type: 'screenshot',
        base64: png,
        note: 'See image in next turn.',
      }),
      actionOutcome: outcome('succeeded'),
    });
    expect(panel.panelEl.querySelector('.sp-cu-step')?.getAttribute('data-outcome')).toBe(
      'succeeded',
    );
    expect(panel.panelEl.querySelector('.sp-cu-step-title')?.textContent).toBe(
      'Completed: screenshot',
    );
    expect(panel.panelEl.querySelector('.sp-cu-step-detail')?.textContent).toBe(
      'Screenshot preview',
    );
    expect(panel.panelEl.textContent).not.toContain(png);
    expect(panel.panelEl.textContent).not.toContain('"base64"');
    expect(panel.panelEl.textContent).not.toContain('"type"');
    expect(panel.panelEl.querySelector('img')?.src).toBe(`data:image/png;base64,${png}`);
  });

  it('uses a named native button that can receive keyboard focus and open the existing preview', () => {
    panel.appendStep({
      kind: 'tool_result',
      stepNumber: 1,
      toolName: 'screenshot',
      toolResult: JSON.stringify({ type: 'screenshot', base64: png }),
      actionOutcome: outcome('succeeded'),
    });
    const button = panel.panelEl.querySelector<HTMLButtonElement>('.sp-cu-screenshot button')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Open screenshot preview in a new tab');
    expect(button.disabled).toBe(true);
    button.click();
    expect(open).not.toHaveBeenCalled();
    const ready = loaded();
    expect(ready.disabled).toBe(false);
    expect(ready.tabIndex).toBe(0);
    ready.focus();
    expect(document.activeElement).toBe(ready);
    ready.click();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(open).toHaveBeenCalledExactlyOnceWith(
      'blob:screenshot-preview',
      '_blank',
      'noopener,noreferrer',
    );
    vi.advanceTimersByTime(10_000);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:screenshot-preview');
  });

  it.each(['refused', 'failed'] as const)(
    'preserves a %s receipt and does not preview a misleading image payload',
    (claim) => {
      panel.appendStep({
        kind: 'tool_result',
        stepNumber: 1,
        toolName: 'screenshot',
        toolResult: JSON.stringify({ type: 'screenshot', base64: png }),
        actionOutcome: outcome(claim),
      });
      expect(panel.panelEl.querySelector('.sp-cu-step')?.getAttribute('data-outcome')).toBe(claim);
      expect(panel.panelEl.querySelector('.sp-cu-step-title')?.textContent).toBe(
        claim === 'refused' ? 'Skipped: screenshot' : 'Not verified: screenshot',
      );
      expect(panel.panelEl.querySelector('.sp-cu-screenshot')).toBeNull();
      expect(panel.panelEl.textContent).not.toContain(png);
    },
  );

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
    JSON.stringify({ type: 'screenshot', base64: 'invalid" onerror="alert(1)' }),
    JSON.stringify({ type: 'screenshot', base64: '' }),
    JSON.stringify({ type: 'screenshot', base64: 7 }),
    JSON.stringify({ type: 'other', base64: png }),
    '{"type":"screenshot","base64":',
  ])('shows no raw JSON or preview for malformed screenshot output: %s', (toolResult) => {
    panel.appendStep({ kind: 'tool_result', stepNumber: 1, toolName: 'screenshot', toolResult });
    expect(panel.panelEl.querySelector('.sp-cu-step')?.getAttribute('data-outcome')).toBe(
      'unverified',
    );
    expect(panel.panelEl.querySelector('.sp-cu-step-detail')?.textContent).toBe(
      'No screenshot preview is available.',
    );
    expect(panel.panelEl.querySelector('.sp-cu-screenshot')).toBeNull();
    expect(panel.panelEl.textContent).not.toContain('"base64"');
    expect(panel.panelEl.textContent).not.toContain('alert(1)');
  });

  it('does not pretend base64 text is a decodable image when the browser rejects it', () => {
    panel.appendStep({
      kind: 'tool_result',
      stepNumber: 1,
      toolName: 'screenshot',
      toolResult: JSON.stringify({ type: 'screenshot', base64: btoa('not image bytes') }),
    });
    const image = panel.panelEl.querySelector<HTMLImageElement>('.sp-cu-screenshot img')!;
    image.dispatchEvent(new Event('error'));
    expect(panel.panelEl.querySelector('.sp-cu-screenshot')).toBeNull();
    expect(panel.panelEl.querySelector('.sp-cu-step-detail')?.textContent).toBe(
      'The screenshot could not be displayed.',
    );
    expect(panel.panelEl.querySelector('.sp-cu-step')?.getAttribute('data-outcome')).toBe(
      'unverified',
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('preserves the legacy screenshot event preview with the same keyboard control', () => {
    panel.appendStep({ kind: 'screenshot', stepNumber: 1, screenshotBase64: png });
    expect(panel.panelEl.querySelector('.sp-cu-step-title')?.textContent).toBe(
      'Screenshot captured',
    );
    expect(loaded().disabled).toBe(false);
  });
});
