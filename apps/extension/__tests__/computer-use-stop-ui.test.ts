/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildComputerUsePanel } from '../src/features/side-panel/computerUsePanel';

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

  it('tombstones a pending admission before the cancellation response resolves', () => {
    sendMessage.mockImplementation(() => new Promise(() => {}));
    const api = buildComputerUsePanel();
    document.body.appendChild(api.panelEl);
    api.setRunState(true, 'cu_run_pending-admission');

    api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-clear-btn')?.click();

    expect(api.ownsRun('cu_run_pending-admission')).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'CANCEL_COMPUTER_USE',
      runId: 'cu_run_pending-admission',
      reason: 'user_cleared',
    });
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
