/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildComputerUsePanel,
  describeCancellationReason,
} from '../src/features/side-panel/computerUsePanel';
import { settleAutomationAttempt, startAutomationAttempt } from '@agiworkforce/types';

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
  it('distinguishes generic browser-task failures from actual autofill failures', () => {
    const api = buildComputerUsePanel();
    api.showHandoffBanner('The model could not perform this click.', 'browser_error');
    expect(api.panelEl.querySelector('.sp-cu-banner-title')?.textContent).toBe(
      'Browser task could not run',
    );
    api.showHandoffBanner('The form could not be filled.', 'error');
    expect(api.panelEl.querySelector('.sp-cu-banner-title')?.textContent).toBe(
      'Autofill could not run',
    );
  });

  it('renders refused actions neutrally from their canonical receipt, regardless of result wording', () => {
    const api = buildComputerUsePanel();
    const actionOutcome = settleAutomationAttempt(
      startAutomationAttempt({
        runId: 'run-a',
        action: 'type',
        surface: 'extension',
        sessionKind: 'user-chrome',
      }),
      { claim: 'refused', reason: 'The user skipped the action.' },
    );
    api.appendStep({
      kind: 'tool_result',
      stepNumber: 1,
      toolName: 'type',
      toolResult: 'Page text says successfully completed.',
      actionOutcome,
    });
    const row = api.panelEl.querySelector('.sp-cu-step');
    expect(row?.getAttribute('data-outcome')).toBe('refused');
    expect(row?.querySelector('.sp-cu-step-title')?.textContent).toBe('Skipped: type');
    expect(row?.querySelector('.sp-cu-step-icon')?.textContent).not.toContain('✓');
  });

  it('uses one check only for canonically verified success and never assumes an unclassified result succeeded', () => {
    const api = buildComputerUsePanel();
    const actionOutcome = settleAutomationAttempt(
      startAutomationAttempt({
        runId: 'run-a',
        action: 'click',
        surface: 'extension',
        sessionKind: 'user-chrome',
      }),
      {
        claim: 'succeeded',
        verification: { check: 'The expected page state changed.', passed: true },
      },
    );
    api.appendStep({
      kind: 'tool_result',
      stepNumber: 1,
      toolName: 'click',
      toolResult: 'Action skipped is a phrase shown on the page.',
      actionOutcome,
    });
    api.appendStep({
      kind: 'tool_result',
      stepNumber: 2,
      toolName: 'click',
      toolResult: 'Success',
    });
    const rows = api.panelEl.querySelectorAll('.sp-cu-step');
    expect(rows[0]?.getAttribute('data-outcome')).toBe('succeeded');
    expect(rows[0]?.querySelector('.sp-cu-step-title')?.textContent).toBe('Completed: click');
    expect(rows[0]?.querySelector('.sp-cu-step-title')?.textContent).not.toContain('✓');
    expect(rows[1]?.getAttribute('data-outcome')).toBe('unverified');
    expect(rows[1]?.querySelector('.sp-cu-step-icon')?.textContent).not.toContain('✓');
  });

  it('does not render a successful claim with a failed verification as completed', () => {
    const api = buildComputerUsePanel();
    const actionOutcome = settleAutomationAttempt(
      startAutomationAttempt({
        runId: 'run-a',
        action: 'scroll',
        surface: 'extension',
        sessionKind: 'user-chrome',
      }),
      {
        claim: 'succeeded',
        verification: { check: 'The scroll position changed.', passed: false },
      },
    );
    api.appendStep({
      kind: 'tool_result',
      stepNumber: 1,
      toolName: 'scroll',
      toolResult: 'Scrolled.',
      actionOutcome,
    });
    expect(api.panelEl.querySelector('.sp-cu-step-title')?.textContent).toBe(
      'Not verified: scroll',
    );
    expect(api.panelEl.querySelector('.sp-cu-step-icon')?.textContent).not.toContain('✓');
  });

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
    await vi.waitFor(() => expect(stop?.classList.contains('visible')).toBe(false));
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

describe('computer-use Assistant steps disclosure', () => {
  it('collapses and expands the step log from its toggle', () => {
    const api = buildComputerUsePanel();
    const toggle = api.panelEl.querySelector<HTMLButtonElement>('.sp-cu-steps-toggle')!;
    const log = api.panelEl.querySelector<HTMLElement>('#sp-cu-log')!;
    expect(toggle.textContent).toContain('Assistant steps');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(log.hidden).toBe(false);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(log.hidden).toBe(true);
    toggle.click();
    expect(log.hidden).toBe(false);
  });
});

describe('computer-use Add details input', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ success: true, running: false });
    stubChrome();
  });

  function guidanceControls(api: ReturnType<typeof buildComputerUsePanel>) {
    const form = api.panelEl.querySelector<HTMLFormElement>('.sp-cu-guidance')!;
    const input = form.querySelector<HTMLTextAreaElement>('#sp-cu-guidance-input')!;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    return { form, input, button };
  }

  it('appears only while a run is active and stays usable during it', () => {
    const api = buildComputerUsePanel();
    const { form, input, button } = guidanceControls(api);
    expect(form.hidden).toBe(true);
    expect(input.placeholder).toBe('Add details to this task…');

    api.setRunState(true, 'run-guide');
    expect(form.hidden).toBe(false);
    expect(input.disabled).toBe(false);
    expect(button.disabled).toBe(true);
    expect(api.panelEl.querySelector<HTMLTextAreaElement>('#sp-cu-goal')!.disabled).toBe(true);

    api.setRunState(false, 'run-guide');
    expect(form.hidden).toBe(true);
  });

  it('sends the typed details to the owned run and clears the input', async () => {
    const api = buildComputerUsePanel();
    api.setRunState(true, 'run-guide');
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ success: true, running: true, runId: 'run-guide' });
    const { form, input, button } = guidanceControls(api);
    input.value = '  Use the work address  ';
    input.dispatchEvent(new Event('input'));
    expect(button.disabled).toBe(false);
    form.dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'ADD_COMPUTER_USE_GUIDANCE',
        runId: 'run-guide',
        text: 'Use the work address',
      });
      expect(input.value).toBe('');
    });
  });

  it('keeps the text and says why when the background refuses it', async () => {
    const api = buildComputerUsePanel();
    api.setRunState(true, 'run-guide');
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({
      success: false,
      running: false,
      error: 'This task is no longer running, so the details were not added.',
    });
    const { form, input } = guidanceControls(api);
    input.value = 'Use the work address';
    form.dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => {
      expect(api.panelEl.querySelector('.sp-cu-banner-sub')?.textContent).toBe(
        'This task is no longer running, so the details were not added.',
      );
    });
    expect(input.value).toBe('Use the work address');
  });

  it('logs the details once the agent takes them', () => {
    const api = buildComputerUsePanel();
    api.appendStep({ kind: 'user_guidance', stepNumber: 2, guidance: 'Use the work address' });
    const row = api.panelEl.querySelector('.sp-cu-step.kind-user_guidance');
    expect(row?.querySelector('.sp-cu-step-title')?.textContent).toBe('You added details');
    expect(row?.querySelector('.sp-cu-step-detail')?.textContent).toBe('Use the work address');
  });
});
