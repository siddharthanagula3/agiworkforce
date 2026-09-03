import type { ComputerUseCommandResponse } from '../../types';
import type { AgentLoopStep, AgentLoopUsage } from '../computer-use/agentLoop';
import { APPROVAL_TIMEOUT_MS } from '../computer-use/agentLoop';
import { getAuthToken } from '../computer-use/cloudAgentClient';

export const COMPUTER_USE_PANEL_CSS = `
  /* Computer Use tab panel */
  #sp-cu-panel {
    display: none;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  #sp-cu-panel.sp-tab-visible {
    display: flex;
  }

  /* Handoff banner */
  .sp-cu-banner {
    display: none;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
    font-size: 12px;
    color: var(--agi-ext-text);
    flex-shrink: 0;
  }

  .sp-cu-banner.visible {
    display: flex;
  }

  .sp-cu-banner-icon {
    font-size: 16px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .sp-cu-banner-text {
    flex: 1;
    line-height: 1.45;
    /* min-width:0 is required for a flex child to shrink below its min-content
       width. Without it a long unbroken error string (a URL, a stack frame, a
       selector) held the banner wider than the ~320px side panel and the text
       ran off the edge unrecoverably. .sp-cu-step-body two rules down already
       had this pair. */
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .sp-cu-banner-title {
    font-weight: 600;
    color: var(--agi-ext-accent);
    margin-bottom: 2px;
  }

  .sp-cu-banner-sub {
    font-size: 11px;
    color: var(--agi-ext-text-muted);
  }

  /* Outcome tinting. The banner reports three different endings and used one
     accent for all of them, so a completed run was styled as an escalation. */
  .sp-cu-banner[data-kind='success'] {
    background: var(--agi-ext-success-bg);
    border-bottom-color: var(--agi-ext-success-border);
  }

  .sp-cu-banner[data-kind='success'] .sp-cu-banner-title {
    color: var(--agi-ext-success);
  }

  .sp-cu-banner[data-kind='error'] {
    background: var(--agi-ext-danger-bg);
    border-bottom-color: var(--agi-ext-danger-border);
  }

  .sp-cu-banner[data-kind='error'] .sp-cu-banner-title {
    color: var(--agi-ext-danger);
  }

  /* Controls bar */
  .sp-cu-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--agi-ext-border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .sp-cu-controls-label {
    font-size: 11px;
    color: var(--agi-ext-text-muted);
    flex: 1;
  }

  .sp-cu-ask-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--agi-ext-text-muted);
    cursor: pointer;
    user-select: none;
  }

  .sp-cu-ask-toggle input[type="checkbox"] {
    accent-color: var(--agi-ext-accent);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .sp-cu-clear-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: 5px;
    color: var(--agi-ext-text-muted);
    font-size: 11px;
    padding: 3px 10px;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }

  .sp-cu-clear-btn:hover {
    border-color: var(--agi-ext-accent);
    color: var(--agi-ext-accent);
  }

  .sp-cu-run-btn {
    background: var(--agi-ext-accent);
    color: var(--agi-ext-on-accent);
    border: none;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 500;
    padding: 4px 12px;
    cursor: pointer;
    transition: background 0.12s;
    flex-shrink: 0;
  }

  .sp-cu-run-btn:hover {
    background: color-mix(in srgb, var(--agi-ext-accent) 80%, black);
  }

  .sp-cu-run-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .sp-cu-stop-btn {
    display: none;
    background: var(--agi-ext-danger-bg);
    color: var(--agi-ext-danger);
    border: 1px solid var(--agi-ext-danger-border);
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 11px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .sp-cu-stop-btn.visible {
    display: inline-flex;
  }

  .sp-cu-stop-btn:hover {
    border-color: var(--agi-ext-danger);
  }

  .sp-cu-stop-btn:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  /* Action log */
  #sp-cu-log {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .sp-cu-empty {
    padding: 32px 20px;
    text-align: center;
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.6;
  }

  .sp-cu-step {
    display: flex;
    gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--agi-ext-border);
    align-items: flex-start;
    transition: background 0.1s;
  }

  .sp-cu-step:last-child {
    border-bottom: none;
  }

  .sp-cu-step:hover {
    background: var(--agi-ext-hover);
  }

  .sp-cu-step-icon {
    font-size: 14px;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
    margin-top: 1px;
  }

  .sp-cu-step-body {
    flex: 1;
    min-width: 0;
  }

  .sp-cu-step-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--agi-ext-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sp-cu-step-detail {
    font-size: 11px;
    color: var(--agi-ext-text-muted);
    margin-top: 2px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 60px;
    overflow: hidden;
  }

  .sp-cu-step-detail.expanded {
    max-height: none;
  }

  .sp-cu-step-time {
    font-size: 10px;
    color: var(--agi-ext-text-muted);
    flex-shrink: 0;
    margin-top: 3px;
  }

  /* Screenshot thumbnails */
  .sp-cu-screenshot {
    margin: 6px 14px;
    border: 1px solid var(--agi-ext-border);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.12s;
    max-width: 100%;
  }

  .sp-cu-screenshot:hover {
    border-color: var(--agi-ext-accent);
  }

  .sp-cu-screenshot img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 5px;
  }

  /* Step kind colours */
  .sp-cu-step.kind-tool_call .sp-cu-step-icon { color: var(--agi-ext-accent); }
  .sp-cu-step.kind-tool_result .sp-cu-step-icon { color: var(--agi-ext-success); }
  .sp-cu-step.kind-error .sp-cu-step-icon { color: var(--agi-ext-danger); }
  .sp-cu-step.kind-final .sp-cu-step-icon { color: var(--agi-ext-success); }
  .sp-cu-step.kind-screenshot .sp-cu-step-icon { color: var(--agi-ext-text-muted); }

  /* P2-7: Usage meter */
  .sp-cu-usage-meter {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    border-bottom: 1px solid var(--agi-ext-border);
    font-size: 10px;
    color: var(--agi-ext-text-muted);
    flex-shrink: 0;
  }

  .sp-cu-usage-steps {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sp-cu-usage-bar-track {
    width: 60px;
    height: 4px;
    background: var(--agi-ext-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .sp-cu-usage-bar-fill {
    height: 100%;
    background: var(--agi-ext-accent);
    border-radius: 2px;
    transition: width 0.2s;
    width: 0%;
  }

  .sp-cu-usage-tokens {
    margin-left: auto;
    white-space: nowrap;
  }

  /* Ask-before-acting pending card */
  .sp-cu-approval {
    margin: 8px 14px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--agi-ext-warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--agi-ext-warning) 40%, transparent);
    border-radius: 8px;
    font-size: 12px;
  }

  /* Timed out and auto-denied. Drops the warning tint so it reads as settled
     history rather than a decision still waiting on the user. */
  .sp-cu-approval.expired {
    background: transparent;
    border-color: var(--agi-ext-border);
    opacity: 0.7;
  }

  .sp-cu-approval.expired .sp-cu-approval-allow,
  .sp-cu-approval.expired .sp-cu-approval-deny {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .sp-cu-approval-title {
    font-weight: 600;
    color: var(--agi-ext-text);
    margin-bottom: 4px;
  }

  .sp-cu-approval-desc {
    color: var(--agi-ext-text-muted);
    font-size: 11px;
    margin-bottom: 8px;
    /* Same content shape as .sp-cu-step-detail (tool args and URLs), so it needs
       the same guards. Without word-break an approval prompt for a long URL
       pushed its own Allow/Skip buttons out of the card, the user could read
       what they were approving OR press the button, not both. Capped and
       scrollable rather than clipped: an approval must stay fully readable. */
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow-y: auto;
  }

  .sp-cu-approval-btns {
    display: flex;
    gap: 8px;
  }

  .sp-cu-approval-allow {
    background: var(--agi-ext-accent);
    color: var(--agi-ext-on-accent);
    border: none;
    border-radius: 5px;
    padding: 4px 14px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .sp-cu-approval-deny {
    background: none;
    border: 1px solid var(--agi-ext-border);
    color: var(--agi-ext-text-muted);
    border-radius: 5px;
    padding: 4px 14px;
    font-size: 11px;
    cursor: pointer;
  }

  .sp-cu-approval-allow:hover {
    background: color-mix(in srgb, var(--agi-ext-accent) 80%, black);
  }

  .sp-cu-approval-deny:hover {
    border-color: var(--agi-ext-danger-border);
    color: var(--agi-ext-danger);
  }

  /* Auth status chip in controls bar */
  .sp-cu-auth-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sp-cu-auth-chip.authed {
    background: var(--agi-ext-success-bg);
    color: var(--agi-ext-success);
    border: 1px solid var(--agi-ext-success-border);
  }

  .sp-cu-auth-chip.unauthed {
    background: color-mix(in srgb, var(--agi-ext-warning) 12%, transparent);
    color: var(--agi-ext-warning);
    border: 1px solid color-mix(in srgb, var(--agi-ext-warning) 35%, transparent);
  }

  .sp-cu-auth-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sp-cu-auth-chip.authed .sp-cu-auth-dot {
    background: var(--agi-ext-success);
  }

  .sp-cu-auth-chip.unauthed .sp-cu-auth-dot {
    background: var(--agi-ext-warning);
  }
`;

