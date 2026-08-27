/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildComputerUsePanel,
  describeCancellationReason,
} from '../src/features/side-panel/computerUsePanel';

const sendMessage = vi.fn();

function stubChrome(): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: { lastError: undefined, sendMessage },
      storage: {
        local: {
          get: vi.fn((_key: unknown, callback?: (items: Record<string, unknown>) => void) => {
            callback?.({});
            return Promise.resolve({});
          }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
  });
}

describe('computer-use visible Stop lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ success: true, running: false });
    stubChrome();
  });

  it('shows Stop for the owned run and sends an exact-run cancellation', async () => {
    const api = buildComputerUsePanel();
    document.body.appendChild(api.panelEl);
    api.setRunState(true, 'run-a');

    const stop = api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-stop-btn');
    const start = api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-run-btn');
    expect(stop?.classList.contains('visible')).toBe(true);
    expect(start?.disabled).toBe(true);

    stop?.click();
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'CANCEL_COMPUTER_USE',
        runId: 'run-a',
        reason: 'user_stopped',
      });
    });
    expect(stop?.classList.contains('visible')).toBe(false);
    expect(start?.disabled).toBe(false);
  });

  it('Clear cancels before discarding the visible run log', async () => {
    const api = buildComputerUsePanel();
    document.body.appendChild(api.panelEl);
    api.setRunState(true, 'run-clear');
    api.appendStep({ kind: 'tool_call', stepNumber: 1, toolName: 'click' });

    api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-clear-btn')?.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'CANCEL_COMPUTER_USE',
        runId: 'run-clear',
        reason: 'user_cleared',
      });
    });
    expect(api.panelEl.querySelectorAll('.sp-cu-step')).toHaveLength(0);
  });

  it('keeps the run until the background answers, rather than reporting a stop it never got', () => {
    sendMessage.mockImplementation(() => new Promise(() => {}));
    const api = buildComputerUsePanel();
    document.body.appendChild(api.panelEl);
    api.setRunState(true, 'cu_run_pending-admission');

    const stop = api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-stop-btn');
    stop?.click();

    expect(api.ownsRun('cu_run_pending-admission')).toBe(true);
    expect(stop?.disabled).toBe(true);
    expect(stop?.textContent).toBe('Stopping…');
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'CANCEL_COMPUTER_USE',
      runId: 'cu_run_pending-admission',
      reason: 'user_stopped',
    });
  });

  it('surfaces a refused stop instead of showing idle over a run that is still driving', async () => {
    sendMessage.mockResolvedValue({
      success: false,
      running: true,
      error: 'CANCEL_COMPUTER_USE: run ownership no longer matches',
    });
    const api = buildComputerUsePanel();
    document.body.appendChild(api.panelEl);
    api.setRunState(true, 'cu_run_refused');

    api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-stop-btn')?.click();

    await vi.waitFor(() => {
      expect(api.panelEl.querySelector('.sp-cu-banner')?.classList.contains('visible')).toBe(true);
    });
    expect(api.panelEl.querySelector('.sp-cu-banner-title')?.textContent).toBe(
      'Browser control stopped',
    );
    expect(api.panelEl.querySelector('.sp-cu-banner-sub')?.textContent).toContain(
      'run ownership no longer matches',
    );
    expect(api.ownsRun('cu_run_refused')).toBe(true);
    expect(api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-stop-btn')?.disabled).toBe(false);
  });

  it('adopts a run the background is still driving when the panel is reopened', async () => {
    sendMessage.mockImplementation((message: { type: string }) =>
      message.type === 'GET_COMPUTER_USE_STATE'
        ? Promise.resolve({
            success: true,
            running: true,
            runId: 'cu_run_survivor',
            runGeneration: 5,
            tabId: 12,
          })
        : Promise.resolve({ success: true, running: false }),
    );

    const api = buildComputerUsePanel();
    document.body.appendChild(api.panelEl);

    await vi.waitFor(() => {
      expect(api.ownsRun('cu_run_survivor')).toBe(true);
    });
    expect(api.panelEl.querySelector('.sp-cu-stop-btn')?.classList.contains('visible')).toBe(true);
    expect(api.panelEl.querySelector('.sp-cu-banner-sub')?.textContent).toContain('still active');
  });

  it('panel teardown cancels only the run incarnation it owns', () => {
    const api = buildComputerUsePanel();
    api.setRunState(true, 'run-panel');

    window.dispatchEvent(new PageTransitionEvent('pagehide'));

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'CANCEL_COMPUTER_USE',
      runId: 'run-panel',
      reason: 'panel_closed',
    });
    expect(api.ownsRun('run-panel')).toBe(false);
  });

  it('ignores delayed running and completion states from a superseded run', () => {
    const api = buildComputerUsePanel();
    api.setRunState(true, 'run-b', 2);

    api.setRunState(true, 'run-a', 1);
    api.setRunState(false, 'run-a');

    expect(api.ownsRun('run-b')).toBe(true);
    expect(api.panelEl.querySelector('.sp-cu-stop-btn')?.classList.contains('visible')).toBe(true);
  });
});

describe('every way a run can end has words for the user', () => {
  it('has copy for each declared cancellation reason', () => {
    const runOwnership = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/features/computer-use/runOwnership.ts'),
      'utf8',
    );
    const union = runOwnership.slice(
      runOwnership.indexOf('export type ComputerUseCancellationReason'),
      runOwnership.indexOf(';', runOwnership.indexOf('export type ComputerUseCancellationReason')),
    );
    const reasons = [...union.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);

    expect(reasons.length).toBeGreaterThan(5);
    for (const reason of reasons) {
      expect(describeCancellationReason(reason), `no copy for "${reason}"`).toBeTruthy();
    }
  });

  it('tells the user in plain words that Chrome’s own Cancel stopped the run', () => {
    expect(describeCancellationReason('debugger_detached')).toContain('debugging bar');
  });

  it('returns null for anything that is not a reason, rather than inventing copy', () => {
    expect(describeCancellationReason('made_up')).toBeNull();
    expect(describeCancellationReason(undefined)).toBeNull();
  });
});
