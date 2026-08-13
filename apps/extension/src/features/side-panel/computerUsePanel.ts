/**
 * computerUsePanel.ts — Side-panel Computer Use demo UI.
 *
 * Builds and manages the "Computer Use" tab UI injected into the side panel.
 * Responsibilities:
 *   - Render a live action log (each tool call: icon + description + timestamp)
 *   - Show screenshot thumbnails of what the agent sees after each screenshot action
 *   - Show a handoff banner when escalation fires ("Autofill stalled — switching
 *     to computer use")
 *   - Surface the "Ask before acting" gate toggle (default-on)
 *   - Accept structured AgentLoopStep events and append them incrementally
 *
 * DESIGN TOKENS ONLY — no hex colours. All colours reference var(--agi-ext-*)
 * tokens from the design-tokens package.
 *
 * This module is imported by side_panel.ts and wired into the tab switcher.
 * It does NOT import runAgentLoop directly to avoid bundling the CDP driver
 * into the panel context (the loop runs in the service worker). Events are
 * communicated via chrome.runtime.sendMessage / onMessage.
 */

import type { AgentLoopStep, AgentLoopUsage } from '../computer-use/agentLoop';
import { APPROVAL_TIMEOUT_MS } from '../computer-use/agentLoop';
import { getAuthToken } from '../computer-use/cloudAgentClient';

// ─── CSS injected into the side panel's adoptedStyleSheets ───────────────────

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
       pushed its own Allow/Skip buttons out of the card — the user could read
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

// ─── Tool icon map ────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  screenshot: 'camera_icon',
  click: 'cursor_icon',
  scroll: 'scroll_icon',
  type: 'keyboard_icon',
  read_dom: 'document_icon',
  navigate: 'globe_icon',
  find: 'search_icon',
};

/** Simple text emoji stand-ins (no external icon dep in this UI context). */
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

// ─── Public API ────────────────────────────────────────────────────────────────

/** How a Run Autofill attempt ended. */
export type AutofillOutcome = 'escalation' | 'success' | 'error';

const AUTOFILL_OUTCOME_PRESENTATION: Record<AutofillOutcome, { title: string; icon: string }> = {
  escalation: {
    title: 'Autofill stalled — switching to computer use',
    icon: '\u{26A1}', // lightning bolt
  },
  success: {
    title: 'Autofill complete',
    icon: '\u{2713}', // check mark
  },
  error: {
    title: 'Autofill could not run',
    icon: '\u{26A0}', // warning sign
  },
};

export interface ComputerUsePanelAPI {
  /** The panel root element — append to document.body and show via CSS class. */
  panelEl: HTMLElement;
  /** Append a step to the live action log. */
  appendStep(step: AgentLoopStep & { screenshotBase64?: string }): void;
  /**
   * Show the outcome banner.
   *
   * `kind` picks the headline and icon: an escalation, a completed autofill and
   * a failure are three different endings. They previously shared the single
   * build-time headline "Autofill stalled — switching to computer use", so a
   * successful run announced itself as a stall.
   */
  showHandoffBanner(reason: string, kind?: AutofillOutcome): void;
  /** Hide the handoff banner. */
  hideHandoffBanner(): void;
  /** Clear all log entries. */
  clearLog(): void;
  /** Whether "ask before acting" is currently enabled. */
  isAskBeforeActing(): boolean;
  /**
   * Show an approval card for a pending action. Calls resolve(true/false) when
   * the user clicks Allow or Deny.
   */
  showApprovalCard(
    toolName: string,
    description: string,
    resolve: (allowed: boolean) => void,
  ): void;
  /**
   * Register the callback that fires when the user clicks the "Run Autofill"
   * button in the controls bar. Called by side_panel.ts during buildUI() to
   * wire in the orchestration logic (send AGI_RUN_AUTOFILL to content script,
   * evaluate escalation decision, optionally send AGI_START_COMPUTER_USE to
   * the background).
   */
  onRunAutofill(handler: () => void): void;
  /**
   * P2-7: Update the usage meter with the latest step/token counts.
   * Called by the agent loop via onUsageUpdate.
   */
  updateUsageMeter(usage: AgentLoopUsage): void;
  /**
   * Re-check the cloud auth token and update the auth-status chip.
   * Called by side_panel.ts whenever the Computer Use tab becomes visible,
   * so the chip reflects the latest Clerk session state.
   */
  refreshAuthChip(): void;
  /** Reflect the authoritative background run lifecycle in visible controls. */
  setRunState(running: boolean, runId?: string, generation?: number): void;
  /** True only for events belonging to the panel's current run. */
  ownsRun(runId: unknown): boolean;
}

