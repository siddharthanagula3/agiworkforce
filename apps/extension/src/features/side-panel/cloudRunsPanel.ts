import {
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
  managedCloudAgentRunPath,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  ALL_MANAGED_RUN_STATES,
  cancelChromeManagedRun,
  listChromeManagedRuns,
  readChromeManagedRunJournal,
  resolveChromeManagedRunApproval,
} from '../cloud-bridge/managedRunControl';
import { el } from './dom';

export const CLOUD_RUNS_PANEL_CSS = `
  #sp-runs-panel {
    display: none;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  #sp-runs-panel.sp-tab-visible {
    display: flex;
  }

  .sp-runs-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--agi-ext-border);
    flex-shrink: 0;
  }

  .sp-runs-filters {
    display: flex;
    gap: 4px;
    flex: 1;
  }

  .sp-runs-filter {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: 5px;
    color: var(--agi-ext-text-muted);
    font-size: 11px;
    padding: 3px 10px;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }

  .sp-runs-filter[aria-pressed='true'] {
    border-color: var(--agi-ext-accent);
    color: var(--agi-ext-accent);
  }

  .sp-runs-icon-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: 5px;
    color: var(--agi-ext-text-muted);
    font-size: 11px;
    padding: 3px 10px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .sp-runs-icon-btn:hover {
    border-color: var(--agi-ext-accent);
    color: var(--agi-ext-accent);
  }

  .sp-runs-icon-btn:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .sp-runs-status {
    padding: 6px 14px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--agi-ext-text-muted);
    border-bottom: 1px solid var(--agi-ext-border);
    flex-shrink: 0;
    /* A gateway message can be one long unbroken token; without this it held the
       panel wider than the side panel and ran off the edge. */
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .sp-runs-status[hidden] {
    display: none;
  }

  .sp-runs-status[data-kind='error'] {
    color: var(--agi-ext-danger);
  }

  .sp-runs-status[data-kind='success'] {
    color: var(--agi-ext-success);
  }

  #sp-runs-list,
  #sp-runs-detail {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  #sp-runs-list[hidden],
  #sp-runs-detail[hidden] {
    display: none;
  }

  .sp-runs-empty {
    padding: 32px 20px;
    text-align: center;
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.6;
  }

  .sp-run-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 8px 14px;
    border: none;
    border-bottom: 1px solid var(--agi-ext-border);
    background: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: var(--agi-ext-text);
  }

  .sp-run-row:hover {
    background: var(--agi-ext-hover);
  }

  .sp-run-row-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sp-run-badge {
    border-radius: 10px;
    border: 1px solid var(--agi-ext-border);
    padding: 1px 8px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .sp-run-badge[data-tone='active'] {
    color: var(--agi-ext-accent);
    border-color: color-mix(in srgb, var(--agi-ext-accent) 40%, transparent);
    background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
  }

  .sp-run-badge[data-tone='attention'] {
    color: var(--agi-ext-warning);
    border-color: color-mix(in srgb, var(--agi-ext-warning) 40%, transparent);
    background: color-mix(in srgb, var(--agi-ext-warning) 12%, transparent);
  }

  .sp-run-badge[data-tone='success'] {
    color: var(--agi-ext-success);
    border-color: var(--agi-ext-success-border);
    background: var(--agi-ext-success-bg);
  }

  .sp-run-badge[data-tone='danger'] {
    color: var(--agi-ext-danger);
    border-color: var(--agi-ext-danger-border);
    background: var(--agi-ext-danger-bg);
  }

  .sp-run-time {
    margin-left: auto;
    font-size: 10px;
    color: var(--agi-ext-text-muted);
    white-space: nowrap;
  }

  .sp-run-title {
    font-size: 12px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sp-run-sub {
    font-size: 11px;
    color: var(--agi-ext-text-muted);
  }

  .sp-run-approval {
    margin: 8px 14px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--agi-ext-warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--agi-ext-warning) 40%, transparent);
    border-radius: 8px;
    font-size: 12px;
  }

  .sp-run-approval-title {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--agi-ext-text);
  }

  .sp-run-approval-call {
    font-size: 11px;
    color: var(--agi-ext-text-muted);
    margin-bottom: 6px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow-y: auto;
  }

  .sp-run-approval-guidance {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 44px;
    margin-bottom: 8px;
    padding: 6px 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: 6px;
    background: var(--agi-ext-surface);
    color: var(--agi-ext-text);
    font: inherit;
    font-size: 11px;
  }

  .sp-run-approval-btns {
    display: flex;
    gap: 8px;
  }

  .sp-run-approve {
    background: var(--agi-ext-accent);
    color: var(--agi-ext-on-accent);
    border: none;
    border-radius: 5px;
    padding: 4px 14px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .sp-run-reject {
    background: none;
    border: 1px solid var(--agi-ext-border);
    color: var(--agi-ext-text-muted);
    border-radius: 5px;
    padding: 4px 14px;
    font-size: 11px;
    cursor: pointer;
  }

  .sp-run-approve:disabled,
  .sp-run-reject:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .sp-runs-detail-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px 8px;
    border-bottom: 1px solid var(--agi-ext-border);
    flex-wrap: wrap;
  }

  .sp-runs-detail-title {
    font-size: 12px;
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .sp-run-entry {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--agi-ext-border);
  }

  .sp-run-entry-title {
    font-size: 12px;
    color: var(--agi-ext-text);
  }

  .sp-run-entry[data-kind='error'] .sp-run-entry-title {
    color: var(--agi-ext-danger);
  }

  .sp-run-entry-detail {
    font-size: 11px;
    color: var(--agi-ext-text-muted);
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

type RunFilter = 'active' | 'all';
type RunStateTone = 'active' | 'attention' | 'success' | 'danger' | 'muted';
type StatusOrigin = 'progress' | 'load' | 'action';

const RUN_STATE_LABELS: Record<CloudAgentRun['state'], string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_input: 'Needs approval',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  paused: 'Paused',
  archived: 'Archived',
};

const RUN_STATE_TONES: Record<CloudAgentRun['state'], RunStateTone> = {
  queued: 'active',
  running: 'active',
  awaiting_input: 'attention',
  ready_for_review: 'attention',
  paused: 'attention',
  completed: 'success',
  failed: 'danger',
  cancelled: 'muted',
  archived: 'muted',
};

const ORIGIN_SURFACE_LABELS: Record<CloudAgentRun['originSurface'], string> = {
  web: 'Web',
  desktop: 'Desktop',
  mobile: 'Mobile',
  chrome: 'This browser',
  vscode: 'VS Code',
  cli: 'CLI',
  api: 'API',
};

const WORK_MODE_LABELS: Record<CloudAgentRun['workMode'], string> = {
  chat: 'Chat',
  agiwork: 'AGI Work',
  research: 'Research',
};

const LIVE_RUN_STATES: ReadonlySet<CloudAgentRun['state']> = new Set([
  'queued',
  'running',
  'awaiting_input',
  'paused',
]);

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_TIME_STEPS: ReadonlyArray<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
  { unit: 'second', ms: 1_000 },
];

const RUN_REFRESH_INTERVAL_MS = 4_000;
const MAX_RENDERED_JOURNAL_ENTRIES = 200;
const MAX_RENDERED_TEXT_CHARACTERS = 20_000;

export interface CloudRunsPanelDependencies {
  listRuns: typeof listChromeManagedRuns;
  readJournal: typeof readChromeManagedRunJournal;
  resolveApproval: typeof resolveChromeManagedRunApproval;
  cancelRun: typeof cancelChromeManagedRun;
  refreshIntervalMs: number;
  now: () => number;
}

export interface CloudRunsPanelAPI {
  panelEl: HTMLElement;
  setActive(active: boolean): void;
  refresh(): Promise<void>;
  openRun(runId: string): Promise<void>;
  dispose(): void;
}

const DEFAULT_DEPENDENCIES: CloudRunsPanelDependencies = {
  listRuns: listChromeManagedRuns,
  readJournal: readChromeManagedRunJournal,
  resolveApproval: resolveChromeManagedRunApproval,
  cancelRun: cancelChromeManagedRun,
  refreshIntervalMs: RUN_REFRESH_INTERVAL_MS,
  now: () => Date.now(),
};

function formatRelativeTime(iso: string, now: number): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';
  const elapsedMs = timestamp - now;
  for (const step of RELATIVE_TIME_STEPS) {
    if (Math.abs(elapsedMs) >= step.ms || step.unit === 'second') {
      return RELATIVE_TIME_FORMAT.format(Math.round(elapsedMs / step.ms), step.unit);
    }
  }
  return '';
}

interface JournalEntry {
  kind: 'text' | 'tool' | 'approval' | 'state' | 'error';
  title: string;
  detail?: string;
}

function describeEnvelope(envelope: AgentEventEnvelope): JournalEntry | null {
  const event = envelope.event;
  switch (event.type) {
    case 'text-delta':
      return { kind: 'text', title: event.delta };
    case 'tool-execution-start':
      return { kind: 'tool', title: `Running ${event.name}`, detail: event.summary };
    case 'tool-execution-end':
      return {
        kind: event.isError ? 'error' : 'tool',
        title: `${event.isError ? 'Failed' : 'Finished'} ${event.name}`,
      };
    case 'approval-requested':
      return {
        kind: 'approval',
        title: `Approval requested: ${event.name}`,
        detail: event.summary,
      };
    case 'approval-resolved':
      return { kind: 'approval', title: `Approval ${event.decision}` };
    case 'input-requested':
      return { kind: 'approval', title: `Input requested: ${event.toolName}` };
    case 'progress-update':
      return {
        kind: 'tool',
        title: event.summary,
        ...(event.detail ? { detail: event.detail } : {}),
      };
    case 'artifact-produced':
      return { kind: 'tool', title: `Artifact: ${event.name}` };
    case 'task-state-changed':
      return { kind: 'state', title: RUN_STATE_LABELS[event.state] };
    case 'error':
      return { kind: 'error', title: event.message };
    default:
      return null;
  }
}

// Journal reads are incremental, so a later page has to be able to continue the
// entry list an earlier page produced — including finishing a text run that was
// split across the page boundary.
export function summarizeRunJournal(
  events: readonly AgentEventEnvelope[],
  previousEntries: readonly JournalEntry[] = [],
): JournalEntry[] {
  const entries: JournalEntry[] = previousEntries.map((entry) => ({ ...entry }));
  for (const envelope of events) {
    const entry = describeEnvelope(envelope);
    if (!entry) continue;
    const previous = entries[entries.length - 1];
    if (
      entry.kind === 'text' &&
      previous?.kind === 'text' &&
      previous.title.length < MAX_RENDERED_TEXT_CHARACTERS
    ) {
      previous.title += entry.title;
      continue;
    }
    entries.push(entry);
  }
  return entries.slice(-MAX_RENDERED_JOURNAL_ENTRIES);
}

export function buildCloudRunsPanel(
  dependencies: Partial<CloudRunsPanelDependencies> = {},
): CloudRunsPanelAPI {
  const deps: CloudRunsPanelDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };

  const panelEl = el('div', { id: 'sp-runs-panel' });

  const header = el('div', { class: 'sp-runs-header' });
  const filters = el('div', {
    class: 'sp-runs-filters',
    role: 'group',
    'aria-label': 'Run filter',
  });
  const activeFilterBtn = el(
    'button',
    { type: 'button', class: 'sp-runs-filter', 'data-filter': 'active', 'aria-pressed': 'true' },
    'Active',
  );
  const allFilterBtn = el(
    'button',
    { type: 'button', class: 'sp-runs-filter', 'data-filter': 'all', 'aria-pressed': 'false' },
    'All',
  );
  filters.appendChild(activeFilterBtn);
  filters.appendChild(allFilterBtn);
  const refreshBtn = el('button', { type: 'button', class: 'sp-runs-icon-btn' }, 'Refresh');
  header.appendChild(filters);
  header.appendChild(refreshBtn);
  panelEl.appendChild(header);

  const statusEl = el('div', { class: 'sp-runs-status', role: 'status', 'aria-live': 'polite' });
  statusEl.hidden = true;
  panelEl.appendChild(statusEl);

  const listEl = el('div', { id: 'sp-runs-list' });
  const detailEl = el('div', { id: 'sp-runs-detail' });
  detailEl.hidden = true;
  panelEl.appendChild(listEl);
  panelEl.appendChild(detailEl);

  let filter: RunFilter = 'active';
  let runs: CloudAgentRun[] = [];
  let nextCursor: string | null = null;
  let openRunId: string | null = null;
  let detailRun: CloudAgentRun | null = null;
  let openEntries: JournalEntry[] = [];
  let openAfterSequence: number | null = null;
  let openJournalTruncated = false;
  let active = false;
  let disposed = false;
  let inFlight: AbortController | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingDecisionRunId: string | null = null;
  let statusOrigin: StatusOrigin = 'progress';
  const guidanceByRunId = new Map<string, string>();

  function setStatus(
    message: string,
    kind?: 'error' | 'success',
    origin: StatusOrigin = 'progress',
  ): void {
    statusEl.textContent = message;
    statusEl.hidden = message.length === 0;
    statusOrigin = origin;
    if (kind) statusEl.setAttribute('data-kind', kind);
    else statusEl.removeAttribute('data-kind');
  }

  // The outcome of a decision has to outlive the reload that decision triggers —
  // otherwise "another device already answered this" flashes and disappears.
  // Load progress and load failures are cleared by the next successful read.
  function clearTransientStatus(): void {
    if (statusOrigin !== 'action') setStatus('');
  }

  function stopRefreshTimer(): void {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  }

  function isEditingGuidance(): boolean {
    const focused = panelEl.ownerDocument.activeElement;
    return focused instanceof HTMLTextAreaElement && panelEl.contains(focused);
  }

  function hasLiveRun(): boolean {
    if (openRunId) return detailRun !== null && LIVE_RUN_STATES.has(detailRun.state);
    return runs.some((run) => LIVE_RUN_STATES.has(run.state));
  }

  // The panel is the only thing that keeps this timer alive: it is cleared the
  // moment the tab is left, the document is hidden or the panel is torn down, so
  // a closed side panel issues no traffic at all.
  function scheduleRefresh(): void {
    stopRefreshTimer();
    if (disposed || !active || panelEl.ownerDocument.hidden || !hasLiveRun()) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void load({ background: true });
    }, deps.refreshIntervalMs);
  }

  function buildApprovalCard(run: CloudAgentRun): HTMLElement | null {
    const pending = run.pendingApproval;
    if (!pending) return null;

    const card = el('div', { class: 'sp-run-approval', role: 'group' });
    card.appendChild(
      el('div', { class: 'sp-run-approval-title' }, `Waiting on you — ${run.model}`),
    );
    for (const call of pending.toolCalls) {
      card.appendChild(
        el('div', { class: 'sp-run-approval-call' }, `${call.name}\n${call.argsPreview}`),
      );
    }

    const guidance = el('textarea', {
      class: 'sp-run-approval-guidance',
      rows: '2',
      maxlength: String(TOOL_APPROVAL_GUIDANCE_MAX_LENGTH),
      placeholder: 'Optional guidance for the agent',
      'aria-label': 'Guidance for the agent',
    });
    guidance.value = guidanceByRunId.get(run.id) ?? '';
    guidance.addEventListener('input', () => {
      guidanceByRunId.set(run.id, guidance.value);
    });
    card.appendChild(guidance);

    const buttons = el('div', { class: 'sp-run-approval-btns' });
    const approveBtn = el('button', { type: 'button', class: 'sp-run-approve' }, 'Approve');
    const rejectBtn = el('button', { type: 'button', class: 'sp-run-reject' }, 'Deny');
    const busy = pendingDecisionRunId === run.id;
    approveBtn.disabled = busy;
    rejectBtn.disabled = busy;
    approveBtn.addEventListener('click', () => void submitApproval(run, 'approved'));
    rejectBtn.addEventListener('click', () => void submitApproval(run, 'rejected'));
    buttons.appendChild(approveBtn);
    buttons.appendChild(rejectBtn);
    card.appendChild(buttons);
    return card;
  }

  // A connector `input_required` pause is not a tool approval: it needs the
  // remote server's own form, which this panel does not render. Say so instead
  // of showing an attention badge with nothing under it.
  function buildPendingInputNotice(run: CloudAgentRun): HTMLElement | null {
    const pending = run.pendingInput;
    if (!pending) return null;
    const card = el('div', { class: 'sp-run-approval', role: 'group' });
    card.appendChild(el('div', { class: 'sp-run-approval-title' }, 'Waiting on connector details'));
    for (const call of pending.toolCalls) {
      card.appendChild(
        el('div', { class: 'sp-run-approval-call' }, `${call.name} • ${call.connectorId}`),
      );
    }
    card.appendChild(
      el(
        'div',
        { class: 'sp-run-sub' },
        `This run needs a connector form that only ${ORIGIN_SURFACE_LABELS[run.originSurface]} can show. Answer it there to let the run continue.`,
      ),
    );
    return card;
  }

  async function submitApproval(
    run: CloudAgentRun,
    decision: 'approved' | 'rejected',
  ): Promise<void> {
    const pending = run.pendingApproval;
    if (!pending || pendingDecisionRunId !== null) return;
    pendingDecisionRunId = run.id;
    render();
    const guidance = guidanceByRunId.get(run.id)?.trim();
    const result = await deps.resolveApproval({
      runId: run.id,
      toolCallIds: pending.toolCalls.map((call) => call.toolCallId),
      decision,
      ...(guidance ? { guidance } : {}),
    });
    pendingDecisionRunId = null;
    if (result.status === 'success') {
      guidanceByRunId.delete(run.id);
      setStatus(decision === 'approved' ? 'Approved.' : 'Denied.', 'success', 'action');
    } else {
      setStatus(result.message, 'error', 'action');
    }
    render();
    await load({ background: true });
  }

  async function cancelRun(run: CloudAgentRun): Promise<void> {
    const result = await deps.cancelRun({
      runId: run.id,
      runPath: managedCloudAgentRunPath(run.id),
      lastSequence: -1,
      state: run.state,
      cancellationRequestedAt: run.cancellationRequestedAt,
    });
    if (result.status === 'error') {
      setStatus(result.message, 'error', 'action');
      return;
    }
    setStatus('Stop requested.', 'success', 'action');
    await load({ background: true });
  }

  function buildRunRow(run: CloudAgentRun, now: number): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const row = el('button', {
      type: 'button',
      class: 'sp-run-row',
      'data-run-id': run.id,
      'aria-label': `Open ${WORK_MODE_LABELS[run.workMode]} run, ${RUN_STATE_LABELS[run.state]}`,
    });

    const head = el('div', { class: 'sp-run-row-head' });
    head.appendChild(
      el(
        'span',
        { class: 'sp-run-badge', 'data-tone': RUN_STATE_TONES[run.state] },
        RUN_STATE_LABELS[run.state],
      ),
    );
    head.appendChild(el('span', { class: 'sp-run-time' }, formatRelativeTime(run.updatedAt, now)));
    row.appendChild(head);
    row.appendChild(
      el('div', { class: 'sp-run-title' }, `${WORK_MODE_LABELS[run.workMode]} • ${run.model}`),
    );
    row.appendChild(
      el('div', { class: 'sp-run-sub' }, `Started on ${ORIGIN_SURFACE_LABELS[run.originSurface]}`),
    );
    row.addEventListener('click', () => void openRunDetail(run.id));
    fragment.appendChild(row);

    const approval = buildApprovalCard(run) ?? buildPendingInputNotice(run);
    if (approval) fragment.appendChild(approval);
    return fragment;
  }

  function renderList(): void {
    const now = deps.now();
    const fragment = document.createDocumentFragment();
    if (runs.length === 0) {
      fragment.appendChild(
        el(
          'div',
          { class: 'sp-runs-empty' },
          filter === 'active'
            ? 'No active runs.\n\nRuns you start on the web, the desktop app or your phone show up here while they are working.'
            : 'No runs yet.\n\nRuns you start on any signed-in surface show up here.',
        ),
      );
    } else {
      for (const run of runs) fragment.appendChild(buildRunRow(run, now));
      if (nextCursor) {
        const moreBtn = el(
          'button',
          { type: 'button', class: 'sp-runs-icon-btn', 'data-more': 'true' },
          'Load more',
        );
        moreBtn.addEventListener('click', () => void load({ append: true }));
        fragment.appendChild(moreBtn);
      }
    }
    listEl.replaceChildren(fragment);
  }

  function renderDetail(): void {
    const fragment = document.createDocumentFragment();
    const head = el('div', { class: 'sp-runs-detail-head' });
    const backBtn = el('button', { type: 'button', class: 'sp-runs-icon-btn' }, 'Back');
    backBtn.addEventListener('click', () => closeRunDetail());
    head.appendChild(backBtn);

    const run = detailRun;
    if (run) {
      head.appendChild(
        el(
          'span',
          { class: 'sp-run-badge', 'data-tone': RUN_STATE_TONES[run.state] },
          RUN_STATE_LABELS[run.state],
        ),
      );
      head.appendChild(
        el(
          'span',
          { class: 'sp-runs-detail-title' },
          `${WORK_MODE_LABELS[run.workMode]} • ${run.model} • ${ORIGIN_SURFACE_LABELS[run.originSurface]}`,
        ),
      );
      if (LIVE_RUN_STATES.has(run.state)) {
        const stopBtn = el('button', { type: 'button', class: 'sp-runs-icon-btn' }, 'Stop');
        stopBtn.disabled = run.cancellationRequestedAt !== null;
        stopBtn.addEventListener('click', () => void cancelRun(run));
        head.appendChild(stopBtn);
      }
    }
    fragment.appendChild(head);

    if (run) {
      const approval = buildApprovalCard(run) ?? buildPendingInputNotice(run);
      if (approval) fragment.appendChild(approval);
    }

    if (openEntries.length === 0) {
      fragment.appendChild(el('div', { class: 'sp-runs-empty' }, 'No activity recorded yet.'));
    } else {
      for (const entry of openEntries) {
        const entryEl = el('div', { class: 'sp-run-entry', 'data-kind': entry.kind });
        entryEl.appendChild(el('div', { class: 'sp-run-entry-title' }, entry.title));
        if (entry.detail) {
          entryEl.appendChild(el('div', { class: 'sp-run-entry-detail' }, entry.detail));
        }
        fragment.appendChild(entryEl);
      }
    }
    detailEl.replaceChildren(fragment);
  }

  function render(): void {
    const detailOpen = openRunId !== null;
    listEl.hidden = detailOpen;
    detailEl.hidden = !detailOpen;
    activeFilterBtn.setAttribute('aria-pressed', String(filter === 'active'));
    allFilterBtn.setAttribute('aria-pressed', String(filter === 'all'));
    if (detailOpen) renderDetail();
    else renderList();
  }

  function beginRequest(): AbortController {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    return controller;
  }

  async function load(options: { background?: boolean; append?: boolean } = {}): Promise<void> {
    if (disposed) return;
    const background = options.background === true;
    const controller = beginRequest();
    if (!background) setStatus(openRunId ? 'Loading run…' : 'Loading runs…');

    if (openRunId) {
      // Every re-read continues from where the last one stopped; re-downloading
      // the whole log each tick pins a long run to its oldest window and burns a
      // full page budget every interval.
      const result = await deps.readJournal({
        runId: openRunId,
        ...(openAfterSequence !== null ? { afterSequence: openAfterSequence } : {}),
        signal: controller.signal,
      });
      if (controller.signal.aborted || disposed) return;
      if (result.status === 'error') {
        if (result.code !== 'cancelled') {
          setStatus(result.message, 'error', 'load');
          if (!isEditingGuidance()) render();
        }
      } else {
        const loaded = result.journal.run;
        detailRun = loaded;
        openEntries = summarizeRunJournal(result.journal.events, openEntries);
        openAfterSequence = result.journal.nextAfterSequence;
        openJournalTruncated = openJournalTruncated || result.journal.truncated;
        runs = runs.map((run) => (run.id === loaded.id ? loaded : run));
        if (openJournalTruncated && statusOrigin !== 'action') {
          setStatus('Showing the most recent activity for this run.', undefined, 'load');
        } else {
          clearTransientStatus();
        }
        if (!isEditingGuidance()) render();
      }
      scheduleRefresh();
      return;
    }

    const result = await deps.listRuns({
      ...(filter === 'all' ? { states: [...ALL_MANAGED_RUN_STATES] } : {}),
      ...(options.append && nextCursor ? { cursor: nextCursor } : {}),
      signal: controller.signal,
    });
    if (controller.signal.aborted || disposed) return;
    if (result.status === 'error') {
      if (result.code !== 'cancelled') {
        setStatus(result.message, 'error', 'load');
        if (!isEditingGuidance()) render();
      }
      scheduleRefresh();
      return;
    }
    runs = options.append ? [...runs, ...result.page.runs] : result.page.runs;
    nextCursor = result.page.nextCursor;
    clearTransientStatus();
    if (!isEditingGuidance()) render();
    scheduleRefresh();
  }

  function resetOpenJournal(): void {
    openEntries = [];
    openAfterSequence = null;
    openJournalTruncated = false;
  }

  async function openRunDetail(runId: string): Promise<void> {
    openRunId = runId;
    detailRun = runs.find((run) => run.id === runId) ?? null;
    resetOpenJournal();
    render();
    await load();
  }

  function closeRunDetail(): void {
    openRunId = null;
    detailRun = null;
    resetOpenJournal();
    setStatus('');
    render();
    void load({ background: true });
  }

  function setFilter(next: RunFilter): void {
    if (filter === next) return;
    filter = next;
    runs = [];
    nextCursor = null;
    openRunId = null;
    detailRun = null;
    resetOpenJournal();
    render();
    void load();
  }

  activeFilterBtn.addEventListener('click', () => setFilter('active'));
  allFilterBtn.addEventListener('click', () => setFilter('all'));
  refreshBtn.addEventListener('click', () => void load());

  function onVisibilityChange(): void {
    if (panelEl.ownerDocument.hidden) stopRefreshTimer();
    else if (active) void load({ background: true });
  }

  function onPageHide(): void {
    dispose();
  }

  panelEl.ownerDocument.addEventListener('visibilitychange', onVisibilityChange);
  panelEl.ownerDocument.defaultView?.addEventListener('pagehide', onPageHide);

  // Deactivation is also the sign-out path, so it has to leave nothing of the
  // previous account on screen: stopping the poll while stale rows — tool names,
  // argument previews, typed guidance — stay painted is not a teardown.
  function clearRenderedRuns(): void {
    stopRefreshTimer();
    inFlight?.abort();
    inFlight = null;
    runs = [];
    nextCursor = null;
    openRunId = null;
    detailRun = null;
    pendingDecisionRunId = null;
    guidanceByRunId.clear();
    resetOpenJournal();
    setStatus('');
    render();
  }

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    if (active) void load();
    else clearRenderedRuns();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    active = false;
    clearRenderedRuns();
    panelEl.ownerDocument.removeEventListener('visibilitychange', onVisibilityChange);
    panelEl.ownerDocument.defaultView?.removeEventListener('pagehide', onPageHide);
  }

  render();

  return {
    panelEl,
    setActive,
    refresh: () => load(),
    openRun: openRunDetail,
    dispose,
  };
}
