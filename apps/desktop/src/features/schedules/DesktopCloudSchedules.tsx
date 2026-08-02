import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { getPlanMaxScheduledTasks } from '@agiworkforce/types';
import type {
  ManagedCloudScheduleMutation,
  ManagedCloudScheduleRecurrence,
  ManagedCloudScheduleRun,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import { selectHasCloudAccountSession, useAuthStore } from '../../stores/auth';
import { getCloudModels, type CloudModelInfo } from '../../api/cloudApi';
import type { PlanTier } from '../../lib/cloudAccountTypes';
import { resolveDesktopCloudPickerModels } from '../../services/desktopCloudEntitlements';
import {
  desktopCloudSchedules,
  type DesktopCloudSchedulesApi,
} from '../../services/desktopCloudSchedules';

const SCHEDULE_PAGE_SIZE = 50;
const RUN_PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1_000;
const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

const FIELD_CLASS =
  'w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-muted)] focus:border-[var(--chat-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-primary)]/20 disabled:opacity-60';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border)] px-3 py-2 text-sm font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--chat-accent-primary)] px-3 py-2 text-sm font-medium text-[var(--chat-accent-primary-contrast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

type IntervalUnit = 'days';

interface ScheduleDraft {
  name: string;
  description: string;
  prompt: string;
  model: string;
  recurrence: ManagedCloudScheduleRecurrence;
  cronExpression: string;
  scheduledLocal: string;
  intervalValue: string;
  intervalUnit: IntervalUnit;
  timeOfDay: string;
  daysOfWeek: number[];
  dayOfMonth: string;
  timezone: string;
  isActive: boolean;
  expiresLocal: string;
  maxExecutions: string;
}

interface HistoryState {
  status: 'idle' | 'loading' | 'success' | 'error';
  runs: ManagedCloudScheduleRun[];
  error: string | null;
  hasMore: boolean;
  nextOffset: number;
  loadingMore: boolean;
}

const EMPTY_HISTORY: HistoryState = {
  status: 'idle',
  runs: [],
  error: null,
  hasMore: false,
  nextOffset: 0,
  loadingMore: false,
};

function resolvedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function initialDraft(model = ''): ScheduleDraft {
  return {
    name: '',
    description: '',
    prompt: '',
    model,
    recurrence: 'daily',
    cronExpression: '',
    scheduledLocal: '',
    intervalValue: '1',
    intervalUnit: 'days',
    timeOfDay: '09:00',
    daysOfWeek: [1, 2, 3, 4, 5],
    dayOfMonth: '1',
    timezone: resolvedTimezone(),
    isActive: true,
    expiresLocal: '',
    maxExecutions: '',
  };
}

function recurrenceOf(schedule: ManagedCloudScheduleTask): ManagedCloudScheduleRecurrence {
  const stored = schedule.metadata?.['productRecurrence'];
  return ['once', 'daily', 'weekly', 'monthly', 'custom', 'interval'].includes(String(stored))
    ? (stored as ManagedCloudScheduleRecurrence)
    : schedule.scheduleType === 'cron'
      ? 'custom'
      : schedule.scheduleType;
}

function dateTimeLabel(value: string | null, timezone?: string): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function durationLabel(value: number | null): string {
  if (value === null) return 'In progress';
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)} m ${Math.floor((value % 60_000) / 1_000)} s`;
}

function recurrenceLabel(schedule: ManagedCloudScheduleTask): string {
  const recurrence = recurrenceOf(schedule);
  if (recurrence === 'once')
    return `Once · ${dateTimeLabel(schedule.executeAt, schedule.timezone)}`;
  if (recurrence === 'interval') {
    const days = Math.max(1, Math.round((schedule.intervalMs ?? DAY_MS) / DAY_MS));
    return `Every ${days} day${days === 1 ? '' : 's'}`;
  }
  const labels: Record<Exclude<ManagedCloudScheduleRecurrence, 'once' | 'interval'>, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    custom: 'Custom cron',
  };
  return `${labels[recurrence]} · ${schedule.timezone}`;
}

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function dateTimeParts(formatter: Intl.DateTimeFormat, instant: Date): WallClockParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

function timezoneFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function localInputToIso(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a complete local date and time.');
  const target: WallClockParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const formatter = timezoneFormatter(timezone);
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const candidates = new Set<string>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sampleMs = naiveUtc + hours * 60 * 60_000;
    const local = dateTimeParts(formatter, new Date(sampleMs));
    const offset =
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - sampleMs;
    const candidate = new Date(naiveUtc - offset);
    const parts = dateTimeParts(formatter, candidate);
    if (
      parts.year === target.year &&
      parts.month === target.month &&
      parts.day === target.day &&
      parts.hour === target.hour &&
      parts.minute === target.minute
    ) {
      candidates.add(candidate.toISOString());
    }
  }
  if (candidates.size === 0) {
    throw new Error('That local time does not exist in this time zone.');
  }
  if (candidates.size > 1) {
    throw new Error('That local time occurs twice because the clock changes.');
  }
  return [...candidates][0]!;
}

function isoToLocalInput(value: string | null, timezone: string): string {
  if (!value) return '';
  const parts = dateTimeParts(timezoneFormatter(timezone), new Date(value));
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function draftFromSchedule(
  schedule: ManagedCloudScheduleTask,
  modelOptions: readonly CloudModelInfo[],
): ScheduleDraft {
  const metadata = schedule.metadata ?? {};
  const storedDays = metadata['daysOfWeek'];
  const storedDayOfMonth = metadata['dayOfMonth'];
  return {
    name: schedule.name,
    description: schedule.description ?? '',
    prompt: schedule.prompt ?? '',
    model: modelOptions.some((model) => model.id === schedule.model) ? (schedule.model ?? '') : '',
    recurrence: recurrenceOf(schedule),
    cronExpression: schedule.cronExpression ?? '',
    scheduledLocal: isoToLocalInput(schedule.executeAt, schedule.timezone),
    intervalValue: String(Math.max(1, Math.round((schedule.intervalMs ?? DAY_MS) / DAY_MS))),
    intervalUnit: 'days',
    timeOfDay: typeof metadata['timeOfDay'] === 'string' ? metadata['timeOfDay'] : '09:00',
    daysOfWeek: Array.isArray(storedDays)
      ? storedDays.filter((day): day is number => typeof day === 'number' && Number.isInteger(day))
      : [1, 2, 3, 4, 5],
    dayOfMonth: typeof storedDayOfMonth === 'number' ? String(storedDayOfMonth) : '1',
    timezone: schedule.timezone,
    isActive: schedule.isEnabled,
    expiresLocal: isoToLocalInput(schedule.expiresAt, schedule.timezone),
    maxExecutions: schedule.maxExecutions === null ? '' : String(schedule.maxExecutions),
  };
}

function mutationFromDraft(draft: ScheduleDraft): ManagedCloudScheduleMutation {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const prompt = draft.prompt.trim();
  const model = draft.model.trim();
  if (!name) throw new Error('Enter a schedule name.');
  if (!prompt) throw new Error('Enter instructions for the scheduled task.');
  if (!model) throw new Error('Select a model or Auto mode.');
  timezoneFormatter(draft.timezone);

  const scheduledAt =
    draft.recurrence === 'once' ? localInputToIso(draft.scheduledLocal, draft.timezone) : null;
  if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
    throw new Error('Choose a scheduled time in the future.');
  }
  const expiresAt = draft.expiresLocal ? localInputToIso(draft.expiresLocal, draft.timezone) : null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw new Error('Choose an expiration in the future.');
  }
  if (scheduledAt && expiresAt && new Date(expiresAt) <= new Date(scheduledAt)) {
    throw new Error('Expiration must be after the scheduled run.');
  }

  const intervalDays = Number(draft.intervalValue);
  if (
    draft.recurrence === 'interval' &&
    (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)
  ) {
    throw new Error('Use an interval from 1 to 365 days.');
  }
  const dayOfMonth = Number(draft.dayOfMonth);
  if (
    draft.recurrence === 'monthly' &&
    (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)
  ) {
    throw new Error('Use a day of month from 1 to 31.');
  }
  if (draft.recurrence === 'weekly' && draft.daysOfWeek.length === 0) {
    throw new Error('Select at least one day of the week.');
  }
  if (draft.recurrence === 'custom' && !draft.cronExpression.trim()) {
    throw new Error('Enter a cron expression.');
  }
  const maxExecutions = draft.maxExecutions.trim() ? Number(draft.maxExecutions) : null;
  if (
    maxExecutions !== null &&
    (!Number.isInteger(maxExecutions) || maxExecutions < 1 || maxExecutions > 1_000_000)
  ) {
    throw new Error('Maximum executions must be from 1 to 1,000,000.');
  }

  return {
    name,
    description: description || null,
    prompt,
    model,
    recurrence: draft.recurrence,
    cronExpression: draft.recurrence === 'custom' ? draft.cronExpression.trim() : null,
    scheduledAt,
    intervalMs: draft.recurrence === 'interval' ? intervalDays * DAY_MS : null,
    timeOfDay: draft.timeOfDay,
    daysOfWeek: [...new Set(draft.daysOfWeek)].sort((left, right) => left - right),
    dayOfMonth: draft.recurrence === 'monthly' ? dayOfMonth : null,
    timezone: draft.timezone,
    isActive: draft.isActive,
    expiresAt,
    maxExecutions,
  };
}

function runResultText(run: ManagedCloudScheduleRun): string | null {
  const value = run.result?.['text'];
  return typeof value === 'string' && value.trim() ? value : null;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function abortedRequest(): DOMException {
  return new DOMException('The Managed Cloud schedule request was canceled.', 'AbortError');
}

function assertRequestActive(signal: AbortSignal): void {
  if (signal.aborted) throw abortedRequest();
}

function useAbortableRequests() {
  const controllers = useRef(new Set<AbortController>());

  useEffect(
    () => () => {
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    },
    [],
  );

  return useCallback(async <T,>(request: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const result = await request(controller.signal);
      if (controller.signal.aborted) throw abortedRequest();
      return result;
    } finally {
      controllers.current.delete(controller);
    }
  }, []);
}

export type DesktopCloudScheduleModelsLoader = (signal?: AbortSignal) => Promise<CloudModelInfo[]>;

async function loadDesktopCloudScheduleModels(signal?: AbortSignal): Promise<CloudModelInfo[]> {
  const models = await getCloudModels();
  if (signal?.aborted) throw abortedRequest();
  return models;
}

export interface DesktopCloudSchedulesProps {
  api?: DesktopCloudSchedulesApi;
  loadModels?: DesktopCloudScheduleModelsLoader;
}

interface AuthenticatedDesktopCloudSchedulesProps {
  api: DesktopCloudSchedulesApi;
  loadModels: DesktopCloudScheduleModelsLoader;
  plan: PlanTier | null;
}

function AuthenticatedDesktopCloudSchedules({
  api,
  loadModels,
  plan,
}: AuthenticatedDesktopCloudSchedulesProps) {
  const runAbortable = useAbortableRequests();
  const [schedules, setSchedules] = useState<ManagedCloudScheduleTask[]>([]);
  const [listStatus, setListStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedCloudScheduleTask | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(() => initialDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [operation, setOperation] = useState<Record<string, string | null>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, HistoryState>>({});
  const [discoveredModels, setDiscoveredModels] = useState<CloudModelInfo[]>([]);
  const [modelStatus, setModelStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [modelError, setModelError] = useState<string | null>(null);
  const manualRunKeys = useRef<Record<string, string>>({});

  const modelOptions = useMemo(
    () => resolveDesktopCloudPickerModels(discoveredModels, plan),
    [discoveredModels, plan],
  );
  const scheduleLimit = getPlanMaxScheduledTasks(plan);
  const schedulesEnabled = scheduleLimit === null || scheduleLimit > 0;
  const scheduleLimitReached =
    listStatus === 'success' && scheduleLimit !== null && schedules.length >= scheduleLimit;
  const modelCatalogReady = modelStatus === 'success' && modelOptions.length > 0;
  const canCreateSchedule =
    schedulesEnabled && !scheduleLimitReached && modelCatalogReady && listStatus === 'success';

  const loadModelCatalog = useCallback(async () => {
    setModelStatus('loading');
    setModelError(null);
    try {
      const models = await runAbortable((signal) => loadModels(signal));
      setDiscoveredModels(models);
      setModelStatus('success');
    } catch (error) {
      if (isAbortError(error)) return;
      setDiscoveredModels([]);
      setModelStatus('error');
      setModelError(errorText(error, 'Managed model catalog could not be loaded.'));
    }
  }, [loadModels, runAbortable]);

  useEffect(() => {
    if (schedulesEnabled) return;
    setEditorOpen(false);
    setEditing(null);
    setDraft(initialDraft());
    setFormError(null);
  }, [schedulesEnabled]);

  const loadSchedules = useCallback(
    async (append = false, offset = 0) => {
      if (append) setLoadingMore(true);
      else setListStatus('loading');
      setListError(null);
      try {
        const result = await runAbortable((signal) =>
          api.listSchedules({
            limit: SCHEDULE_PAGE_SIZE,
            offset,
            signal,
          }),
        );
        setSchedules((current) => (append ? [...current, ...result.schedules] : result.schedules));
        setHasMore(result.hasMore);
        setNextOffset(result.pagination.offset + result.pagination.limit);
        setListStatus('success');
      } catch (error) {
        if (isAbortError(error)) return;
        setListError(errorText(error, 'Schedules could not be loaded.'));
        if (!append) setListStatus('error');
      } finally {
        if (append) setLoadingMore(false);
      }
    },
    [api, runAbortable],
  );

  useEffect(() => {
    void loadSchedules();
    void loadModelCatalog();
  }, [loadModelCatalog, loadSchedules]);

  const openCreate = () => {
    if (!canCreateSchedule) return;
    setEditing(null);
    setDraft(initialDraft(modelOptions[0]?.id));
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (schedule: ManagedCloudScheduleTask) => {
    if (!schedulesEnabled || !modelCatalogReady) return;
    setEditing(schedule);
    setDraft(draftFromSchedule(schedule, modelOptions));
    setFormError(
      schedule.model && !modelOptions.some((model) => model.id === schedule.model)
        ? 'This schedule’s saved model is not currently available. Select another model before saving.'
        : null,
    );
    setEditorOpen(true);
  };

  const save = async () => {
    if (!schedulesEnabled) {
      setFormError('Upgrade to Basic or higher to manage Managed Cloud schedules.');
      return;
    }
    if (!editing && scheduleLimitReached) {
      setFormError('Delete a schedule or upgrade before creating another one.');
      return;
    }
    if (!modelCatalogReady || !modelOptions.some((model) => model.id === draft.model)) {
      setFormError('Select a currently available Managed Cloud model.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const payload = mutationFromDraft(draft);
      const saved = await runAbortable((signal) =>
        editing
          ? api.updateSchedule(editing.id, payload, signal)
          : api.createSchedule(payload, signal),
      );
      setSchedules((current) =>
        editing
          ? current.map((schedule) => (schedule.id === saved.id ? saved : schedule))
          : [saved, ...current],
      );
      setEditorOpen(false);
      setEditing(null);
    } catch (error) {
      if (isAbortError(error)) return;
      setFormError(errorText(error, 'Schedule could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const runOperation = async (
    schedule: ManagedCloudScheduleTask,
    label: string,
    work: (signal: AbortSignal) => Promise<void>,
  ) => {
    setOperation((current) => ({ ...current, [schedule.id]: label }));
    setRowErrors((current) => ({ ...current, [schedule.id]: null }));
    try {
      await runAbortable(work);
    } catch (error) {
      if (isAbortError(error)) return;
      setRowErrors((current) => ({
        ...current,
        [schedule.id]: errorText(error, `Schedule ${label} failed.`),
      }));
    } finally {
      setOperation((current) => ({ ...current, [schedule.id]: null }));
    }
  };

  const toggleSchedule = (schedule: ManagedCloudScheduleTask) => {
    if (!schedulesEnabled && !schedule.isEnabled) {
      setRowErrors((current) => ({
        ...current,
        [schedule.id]: 'Upgrade to Basic or higher before resuming unattended runs.',
      }));
      return;
    }
    return runOperation(schedule, 'status update', async (signal) => {
      const updated = await api.setScheduleEnabled(schedule.id, !schedule.isEnabled, signal);
      assertRequestActive(signal);
      setSchedules((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
    });
  };

  const deleteSchedule = (schedule: ManagedCloudScheduleTask) => {
    if (!window.confirm(`Delete “${schedule.name}”? Its run history will also be removed.`)) return;
    void runOperation(schedule, 'deletion', async (signal) => {
      await api.deleteSchedule(schedule.id, signal);
      assertRequestActive(signal);
      setSchedules((current) => current.filter((candidate) => candidate.id !== schedule.id));
      setExpandedHistoryId((current) => (current === schedule.id ? null : current));
    });
  };

  const loadHistory = async (schedule: ManagedCloudScheduleTask, append = false) => {
    const current = historyById[schedule.id] ?? EMPTY_HISTORY;
    setHistoryById((all) => ({
      ...all,
      [schedule.id]: {
        ...current,
        status: append ? current.status : 'loading',
        loadingMore: append,
        error: null,
      },
    }));
    try {
      const result = await runAbortable((signal) =>
        api.listRuns(schedule.id, {
          limit: RUN_PAGE_SIZE,
          offset: append ? current.nextOffset : 0,
          signal,
        }),
      );
      setHistoryById((all) => ({
        ...all,
        [schedule.id]: {
          status: 'success',
          runs: append ? [...current.runs, ...result.runs] : result.runs,
          error: null,
          hasMore: result.hasMore,
          nextOffset: result.pagination.offset + result.pagination.limit,
          loadingMore: false,
        },
      }));
    } catch (error) {
      if (isAbortError(error)) return;
      setHistoryById((all) => ({
        ...all,
        [schedule.id]: {
          ...current,
          status: append ? current.status : 'error',
          error: errorText(error, 'Run history could not be loaded.'),
          loadingMore: false,
        },
      }));
    }
  };

  const toggleHistory = (schedule: ManagedCloudScheduleTask) => {
    if (expandedHistoryId === schedule.id) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(schedule.id);
    if (!historyById[schedule.id] || historyById[schedule.id]?.status === 'idle') {
      void loadHistory(schedule);
    }
  };

  const runNow = (schedule: ManagedCloudScheduleTask) => {
    if (!schedulesEnabled) {
      setRowErrors((current) => ({
        ...current,
        [schedule.id]: 'Upgrade to Basic or higher before running unattended tasks.',
      }));
      return;
    }
    return runOperation(schedule, 'manual run', async (signal) => {
      const idempotencyKey = manualRunKeys.current[schedule.id] ?? crypto.randomUUID();
      manualRunKeys.current[schedule.id] = idempotencyKey;
      const result = await api.runNow(schedule.id, idempotencyKey, signal);
      assertRequestActive(signal);
      delete manualRunKeys.current[schedule.id];
      setHistoryById((all) => {
        const current = all[schedule.id] ?? EMPTY_HISTORY;
        return {
          ...all,
          [schedule.id]: {
            ...current,
            status: 'success',
            runs: [result.run, ...current.runs.filter((run) => run.id !== result.run.id)],
          },
        };
      });
      const refreshed = await api.getSchedule(schedule.id, signal);
      assertRequestActive(signal);
      setSchedules((current) =>
        current.map((candidate) => (candidate.id === refreshed.id ? refreshed : candidate)),
      );
    });
  };

  const createBlockedReason = !schedulesEnabled
    ? plan === null
      ? 'Scheduling is disabled until your Cloud plan is confirmed.'
      : 'Upgrade to Basic or higher to create Managed Cloud schedules.'
    : scheduleLimitReached
      ? `This plan's ${scheduleLimit} schedule slots are in use.`
      : modelStatus === 'loading'
        ? 'The Managed Cloud model catalog is still loading.'
        : modelStatus === 'error'
          ? 'Retry the Managed Cloud model catalog before creating a schedule.'
          : modelOptions.length === 0
            ? 'No schedule-compatible Managed Cloud models are currently available.'
            : listStatus !== 'success'
              ? 'Wait for the account schedule list to finish loading.'
              : undefined;

  return (
    <div className="h-full overflow-y-auto px-6 py-6 text-[var(--chat-text-primary)]">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-2.5 py-1 text-xs text-[var(--chat-text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--chat-success)]" aria-hidden />
              Managed Cloud
            </div>
            <h1 className="font-serif text-xl font-medium">Schedules</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--chat-text-muted)]">
              Run self-contained text tasks once or on a recurring cadence. Times use IANA time
              zones and automatically follow daylight-saving changes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--chat-text-secondary)]">
              {['Text output', 'Managed models', 'No chat memory', 'No tools'].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-2.5 py-1"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            disabled={!canCreateSchedule}
            title={createBlockedReason}
            className={PRIMARY_BUTTON}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create schedule
          </button>
        </header>

        {!schedulesEnabled ? (
          <div
            role="status"
            className="rounded-xl border border-[var(--chat-warning)]/30 bg-[var(--chat-warning)]/5 p-4 text-sm text-[var(--chat-text-secondary)]"
          >
            <p className="font-medium text-[var(--chat-text-primary)]">
              Managed Cloud schedules are disabled for this plan
            </p>
            <p className="mt-1">
              {plan === null
                ? 'Your Cloud plan is still loading or could not be confirmed. Scheduling stays disabled until account entitlements are available.'
                : 'Free does not include unattended scheduled runs. Upgrade to Basic or higher to create, resume, edit, or run schedules.'}
            </p>
          </div>
        ) : scheduleLimit !== null ? (
          <div
            role="status"
            className="rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-3 text-sm text-[var(--chat-text-secondary)]"
          >
            <span className="font-medium text-[var(--chat-text-primary)]">
              {Math.min(schedules.length, scheduleLimit)} of {scheduleLimit} schedule slots used
            </span>
            {scheduleLimitReached ? (
              <span> · Delete a schedule or upgrade before creating another.</span>
            ) : null}
          </div>
        ) : null}

        {schedulesEnabled && modelStatus === 'loading' ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-3 text-sm text-[var(--chat-text-muted)]"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading schedule-compatible Managed Cloud models…
          </div>
        ) : null}

        {schedulesEnabled && modelStatus === 'error' ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--chat-destructive)]/30 bg-[var(--chat-destructive)]/5 p-4 text-sm text-[var(--chat-destructive)]"
          >
            <span>{modelError ?? 'Managed model catalog could not be loaded.'}</span>
            <button
              type="button"
              onClick={() => void loadModelCatalog()}
              className={SECONDARY_BUTTON}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Retry models
            </button>
          </div>
        ) : null}

        {schedulesEnabled && modelStatus === 'success' && modelOptions.length === 0 ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--chat-warning)]/30 bg-[var(--chat-warning)]/5 p-4 text-sm text-[var(--chat-text-secondary)]"
          >
            <span>No schedule-compatible Managed Cloud models are currently available.</span>
            <button
              type="button"
              onClick={() => void loadModelCatalog()}
              className={SECONDARY_BUTTON}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Retry models
            </button>
          </div>
        ) : null}

        {listError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--chat-destructive)]/30 bg-[var(--chat-destructive)]/5 p-4 text-sm text-[var(--chat-destructive)]"
          >
            <span>{listError}</span>
            <button type="button" onClick={() => void loadSchedules()} className={SECONDARY_BUTTON}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Retry
            </button>
          </div>
        ) : null}

        {listStatus === 'loading' && schedules.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-[var(--chat-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading schedules…
          </div>
        ) : listStatus !== 'error' && schedules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--chat-border)] px-6 py-16 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-[var(--chat-text-muted)]" aria-hidden />
            <p className="mt-3 text-sm font-medium">No schedules yet</p>
            <p className="mt-1 text-sm text-[var(--chat-text-muted)]">
              Create a recurring brief, reminder, or unattended text task.
            </p>
            <button
              type="button"
              onClick={openCreate}
              disabled={!canCreateSchedule}
              title={createBlockedReason}
              className={`${PRIMARY_BUTTON} mt-4`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create schedule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => {
              const busy = operation[schedule.id];
              const expanded = expandedHistoryId === schedule.id;
              const historyState = historyById[schedule.id] ?? EMPTY_HISTORY;
              return (
                <article
                  key={schedule.id}
                  className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]"
                >
                  <div className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-sm font-semibold">{schedule.name}</h2>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              schedule.isEnabled
                                ? 'bg-[var(--chat-success)]/10 text-[var(--chat-success)]'
                                : 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]'
                            }`}
                          >
                            {schedule.isEnabled ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        {schedule.description ? (
                          <p className="mt-1 text-xs text-[var(--chat-text-muted)]">
                            {schedule.description}
                          </p>
                        ) : null}
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--chat-text-secondary)]">
                          {schedule.prompt}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--chat-text-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden />
                            {recurrenceLabel(schedule)}
                          </span>
                          <span>
                            Next: {dateTimeLabel(schedule.nextExecutionAt, schedule.timezone)}
                          </span>
                          <span>
                            Last: {dateTimeLabel(schedule.lastExecutedAt, schedule.timezone)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void toggleSchedule(schedule)}
                          disabled={Boolean(busy) || (!schedulesEnabled && !schedule.isEnabled)}
                          title={
                            !schedulesEnabled && !schedule.isEnabled
                              ? 'Upgrade to Basic or higher to resume this schedule.'
                              : undefined
                          }
                          className={SECONDARY_BUTTON}
                        >
                          {busy === 'status update' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : null}
                          {schedule.isEnabled ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runNow(schedule)}
                          disabled={Boolean(busy) || !schedulesEnabled}
                          title={
                            !schedulesEnabled
                              ? 'Upgrade to Basic or higher to run this schedule.'
                              : undefined
                          }
                          className={SECONDARY_BUTTON}
                        >
                          {busy === 'manual run' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Play className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Run now
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleHistory(schedule)}
                          className={SECONDARY_BUTTON}
                          aria-expanded={expanded}
                        >
                          <History className="h-3.5 w-3.5" aria-hidden />
                          History
                          {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${schedule.name}`}
                          title="Edit schedule"
                          onClick={() => openEdit(schedule)}
                          disabled={Boolean(busy) || !schedulesEnabled || !modelCatalogReady}
                          className={SECONDARY_BUTTON}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${schedule.name}`}
                          title="Delete schedule"
                          onClick={() => deleteSchedule(schedule)}
                          disabled={Boolean(busy)}
                          className={`${SECONDARY_BUTTON} hover:border-[var(--chat-destructive)]/40 hover:text-[var(--chat-destructive)]`}
                        >
                          {busy === 'deletion' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      </div>
                    </div>
                    {rowErrors[schedule.id] ? (
                      <p role="alert" className="mt-3 text-xs text-[var(--chat-destructive)]">
                        {rowErrors[schedule.id]}
                      </p>
                    ) : null}
                    {schedule.lastError ? (
                      <p className="mt-3 rounded-lg bg-[var(--chat-destructive)]/5 px-3 py-2 text-xs text-[var(--chat-destructive)]">
                        Last error: {schedule.lastError}
                      </p>
                    ) : null}
                  </div>

                  {expanded ? (
                    <div className="border-t border-[var(--chat-border)] px-4 py-3">
                      {historyState.status === 'loading' ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-[var(--chat-text-muted)]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          Loading run history…
                        </div>
                      ) : historyState.error ? (
                        <div className="flex items-center justify-between gap-3 py-2 text-xs text-[var(--chat-destructive)]">
                          <span>{historyState.error}</span>
                          <button
                            type="button"
                            onClick={() => void loadHistory(schedule)}
                            className={SECONDARY_BUTTON}
                          >
                            Retry
                          </button>
                        </div>
                      ) : historyState.runs.length === 0 ? (
                        <p className="py-3 text-xs text-[var(--chat-text-muted)]">
                          This schedule has not run yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {historyState.runs.map((run) => (
                            <div
                              key={run.id}
                              className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-base)] p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span
                                  className={
                                    run.status === 'success'
                                      ? 'font-medium text-[var(--chat-success)]'
                                      : run.status === 'running'
                                        ? 'font-medium text-[var(--chat-info)]'
                                        : 'font-medium text-[var(--chat-destructive)]'
                                  }
                                >
                                  {run.status}
                                </span>
                                <span className="text-[var(--chat-text-muted)]">
                                  {dateTimeLabel(run.startedAt)} · {durationLabel(run.durationMs)}
                                </span>
                              </div>
                              {runResultText(run) ? (
                                <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--chat-text-secondary)]">
                                  {runResultText(run)}
                                </p>
                              ) : null}
                              {run.error ? (
                                <p className="mt-2 text-xs text-[var(--chat-destructive)]">
                                  {run.error}
                                </p>
                              ) : null}
                            </div>
                          ))}
                          {historyState.hasMore ? (
                            <button
                              type="button"
                              onClick={() => void loadHistory(schedule, true)}
                              disabled={historyState.loadingMore}
                              className={SECONDARY_BUTTON}
                            >
                              {historyState.loadingMore ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : null}
                              Show more runs
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {hasMore ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadSchedules(true, nextOffset)}
            className={`${SECONDARY_BUTTON} self-center`}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Show more schedules
          </button>
        ) : null}
      </div>

      {editorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--chat-surface-overlay)]/80 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !saving) setEditorOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-schedule-editor-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-5 shadow-2xl"
          >
            <div className="mb-5">
              <h2 id="cloud-schedule-editor-title" className="text-base font-semibold">
                {editing ? 'Edit schedule' : 'Create schedule'}
              </h2>
              <p className="mt-1 text-sm text-[var(--chat-text-muted)]">
                The task runs in Managed Cloud without chat memory or tools.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  Name
                </span>
                <input
                  value={draft.name}
                  maxLength={500}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  Description
                </span>
                <input
                  value={draft.description}
                  maxLength={2_000}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  Prompt / task
                </span>
                <textarea
                  value={draft.prompt}
                  rows={5}
                  maxLength={10_000}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, prompt: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  Model
                </span>
                <select
                  value={draft.model}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, model: event.target.value }))
                  }
                  className={FIELD_CLASS}
                >
                  {draft.model === '' ? <option value="">Select a model</option> : null}
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  Cadence
                </span>
                <select
                  value={draft.recurrence}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      recurrence: event.target.value as ManagedCloudScheduleRecurrence,
                    }))
                  }
                  className={FIELD_CLASS}
                >
                  <option value="once">One time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="interval">Interval</option>
                  <option value="custom">Custom cron</option>
                </select>
              </label>

              {draft.recurrence === 'once' ? (
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                    Run at
                  </span>
                  <input
                    type="datetime-local"
                    value={draft.scheduledLocal}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, scheduledLocal: event.target.value }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
              ) : null}
              {['daily', 'weekly', 'monthly'].includes(draft.recurrence) ? (
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                    Time of day
                  </span>
                  <input
                    type="time"
                    value={draft.timeOfDay}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, timeOfDay: event.target.value }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
              ) : null}
              {draft.recurrence === 'monthly' ? (
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                    Day of month
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={draft.dayOfMonth}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, dayOfMonth: event.target.value }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
              ) : null}
              {draft.recurrence === 'interval' ? (
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                    Repeat every
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={draft.intervalValue}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, intervalValue: event.target.value }))
                      }
                      className={FIELD_CLASS}
                    />
                    <span className="flex items-center text-sm text-[var(--chat-text-muted)]">
                      days
                    </span>
                  </div>
                </label>
              ) : null}
              {draft.recurrence === 'custom' ? (
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                    Cron expression
                  </span>
                  <input
                    value={draft.cronExpression}
                    placeholder="0 9 * * 1-5"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, cronExpression: event.target.value }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
              ) : null}
              {draft.recurrence === 'weekly' ? (
                <fieldset className="sm:col-span-2">
                  <legend className="mb-2 text-xs font-medium text-[var(--chat-text-secondary)]">
                    Days of week
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => {
                      const selected = draft.daysOfWeek.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              daysOfWeek: selected
                                ? current.daysOfWeek.filter((value) => value !== day.value)
                                : [...current.daysOfWeek, day.value],
                            }))
                          }
                          className={
                            selected
                              ? 'rounded-lg border border-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/10 px-3 py-1.5 text-xs font-medium text-[var(--chat-accent-primary)]'
                              : 'rounded-lg border border-[var(--chat-border)] px-3 py-1.5 text-xs text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)]'
                          }
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  IANA time zone
                </span>
                <input
                  value={draft.timezone}
                  placeholder="America/Chicago"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, timezone: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  Expires at (optional)
                </span>
                <input
                  type="datetime-local"
                  value={draft.expiresLocal}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, expiresLocal: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]">
                  Maximum executions (optional)
                </span>
                <input
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={draft.maxExecutions}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, maxExecutions: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label className="flex items-center gap-2 self-end rounded-lg border border-[var(--chat-border)] px-3 py-2">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, isActive: event.target.checked }))
                  }
                  className="accent-[var(--chat-accent-primary)]"
                />
                <span className="text-sm text-[var(--chat-text-secondary)]">Enabled</span>
              </label>
            </div>

            {formError ? (
              <p role="alert" className="mt-4 text-sm text-[var(--chat-destructive)]">
                {formError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditorOpen(false)}
                className={SECONDARY_BUTTON}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  !schedulesEnabled ||
                  !modelCatalogReady ||
                  (!editing && scheduleLimitReached)
                }
                onClick={() => void save()}
                className={PRIMARY_BUTTON}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {editing ? 'Save changes' : 'Create schedule'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SignedOutDesktopCloudSchedules() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-6 text-center">
      <CalendarClock className="mb-3 h-8 w-8 text-[var(--chat-text-muted)]" aria-hidden />
      <p className="text-base font-semibold text-[var(--chat-text-primary)]">
        Sign in to manage Cloud schedules
      </p>
      <p className="mt-2 max-w-md text-sm text-[var(--chat-text-muted)]">
        Managed schedules are account-owned runs that continue while Desktop is closed. Local
        schedules stay on this device and remain available in Local mode.
      </p>
    </div>
  );
}

export function DesktopCloudSchedules({
  api = desktopCloudSchedules,
  loadModels = loadDesktopCloudScheduleModels,
}: DesktopCloudSchedulesProps) {
  const isSignedIn = useAuthStore(selectHasCloudAccountSession);
  const accountId = useAuthStore((state) => state.user?.id ?? null);
  const cloudSessionEpoch = useAuthStore((state) => state.cloudSessionEpoch);
  const plan = useAuthStore((state) => state.plan);

  if (!isSignedIn || !accountId) return <SignedOutDesktopCloudSchedules />;

  return (
    <AuthenticatedDesktopCloudSchedules
      key={`${accountId}:${cloudSessionEpoch}`}
      api={api}
      loadModels={loadModels}
      plan={plan}
    />
  );
}

export default DesktopCloudSchedules;
