import {
  MAX_CLOUD_AGENT_RUN_STEER_LENGTH,
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
  isCloudAgentRunSteerable,
  managedCloudAgentRunPath,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import {
  applyAgentActivityEvent,
  type AgentActivityProgressEntry,
  type AgentActivityState,
  type AgentActivityToolEntry,
  type ConnectorInputResponse,
} from '@agiworkforce/client-runtime';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  AGENT_TASK_BOARD_STAGES,
  agentTaskBoardStage,
  agentTaskStateLabel,
  messageKindForAgentEvent,
  type AgentTaskBoardStage,
} from '@agiworkforce/types';
import {
  AGIWORK_PLAN_OVERVIEW_PROGRESS_ID,
  AGIWORK_PLAN_PROGRESS_ID_PREFIX,
} from '@agiworkforce/unified-chat/agi-work-progress';
import {
  isLiveTaskState,
  isPausableState,
  runWorkState,
  taskResultText,
} from '@agiworkforce/unified-chat/task-display';
import {
  ALL_MANAGED_RUN_STATES,
  answerChromeManagedRunInput,
  cancelChromeManagedRun,
  listChromeManagedRuns,
  pauseChromeManagedRun,
  readChromeManagedRunJournal,
  resolveChromeManagedRunApproval,
  resumePausedChromeManagedRun,
  steerChromeManagedRun,
} from '../cloud-bridge/managedRunControl';
import { openClerkSignIn } from '../cloud-bridge/clerkAuth';
import { buildConnectorInputForm, type ConnectorInputBinding } from './connectorInputForm';
import { answerFiles, buildAnswerFiles, type AnswerFileAccess } from './generatedFiles';
import {
  buildSchedulesSection,
  SCHEDULES_SECTION_CSS,
  type SchedulesSectionDependencies,
} from './schedulesSection';
import { el } from './dom';
import { buildHelpArticleLink } from './helpLinks';
import { renderMarkdown, sanitizeHtml } from './markdown';
import { t } from '../../i18n';

export const CLOUD_RUNS_PANEL_CSS =
  `
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
    border-radius: var(--corner-control);
    color: var(--agi-ext-text-muted);
    font-size: var(--type-label-size);
    padding: 3px 10px;
    cursor: pointer;
    transition: border-color var(--duration-instant), color var(--duration-instant);
  }

  .sp-runs-filter[aria-pressed='true'] {
    border-color: var(--agi-ext-accent);
    color: var(--agi-ext-accent-text);
  }

  .sp-runs-icon-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    color: var(--agi-ext-text-muted);
    font-size: var(--type-label-size);
    padding: 3px 10px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .sp-runs-icon-btn:hover {
    border-color: var(--agi-ext-accent);
    color: var(--agi-ext-accent-text);
  }

  .sp-runs-icon-btn:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .sp-runs-status {
    padding: 6px 14px;
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
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
    color: var(--agi-ext-danger-text);
  }

  .sp-runs-status[data-kind='success'] {
    color: var(--agi-ext-success-text);
  }

  .sp-runs-status-action {
    margin-left: 6px;
    padding: 0;
    font: inherit;
    color: var(--agi-ext-accent-text);
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }

  .sp-runs-status-action:disabled {
    cursor: wait;
    opacity: 0.55;
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
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    line-height: var(--type-caption-height);
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
    border-radius: var(--corner-menu);
    border: 1px solid var(--agi-ext-border);
    padding: 1px 8px;
    font-size: var(--type-label-size);
    font-weight: 600;
    white-space: nowrap;
  }

  .sp-run-badge[data-tone='active'] {
    color: var(--agi-ext-accent-text);
    border-color: color-mix(in srgb, var(--agi-ext-accent) 40%, transparent);
    background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
  }

  .sp-run-badge[data-tone='attention'] {
    color: var(--agi-ext-warning-text);
    border-color: color-mix(in srgb, var(--agi-ext-warning) 40%, transparent);
    background: color-mix(in srgb, var(--agi-ext-warning) 12%, transparent);
  }

  .sp-run-badge[data-tone='success'] {
    color: var(--agi-ext-success-text);
    border-color: var(--agi-ext-success-border);
    background: var(--agi-ext-success-bg);
  }

  .sp-run-badge[data-tone='danger'] {
    color: var(--agi-ext-danger-text);
    border-color: var(--agi-ext-danger-border);
    background: var(--agi-ext-danger-bg);
  }

  .sp-run-time {
    margin-left: auto;
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    white-space: nowrap;
  }

  .sp-run-title {
    font-size: var(--type-caption-size);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sp-run-sub {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
  }

  .sp-run-approval {
    margin: 8px 14px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--agi-ext-warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--agi-ext-warning) 40%, transparent);
    border-radius: var(--corner-field);
    font-size: var(--type-caption-size);
  }

  .sp-run-approval-title {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--agi-ext-text);
  }

  .sp-run-approval-call {
    font-size: var(--type-caption-size);
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
    border-radius: var(--corner-control);
    background: var(--agi-ext-surface);
    color: var(--agi-ext-text);
    font: inherit;
    font-size: var(--type-caption-size);
  }

  .sp-run-approval-btns {
    display: flex;
    gap: 8px;
  }

  .sp-run-approve {
    background: var(--agi-ext-accent);
    color: var(--agi-ext-on-accent);
    border: none;
    border-radius: var(--corner-control);
    padding: 4px 14px;
    font-size: var(--type-caption-size);
    font-weight: 500;
    cursor: pointer;
  }

  .sp-run-reject {
    background: none;
    border: 1px solid var(--agi-ext-border);
    color: var(--agi-ext-text-muted);
    border-radius: var(--corner-control);
    padding: 4px 14px;
    font-size: var(--type-caption-size);
    cursor: pointer;
  }

  .sp-run-approve:disabled,
  .sp-run-reject:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .sp-runs-board {
    display: flex;
    gap: 8px;
    padding: 0 14px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
  }

  .sp-runs-column {
    flex: 0 0 min(240px, 85%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-field);
    scroll-snap-align: start;
    min-width: 0;
  }

  .sp-runs-column-head {
    display: flex;
    justify-content: space-between;
    margin: 0;
    font-size: var(--type-caption-size);
    font-weight: 600;
    color: var(--agi-ext-text);
  }

  .sp-runs-column-count {
    font-weight: 400;
    color: var(--agi-ext-text-muted);
  }

  .sp-runs-column-empty {
    padding: 12px 0;
    text-align: center;
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
  }

  .sp-runs-column-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sp-runs-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    background: var(--agi-ext-surface);
  }

  .sp-runs-card-open {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    font: inherit;
    color: var(--agi-ext-text);
    cursor: pointer;
    min-width: 0;
  }

  .sp-runs-card-note {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    overflow-wrap: anywhere;
  }

  .sp-runs-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
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
    font-size: var(--type-caption-size);
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
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
  }

  .sp-run-entry[data-kind='error'] .sp-run-entry-title {
    color: var(--agi-ext-danger-text);
  }

  .sp-run-entry-detail {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .sp-run-preview {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sp-runs-detail-meta {
    flex-basis: 100%;
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    overflow-wrap: anywhere;
  }

  .sp-run-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 14px;
    padding: 10px 12px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-field);
  }

  .sp-run-section-title {
    margin: 0;
    font-size: var(--type-caption-size);
    font-weight: 600;
    color: var(--agi-ext-text);
  }

  .sp-run-plan-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sp-run-plan-step {
    display: flex;
    gap: 8px;
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
  }

  .sp-run-plan-marker {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border: 1px solid var(--agi-ext-border-strong);
    border-radius: var(--corner-pill);
  }

  .sp-run-plan-step[data-status='completed'] .sp-run-plan-marker {
    background: var(--agi-ext-success);
    border-color: var(--agi-ext-success);
  }

  .sp-run-plan-step[data-status='failed'] .sp-run-plan-marker {
    background: var(--agi-ext-danger);
    border-color: var(--agi-ext-danger);
  }

  .sp-run-plan-step[data-status='running'] .sp-run-plan-marker {
    background: var(--agi-ext-accent);
    border-color: var(--agi-ext-accent);
  }

  .sp-run-plan-step[data-status='stopped'] .sp-run-plan-marker {
    background: var(--agi-ext-text-muted);
    border-color: var(--agi-ext-text-muted);
  }

  .sp-run-plan-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .sp-run-plan-status {
    color: var(--agi-ext-text-muted);
  }

  .sp-run-plan-step[data-status='running'] .sp-run-plan-status {
    color: var(--agi-ext-accent-text);
    font-weight: 600;
  }

  .sp-run-plan-step[data-status='completed'] .sp-run-plan-status {
    color: var(--agi-ext-success-text);
  }

  .sp-run-plan-step[data-status='failed'] .sp-run-plan-status {
    color: var(--agi-ext-danger-text);
  }

  .sp-run-plan-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 6px;
    border-top: 1px solid var(--agi-ext-border);
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
    overflow-wrap: anywhere;
  }

  .sp-run-plan-summary p,
  .sp-run-steer-item p {
    margin: 0;
  }

  .sp-run-steer {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 14px;
    border-top: 1px solid var(--agi-ext-border);
    background: var(--agi-ext-bg);
  }

  .sp-run-steer-queue {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sp-run-steer-item {
    padding: 6px 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
  }

  .sp-run-steer-text {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .sp-run-steer-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .sp-run-approval .sp-connector-input {
    margin: 6px 0 0;
  }

  .sp-runs-help {
    padding: 8px 14px;
  }

  .sp-run-result {
    max-height: 320px;
    overflow-y: auto;
    font-size: var(--type-caption-size);
    line-height: var(--type-body-height);
    color: var(--agi-ext-text);
    overflow-wrap: anywhere;
  }

  .sp-run-result > :first-child {
    margin-top: 0;
  }

  .sp-run-result > :last-child {
    margin-bottom: 0;
  }
` + SCHEDULES_SECTION_CSS;

