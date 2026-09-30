import {
  describeScheduleRunTiming,
  MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  MANAGED_CLOUD_SCHEDULE_TEMPLATES,
  ManagedCloudScheduleMutationSchema,
  type ManagedCloudScheduleMutation,
  type ManagedCloudScheduleRun,
  type ManagedCloudScheduleRunApproval,
  type ManagedCloudScheduleRunPendingApproval,
  type ManagedCloudScheduleSources,
  type ManagedCloudScheduleTask,
  type ManagedCloudScheduleTemplate,
} from '@agiworkforce/cloud-contracts';
import type { LifecycleStatus } from '@agiworkforce/types';
import { openClerkSignIn } from '../cloud-bridge/clerkAuth';
import {
  createChromeSchedule,
  deleteChromeSchedule,
  listChromeScheduleRuns,
  listChromeSchedules,
  readChromeScheduleApproval,
  resolveChromeScheduleApproval,
  runChromeScheduleNow,
  setChromeScheduleEnabled,
  updateChromeScheduleDetails,
} from '../cloud-bridge/schedulesClient';
import { t } from '../../i18n';
import { el } from './dom';
import { buildHelpArticleLink } from './helpLinks';
import { renderMarkdown, sanitizeHtml } from './markdown';

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
  .sp-schedules-title {
    flex: 1;
    font-size: var(--type-caption-size);
    font-weight: 600;
    line-height: var(--type-caption-height);
    color: var(--agi-ext-text);
  }
  .sp-schedules-status {
    padding: 0 14px 6px;
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
    color: var(--agi-ext-text-muted);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sp-schedules-status[hidden] { display: none; }
  .sp-schedules-status[data-kind='error'] { color: var(--agi-ext-danger-text); }
  .sp-schedules-status-action {
    margin-left: 6px;
    padding: 0;
    font: inherit;
    color: var(--agi-ext-accent-text);
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }
  .sp-schedules-status-action:disabled { cursor: wait; opacity: 0.55; }
  .sp-schedules-empty {
    padding: 4px 14px 12px;
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    line-height: var(--type-caption-height);
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
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sp-schedule-badge {
    flex-shrink: 0;
    font-size: var(--type-label-size);
    padding: 1px 7px;
    border-radius: var(--corner-pill);
    border: 1px solid var(--agi-ext-border);
    color: var(--agi-ext-text-muted);
  }
  .sp-schedule-badge[data-tone='active'] {
    color: var(--agi-ext-success-text);
    border-color: var(--agi-ext-success-border);
  }
  .sp-schedule-badge[data-tone='failed'] {
    color: var(--agi-ext-danger-text);
    border-color: var(--agi-ext-danger-border);
  }
  .sp-schedule-sub { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); }
  .sp-schedule-description {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    overflow-wrap: anywhere;
  }
  .sp-schedule-last-error {
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
    color: var(--agi-ext-danger-text);
    overflow-wrap: anywhere;
  }
  .sp-schedule-confirm {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid var(--agi-ext-danger-border);
    border-radius: var(--corner-control);
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
  }
  .sp-schedule-confirm-text { margin: 0; overflow-wrap: anywhere; }
  .sp-schedule-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .sp-schedule-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    color: var(--agi-ext-text-muted);
    font-size: var(--type-label-size);
    padding: 3px 8px;
    cursor: pointer;
    transition: color var(--duration-instant), border-color var(--duration-instant);
  }
  .sp-schedule-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); }
  .sp-schedule-btn.is-danger { color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); }
  .sp-schedule-btn:disabled { cursor: wait; opacity: 0.55; }
  .sp-schedule-approval {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
  }
  .sp-schedule-approval-call { overflow-wrap: anywhere; }
  .sp-schedule-form {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin: 4px 14px 10px;
    padding: 10px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
  }
  .sp-schedule-form[hidden],
  .sp-schedule-templates[hidden],
  .sp-schedule-row-fields[hidden] { display: none; }
  .sp-schedule-templates { display: flex; flex-wrap: wrap; gap: 6px; }
  .sp-schedule-template {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 5px 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    background: none;
    color: var(--agi-ext-text);
    font: inherit;
    font-size: var(--type-caption-size);
    text-align: left;
    cursor: pointer;
  }
  .sp-schedule-template:hover { border-color: var(--agi-ext-accent); }
  .sp-schedule-template-cadence { color: var(--agi-ext-text-muted); }
  .sp-schedule-field { display: flex; flex-direction: column; gap: 3px; }
  .sp-schedule-field[hidden] { display: none; }
  .sp-schedule-field > span { color: var(--agi-ext-text-muted); }
  .sp-schedule-input {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--control-sm);
    padding: 4px 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    background: var(--agi-ext-bg);
    color: var(--agi-ext-text);
    font: inherit;
    font-size: var(--type-caption-size);
  }
  textarea.sp-schedule-input { min-height: 64px; resize: vertical; }
  .sp-schedule-days { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; border: 0; }
  .sp-schedule-days label { display: inline-flex; align-items: center; gap: 3px; }
  .sp-schedule-row-fields { display: flex; gap: 8px; }
  .sp-schedule-row-fields > .sp-schedule-field { flex: 1; min-width: 0; }
  .sp-schedule-form-error { color: var(--agi-ext-danger-text); }
  .sp-schedule-form-error:empty { display: none; }
  .sp-schedule-template:focus-visible,
  .sp-schedule-input:focus-visible,
  .sp-schedule-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 1px; }
  .sp-schedule-runs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--agi-ext-border);
  }
  .sp-schedule-runs-heading {
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
    font-weight: 600;
    line-height: var(--type-caption-height);
  }
  .sp-schedule-runs-prompt {
    margin: 0;
    color: var(--agi-ext-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
  }
  .sp-schedule-run-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .sp-schedule-run {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    background: var(--agi-ext-bg);
  }
  .sp-schedule-run-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .sp-schedule-run-status {
    color: var(--agi-ext-text);
    font-size: var(--type-caption-size);
    font-weight: 600;
    line-height: var(--type-caption-height);
  }
  .sp-schedule-run-status[data-status='failed'],
  .sp-schedule-run-status[data-status='timeout'] { color: var(--agi-ext-danger-text); }
  .sp-schedule-run-output {
    max-height: 220px;
    overflow-y: auto;
    color: var(--agi-ext-text);
    font-size: var(--type-caption-size);
    line-height: var(--type-body-height);
    overflow-wrap: anywhere;
  }
  .sp-schedule-run-output > :first-child { margin-top: 0; }
  .sp-schedule-run-output > :last-child { margin-bottom: 0; }
  .sp-schedule-run-error {
    color: var(--agi-ext-danger-text);
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
    overflow-wrap: anywhere;
  }
  .sp-schedule-approval-input {
    margin: 0;
    max-height: 120px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
  }
`;

export interface SchedulesSectionDependencies {
  createSchedule: typeof createChromeSchedule;
  updateScheduleDetails: typeof updateChromeScheduleDetails;
  deleteSchedule: typeof deleteChromeSchedule;
  listSchedules: typeof listChromeSchedules;
  listRuns: typeof listChromeScheduleRuns;
  setScheduleEnabled: typeof setChromeScheduleEnabled;
  runScheduleNow: typeof runChromeScheduleNow;
  readApproval: typeof readChromeScheduleApproval;
  resolveApproval: typeof resolveChromeScheduleApproval;
  signIn: typeof openClerkSignIn;
  now: () => number;
}

interface ScheduleRunsView {
  scheduleId: string;
  state: 'loading' | 'ready' | 'error';
  runs: ManagedCloudScheduleRun[];
  message: string;
}

export interface SchedulesSectionAPI {
  sectionEl: HTMLElement;
  setActive(active: boolean): void;
  refresh(): Promise<void>;
}

const DEFAULT_DEPENDENCIES: SchedulesSectionDependencies = {
  createSchedule: createChromeSchedule,
  updateScheduleDetails: updateChromeScheduleDetails,
  deleteSchedule: deleteChromeSchedule,
  listSchedules: listChromeSchedules,
  listRuns: listChromeScheduleRuns,
  setScheduleEnabled: setChromeScheduleEnabled,
  runScheduleNow: runChromeScheduleNow,
  readApproval: readChromeScheduleApproval,
  resolveApproval: resolveChromeScheduleApproval,
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

type ScheduleFormRecurrence = 'daily' | 'weekly' | 'monthly';

const SCHEDULE_FIELDS = ManagedCloudScheduleMutationSchema.shape;

function maxLength(limit: number | null): Record<string, string> {
  return limit === null ? {} : { maxlength: String(limit) };
}

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function availableTimeZones(current: string): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  const zones = intl.supportedValuesOf?.('timeZone') ?? [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function weekdayLabel(day: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2023, 0, 1 + day)),
  );
}

function badgeTone(
  schedule: ManagedCloudScheduleTask,
): Extract<LifecycleStatus, 'failed' | 'idle'> | 'active' {
  if (schedule.status === 'failed') return 'failed';
  return schedule.isEnabled && schedule.status === 'active' ? 'active' : 'idle';
}

export function buildSchedulesSection(
  dependencies: Partial<SchedulesSectionDependencies> = {},
): SchedulesSectionAPI {
  const deps: SchedulesSectionDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };

  const sectionEl = el('div', { class: 'sp-schedules', id: 'sp-schedules' });
  const head = el('div', { class: 'sp-schedules-head' });
  head.appendChild(el('h2', { class: 'sp-schedules-title' }, t('spSchedulesTitle')));
  head.appendChild(buildHelpArticleLink('schedules-and-triggers', t('spHelpLinkSchedules')));
  const newBtn = el(
    'button',
    {
      type: 'button',
      class: 'sp-schedule-btn',
      'aria-expanded': 'false',
      'aria-controls': 'sp-schedule-form',
    },
    t('spSchedulesNew'),
  );
  head.appendChild(newBtn);
  sectionEl.appendChild(head);

  const form = el('form', {
    class: 'sp-schedule-form',
    id: 'sp-schedule-form',
    'aria-label': t('spSchedulesFormLabel'),
    hidden: '',
  });
  form.noValidate = true;
  const templateRow = el('div', {
    class: 'sp-schedule-templates',
    role: 'group',
    'aria-label': t('spSchedulesTemplatesLabel'),
  });
  form.appendChild(templateRow);

  const field = (label: string, control: HTMLElement): HTMLLabelElement => {
    const wrapper = el('label', { class: 'sp-schedule-field' });
    wrapper.appendChild(el('span', {}, label));
    wrapper.appendChild(control);
    return wrapper;
  };
  const nameInput = el('input', {
    type: 'text',
    class: 'sp-schedule-input',
    ...maxLength(SCHEDULE_FIELDS.name.maxLength),
  });
  const descriptionInput = el('input', {
    type: 'text',
    class: 'sp-schedule-input',
    ...maxLength(SCHEDULE_FIELDS.description.unwrap().maxLength),
  });
  const promptInput = el('textarea', {
    class: 'sp-schedule-input',
    ...maxLength(SCHEDULE_FIELDS.prompt.maxLength),
  });
  const repeatSelect = el('select', { class: 'sp-schedule-input' });
  for (const [value, label] of [
    ['daily', t('spSchedulesRepeatDaily')],
    ['weekly', t('spSchedulesRepeatWeekly')],
    ['monthly', t('spSchedulesRepeatMonthly')],
  ] as const) {
    repeatSelect.appendChild(el('option', { value }, label));
  }
  const daysSet = el('fieldset', { class: 'sp-schedule-days' });
  daysSet.appendChild(el('legend', { class: 'sp-visually-hidden' }, t('spSchedulesDaysLabel')));
  const dayBoxes = WEEKDAY_INDEXES.map((day) => {
    const box = el('input', { type: 'checkbox', value: String(day) });
    const label = el('label', {});
    label.appendChild(box);
    label.appendChild(document.createTextNode(weekdayLabel(day)));
    daysSet.appendChild(label);
    return box;
  });
  const daysField = el('div', { class: 'sp-schedule-field' });
  daysField.appendChild(el('span', {}, t('spSchedulesDaysLabel')));
  daysField.appendChild(daysSet);
  const dayOfMonthInput = el('input', {
    type: 'number',
    class: 'sp-schedule-input',
    min: '1',
    max: '31',
  });
  const dayOfMonthField = field(t('spSchedulesDayOfMonthLabel'), dayOfMonthInput);
  const timeInput = el('input', { type: 'time', class: 'sp-schedule-input', required: '' });
  const zoneSelect = el('select', { class: 'sp-schedule-input' });
  const whenRow = el('div', { class: 'sp-schedule-row-fields' });
  whenRow.appendChild(field(t('spSchedulesTimeLabel'), timeInput));
  whenRow.appendChild(field(t('spSchedulesTimeZoneLabel'), zoneSelect));
  const formError = el('div', { class: 'sp-schedule-form-error', role: 'alert' });
  const formActions = el('div', { class: 'sp-schedule-actions' });
  const createBtn = el(
    'button',
    { type: 'submit', class: 'sp-schedule-btn' },
    t('spSchedulesCreate'),
  );
  const cancelBtn = el(
    'button',
    { type: 'button', class: 'sp-schedule-btn' },
    t('spSchedulesCancel'),
  );
  formActions.append(createBtn, cancelBtn);
  const repeatField = field(t('spSchedulesRepeatLabel'), repeatSelect);
  form.append(
    field(t('spSchedulesNameLabel'), nameInput),
    field(t('spSchedulesDescriptionLabel'), descriptionInput),
    field(t('spSchedulesPromptLabel'), promptInput),
    repeatField,
    daysField,
    dayOfMonthField,
    whenRow,
    formError,
    formActions,
  );
  sectionEl.appendChild(form);

  let templateSources: ManagedCloudScheduleSources | undefined;
  let editingSchedule: ManagedCloudScheduleTask | null = null;

  function syncRepeatFields(): void {
    const editing = editingSchedule !== null;
    daysField.hidden = editing || repeatSelect.value !== 'weekly';
    dayOfMonthField.hidden = editing || repeatSelect.value !== 'monthly';
  }

  function syncFormMode(): void {
    const editing = editingSchedule !== null;
    templateRow.hidden = editing;
    repeatField.hidden = editing;
    whenRow.hidden = editing;
    createBtn.textContent = editing ? t('spSchedulesSave') : t('spSchedulesCreate');
    form.setAttribute(
      'aria-label',
      editingSchedule
        ? t('spSchedulesEditAria', [editingSchedule.name])
        : t('spSchedulesFormLabel'),
    );
    syncRepeatFields();
  }

  function resetForm(): void {
    templateSources = undefined;
    editingSchedule = null;
    nameInput.value = '';
    descriptionInput.value = '';
    promptInput.value = '';
    repeatSelect.value = 'daily';
    for (const box of dayBoxes) box.checked = Number(box.value) >= 1 && Number(box.value) <= 5;
    dayOfMonthInput.value = '1';
    timeInput.value = '09:00';
    const zone = browserTimeZone();
    zoneSelect.replaceChildren(
      ...availableTimeZones(zone).map((value) => el('option', { value }, value)),
    );
    zoneSelect.value = zone;
    formError.replaceChildren();
    createBtn.disabled = false;
    syncFormMode();
  }

  function applyTemplate(template: ManagedCloudScheduleTemplate): void {
    templateSources = template.draft.sources;
    nameInput.value = template.draft.name;
    promptInput.value = template.draft.prompt;
    repeatSelect.value = template.draft.recurrence;
    const days = template.draft.daysOfWeek ?? [];
    for (const box of dayBoxes) box.checked = days.includes(Number(box.value));
    timeInput.value = template.draft.timeOfDay;
    syncRepeatFields();
    nameInput.focus();
  }

  for (const template of MANAGED_CLOUD_SCHEDULE_TEMPLATES) {
    const button = el('button', {
      type: 'button',
      class: 'sp-schedule-template',
      title: template.description,
    });
    button.appendChild(el('span', {}, template.name));
    button.appendChild(
      el('span', { class: 'sp-schedule-template-cadence' }, template.cadenceLabel),
    );
    button.addEventListener('click', () => applyTemplate(template));
    templateRow.appendChild(button);
  }

  function setFormOpen(open: boolean): void {
    form.hidden = !open;
    newBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      resetForm();
      nameInput.focus();
    } else {
      editingSchedule = null;
    }
  }

  function openEditForm(schedule: ManagedCloudScheduleTask): void {
    resetForm();
    editingSchedule = schedule;
    nameInput.value = schedule.name;
    descriptionInput.value = schedule.description ?? '';
    promptInput.value = schedule.prompt ?? '';
    syncFormMode();
    form.hidden = false;
    newBtn.setAttribute('aria-expanded', 'true');
    form.scrollIntoView?.({ block: 'nearest' });
    nameInput.focus();
  }

  function scheduleMutation(): ManagedCloudScheduleMutation | string {
    const name = nameInput.value.trim();
    const prompt = promptInput.value.trim();
    const recurrence = repeatSelect.value as ScheduleFormRecurrence;
    const daysOfWeek = dayBoxes.filter((box) => box.checked).map((box) => Number(box.value));
    const dayOfMonth = Number(dayOfMonthInput.value);
    if (!name) return t('spSchedulesNameRequired');
    if (!prompt) return t('spSchedulesPromptRequired');
    if (recurrence === 'weekly' && daysOfWeek.length === 0) return t('spSchedulesDaysRequired');
    if (
      recurrence === 'monthly' &&
      !(Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31)
    ) {
      return t('spSchedulesDayOfMonthRequired');
    }
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeInput.value)) return t('spSchedulesTimeRequired');
    return {
      name,
      description: descriptionInput.value.trim() || null,
      prompt,
      model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
      recurrence,
      cronExpression: null,
      scheduledAt: null,
      intervalMs: null,
      timeOfDay: timeInput.value,
      daysOfWeek: recurrence === 'weekly' ? daysOfWeek : [],
      dayOfMonth: recurrence === 'monthly' ? dayOfMonth : null,
      timezone: zoneSelect.value || browserTimeZone(),
      isActive: true,
      expiresAt: null,
      maxExecutions: null,
      ...(templateSources ? { sources: templateSources } : {}),
    };
  }

  newBtn.addEventListener('click', () => setFormOpen(form.hidden || editingSchedule !== null));
  cancelBtn.addEventListener('click', () => setFormOpen(false));
  repeatSelect.addEventListener('change', syncRepeatFields);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (editingSchedule) {
      void saveDetails(editingSchedule);
      return;
    }
    const mutation = scheduleMutation();
    if (typeof mutation === 'string') {
      formError.replaceChildren(document.createTextNode(mutation));
      return;
    }
    createBtn.disabled = true;
    formError.replaceChildren();
    void deps.createSchedule(mutation).then(async (result) => {
      createBtn.disabled = false;
      if (result.status === 'error') {
        formError.replaceChildren(document.createTextNode(result.message));
        return;
      }
      setFormOpen(false);
      await refresh();
      setStatus(t('spSchedulesCreated', [result.schedule.name]));
    });
  });

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
  let approvals = new Map<string, ManagedCloudScheduleRun>();
  let listed = false;
  let active = false;
  let inFlight: AbortController | null = null;
  let pendingScheduleId: string | null = null;
  let confirmingDeleteId: string | null = null;
  let openRunsId: string | null = null;
  let runsView: ScheduleRunsView | null = null;

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
    if (schedule.description?.trim()) {
      row.appendChild(el('div', { class: 'sp-schedule-description' }, schedule.description));
    }

    const next = formatRelative(schedule.nextExecutionAt, now);
    const last = formatRelative(schedule.lastExecutedAt, now);
    const sub = [
      next ? t('spSchedulesNext', [next]) : '',
      last ? t('spSchedulesLast', [last]) : t('spSchedulesNeverRun'),
    ]
      .filter(Boolean)
      .join(' · ');
    row.appendChild(el('div', { class: 'sp-schedule-sub' }, sub));
    if (schedule.lastError) {
      row.appendChild(
        el(
          'div',
          { class: 'sp-schedule-last-error' },
          t('spSchedulesLastRunError', [schedule.lastError]),
        ),
      );
    }

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

    const runsOpen = openRunsId === schedule.id;
    const runsBtn = el(
      'button',
      {
        type: 'button',
        class: 'sp-schedule-btn',
        'aria-expanded': String(runsOpen),
        'aria-controls': `sp-schedule-runs-${schedule.id}`,
      },
      t('spSchedulesRuns'),
    );
    runsBtn.addEventListener('click', () => {
      void toggleRuns(schedule);
    });
    actions.appendChild(runsBtn);

    const editBtn = el(
      'button',
      {
        type: 'button',
        class: 'sp-schedule-btn',
        'data-schedule-id': schedule.id,
        'data-schedule-action': 'edit',
        'aria-label': t('spSchedulesEditAria', [schedule.name]),
      },
      t('spSchedulesEdit'),
    );
    editBtn.disabled = busy;
    editBtn.addEventListener('click', () => openEditForm(schedule));
    actions.appendChild(editBtn);

    const deleteBtn = el(
      'button',
      {
        type: 'button',
        class: 'sp-schedule-btn is-danger',
        'data-schedule-id': schedule.id,
        'data-schedule-action': 'delete',
        'aria-label': t('spSchedulesDeleteAria', [schedule.name]),
      },
      t('spSchedulesDelete'),
    );
    deleteBtn.disabled = busy;
    deleteBtn.addEventListener('click', () => {
      confirmingDeleteId = schedule.id;
      render();
      focusRowAction(schedule.id, 'confirm-delete');
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    if (confirmingDeleteId === schedule.id) row.appendChild(buildDeleteConfirm(schedule, busy));
    if (runsOpen) row.appendChild(buildRuns(schedule, now));

    const waiting = approvals.get(schedule.id);
    if (waiting?.pendingApproval) {
      row.appendChild(buildApproval(schedule, waiting, waiting.pendingApproval, busy, now));
    }
    return row;
  }

  function focusRowAction(scheduleId: string, action: string): void {
    Array.from(listEl.querySelectorAll<HTMLButtonElement>('button[data-schedule-action]'))
      .find(
        (button) =>
          button.dataset['scheduleId'] === scheduleId &&
          button.dataset['scheduleAction'] === action,
      )
      ?.focus();
  }

  function closeDeleteConfirm(scheduleId: string): void {
    confirmingDeleteId = null;
    render();
    focusRowAction(scheduleId, 'delete');
  }

  function buildDeleteConfirm(schedule: ManagedCloudScheduleTask, busy: boolean): HTMLElement {
    const questionId = `sp-schedule-delete-${schedule.id}`;
    const block = el('div', {
      class: 'sp-schedule-confirm',
      role: 'alertdialog',
      'aria-labelledby': questionId,
    });
    block.appendChild(
      el(
        'p',
        { class: 'sp-schedule-confirm-text', id: questionId },
        t('spSchedulesDeleteConfirm', [schedule.name]),
      ),
    );
    const decisions = el('div', { class: 'sp-schedule-actions' });
    const confirmBtn = el(
      'button',
      {
        type: 'button',
        class: 'sp-schedule-btn is-danger',
        'data-schedule-id': schedule.id,
        'data-schedule-action': 'confirm-delete',
      },
      busy ? t('spSchedulesDeleting') : t('spSchedulesDelete'),
    );
    confirmBtn.disabled = busy;
    confirmBtn.addEventListener('click', () => {
      void deleteSchedule(schedule);
    });
    const cancel = el(
      'button',
      { type: 'button', class: 'sp-schedule-btn' },
      t('spSchedulesCancel'),
    );
    cancel.disabled = busy;
    cancel.addEventListener('click', () => closeDeleteConfirm(schedule.id));
    block.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || pendingScheduleId === schedule.id) return;
      event.preventDefault();
      event.stopPropagation();
      closeDeleteConfirm(schedule.id);
    });
    decisions.append(confirmBtn, cancel);
    block.appendChild(decisions);
    return block;
  }

  function runStatusLabel(status: ManagedCloudScheduleRun['status']): string {
    switch (status) {
      case 'success':
        return t('spScheduleRunSucceeded');
      case 'failed':
        return t('spScheduleRunFailed');
      case 'timeout':
        return t('spScheduleRunTimedOut');
      case 'cancelled':
        return t('spScheduleRunCancelled');
      case 'awaiting_approval':
        return t('spScheduleRunAwaitingApproval');
      case 'running':
        return t('spScheduleRunRunning');
    }
  }

  function buildRunEntry(run: ManagedCloudScheduleRun, now: number): HTMLElement {
    const entry = el('li', { class: 'sp-schedule-run' });
    const head = el('div', { class: 'sp-schedule-run-head' });
    head.appendChild(
      el(
        'span',
        { class: 'sp-schedule-run-status', 'data-status': run.status },
        runStatusLabel(run.status),
      ),
    );
    head.appendChild(el('span', { class: 'sp-schedule-sub' }, formatRelative(run.startedAt, now)));
    entry.appendChild(head);
    const timing = describeScheduleRunTiming(run, (iso) => formatRelative(iso, now));
    if (timing) entry.appendChild(el('div', { class: 'sp-schedule-sub' }, timing.note));
    if (run.output?.trim()) {
      const answer = el('div', { class: 'sp-schedule-run-output' });
      answer.innerHTML = sanitizeHtml(renderMarkdown(run.output));
      entry.appendChild(answer);
    } else if (run.status === 'success' && !timing?.skipped) {
      entry.appendChild(el('div', { class: 'sp-schedule-sub' }, t('spScheduleRunNoAnswer')));
    }
    if (run.error) entry.appendChild(el('div', { class: 'sp-schedule-run-error' }, run.error));
    return entry;
  }

  function buildRuns(schedule: ManagedCloudScheduleTask, now: number): HTMLElement {
    const block = el('div', {
      class: 'sp-schedule-runs',
      id: `sp-schedule-runs-${schedule.id}`,
      role: 'region',
      'aria-label': t('spSchedulesRunsLabel', [schedule.name]),
    });
    if (schedule.prompt?.trim()) {
      block.appendChild(el('div', { class: 'sp-schedule-runs-heading' }, t('spSchedulesPrompt')));
      block.appendChild(el('p', { class: 'sp-schedule-runs-prompt' }, schedule.prompt));
    }
    block.appendChild(el('div', { class: 'sp-schedule-runs-heading' }, t('spSchedulesRuns')));
    const view = runsView?.scheduleId === schedule.id ? runsView : null;
    if (!view || view.state === 'loading') {
      block.appendChild(
        el('div', { class: 'sp-schedule-sub', role: 'status' }, t('spSchedulesRunsLoading')),
      );
      return block;
    }
    if (view.state === 'error') {
      block.appendChild(el('div', { class: 'sp-schedule-run-error', role: 'alert' }, view.message));
      return block;
    }
    if (view.runs.length === 0) {
      block.appendChild(el('div', { class: 'sp-schedule-sub' }, t('spSchedulesRunsEmpty')));
      return block;
    }
    const list = el('ol', { class: 'sp-schedule-run-list' });
    for (const run of view.runs) list.appendChild(buildRunEntry(run, now));
    block.appendChild(list);
    return block;
  }

  async function toggleRuns(schedule: ManagedCloudScheduleTask): Promise<void> {
    if (openRunsId === schedule.id) {
      openRunsId = null;
      runsView = null;
      render();
      return;
    }
    openRunsId = schedule.id;
    runsView = { scheduleId: schedule.id, state: 'loading', runs: [], message: '' };
    render();
    const result = await deps.listRuns(schedule.id);
    if (openRunsId !== schedule.id) return;
    runsView =
      result.status === 'success'
        ? { scheduleId: schedule.id, state: 'ready', runs: result.runs, message: '' }
        : { scheduleId: schedule.id, state: 'error', runs: [], message: result.message };
    render();
  }

  function buildApproval(
    schedule: ManagedCloudScheduleTask,
    run: ManagedCloudScheduleRun,
    pending: ManagedCloudScheduleRunPendingApproval,
    busy: boolean,
    now: number,
  ): HTMLElement {
    const block = el('div', { class: 'sp-schedule-approval', role: 'group' });
    block.appendChild(el('strong', {}, t('spSchedulesWaitingApproval')));
    for (const call of pending.toolCalls) {
      block.appendChild(
        el('div', { class: 'sp-schedule-approval-call' }, `${call.summary} (${call.name})`),
      );
      if (call.input) {
        block.appendChild(el('pre', { class: 'sp-schedule-approval-input' }, call.input));
      }
    }
    block.appendChild(
      el(
        'div',
        { class: 'sp-schedule-sub' },
        t('spSchedulesApprovalExpires', [formatRelative(pending.expiresAt, now)]),
      ),
    );
    const decisions = el('div', { class: 'sp-schedule-actions' });
    for (const [decision, label] of [
      ['approved', t('spSchedulesApprove')],
      ['rejected', t('spSchedulesDeny')],
    ] as const) {
      const button = el('button', { type: 'button', class: 'sp-schedule-btn' }, label);
      button.disabled = busy;
      button.addEventListener('click', () => {
        void resolveApproval(schedule, run, decision);
      });
      decisions.appendChild(button);
    }
    block.appendChild(decisions);
    return block;
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

  async function saveDetails(schedule: ManagedCloudScheduleTask): Promise<void> {
    const name = nameInput.value.trim();
    const prompt = promptInput.value.trim();
    if (!name || !prompt) {
      formError.replaceChildren(
        document.createTextNode(
          name ? t('spSchedulesPromptRequired') : t('spSchedulesNameRequired'),
        ),
      );
      return;
    }
    createBtn.disabled = true;
    formError.replaceChildren();
    const result = await deps.updateScheduleDetails(schedule.id, {
      name,
      description: descriptionInput.value.trim() || null,
      prompt,
    });
    createBtn.disabled = false;
    if (result.status === 'error') {
      formError.replaceChildren(document.createTextNode(result.message));
      return;
    }
    schedules = schedules.map((entry) => (entry.id === schedule.id ? result.schedule : entry));
    setFormOpen(false);
    setStatus(t('spSchedulesUpdated', [result.schedule.name]));
    render();
    focusRowAction(schedule.id, 'edit');
  }

  async function deleteSchedule(schedule: ManagedCloudScheduleTask): Promise<void> {
    if (pendingScheduleId !== null) return;
    pendingScheduleId = schedule.id;
    render();
    const result = await deps.deleteSchedule(schedule.id);
    pendingScheduleId = null;
    if (result.status === 'error') {
      reportFailure(result);
      render();
      focusRowAction(schedule.id, 'confirm-delete');
      return;
    }
    confirmingDeleteId = null;
    schedules = schedules.filter((entry) => entry.id !== schedule.id);
    approvals.delete(schedule.id);
    if (openRunsId === schedule.id) {
      openRunsId = null;
      runsView = null;
    }
    if (editingSchedule?.id === schedule.id) setFormOpen(false);
    setStatus(t('spSchedulesDeleted', [schedule.name]));
    render();
    newBtn.focus();
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

  async function resolveApproval(
    schedule: ManagedCloudScheduleTask,
    run: ManagedCloudScheduleRun,
    decision: ManagedCloudScheduleRunApproval['decision'],
  ): Promise<void> {
    const pending = run.pendingApproval;
    if (pendingScheduleId !== null || !pending) return;
    pendingScheduleId = schedule.id;
    render();
    const result = await deps.resolveApproval(schedule.id, run.id, {
      decision,
      toolCallIds: pending.toolCalls.map((call) => call.id),
    });
    pendingScheduleId = null;
    if (result.status === 'error') {
      reportFailure(result);
      render();
      return;
    }
    setStatus(decision === 'approved' ? t('spSchedulesApproved') : t('spSchedulesDenied'));
    render();
    await refresh();
  }

  async function readApprovals(
    listedSchedules: readonly ManagedCloudScheduleTask[],
    signal: AbortSignal,
  ): Promise<Map<string, ManagedCloudScheduleRun>> {
    const paused = listedSchedules.filter(
      (schedule) => schedule.pausedReason === 'approval_required',
    );
    const results = await Promise.all(
      paused.map((schedule) => deps.readApproval(schedule.id, { signal })),
    );
    const found = new Map<string, ManagedCloudScheduleRun>();
    results.forEach((result, index) => {
      const schedule = paused[index];
      if (schedule && result.status === 'success' && result.run) found.set(schedule.id, result.run);
    });
    return found;
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
    const waiting = await readApprovals(result.schedules, controller.signal);
    if (controller.signal.aborted) return;
    schedules = result.schedules;
    approvals = waiting;
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
    approvals = new Map();
    listed = false;
    pendingScheduleId = null;
    confirmingDeleteId = null;
    openRunsId = null;
    runsView = null;
    setStatus('');
    render();
  }

  render();

  return { sectionEl, setActive, refresh };
}