const TOOL_ICONS: Record<string, string> = {
  screenshot: 'camera_icon',
  click: 'cursor_icon',
  scroll: 'scroll_icon',
  type: 'keyboard_icon',
  read_dom: 'document_icon',
  navigate: 'globe_icon',
  find: 'search_icon',
};

const TOOL_EMOJI: Record<string, string> = {
  screenshot: '\u{1F4F8}', // camera
  click: '\u{1F5B1}', // mouse
  scroll: '\u{1F4DC}', // scroll
  type: '\u{2328}', // keyboard
  read_dom: '\u{1F4C4}', // document
  navigate: '\u{1F310}', // globe
  find: '\u{1F50D}', // magnifier
};

const KIND_EMOJI: Record<string, string> = {
  tool_call: '\u{25B6}', // play
  tool_result: '\u{2713}', // check
  error: '\u{26A0}', // warning
  final: '\u{2713}\u{2713}', // double check
  screenshot: '\u{1F4F8}', // camera
};

export type AutofillOutcome = 'escalation' | 'success' | 'error';

/** `run_stopped` reports the end of a browser-control run, not an autofill. */
export type PanelNoticeKind = AutofillOutcome | 'run_stopped';

const BANNER_PRESENTATION: Record<PanelNoticeKind, { title: string; icon: string; style: string }> =
  {
    escalation: {
      title: 'Autofill stalled, switching to computer use',
      icon: '\u{26A1}', // lightning bolt
      style: 'escalation',
    },
    success: {
      title: 'Autofill complete',
      icon: '\u{2713}', // check mark
      style: 'success',
    },
    error: {
      title: 'Autofill could not run',
      icon: '\u{26A0}', // warning sign
      style: 'error',
    },
    run_stopped: {
      title: 'Browser control stopped',
      icon: '\u{25A0}', // filled square
      style: 'error',
    },
  };