type RunFilter = 'active' | 'needs-you' | 'all';
type RunLayout = 'list' | 'board';
type RunStateTone = 'active' | 'attention' | 'success' | 'danger' | 'muted';
type StatusOrigin = 'progress' | 'load' | 'action';

const RUN_STATE_TONES: Record<CloudAgentRun['state'], RunStateTone> = {
  queued: 'active',
  planning: 'active',
  running: 'active',
  resuming: 'active',
  awaiting_input: 'attention',
  awaiting_approval: 'attention',
  ready_for_review: 'attention',
  paused: 'attention',
  completed: 'success',
  partial: 'attention',
  failed: 'danger',
  timed_out: 'danger',
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

const NEEDS_YOU_STATES: ReadonlySet<CloudAgentRun['state']> = new Set([
  'awaiting_input',
  'awaiting_approval',
  'paused',
]);

function needsYou(run: CloudAgentRun): boolean {
  return NEEDS_YOU_STATES.has(run.workState ?? run.state);
}

function needsYouFirst(runs: readonly CloudAgentRun[]): CloudAgentRun[] {
  return [...runs.filter(needsYou), ...runs.filter((run) => !needsYou(run))];
}

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_TIME_STEPS: ReadonlyArray<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
  { unit: 'second', ms: 1_000 },
];

const SIGN_IN_ACTION_LABEL = 'Sign in';
const SIGN_IN_OPENING_LABEL = 'Opening…';
const SIGN_IN_FAILED = 'The sign-in tab did not open.';

const RUN_REFRESH_INTERVAL_MS = 4_000;
const RUN_LAYOUT_STORAGE_KEY = 'agi-ext-runs-layout';

