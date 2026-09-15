import type { ManagedCloudScheduleTask } from '@agiworkforce/cloud-contracts';
import { openClerkSignIn } from '../cloud-bridge/clerkAuth';
import {
  listChromeSchedules,
  runChromeScheduleNow,
  setChromeScheduleEnabled,
} from '../cloud-bridge/schedulesClient';
import { t } from '../../i18n';
import { el } from './dom';

export const SCHEDULES_SECTION_CSS = `
  .sp-schedules {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--agi-ext-border);
    flex-shrink: 0;
    max-height: 45%;
    overflow-y: auto;
  }
  .sp-schedules-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px 4px;
  }
  .sp-schedules-title { flex: 1; font-size: 12px; color: var(--agi-ext-text); }
  .sp-schedules-status {
    padding: 0 14px 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--agi-ext-text-muted);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sp-schedules-status[hidden] { display: none; }
  .sp-schedules-status[data-kind='error'] { color: var(--agi-ext-danger); }
  .sp-schedules-status-action {
    margin-left: 6px;
    padding: 0;
    font: inherit;
    color: var(--agi-ext-accent);
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }
  .sp-schedules-status-action:disabled { cursor: wait; opacity: 0.55; }
  .sp-schedules-empty {
    padding: 4px 14px 12px;
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.5;
  }
  .sp-schedules-empty[hidden] { display: none; }
  .sp-schedule-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--agi-ext-border);
  }
  .sp-schedule-head { display: flex; align-items: center; gap: 8px; }
  .sp-schedule-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--agi-ext-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sp-schedule-badge {
    flex-shrink: 0;
    font-size: 12px;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--agi-ext-border);
    color: var(--agi-ext-text-muted);
  }
  .sp-schedule-badge[data-tone='active'] {
    color: var(--agi-ext-success);
    border-color: var(--agi-ext-success-border);
  }
  .sp-schedule-badge[data-tone='failed'] {
    color: var(--agi-ext-danger);
    border-color: var(--agi-ext-danger-border);
  }
  .sp-schedule-sub { font-size: 12px; color: var(--agi-ext-text-muted); }
  .sp-schedule-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .sp-schedule-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: 5px;
    color: var(--agi-ext-text-muted);
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .sp-schedule-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
  .sp-schedule-btn:disabled { cursor: wait; opacity: 0.55; }
`;

export interface SchedulesSectionDependencies {
  listSchedules: typeof listChromeSchedules;
  setScheduleEnabled: typeof setChromeScheduleEnabled;
  runScheduleNow: typeof runChromeScheduleNow;
  signIn: typeof openClerkSignIn;
  now: () => number;
}

export interface SchedulesSectionAPI {
  sectionEl: HTMLElement;
  setActive(active: boolean): void;
  refresh(): Promise<void>;
}

const DEFAULT_DEPENDENCIES: SchedulesSectionDependencies = {
  listSchedules: listChromeSchedules,
  setScheduleEnabled: setChromeScheduleEnabled,
  runScheduleNow: runChromeScheduleNow,
  signIn: openClerkSignIn,
  now: () => Date.now(),
};

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_TIME_STEPS: { ms: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { ms: 86_400_000, unit: 'day' },
  { ms: 3_600_000, unit: 'hour' },
  { ms: 60_000, unit: 'minute' },
  { ms: 1_000, unit: 'second' },
];