/**
 * Build the Computer Use side-panel tab and return an API for driving it.
 * Call once during side_panel.ts:buildUI().
 */
export function buildComputerUsePanel(): ComputerUsePanelAPI {
  // ── Root element ───────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.id = 'sp-cu-panel';

  // ── Handoff banner ─────────────────────────────────────────────────────────
  const banner = document.createElement('div');
  banner.className = 'sp-cu-banner';

  const bannerIcon = document.createElement('div');
  bannerIcon.className = 'sp-cu-banner-icon';
  // Both are set per outcome by showHandoffBanner(); the banner is hidden until
  // then, so there is no build-time headline to contradict the result.
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

  // ── Controls bar ───────────────────────────────────────────────────────────
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
  // Default: ON (ask before acting). Autonomous CDP browser control on a
  // prompt-injectable page must default to human-in-the-loop (trust-boundary
  // P0). Unchecking is an explicit "autopilot" opt-out; the authoritative gate
  // is in background.ts (an unset pref is treated as ask-before-acting).
  askCheckbox.checked = true;

  // Rehydrate the persisted gate. The synchronous default above stays ON so the
  // control is never briefly wrong during this async round-trip; only an
  // explicit stored `false` (the autopilot opt-out) unchecks it, which is the
  // same rule the authoritative gate in background.ts applies. Without this the
  // panel rendered "ask before acting" checked while background.ts ran the agent
  // with no approval gate — a control misreporting the trust boundary it names.
  let askPreferenceMutation = 0;
  chrome.storage?.local?.get('agi_cu_ask_before_acting', (items) => {
    if (chrome.runtime?.lastError) return;
    if (askPreferenceMutation !== 0) return;
    askCheckbox.checked = items?.['agi_cu_ask_before_acting'] !== false;
  });

  // Persist on toggle rather than only when Run Autofill escalates, so closing
  // the panel without running anything cannot drop the user's choice.
  askCheckbox.addEventListener('change', () => {
    const next = askCheckbox.checked;
    const mutation = ++askPreferenceMutation;
    askCheckbox.disabled = true;
    void (async () => {
      try {
        await chrome.storage.local.set({ agi_cu_ask_before_acting: next });
      } catch {
        // The background reads the stored preference as the authoritative gate.
        // Roll the visual control back so it cannot claim an opt-in/opt-out that
        // never reached that boundary.
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

  // "Run Autofill" trigger button.
  // Clicking it fires the registered onRunAutofill handler (wired by side_panel.ts).
  // The handler: queries the active tab, sends AGI_RUN_AUTOFILL to the content
  // script, evaluates the escalation decision, and optionally starts the agent loop.
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
  }

  function ownsRun(runId: unknown): boolean {
    return typeof runId === 'string' && activeRunId === runId;
  }

  async function requestCancellation(
    reason: 'panel_closed' | 'user_cleared' | 'user_stopped',
  ): Promise<void> {
    const runId = activeRunId;
    if (!runId) return;
    // Tombstone locally before awaiting the worker. Any already-queued step or
    // completion for this run is ignored from the instant the user clicks Stop.
    setRunState(false, runId);
    try {
      await chrome.runtime.sendMessage({
        type: 'CANCEL_COMPUTER_USE',
        runId,
        reason,
      });
    } catch {
      // A service-worker restart has no surviving in-memory run.
    }
  }

  stopBtn.addEventListener('click', () => {
    void requestCancellation('user_stopped');
  });
  clearBtn.addEventListener('click', () => {
    void requestCancellation('user_cleared');
    clearLog();
  });
  window.addEventListener('pagehide', () => {
    const runId = activeRunId;
    if (!runId) return;
    activeRunId = null;
    void chrome.runtime.sendMessage({
      type: 'CANCEL_COMPUTER_USE',
      runId,
      reason: 'panel_closed',
    });
  });

  // Auth-status chip — green "Signed in" or amber "Sign in required".
  // Checked once on panel build; re-checked whenever the panel becomes visible
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
          authChip.title = 'Cloud token present — agent can run.';
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
  // Initial check
  refreshAuthChip();

  controls.appendChild(runAutofillBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(authChip);
  controls.appendChild(controlsLabel);
  controls.appendChild(askLabel);
  controls.appendChild(clearBtn);
  panelEl.appendChild(controls);

  // ── P2-7: Usage meter ─────────────────────────────────────────────────────
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

  // ── Action log ─────────────────────────────────────────────────────────────
  const logEl = document.createElement('div');
  logEl.id = 'sp-cu-log';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'sp-cu-empty';
  emptyEl.textContent =
    'No agent activity yet.\n\nStart an autofill on a Greenhouse, Lever, or Ashby job page. ' +
    'If the fast-path stalls, the agent loop takes over automatically.';
  logEl.appendChild(emptyEl);

  panelEl.appendChild(logEl);

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

    /**
     * `.sp-cu-step-detail` is capped at 60px with `overflow: hidden`, so any
     * detail longer than ~3 lines is cut off. Only the tool_call branch used to
     * wire the toggle, which meant tool RESULTS and ERROR messages — the two a
     * user most needs to read — were clipped with no way to reveal the rest.
     * Every branch that sets detail text now goes through here.
     */
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

    // Inline screenshot thumbnail (for screenshot steps with base64 data)
    if (step.kind === 'screenshot' && step.screenshotBase64) {
      const thumb = document.createElement('div');
      thumb.className = 'sp-cu-screenshot';
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${step.screenshotBase64}`;
      img.alt = 'Agent screenshot';
      img.loading = 'lazy';
      thumb.appendChild(img);
      // Click to open full-size — use a data: URL so we never call document.write()
      thumb.addEventListener('click', () => {
        // Build a self-contained data: URL with a minimal HTML wrapper.
        // This is safe: the content is fully base64-encoded PNG from our own CDP
        // capture and never contains user-supplied HTML.
        const htmlContent =
          `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
          `<title>AGI screenshot</title>` +
          `<style>body{margin:0;background:black}img{max-width:100%;height:auto;display:block}</style>` +
          `</head><body><img src="data:image/png;base64,${step.screenshotBase64}" alt="Agent screenshot"></body></html>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        // Revoke after a short delay to allow the new tab to load
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

  // ─── Public methods ────────────────────────────────────────────────────────

  function appendStep(step: AgentLoopStep & { screenshotBase64?: string }): void {
    setEmpty(false);
    const frag = buildStepEl(step);
    logEl.appendChild(frag);
    // Auto-scroll to bottom
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showHandoffBanner(reason: string, kind: AutofillOutcome = 'escalation'): void {
    const presentation = AUTOFILL_OUTCOME_PRESENTATION[kind];
    bannerTitle.textContent = presentation.title;
    bannerIcon.textContent = presentation.icon;
    banner.setAttribute('data-kind', kind);
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

    /*
     * The card MUST expire with the loop's gate. agentLoop resolves DENY after
     * APPROVAL_TIMEOUT_MS, but that only settles its promise — it never touched
     * this card. So an unattended card stayed on screen with Allow/Skip buttons
     * that looked live, did nothing when pressed, and stacked up one per action
     * for the rest of the run. Expire on the same deadline and say so.
     */
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

    // Insert approval card at top of log (above existing steps)
    logEl.insertBefore(card, logEl.firstChild);
    logEl.scrollTop = 0;
    allowBtn.focus();
  }

  function onRunAutofill(handler: () => void): void {
    _runAutofillHandler = handler;
  }

  /** P2-7: Update the usage meter with step and token counts. */
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

  // Unused reference suppressor for TOOL_ICONS (kept for future SVG wiring)
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
  };
}