function loadRunLayout(): RunLayout {
  try {
    return globalThis.localStorage?.getItem(RUN_LAYOUT_STORAGE_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

function saveRunLayout(layout: RunLayout): void {
  try {
    globalThis.localStorage?.setItem(RUN_LAYOUT_STORAGE_KEY, layout);
  } catch {
    return;
  }
}
const MAX_RENDERED_JOURNAL_ENTRIES = 200;
const MAX_RESULT_EVENTS = 20_000;
const MAX_RENDERED_TEXT_CHARACTERS = 20_000;

export interface CloudRunsPanelDependencies {
  listRuns: typeof listChromeManagedRuns;
  readJournal: typeof readChromeManagedRunJournal;
  resolveApproval: typeof resolveChromeManagedRunApproval;
  cancelRun: typeof cancelChromeManagedRun;
  pauseRun: typeof pauseChromeManagedRun;
  resumePausedRun: typeof resumePausedChromeManagedRun;
  steerRun: typeof steerChromeManagedRun;
  answerInput: typeof answerChromeManagedRunInput;
  signIn: typeof openClerkSignIn;
  refreshIntervalMs: number;
  now: () => number;
  schedules: Partial<SchedulesSectionDependencies>;
  fileAccess?: AnswerFileAccess;
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
  pauseRun: pauseChromeManagedRun,
  resumePausedRun: resumePausedChromeManagedRun,
  steerRun: steerChromeManagedRun,
  answerInput: answerChromeManagedRunInput,
  signIn: openClerkSignIn,
  refreshIntervalMs: RUN_REFRESH_INTERVAL_MS,
  now: () => Date.now(),
  schedules: {},
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

type PlanItemStatus = 'completed' | 'failed' | 'running' | 'stopped' | 'pending';

interface PlanItem {
  ordinal: number;
  description: string;
  status: PlanItemStatus;
}

interface InputAnswer {
  round: number;
  responses: Record<string, ConnectorInputResponse>;
}

const PLAN_ITEM_STATUS_LABELS: Record<PlanItemStatus, string> = {
  completed: 'Done',
  failed: 'Failed',
  running: 'In progress',
  stopped: 'Stopped',
  pending: 'Not started',
};

const STOPPED_SHORT_STATES: ReadonlySet<CloudAgentRun['state']> = new Set<CloudAgentRun['state']>([
  'partial',
  'timed_out',
  'cancelled',
  'failed',
]);

const PLAN_LINE = /^(\d+)\.\s*(.+)$/;

function isPlanProgressId(progressId: string): boolean {
  return (
    progressId === AGIWORK_PLAN_OVERVIEW_PROGRESS_ID ||
    progressId.startsWith(AGIWORK_PLAN_PROGRESS_ID_PREFIX)
  );
}

function planStepStatus(
  step: AgentActivityProgressEntry | undefined,
  live: boolean,
): PlanItemStatus {
  if (step?.status === 'completed' || step?.status === 'failed') return step.status;
  if (step?.status === 'running') return live ? 'running' : 'stopped';
  return step?.status === 'cancelled' ? 'stopped' : 'pending';
}

function planFromActivity(activity: AgentActivityState | undefined, live: boolean): PlanItem[] {
  const progress = (activity?.entries ?? []).filter(
    (entry): entry is AgentActivityProgressEntry => entry.kind === 'progress',
  );
  const steps = progress.filter((entry) =>
    entry.progressId.startsWith(AGIWORK_PLAN_PROGRESS_ID_PREFIX),
  );
  const overview = progress.find((entry) => entry.progressId === AGIWORK_PLAN_OVERVIEW_PROGRESS_ID);
  if (overview?.detail) {
    return overview.detail.split('\n').flatMap((line): PlanItem[] => {
      const match = PLAN_LINE.exec(line.trim());
      if (!match?.[1] || !match[2]) return [];
      const ordinal = Number(match[1]);
      const step = steps.find(
        (entry) => entry.progressId === `${AGIWORK_PLAN_PROGRESS_ID_PREFIX}agiwork-plan-${ordinal}`,
      );
      return [{ ordinal, description: match[2], status: planStepStatus(step, live) }];
    });
  }
  return steps.map((step, index): PlanItem => {
    const match = PLAN_LINE.exec(step.summary.trim());
    return {
      ordinal: match?.[1] ? Number(match[1]) : index + 1,
      description: match?.[2] ?? step.summary,
      status: planStepStatus(step, live),
    };
  });
}

function pendingInputEntries(run: CloudAgentRun): AgentActivityToolEntry[] {
  const pending = run.pendingInput;
  if (!pending) return [];
  const requestedAtMs = Date.parse(pending.requestedAt);
  return pending.toolCalls.map((call): AgentActivityToolEntry => ({
    kind: 'tool',
    id: call.toolCallId,
    toolCallId: call.toolCallId,
    name: call.name,
    category: 'connector',
    summary: call.name,
    status: 'awaiting-approval',
    startedAtMs: Number.isFinite(requestedAtMs) ? requestedAtMs : 0,
    inputRequest: {
      connectorId: call.connectorId,
      inputRequests: call.inputRequests,
      round: call.round,
    },
  }));
}

function mergeRun(previous: CloudAgentRun | null | undefined, next: CloudAgentRun): CloudAgentRun {
  if (!previous) return next;
  return {
    ...next,
    ...(!next.conversationTitle && previous.conversationTitle
      ? { conversationTitle: previous.conversationTitle }
      : {}),
    ...(!next.conversationPreview && previous.conversationPreview
      ? { conversationPreview: previous.conversationPreview }
      : {}),
  };
}

function runTitle(run: CloudAgentRun): string | null {
  return run.conversationTitle?.trim() || null;
}

function runPreview(run: CloudAgentRun, title: string | null): string | null {
  const preview = run.conversationPreview?.trim();
  return preview && preview !== title ? preview : null;
}

function runModeAndModel(run: CloudAgentRun): string {
  return `${WORK_MODE_LABELS[run.workMode]} • ${run.model}`;
}

function runStateLabel(run: CloudAgentRun): string {
  return run.pauseRequestedAt && isPausableState(runWorkState(run))
    ? 'Pausing'
    : agentTaskStateLabel(run.state);
}

function describeEnvelope(envelope: AgentEventEnvelope): JournalEntry | null {
  const event = envelope.event;
  if (messageKindForAgentEvent(event.type) === null) return null;
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
      if (isPlanProgressId(event.progressId)) return null;
      return {
        kind: 'tool',
        title: event.summary,
        ...(event.detail ? { detail: event.detail } : {}),
      };
    case 'artifact-produced':
      return { kind: 'tool', title: `Artifact: ${event.name}` };
    case 'task-state-changed':
      return { kind: 'state', title: agentTaskStateLabel(event.state) };
    case 'error':
      return { kind: 'error', title: event.message };
    default:
      return null;
  }
}

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
  const needsYouFilterBtn = el(
    'button',
    {
      type: 'button',
      class: 'sp-runs-filter',
      'data-filter': 'needs-you',
      'aria-pressed': 'false',
    },
    'Needs you',
  );
  const allFilterBtn = el(
    'button',
    { type: 'button', class: 'sp-runs-filter', 'data-filter': 'all', 'aria-pressed': 'false' },
    'All',
  );
  filters.appendChild(activeFilterBtn);
  filters.appendChild(needsYouFilterBtn);
  filters.appendChild(allFilterBtn);
  const layoutGroup = el('div', {
    class: 'sp-runs-filters',
    role: 'group',
    'aria-label': 'Run layout',
  });
  const listLayoutBtn = el(
    'button',
    { type: 'button', class: 'sp-runs-filter', 'data-layout': 'list', 'aria-pressed': 'true' },
    'List',
  );
  const boardLayoutBtn = el(
    'button',
    { type: 'button', class: 'sp-runs-filter', 'data-layout': 'board', 'aria-pressed': 'false' },
    'Board',
  );
  layoutGroup.appendChild(listLayoutBtn);
  layoutGroup.appendChild(boardLayoutBtn);
  const refreshBtn = el('button', { type: 'button', class: 'sp-runs-icon-btn' }, 'Refresh');
  header.appendChild(filters);
  header.appendChild(layoutGroup);
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

  const schedules = buildSchedulesSection(deps.schedules);
  panelEl.appendChild(schedules.sectionEl);

  let filter: RunFilter = 'active';
  let layout: RunLayout = loadRunLayout();
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
  let pendingControlRunId: string | null = null;
  let pendingInputRunId: string | null = null;
  let openActivity: AgentActivityState | undefined;
  let openEvents: AgentEventEnvelope[] = [];
  let statusOrigin: StatusOrigin = 'progress';
  const guidanceByRunId = new Map<string, string>();
  const steerDraftByRunId = new Map<string, string>();
  const inputAnswersByRunId = new Map<string, Map<string, InputAnswer>>();
  const inputErrorByRunId = new Map<string, string>();

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

  function setSignInStatus(message: string, origin: StatusOrigin): void {
    setStatus(message, undefined, origin);
    const action = el(
      'button',
      { type: 'button', class: 'sp-runs-status-action' },
      SIGN_IN_ACTION_LABEL,
    );
    action.addEventListener('click', () => {
      action.setAttribute('disabled', '');
      action.textContent = SIGN_IN_OPENING_LABEL;
      void deps
        .signIn()
        .catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : SIGN_IN_FAILED, 'error', 'action');
        })
        .finally(() => {
          action.removeAttribute('disabled');
          action.textContent = SIGN_IN_ACTION_LABEL;
        });
    });
    statusEl.appendChild(action);
  }

  function reportLoadFailure(
    result: { code: string; message: string },
    origin: StatusOrigin,
  ): void {
    if (result.code === 'auth_required') setSignInStatus(result.message, origin);
    else setStatus(result.message, 'error', origin);
  }

  function clearTransientStatus(): void {
    if (statusOrigin !== 'action') setStatus('');
  }

  function stopRefreshTimer(): void {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  }

  function isEditingInPanel(): boolean {
    const focused = panelEl.ownerDocument.activeElement;
    return (
      (focused instanceof HTMLTextAreaElement ||
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLSelectElement) &&
      panelEl.contains(focused)
    );
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
      el(
        'div',
        { class: 'sp-run-approval-title' },
        `${agentTaskStateLabel('awaiting_input')}, ${run.model}`,
      ),
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

  function replaceRun(updated: CloudAgentRun): void {
    runs = runs.map((run) => (run.id === updated.id ? mergeRun(run, updated) : run));
    if (detailRun?.id === updated.id) detailRun = mergeRun(detailRun, updated);
  }

  function pruneInputAnswers(): void {
    for (const [runId, answers] of inputAnswersByRunId) {
      const current = detailRun?.id === runId ? detailRun : runs.find((run) => run.id === runId);
      const calls = current?.pendingInput?.toolCalls ?? [];
      for (const [toolCallId, answer] of answers) {
        if (!calls.some((call) => call.toolCallId === toolCallId && call.round === answer.round)) {
          answers.delete(toolCallId);
        }
      }
      if (answers.size === 0) inputAnswersByRunId.delete(runId);
    }
    for (const runId of inputErrorByRunId.keys()) {
      const current = detailRun?.id === runId ? detailRun : runs.find((run) => run.id === runId);
      if (!current?.pendingInput) inputErrorByRunId.delete(runId);
    }
  }

  function inputBinding(run: CloudAgentRun): ConnectorInputBinding {
    const answers = inputAnswersByRunId.get(run.id);
    const answered = new Set(
      (run.pendingInput?.toolCalls ?? [])
        .filter((call) => answers?.get(call.toolCallId)?.round === call.round)
        .map((call) => call.toolCallId),
    );
    const error = inputErrorByRunId.get(run.id);
    const sending = pendingInputRunId === run.id;
    return {
      answered,
      sending,
      ...(error ? { error } : {}),
      ...(sending
        ? {}
        : {
            onRespond: (toolCallId: string, responses: Record<string, ConnectorInputResponse>) =>
              void respondToInput(run, toolCallId, responses),
          }),
    };
  }

  async function respondToInput(
    run: CloudAgentRun,
    toolCallId: string,
    responses: Record<string, ConnectorInputResponse>,
  ): Promise<void> {
    const calls = run.pendingInput?.toolCalls ?? [];
    const call = calls.find((candidate) => candidate.toolCallId === toolCallId);
    if (!call || pendingInputRunId !== null) return;
    const answers = inputAnswersByRunId.get(run.id) ?? new Map<string, InputAnswer>();
    answers.set(toolCallId, { round: call.round, responses });
    inputAnswersByRunId.set(run.id, answers);
    inputErrorByRunId.delete(run.id);
    if (calls.some((candidate) => answers.get(candidate.toolCallId)?.round !== candidate.round)) {
      render();
      return;
    }
    pendingInputRunId = run.id;
    render();
    const result = await deps.answerInput({
      runId: run.id,
      toolInputs: calls.map((candidate) => ({
        tool_call_id: candidate.toolCallId,
        input_responses: answers.get(candidate.toolCallId)?.responses ?? {},
      })),
    });
    pendingInputRunId = null;
    if (result.status === 'success') {
      setStatus('Sent. The run continues from here.', 'success', 'action');
    } else {
      inputAnswersByRunId.delete(run.id);
      inputErrorByRunId.set(run.id, result.message);
    }
    render();
    await load({ background: true });
  }

  function buildPendingInputCard(run: CloudAgentRun): HTMLElement | null {
    const entries = pendingInputEntries(run);
    if (entries.length === 0) return null;
    const card = el('div', { class: 'sp-run-approval', role: 'group' });
    card.appendChild(el('div', { class: 'sp-run-approval-title' }, 'Waiting on connector details'));
    const binding = inputBinding(run);
    for (const entry of entries) {
      const form = buildConnectorInputForm(entry, binding);
      if (form) card.appendChild(form);
    }
    return card;
  }

  function buildPausedCard(run: CloudAgentRun): HTMLElement | null {
    if (runWorkState(run) !== 'paused') return null;
    const card = el('div', { class: 'sp-run-approval', role: 'group' });
    card.appendChild(el('div', { class: 'sp-run-approval-title' }, agentTaskStateLabel('paused')));
    const guidance = el('textarea', {
      class: 'sp-run-approval-guidance',
      rows: '2',
      maxlength: String(TOOL_APPROVAL_GUIDANCE_MAX_LENGTH),
      placeholder: 'Tell the agent what to change when it resumes (optional)',
      'aria-label': 'Guidance for when this run resumes',
    });
    guidance.value = guidanceByRunId.get(run.id) ?? '';
    guidance.addEventListener('input', () => {
      guidanceByRunId.set(run.id, guidance.value);
    });
    card.appendChild(guidance);
    const buttons = el('div', { class: 'sp-run-approval-btns' });
    const resumeBtn = el('button', { type: 'button', class: 'sp-run-approve' }, 'Resume');
    resumeBtn.disabled = pendingControlRunId === run.id;
    resumeBtn.addEventListener('click', () => void resumeRun(run));
    buttons.appendChild(resumeBtn);
    card.appendChild(buttons);
    return card;
  }

  function buildPlanSection(run: CloudAgentRun): HTMLElement | null {
    const workState = runWorkState(run);
    const live = isLiveTaskState(workState);
    const plan = planFromActivity(openActivity, live);
    if (plan.length === 0) return null;
    const section = el('section', {
      class: 'sp-run-section',
      'aria-labelledby': 'sp-run-plan-title',
    });
    section.appendChild(
      el('h3', { class: 'sp-run-section-title', id: 'sp-run-plan-title' }, `Plan · ${plan.length}`),
    );
    const list = el('ol', { class: 'sp-run-plan-list' });
    for (const item of plan) {
      const step = el('li', {
        class: 'sp-run-plan-step',
        'data-status': item.status,
        ...(item.status === 'running' ? { 'aria-current': 'step' } : {}),
      });
      step.appendChild(el('span', { class: 'sp-run-plan-marker', 'aria-hidden': 'true' }));
      const copy = el('span', { class: 'sp-run-plan-copy' });
      copy.appendChild(el('span', {}, `${item.ordinal}. ${item.description}`));
      copy.appendChild(
        el('span', { class: 'sp-run-plan-status' }, PLAN_ITEM_STATUS_LABELS[item.status]),
      );
      step.appendChild(copy);
      list.appendChild(step);
    }
    section.appendChild(list);
    if (!live && STOPPED_SHORT_STATES.has(workState)) {
      const remaining = plan.filter((item) => item.status !== 'completed');
      const summary = el('div', { class: 'sp-run-plan-summary' });
      summary.appendChild(
        el(
          'p',
          {},
          `Done ${plan.length - remaining.length} of ${plan.length} steps before it stopped.`,
        ),
      );
      if (remaining.length > 0) {
        summary.appendChild(
          el(
            'p',
            { class: 'sp-run-sub' },
            `Remaining: ${remaining.map((item) => `${item.ordinal}. ${item.description}`).join('; ')}`,
          ),
        );
      }
      section.appendChild(summary);
    }
    return section;
  }

  function buildResultSection(run: CloudAgentRun): HTMLElement | null {
    const text = taskResultText(openEvents);
    if (!text) return null;
    const live = isLiveTaskState(runWorkState(run));
    const section = el('section', {
      class: 'sp-run-section',
      'aria-labelledby': 'sp-run-result-title',
    });
    section.appendChild(
      el(
        'h3',
        { class: 'sp-run-section-title', id: 'sp-run-result-title' },
        live
          ? t('spRunLatestOutput')
          : run.workMode === 'research'
            ? t('spRunReport')
            : t('spRunResult'),
      ),
    );
    const body = el('div', { class: 'sp-run-result' });
    body.innerHTML = sanitizeHtml(renderMarkdown(text));
    section.appendChild(body);
    return section;
  }

  function buildOutputsSection(): HTMLElement | null {
    const files = answerFiles(undefined, openActivity);
    const list = buildAnswerFiles(files, deps.fileAccess);
    if (!list) return null;
    const section = el('section', {
      class: 'sp-run-section',
      'aria-labelledby': 'sp-run-outputs-title',
    });
    section.appendChild(
      el(
        'h3',
        { class: 'sp-run-section-title', id: 'sp-run-outputs-title' },
        `Outputs · ${files.length}`,
      ),
    );
    section.appendChild(list);
    return section;
  }

  function buildSteerSection(run: CloudAgentRun): HTMLElement | null {
    const queued = run.pendingSteers ?? [];
    const steerable = isCloudAgentRunSteerable(run);
    if (!steerable && queued.length === 0) return null;
    const live = isLiveTaskState(runWorkState(run));
    const section = el('section', { class: 'sp-run-steer', 'aria-label': 'Message the agent' });
    if (queued.length > 0) {
      const list = el('ul', { class: 'sp-run-steer-queue', 'aria-label': 'Queued messages' });
      for (const steer of queued) {
        const item = el('li', { class: 'sp-run-steer-item' });
        item.appendChild(el('p', { class: 'sp-run-steer-text' }, steer.text));
        item.appendChild(
          el(
            'p',
            { class: 'sp-run-sub' },
            live
              ? 'Queued. The agent reads it at its next step.'
              : 'Not read before the run finished.',
          ),
        );
        list.appendChild(item);
      }
      section.appendChild(list);
    }
    if (steerable) {
      const busy = pendingControlRunId === run.id;
      const form = el('form', { class: 'sp-run-steer-form' });
      const inputId = `sp-run-steer-${run.id}`;
      form.appendChild(
        el('label', { class: 'sp-visually-hidden', for: inputId }, 'Message for the agent'),
      );
      const input = el('textarea', {
        id: inputId,
        class: 'sp-run-approval-guidance',
        rows: '2',
        maxlength: String(MAX_CLOUD_AGENT_RUN_STEER_LENGTH),
        placeholder: 'Message the agent to add instructions or change course',
      });
      input.value = steerDraftByRunId.get(run.id) ?? '';
      input.disabled = busy;
      const send = el('button', { type: 'submit', class: 'sp-run-approve' }, 'Send');
      send.disabled = busy || input.value.trim().length === 0;
      input.addEventListener('input', () => {
        steerDraftByRunId.set(run.id, input.value);
        send.disabled = pendingControlRunId === run.id || input.value.trim().length === 0;
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        void submitSteer(run);
      });
      form.appendChild(input);
      const foot = el('div', { class: 'sp-run-steer-foot' });
      foot.appendChild(
        el(
          'span',
          { class: 'sp-run-sub' },
          'It reads your message at its next step and keeps its progress.',
        ),
      );
      foot.appendChild(send);
      form.appendChild(foot);
      section.appendChild(form);
    }
    return section;
  }

  function focusSteerInput(runId: string): void {
    const input = panelEl.ownerDocument.getElementById(`sp-run-steer-${runId}`);
    if (input instanceof HTMLTextAreaElement && !input.disabled) input.focus();
  }

  async function submitSteer(run: CloudAgentRun): Promise<void> {
    const message = steerDraftByRunId.get(run.id)?.trim();
    if (!message || pendingControlRunId !== null) return;
    pendingControlRunId = run.id;
    render();
    const result = await deps.steerRun({ runId: run.id, message });
    pendingControlRunId = null;
    if (result.status === 'success') {
      steerDraftByRunId.delete(run.id);
      replaceRun(result.run);
      setStatus('Message queued.', 'success', 'action');
    } else {
      setStatus(result.message, 'error', 'action');
    }
    render();
    focusSteerInput(run.id);
  }

  async function pauseRun(run: CloudAgentRun): Promise<void> {
    if (pendingControlRunId !== null) return;
    pendingControlRunId = run.id;
    render();
    const result = await deps.pauseRun({ runId: run.id });
    pendingControlRunId = null;
    if (result.status === 'success') {
      replaceRun(result.run);
      setStatus('Pausing at the next step.', 'success', 'action');
    } else {
      setStatus(result.message, 'error', 'action');
    }
    render();
    scheduleRefresh();
  }

  async function resumeRun(run: CloudAgentRun): Promise<void> {
    if (pendingControlRunId !== null) return;
    pendingControlRunId = run.id;
    render();
    const guidance = guidanceByRunId.get(run.id)?.trim();
    const result = await deps.resumePausedRun({
      runId: run.id,
      ...(guidance ? { guidance } : {}),
    });
    pendingControlRunId = null;
    if (result.status === 'success') {
      guidanceByRunId.delete(run.id);
      setStatus(run.pauseRequestedAt ? 'Kept working.' : 'Resumed.', 'success', 'action');
    } else {
      setStatus(result.message, 'error', 'action');
    }
    render();
    await load({ background: true });
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

  function runOpenLabel(run: CloudAgentRun, title: string | null): string {
    return `Open ${title ?? `${WORK_MODE_LABELS[run.workMode]} run`}, ${runStateLabel(run)}`;
  }

  function buildAttentionCard(run: CloudAgentRun): HTMLElement | null {
    return buildApprovalCard(run) ?? buildPendingInputCard(run) ?? buildPausedCard(run);
  }

  function buildPauseControl(
    run: CloudAgentRun,
    subject: string,
    offerResume: boolean,
    follow: (action: Promise<void>) => void = (action) => void action,
  ): HTMLButtonElement | null {
    const workState = runWorkState(run);
    const paused = workState === 'paused';
    if (!isPausableState(workState) && !(paused && offerResume)) return null;
    const pauseRequested = !paused && Boolean(run.pauseRequestedAt);
    const [label, ariaLabel] = paused
      ? ['Resume', `Resume ${subject}`]
      : pauseRequested
        ? ['Keep working', `Keep ${subject} working`]
        : ['Pause', `Pause ${subject}`];
    const button = el(
      'button',
      { type: 'button', class: 'sp-runs-icon-btn', 'aria-label': ariaLabel },
      label,
    );
    button.disabled = pendingControlRunId !== null || run.cancellationRequestedAt !== null;
    button.addEventListener('click', () =>
      follow(paused || pauseRequested ? resumeRun(run) : pauseRun(run)),
    );
    return button;
  }

  function buildRunRow(run: CloudAgentRun, now: number): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const title = runTitle(run);
    const row = el('button', {
      type: 'button',
      class: 'sp-run-row',
      'data-run-id': run.id,
      'aria-label': runOpenLabel(run, title),
    });

    const head = el('div', { class: 'sp-run-row-head' });
    head.appendChild(
      el(
        'span',
        { class: 'sp-run-badge', 'data-tone': RUN_STATE_TONES[run.state] },
        runStateLabel(run),
      ),
    );
    head.appendChild(el('span', { class: 'sp-run-time' }, formatRelativeTime(run.updatedAt, now)));
    row.appendChild(head);
    row.appendChild(el('div', { class: 'sp-run-title' }, title ?? runModeAndModel(run)));
    const preview = runPreview(run, title);
    if (preview) row.appendChild(el('div', { class: 'sp-run-preview' }, preview));
    const origin = `Started on ${ORIGIN_SURFACE_LABELS[run.originSurface]}`;
    row.appendChild(
      el('div', { class: 'sp-run-sub' }, title ? `${runModeAndModel(run)} • ${origin}` : origin),
    );
    row.addEventListener('click', () => void openRunDetail(run.id));
    fragment.appendChild(row);

    const attention = buildAttentionCard(run);
    if (attention) fragment.appendChild(attention);
    return fragment;
  }

  function focusBoardCard(runId: string): void {
    const card = Array.from(listEl.querySelectorAll<HTMLElement>('[data-board-run-id]')).find(
      (node) => node.getAttribute('data-board-run-id') === runId,
    );
    card?.querySelector<HTMLElement>('.sp-runs-card-open')?.focus();
  }

  function moveBoardCard(run: CloudAgentRun, action: Promise<void>): void {
    void action.finally(() => {
      if (layout === 'board' && openRunId === null) focusBoardCard(run.id);
    });
  }

  function buildBoardCard(run: CloudAgentRun, now: number): HTMLElement {
    const card = el('li', { class: 'sp-runs-card', 'data-board-run-id': run.id });
    const title = runTitle(run);
    const openBtn = el('button', {
      type: 'button',
      class: 'sp-runs-card-open',
      'data-run-id': run.id,
      'aria-label': runOpenLabel(run, title),
    });
    const head = el('div', { class: 'sp-run-row-head' });
    head.appendChild(
      el(
        'span',
        { class: 'sp-run-badge', 'data-tone': RUN_STATE_TONES[run.state] },
        runStateLabel(run),
      ),
    );
    head.appendChild(el('span', { class: 'sp-run-time' }, formatRelativeTime(run.updatedAt, now)));
    openBtn.appendChild(head);
    openBtn.appendChild(el('div', { class: 'sp-run-title' }, title ?? runModeAndModel(run)));
    if (title) openBtn.appendChild(el('div', { class: 'sp-run-sub' }, runModeAndModel(run)));
    openBtn.addEventListener('click', () => void openRunDetail(run.id));
    card.appendChild(openBtn);

    const pending = run.pendingApproval;
    if (pending) {
      card.appendChild(
        el(
          'div',
          { class: 'sp-runs-card-note' },
          `Wants to run ${pending.toolCalls.map((call) => call.name).join(', ')}`,
        ),
      );
    } else if (run.pendingInput) {
      card.appendChild(
        el('div', { class: 'sp-runs-card-note' }, 'Open it to answer the connector request.'),
      );
    }

    const actions = el('div', { class: 'sp-runs-card-actions' });
    if (pending) {
      const busy = pendingDecisionRunId !== null;
      const approveBtn = el(
        'button',
        { type: 'button', class: 'sp-runs-icon-btn', 'aria-label': `Approve ${run.model} run` },
        'Approve',
      );
      const denyBtn = el(
        'button',
        { type: 'button', class: 'sp-runs-icon-btn', 'aria-label': `Deny ${run.model} run` },
        'Deny',
      );
      approveBtn.disabled = busy;
      denyBtn.disabled = busy;
      approveBtn.addEventListener('click', () =>
        moveBoardCard(run, submitApproval(run, 'approved')),
      );
      denyBtn.addEventListener('click', () => moveBoardCard(run, submitApproval(run, 'rejected')));
      actions.appendChild(approveBtn);
      actions.appendChild(denyBtn);
    }
    const control = buildPauseControl(run, `${run.model} run`, true, (action) =>
      moveBoardCard(run, action),
    );
    if (control) actions.appendChild(control);
    if (LIVE_RUN_STATES.has(run.state)) {
      const stopBtn = el(
        'button',
        { type: 'button', class: 'sp-runs-icon-btn', 'aria-label': `Stop ${run.model} run` },
        'Stop',
      );
      stopBtn.disabled = run.cancellationRequestedAt !== null;
      stopBtn.addEventListener('click', () => {
        stopBtn.disabled = true;
        moveBoardCard(run, cancelRun(run));
      });
      actions.appendChild(stopBtn);
    }
    if (actions.childElementCount > 0) card.appendChild(actions);
    return card;
  }

  function buildBoard(now: number): HTMLElement {
    const board = el('div', { class: 'sp-runs-board', role: 'region', 'aria-label': 'Run board' });
    const grouped = new Map<AgentTaskBoardStage, CloudAgentRun[]>();
    for (const run of runs) {
      const stage = agentTaskBoardStage(run.state);
      grouped.set(stage, [...(grouped.get(stage) ?? []), run]);
    }
    for (const stage of AGENT_TASK_BOARD_STAGES) {
      const stageRuns = grouped.get(stage.id) ?? [];
      if (!stage.alwaysShown && stageRuns.length === 0) continue;
      const headingId = `sp-runs-stage-${stage.id}`;
      const column = el('section', {
        class: 'sp-runs-column',
        'data-stage': stage.id,
        'aria-labelledby': headingId,
      });
      const heading = el('h3', { class: 'sp-runs-column-head', id: headingId }, stage.label);
      heading.appendChild(el('span', { class: 'sp-runs-column-count' }, String(stageRuns.length)));
      column.appendChild(heading);
      if (stageRuns.length === 0) {
        column.appendChild(el('div', { class: 'sp-runs-column-empty' }, 'Nothing here'));
      } else {
        const list = el('ul', { class: 'sp-runs-column-list' });
        for (const run of stageRuns) list.appendChild(buildBoardCard(run, now));
        column.appendChild(list);
      }
      board.appendChild(column);
    }
    return board;
  }

  function renderList(): void {
    const now = deps.now();
    const fragment = document.createDocumentFragment();
    if (runs.length === 0) {
      fragment.appendChild(
        el(
          'div',
          { class: 'sp-runs-empty' },
          filter === 'needs-you'
            ? 'Nothing needs you right now.\n\nA run that is waiting for your approval, an answer or a resume shows up here.'
            : filter === 'active'
              ? 'No active runs.\n\nRuns you start on the web, the desktop app or your phone show up here while they are working.'
              : 'No runs yet.\n\nRuns you start on any signed-in surface show up here.',
        ),
      );
    } else {
      if (layout === 'board') fragment.appendChild(buildBoard(now));
      else for (const run of needsYouFirst(runs)) fragment.appendChild(buildRunRow(run, now));
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
    fragment.appendChild(
      el('div', { class: 'sp-runs-help' }, buildHelpArticleLink('agi-work', t('spHelpLinkRuns'))),
    );
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
      const title = runTitle(run);
      const summary = `${runModeAndModel(run)} • ${ORIGIN_SURFACE_LABELS[run.originSurface]}`;
      head.appendChild(
        el(
          'span',
          { class: 'sp-run-badge', 'data-tone': RUN_STATE_TONES[run.state] },
          runStateLabel(run),
        ),
      );
      head.appendChild(el('h2', { class: 'sp-runs-detail-title' }, title ?? summary));
      const control = buildPauseControl(run, 'this run', false);
      if (control) head.appendChild(control);
      if (LIVE_RUN_STATES.has(run.state)) {
        const stopBtn = el('button', { type: 'button', class: 'sp-runs-icon-btn' }, 'Stop');
        stopBtn.disabled = run.cancellationRequestedAt !== null;
        stopBtn.addEventListener('click', () => void cancelRun(run));
        head.appendChild(stopBtn);
      }
      if (title) head.appendChild(el('div', { class: 'sp-runs-detail-meta' }, summary));
    }
    fragment.appendChild(head);

    if (run) {
      const attention = buildAttentionCard(run);
      if (attention) fragment.appendChild(attention);
      const plan = buildPlanSection(run);
      if (plan) fragment.appendChild(plan);
      const result = buildResultSection(run);
      if (result) fragment.appendChild(result);
      const outputs = buildOutputsSection();
      if (outputs) fragment.appendChild(outputs);
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
    if (run) {
      const steer = buildSteerSection(run);
      if (steer) fragment.appendChild(steer);
    }
    detailEl.replaceChildren(fragment);
  }

  function render(): void {
    const detailOpen = openRunId !== null;
    listEl.hidden = detailOpen;
    detailEl.hidden = !detailOpen;
    schedules.sectionEl.hidden = detailOpen;
    activeFilterBtn.setAttribute('aria-pressed', String(filter === 'active'));
    needsYouFilterBtn.setAttribute('aria-pressed', String(filter === 'needs-you'));
    allFilterBtn.setAttribute('aria-pressed', String(filter === 'all'));
    listLayoutBtn.setAttribute('aria-pressed', String(layout === 'list'));
    boardLayoutBtn.setAttribute('aria-pressed', String(layout === 'board'));
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
          reportLoadFailure(result, 'load');
          if (!isEditingInPanel()) render();
        }
      } else {
        const loaded = mergeRun(detailRun, result.journal.run);
        detailRun = loaded;
        openEntries = summarizeRunJournal(result.journal.events, openEntries);
        openEvents = [...openEvents, ...result.journal.events].slice(-MAX_RESULT_EVENTS);
        openActivity = result.journal.events.reduce<AgentActivityState | undefined>(
          (activity, envelope) => applyAgentActivityEvent(activity, envelope),
          openActivity,
        );
        openAfterSequence = result.journal.nextAfterSequence;
        openJournalTruncated = openJournalTruncated || result.journal.truncated;
        runs = runs.map((run) => (run.id === loaded.id ? mergeRun(run, loaded) : run));
        pruneInputAnswers();
        if (openJournalTruncated && statusOrigin !== 'action') {
          setStatus('Showing the most recent activity for this run.', undefined, 'load');
        } else {
          clearTransientStatus();
        }
        if (!isEditingInPanel()) render();
      }
      scheduleRefresh();
      return;
    }

    const result = await deps.listRuns({
      ...(filter === 'all'
        ? { states: [...ALL_MANAGED_RUN_STATES] }
        : filter === 'needs-you'
          ? { states: [...NEEDS_YOU_STATES] }
          : {}),
      ...(options.append && nextCursor ? { cursor: nextCursor } : {}),
      signal: controller.signal,
    });
    if (controller.signal.aborted || disposed) return;
    if (result.status === 'error') {
      if (result.code !== 'cancelled') {
        reportLoadFailure(result, 'load');
        if (!isEditingInPanel()) render();
      }
      scheduleRefresh();
      return;
    }
    const loaded = filter === 'needs-you' ? result.page.runs.filter(needsYou) : result.page.runs;
    runs = options.append ? [...runs, ...loaded] : loaded;
    nextCursor = result.page.nextCursor;
    pruneInputAnswers();
    clearTransientStatus();
    if (!isEditingInPanel()) render();
    scheduleRefresh();
  }

  function resetOpenJournal(): void {
    openEntries = [];
    openActivity = undefined;
    openEvents = [];
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

  function setLayout(next: RunLayout): void {
    if (layout === next) return;
    layout = next;
    saveRunLayout(next);
    render();
  }

  listLayoutBtn.addEventListener('click', () => setLayout('list'));
  boardLayoutBtn.addEventListener('click', () => setLayout('board'));
  activeFilterBtn.addEventListener('click', () => setFilter('active'));
  needsYouFilterBtn.addEventListener('click', () => setFilter('needs-you'));
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

  function clearRenderedRuns(): void {
    stopRefreshTimer();
    inFlight?.abort();
    inFlight = null;
    runs = [];
    nextCursor = null;
    openRunId = null;
    detailRun = null;
    pendingDecisionRunId = null;
    pendingControlRunId = null;
    pendingInputRunId = null;
    guidanceByRunId.clear();
    steerDraftByRunId.clear();
    inputAnswersByRunId.clear();
    inputErrorByRunId.clear();
    resetOpenJournal();
    setStatus('');
    render();
  }

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    schedules.setActive(next);
    if (active) void load();
    else clearRenderedRuns();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    active = false;
    schedules.setActive(false);
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