function formatRelative(iso: string | null, now: number): string {
  if (!iso) return '';
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

function badgeTone(schedule: ManagedCloudScheduleTask): string {
  if (schedule.status === 'failed') return 'failed';
  return schedule.isEnabled && schedule.status === 'active' ? 'active' : 'idle';
}

export function buildSchedulesSection(
  dependencies: Partial<SchedulesSectionDependencies> = {},
): SchedulesSectionAPI {
  const deps: SchedulesSectionDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };

  const sectionEl = el('div', { class: 'sp-schedules', id: 'sp-schedules' });
  const head = el('div', { class: 'sp-schedules-head' });
  head.appendChild(el('div', { class: 'sp-schedules-title' }, t('spSchedulesTitle')));
  sectionEl.appendChild(head);

  const statusEl = el('div', {
    class: 'sp-schedules-status',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  });
  const emptyEl = el('div', { class: 'sp-schedules-empty', hidden: '' }, t('spSchedulesEmpty'));
  const listEl = el('div', { class: 'sp-schedules-list' });
  sectionEl.appendChild(statusEl);
  sectionEl.appendChild(emptyEl);
  sectionEl.appendChild(listEl);

  let schedules: ManagedCloudScheduleTask[] = [];
  let listed = false;
  let active = false;
  let inFlight: AbortController | null = null;
  let pendingScheduleId: string | null = null;

  function setStatus(message: string, kind?: 'error'): void {
    statusEl.replaceChildren(document.createTextNode(message));
    statusEl.hidden = message.length === 0;
    if (kind) statusEl.setAttribute('data-kind', kind);
    else statusEl.removeAttribute('data-kind');
  }

  function reportFailure(result: { code: string; message: string }): void {
    if (result.code !== 'auth_required') {
      setStatus(result.message, 'error');
      return;
    }
    setStatus(result.message);
    const action = el(
      'button',
      { type: 'button', class: 'sp-schedules-status-action' },
      t('spProjectsSignIn'),
    );
    action.addEventListener('click', () => {
      action.disabled = true;
      void deps
        .signIn()
        .catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : result.message, 'error');
        })
        .finally(() => {
          action.disabled = false;
        });
    });
    statusEl.appendChild(action);
  }

  function buildRow(schedule: ManagedCloudScheduleTask, now: number): HTMLElement {
    const row = el('div', { class: 'sp-schedule-row' });
    const rowHead = el('div', { class: 'sp-schedule-head' });
    rowHead.appendChild(el('span', { class: 'sp-schedule-name' }, schedule.name));
    rowHead.appendChild(
      el('span', { class: 'sp-schedule-badge', 'data-tone': badgeTone(schedule) }, schedule.status),
    );
    row.appendChild(rowHead);

    const next = formatRelative(schedule.nextExecutionAt, now);
    const last = formatRelative(schedule.lastExecutedAt, now);
    const sub = [
      next ? t('spSchedulesNext', [next]) : '',
      last ? t('spSchedulesLast', [last]) : t('spSchedulesNeverRun'),
    ]
      .filter(Boolean)
      .join(' · ');
    row.appendChild(el('div', { class: 'sp-schedule-sub' }, sub));

    const actions = el('div', { class: 'sp-schedule-actions' });
    const busy = pendingScheduleId === schedule.id;

    const toggleBtn = el(
      'button',
      { type: 'button', class: 'sp-schedule-btn' },
      schedule.isEnabled ? t('spSchedulesPause') : t('spSchedulesResume'),
    );
    toggleBtn.disabled = busy;
    toggleBtn.addEventListener('click', () => {
      void toggleSchedule(schedule);
    });
    actions.appendChild(toggleBtn);

    const runBtn = el(
      'button',
      { type: 'button', class: 'sp-schedule-btn' },
      t('spSchedulesRunNow'),
    );
    runBtn.disabled = busy;
    runBtn.addEventListener('click', () => {
      void runSchedule(schedule);
    });
    actions.appendChild(runBtn);

    row.appendChild(actions);
    return row;
  }

  function render(): void {
    const now = deps.now();
    const fragment = document.createDocumentFragment();
    for (const schedule of schedules) fragment.appendChild(buildRow(schedule, now));
    listEl.replaceChildren(fragment);
    emptyEl.hidden = !listed || schedules.length > 0 || !statusEl.hidden;
  }

  async function toggleSchedule(schedule: ManagedCloudScheduleTask): Promise<void> {
    if (pendingScheduleId !== null) return;
    pendingScheduleId = schedule.id;
    render();
    const result = await deps.setScheduleEnabled(schedule.id, !schedule.isEnabled);
    pendingScheduleId = null;
    if (result.status === 'error') {
      reportFailure(result);
      render();
      return;
    }
    schedules = schedules.map((entry) => (entry.id === schedule.id ? result.schedule : entry));
    setStatus(schedule.isEnabled ? t('spSchedulesPaused') : t('spSchedulesResumed'));
    render();
  }

  async function runSchedule(schedule: ManagedCloudScheduleTask): Promise<void> {
    if (pendingScheduleId !== null) return;
    pendingScheduleId = schedule.id;
    render();
    const result = await deps.runScheduleNow(schedule.id);
    pendingScheduleId = null;
    if (result.status === 'error') {
      reportFailure(result);
      render();
      return;
    }
    setStatus(result.replay ? t('spSchedulesReplayed') : t('spSchedulesStarted'));
    render();
    await refresh();
  }

  async function refresh(): Promise<void> {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    if (schedules.length === 0) setStatus(t('spSchedulesLoading'));
    const result = await deps.listSchedules({ signal: controller.signal });
    if (controller.signal.aborted) return;
    if (result.status === 'error') {
      if (result.code === 'cancelled') return;
      if (result.code === 'auth_required') {
        schedules = [];
        listed = true;
      }
      reportFailure(result);
      render();
      return;
    }
    schedules = result.schedules;
    listed = true;
    setStatus('');
    render();
  }

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    if (active) {
      void refresh();
      return;
    }
    inFlight?.abort();
    inFlight = null;
    schedules = [];
    listed = false;
    pendingScheduleId = null;
    setStatus('');
    render();
  }

  render();

  return { sectionEl, setActive, refresh };
}