/**
 * User-facing copy for each way a run can end. The background broadcasts a
 * machine reason on `AGI_CU_STATE`; without this the panel silently dropped
 * back to idle and the user was never told why the agent stopped driving.
 */
const CANCELLATION_REASON_COPY: Record<string, string> = {
  account_changed: 'The signed-in AGI Cloud account changed, so the run was stopped.',
  debugger_detached:
    'You dismissed Chrome’s browser-debugging bar for this tab, so the run was stopped.',
  panel_closed: 'The side panel closed, so the run was stopped.',
  superseded: 'A newer run replaced this one.',
  tab_intent_changed:
    'The tab left the page this run was approved for, so the run was stopped before acting.',
  tab_removed: 'The tab this run was driving was closed.',
  user_cleared: 'The run was stopped when the log was cleared.',
  user_stopped: 'You stopped the run.',
};

export function describeCancellationReason(reason: unknown): string | null {
  return typeof reason === 'string' ? (CANCELLATION_REASON_COPY[reason] ?? null) : null;
}

/**
 * How long the panel waits for any sign of life from an owned run before it
 * asks the background whether the run still exists. MV3 evicts the service
 * worker, and an evicted worker emits no terminal event, so without this the
 * controls bar reads "agent running" forever.
 */
const RUN_ACTIVITY_TIMEOUT_MS = 90_000;

const STOP_REFUSED_MESSAGE =
  'The run could not be stopped and may still be driving the tab. Close the tab to be certain.';
const RUN_LOST_MESSAGE =
  'The background service stopped reporting on this run, so it is no longer being tracked here.';
const RUN_RECOVERED_MESSAGE =
  'A browser-control run started before this panel was reopened is still active. Use Stop to end it.';

export interface ComputerUsePanelAPI {
  panelEl: HTMLElement;
  appendStep(step: AgentLoopStep & { screenshotBase64?: string }): void;
  showHandoffBanner(reason: string, kind?: PanelNoticeKind): void;
  hideHandoffBanner(): void;
  clearLog(): void;
  isAskBeforeActing(): boolean;
  showApprovalCard(
    toolName: string,
    description: string,
    resolve: (allowed: boolean) => void,
  ): void;
  onRunAutofill(handler: () => void): void;
  updateUsageMeter(usage: AgentLoopUsage): void;
  refreshAuthChip(): void;
  setRunState(running: boolean, runId?: string, generation?: number): void;
  ownsRun(runId: unknown): boolean;
  noteRunActivity(): void;
}

export function buildComputerUsePanel(): ComputerUsePanelAPI {
  const panelEl = document.createElement('div');
  panelEl.id = 'sp-cu-panel';

  const banner = document.createElement('div');
  banner.className = 'sp-cu-banner';

  const bannerIcon = document.createElement('div');
  bannerIcon.className = 'sp-cu-banner-icon';
  bannerIcon.textContent = '';

  const bannerText = document.createElement('div');
  bannerText.className = 'sp-cu-banner-text';

  const bannerTitle = document.createElement('div');
  bannerTitle.className = 'sp-cu-banner-title';
  bannerTitle.textContent = '';

  const bannerSub = document.createElement('div');
  bannerSub.className = 'sp-cu-banner-sub';
  bannerSub.textContent = '';

  bannerText.appendChild(bannerTitle);
  bannerText.appendChild(bannerSub);
  banner.appendChild(bannerIcon);
  banner.appendChild(bannerText);
  panelEl.appendChild(banner);

  const controls = document.createElement('div');
  controls.className = 'sp-cu-controls';

  const controlsLabel = document.createElement('span');
  controlsLabel.className = 'sp-cu-controls-label';
  controlsLabel.textContent = 'AGI Cloud • powered by AGI';

  const askLabel = document.createElement('label');
  askLabel.className = 'sp-cu-ask-toggle';
  askLabel.title =
    'When enabled, the agent pauses and asks you to confirm each action before executing it.';

  const askCheckbox = document.createElement('input');
  askCheckbox.type = 'checkbox';
  askCheckbox.id = 'sp-cu-ask-checkbox';
  askCheckbox.checked = true;

  let askPreferenceMutation = 0;
  chrome.storage?.local?.get('agi_cu_ask_before_acting', (items) => {
    if (chrome.runtime?.lastError) return;
    if (askPreferenceMutation !== 0) return;
    askCheckbox.checked = items?.['agi_cu_ask_before_acting'] !== false;
  });

  askCheckbox.addEventListener('change', () => {
    const next = askCheckbox.checked;
    const mutation = ++askPreferenceMutation;
    askCheckbox.disabled = true;
    void (async () => {
      try {
        await chrome.storage.local.set({ agi_cu_ask_before_acting: next });
      } catch {
        if (askPreferenceMutation === mutation) askCheckbox.checked = !next;
        showHandoffBanner(
          'The Ask before acting setting could not be saved. The previous setting is still active.',
          'error',
        );
      } finally {
        if (askPreferenceMutation === mutation) askCheckbox.disabled = false;
      }
    })();
  });

  const askText = document.createTextNode('Ask before acting');
  askLabel.appendChild(askCheckbox);
  askLabel.appendChild(askText);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'sp-cu-clear-btn';
  clearBtn.textContent = 'Clear';

  const runAutofillBtn = document.createElement('button');
  runAutofillBtn.className = 'sp-cu-run-btn';
  runAutofillBtn.textContent = 'Run Autofill';
  runAutofillBtn.title =
    'Detect and fill this job application form. If the fast-path stalls, the agent loop takes over.';
  let _runAutofillHandler: (() => void) | null = null;
  runAutofillBtn.addEventListener('click', () => {
    if (_runAutofillHandler) _runAutofillHandler();
  });

  const stopBtn = document.createElement('button');
  stopBtn.className = 'sp-cu-stop-btn';
  stopBtn.textContent = 'Stop';
  stopBtn.title = 'Stop the active computer-use run';
  stopBtn.setAttribute('aria-label', 'Stop computer use');

  let activeRunId: string | null = null;
  let activeRunGeneration = 0;
  let runActivityTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRunActivityWatchdog(): void {
    if (!runActivityTimer) return;
    clearTimeout(runActivityTimer);
    runActivityTimer = null;
  }

  function armRunActivityWatchdog(): void {
    clearRunActivityWatchdog();
    runActivityTimer = setTimeout(() => {
      void reconcileRunState();
    }, RUN_ACTIVITY_TIMEOUT_MS);
  }

  function setRunState(running: boolean, runId?: string, generation?: number): void {
    if (
      running &&
      generation !== undefined &&
      Number.isSafeInteger(generation) &&
      generation < activeRunGeneration
    ) {
      return;
    }
    if (!running && runId && activeRunId && activeRunId !== runId) return;
    activeRunId = running && runId ? runId : running ? activeRunId : null;
    if (running && generation !== undefined && Number.isSafeInteger(generation)) {
      activeRunGeneration = Math.max(activeRunGeneration, generation);
    }
    runAutofillBtn.disabled = running;
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop';
    stopBtn.classList.toggle('visible', running);
    controlsLabel.textContent = running
      ? 'AGI Cloud • agent running'
      : 'AGI Cloud • powered by AGI';
    if (running) {
      armRunActivityWatchdog();
    } else {
      clearRunActivityWatchdog();
    }
  }

  function ownsRun(runId: unknown): boolean {
    return typeof runId === 'string' && activeRunId === runId;
  }

  function noteRunActivity(): void {
    if (!activeRunId) return;
    armRunActivityWatchdog();
  }

  async function readBackgroundRunState(): Promise<ComputerUseCommandResponse | null> {
    try {
      const response: unknown = await chrome.runtime.sendMessage({
        type: 'GET_COMPUTER_USE_STATE',
      });
      return response && typeof response === 'object'
        ? (response as ComputerUseCommandResponse)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Reconciles the panel against the background after a silence. An MV3 worker
   * evicted mid-run never sends a terminal event, so the panel must ask rather
   * than keep claiming the agent is running.
   */
  async function reconcileRunState(): Promise<void> {
    const runId = activeRunId;
    if (!runId) return;
    const state = await readBackgroundRunState();
    if (state?.running === true && state.runId === runId) {
      armRunActivityWatchdog();
      return;
    }
    setRunState(false, runId);
    showHandoffBanner(RUN_LOST_MESSAGE, 'run_stopped');
  }

  /**
   * A run outlives the panel document that started it. On boot, adopt whatever
   * the background is still driving so Stop is reachable instead of the panel
   * showing idle over a live run.
   */
  async function adoptBackgroundRun(): Promise<void> {
    if (activeRunId) return;
    const state = await readBackgroundRunState();
    if (state?.running !== true || typeof state.runId !== 'string') return;
    if (activeRunId) return;
    setRunState(
      true,
      state.runId,
      typeof state.runGeneration === 'number' ? state.runGeneration : undefined,
    );
    showHandoffBanner(RUN_RECOVERED_MESSAGE, 'run_stopped');
  }

  async function requestCancellation(
    reason: 'panel_closed' | 'user_cleared' | 'user_stopped',
  ): Promise<void> {
    const runId = activeRunId;
    if (!runId) return;
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping…';
    let response: unknown;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'CANCEL_COMPUTER_USE',
        runId,
        reason,
      });
    } catch {
      // A service-worker restart has no surviving in-memory run to cancel.
      setRunState(false, runId);
      return;
    }
    const cancellation = (
      response && typeof response === 'object' ? response : {}
    ) as ComputerUseCommandResponse;
    if (cancellation.success === true && cancellation.running !== true) {
      setRunState(false, runId);
      return;
    }
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop';
    showHandoffBanner(cancellation.error ?? STOP_REFUSED_MESSAGE, 'run_stopped');
  }

  stopBtn.addEventListener('click', () => {
    void requestCancellation('user_stopped');
  });
  clearBtn.addEventListener('click', () => {
    clearLog();
    void requestCancellation('user_cleared');
  });
  window.addEventListener('pagehide', () => {
    clearRunActivityWatchdog();
    const runId = activeRunId;
    if (!runId) return;
    activeRunId = null;
    void chrome.runtime.sendMessage({
      type: 'CANCEL_COMPUTER_USE',
      runId,
      reason: 'panel_closed',
    });
  });

  void adoptBackgroundRun();

  // via the exported refreshAuthChip() helper wired to the tab-switch event.
  const authChip = document.createElement('span');
  authChip.className = 'sp-cu-auth-chip unauthed';
  authChip.setAttribute('aria-live', 'polite');
  authChip.setAttribute('title', 'Cloud auth status');
  const authDot = document.createElement('span');
  authDot.className = 'sp-cu-auth-dot';
  const authLabel = document.createElement('span');
  authLabel.textContent = 'Checking…';
  authChip.appendChild(authDot);
  authChip.appendChild(authLabel);

  function refreshAuthChip(): void {
    getAuthToken()
      .then((token) => {
        if (token) {
          authChip.className = 'sp-cu-auth-chip authed';
          authLabel.textContent = 'Signed in';
          authChip.title = 'Cloud token present, agent can run.';
        } else {
          authChip.className = 'sp-cu-auth-chip unauthed';
          authLabel.textContent = 'Sign in required';
          authChip.title = 'Sign in to AGI Cloud from the extension drawer to enable the agent.';
        }
      })
      .catch(() => {
        authChip.className = 'sp-cu-auth-chip unauthed';
        authLabel.textContent = 'Auth unavailable';
      });
  }
  refreshAuthChip();

  controls.appendChild(runAutofillBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(authChip);
  controls.appendChild(controlsLabel);
  controls.appendChild(askLabel);
  controls.appendChild(clearBtn);
  panelEl.appendChild(controls);

  const usageMeter = document.createElement('div');
  usageMeter.className = 'sp-cu-usage-meter';
  usageMeter.setAttribute('aria-label', 'Agent usage');

  const usageStepsEl = document.createElement('span');
  usageStepsEl.className = 'sp-cu-usage-steps';
  usageStepsEl.textContent = 'Steps: 0/20';

  const barTrack = document.createElement('div');
  barTrack.className = 'sp-cu-usage-bar-track';
  const barFill = document.createElement('div');
  barFill.className = 'sp-cu-usage-bar-fill';
  barTrack.appendChild(barFill);

  const usageTokensEl = document.createElement('span');
  usageTokensEl.className = 'sp-cu-usage-tokens';
  usageTokensEl.textContent = '';

  usageMeter.appendChild(usageStepsEl);
  usageMeter.appendChild(barTrack);
  usageMeter.appendChild(usageTokensEl);
  panelEl.appendChild(usageMeter);

  const logEl = document.createElement('div');
  logEl.id = 'sp-cu-log';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'sp-cu-empty';
  emptyEl.textContent =
    'No agent activity yet.\n\nStart an autofill on a Greenhouse, Lever, or Ashby job page. ' +
    'If the fast-path stalls, the agent loop takes over automatically.';
  logEl.appendChild(emptyEl);

  panelEl.appendChild(logEl);

  function fmtTime(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function setEmpty(isEmpty: boolean): void {
    emptyEl.style.display = isEmpty ? '' : 'none';
  }

  function buildStepEl(step: AgentLoopStep & { screenshotBase64?: string }): DocumentFragment {
    const frag = document.createDocumentFragment();

    const stepEl = document.createElement('div');
    stepEl.className = `sp-cu-step kind-${step.kind}`;

    const iconEl = document.createElement('div');
    iconEl.className = 'sp-cu-step-icon';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'sp-cu-step-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'sp-cu-step-title';

    const detailEl = document.createElement('div');
    detailEl.className = 'sp-cu-step-detail';

    const timeEl = document.createElement('div');
    timeEl.className = 'sp-cu-step-time';
    timeEl.textContent = fmtTime();

    const makeExpandable = (): void => {
      detailEl.title = 'Click to expand';
      detailEl.style.cursor = 'pointer';
      detailEl.setAttribute('role', 'button');
      detailEl.setAttribute('tabindex', '0');
      detailEl.setAttribute('aria-expanded', 'false');
      const toggle = (): void => {
        const nowExpanded = detailEl.classList.toggle('expanded');
        detailEl.setAttribute('aria-expanded', String(nowExpanded));
        detailEl.title = nowExpanded ? 'Click to collapse' : 'Click to expand';
      };
      detailEl.addEventListener('click', toggle);
      detailEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    };

    switch (step.kind) {
      case 'tool_call': {
        const emoji = (step.toolName && TOOL_EMOJI[step.toolName]) ?? KIND_EMOJI['tool_call'] ?? '';
        iconEl.textContent = emoji;
        titleEl.textContent = formatToolCallTitle(step.toolName ?? '', step.toolArgs);
        if (step.toolArgs && Object.keys(step.toolArgs).length > 0) {
          detailEl.textContent = formatArgs(step.toolArgs);
          makeExpandable();
        }
        break;
      }
      case 'tool_result': {
        iconEl.textContent = KIND_EMOJI['tool_result'] ?? '';
        titleEl.textContent = `✓ ${step.toolName ?? 'result'}`;
        if (step.toolResult) {
          detailEl.textContent = step.toolResult.slice(0, 300);
          makeExpandable();
        }
        break;
      }
      case 'error': {
        iconEl.textContent = KIND_EMOJI['error'] ?? '';
        titleEl.textContent = `Error: ${step.toolName ?? 'tool'}`;
        detailEl.textContent = step.errorMessage ?? '';
        if (detailEl.textContent) makeExpandable();
        stepEl.style.background = 'color-mix(in srgb, var(--agi-ext-danger) 5%, transparent)';
        break;
      }
      case 'final': {
        iconEl.textContent = KIND_EMOJI['final'] ?? '';
        titleEl.textContent = 'Agent finished';
        if (step.finalMessage) {
          detailEl.textContent = step.finalMessage.slice(0, 400);
          detailEl.classList.add('expanded');
        }
        stepEl.style.background = 'color-mix(in srgb, var(--agi-ext-success) 5%, transparent)';
        break;
      }
      case 'screenshot': {
        iconEl.textContent = TOOL_EMOJI['screenshot'] ?? '';
        titleEl.textContent = 'Screenshot captured';
        break;
      }
    }

    bodyEl.appendChild(titleEl);
    if (detailEl.textContent) bodyEl.appendChild(detailEl);
    stepEl.appendChild(iconEl);
    stepEl.appendChild(bodyEl);
    stepEl.appendChild(timeEl);
    frag.appendChild(stepEl);

    if (step.kind === 'screenshot' && step.screenshotBase64) {
      const thumb = document.createElement('div');
      thumb.className = 'sp-cu-screenshot';
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${step.screenshotBase64}`;
      img.alt = 'Agent screenshot';
      img.loading = 'lazy';
      thumb.appendChild(img);
      thumb.addEventListener('click', () => {
        const htmlContent =
          `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
          `<title>AGI screenshot</title>` +
          `<style>body{margin:0;background:black}img{max-width:100%;height:auto;display:block}</style>` +
          `</head><body><img src="data:image/png;base64,${step.screenshotBase64}" alt="Agent screenshot"></body></html>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      });
      frag.appendChild(thumb);
    }

    return frag;
  }

  function formatToolCallTitle(toolName: string, args?: Record<string, unknown>): string {
    switch (toolName) {
      case 'click':
        if (args?.['selector']) return `Click: ${String(args['selector']).slice(0, 60)}`;
        if (args?.['x'] !== undefined)
          return `Click at (${String(args['x'])}, ${String(args['y'])})`;
        return 'Click';
      case 'type':
        return `Type: "${String(args?.['text'] ?? '').slice(0, 40)}"`;
      case 'navigate':
        return `Navigate to: ${String(args?.['url'] ?? '').slice(0, 60)}`;
      case 'scroll':
        if (args?.['toSelector']) return `Scroll to: ${String(args['toSelector']).slice(0, 50)}`;
        return `Scroll ${String(args?.['dy'] ?? '?')}px`;
      case 'read_dom':
        return 'Read page DOM';
      case 'find':
        return `Find: "${String(args?.['description'] ?? '').slice(0, 50)}"`;
      default:
        return toolName || 'Tool call';
    }
  }

  function formatArgs(args: Record<string, unknown>): string {
    return Object.entries(args)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`)
      .join('\n');
  }

  function appendStep(step: AgentLoopStep & { screenshotBase64?: string }): void {
    setEmpty(false);
    const frag = buildStepEl(step);
    logEl.appendChild(frag);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showHandoffBanner(reason: string, kind: PanelNoticeKind = 'escalation'): void {
    const presentation = BANNER_PRESENTATION[kind];
    bannerTitle.textContent = presentation.title;
    bannerIcon.textContent = presentation.icon;
    banner.setAttribute('data-kind', presentation.style);
    bannerSub.textContent = reason;
    banner.classList.add('visible');
  }

  function hideHandoffBanner(): void {
    banner.classList.remove('visible');
  }

  function clearLog(): void {
    logEl.replaceChildren(emptyEl);
    setEmpty(true);
    hideHandoffBanner();
  }

  function isAskBeforeActing(): boolean {
    return askCheckbox.checked;
  }

  let approvalCardSequence = 0;

  function showApprovalCard(
    toolName: string,
    description: string,
    resolve: (allowed: boolean) => void,
  ): void {
    const approvalId = ++approvalCardSequence;
    const card = document.createElement('div');
    card.className = 'sp-cu-approval';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-labelledby', `sp-cu-approval-title-${approvalId}`);
    card.setAttribute('aria-describedby', `sp-cu-approval-desc-${approvalId}`);

    const cardTitle = document.createElement('div');
    cardTitle.className = 'sp-cu-approval-title';
    cardTitle.id = `sp-cu-approval-title-${approvalId}`;
    cardTitle.textContent = `Approve action: ${toolName}`;

    const cardDesc = document.createElement('div');
    cardDesc.className = 'sp-cu-approval-desc';
    cardDesc.id = `sp-cu-approval-desc-${approvalId}`;
    cardDesc.textContent = description;

    const btns = document.createElement('div');
    btns.className = 'sp-cu-approval-btns';

    const allowBtn = document.createElement('button');
    allowBtn.className = 'sp-cu-approval-allow';
    allowBtn.textContent = 'Allow';

    const denyBtn = document.createElement('button');
    denyBtn.className = 'sp-cu-approval-deny';
    denyBtn.textContent = 'Skip';

    let settled = false;
    const expiry = setTimeout(() => {
      if (settled) return;
      const shouldRestoreFocus = card.contains(document.activeElement);
      settled = true;
      clearTimeout(expiry);
      card.classList.add('expired');
      card.setAttribute('role', 'status');
      allowBtn.disabled = true;
      denyBtn.disabled = true;
      cardTitle.textContent = `Skipped (no response): ${toolName}`;
      cardDesc.textContent =
        'This action timed out after 30 seconds and was skipped automatically.';
      if (shouldRestoreFocus) {
        card.tabIndex = -1;
        card.focus();
      }
      // The loop already resolved DENY on its own timer; this is presentation only.
    }, APPROVAL_TIMEOUT_MS);

    function cleanup(allowed: boolean): void {
      if (settled) return;
      const shouldRestoreFocus = card.contains(document.activeElement);
      settled = true;
      clearTimeout(expiry);
      card.remove();
      if (shouldRestoreFocus) stopBtn.focus();
      resolve(allowed);
    }

    allowBtn.addEventListener('click', () => cleanup(true));
    denyBtn.addEventListener('click', () => cleanup(false));

    btns.appendChild(allowBtn);
    btns.appendChild(denyBtn);
    card.appendChild(cardTitle);
    card.appendChild(cardDesc);
    card.appendChild(btns);

    logEl.insertBefore(card, logEl.firstChild);
    logEl.scrollTop = 0;
    allowBtn.focus();
  }

  function onRunAutofill(handler: () => void): void {
    _runAutofillHandler = handler;
  }

  function updateUsageMeter(usage: AgentLoopUsage): void {
    const { stepsUsed, maxSteps, totalTokens } = usage;
    usageStepsEl.textContent = `Steps: ${stepsUsed}/${maxSteps}`;
    const pct = Math.min(100, (stepsUsed / Math.max(maxSteps, 1)) * 100);
    barFill.style.width = `${pct}%`;
    if (totalTokens > 0) {
      const kTokens =
        totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens);
      usageTokensEl.textContent = `~${kTokens} tokens`;
    } else {
      usageTokensEl.textContent = '';
    }
  }

  void TOOL_ICONS;

  return {
    panelEl,
    appendStep,
    showHandoffBanner,
    hideHandoffBanner,
    clearLog,
    isAskBeforeActing,
    showApprovalCard,
    onRunAutofill,
    updateUsageMeter,
    refreshAuthChip,
    setRunState,
    ownsRun,
    noteRunActivity,
  };
}
