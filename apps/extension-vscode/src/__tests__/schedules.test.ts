import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as vscode from 'vscode';
import type {
  ManagedCloudScheduleRun,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import {
  SCHEDULES_VIEW_ID,
  ScheduleTreeItem,
  SchedulesTreeProvider,
  readScheduleCommandArgument,
} from '../features/schedules/schedulesTree';
import {
  describeScheduleFailure,
  isRecoverableScheduleFailure,
  scheduleCadence,
  scheduleContextValue,
  scheduleDescription,
  scheduleLastRunLabel,
  scheduleNextRunLabel,
  scheduleRunDetail,
} from '../features/schedules/schedulePresentation';
import {
  PAUSE_SCHEDULE_COMMAND,
  RESUME_SCHEDULE_COMMAND,
  RUN_SCHEDULE_NOW_COMMAND,
  SHOW_SCHEDULE_RUNS_COMMAND,
  runScheduleNowInteractively,
  schedulesWebUrl,
  setScheduleEnabledInteractively,
  showScheduleRuns,
} from '../features/schedules/scheduleActions';
import { createExtensionSchedulesClient } from '../features/schedules/scheduleClient';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');

function makeSchedule(overrides: Partial<ManagedCloudScheduleTask> = {}): ManagedCloudScheduleTask {
  return {
    id: 'sched_1',
    userId: 'user_1',
    name: 'Morning digest',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    executeAt: null,
    intervalMs: null,
    timezone: 'America/Chicago',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 3,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Summarize my inbox',
    model: 'model-under-test',
    status: 'active',
    lastExecutedAt: null,
    nextExecutionAt: '2026-09-13T14:00:00.000Z',
    lastError: null,
    metadata: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-13T11:00:00.000Z',
    ...overrides,
  };
}

function makeRun(overrides: Partial<ManagedCloudScheduleRun> = {}): ManagedCloudScheduleRun {
  return {
    id: 'run_1',
    taskId: 'sched_1',
    status: 'success',
    triggerSource: 'schedule',
    scheduledFor: '2026-09-13T09:00:00.000Z',
    startedAt: '2026-09-13T09:00:01.000Z',
    completedAt: '2026-09-13T09:00:31.000Z',
    durationMs: 30_000,
    result: null,
    error: null,
    idempotencyKey: 'key_1',
    leaseExpiresAt: null,
    attemptCount: 1,
    ...overrides,
  };
}

import { SCHEDULE_ROW_ACTIONS, SCHEDULE_TITLE_ACTIONS } from '../features/surfaces';

describe('schedule presentation', () => {
  it('names the status, the cadence, the next run and the last run', () => {
    expect(scheduleDescription(makeSchedule(), NOW)).toBe(
      'Active · 0 9 * * * · next in 2h · never run',
    );
  });

  it('says a paused schedule has no next run rather than that it is due', () => {
    const paused = makeSchedule({ status: 'paused', isEnabled: false, nextExecutionAt: null });

    expect(scheduleNextRunLabel(paused, NOW)).toBe('no next run');
    expect(scheduleContextValue(paused)).toBe('schedulePaused');
    expect(scheduleContextValue(makeSchedule())).toBe('scheduleActive');
  });

  it('reports a failed last run instead of its timestamp', () => {
    expect(
      scheduleLastRunLabel(
        makeSchedule({ lastExecutedAt: '2026-09-13T09:00:00.000Z', lastError: 'model refused' }),
      ),
    ).toBe('last run failed');
  });

  it('reads each schedule type back as the cadence the account set', () => {
    expect(scheduleCadence(makeSchedule())).toBe('0 9 * * *');
    expect(
      scheduleCadence(
        makeSchedule({ scheduleType: 'interval', cronExpression: null, intervalMs: 900_000 }),
      ),
    ).toBe('Every 15m');
    expect(
      scheduleCadence(
        makeSchedule({ scheduleType: 'interval', cronExpression: null, intervalMs: null }),
      ),
    ).toBe('On an interval');
  });

  it('names a manual run as run now and keeps the servers error text', () => {
    expect(scheduleRunDetail(makeRun({ triggerSource: 'manual' }))).toBe('run now · 30s');
    expect(scheduleRunDetail(makeRun({ status: 'failed', error: 'quota exhausted' }))).toContain(
      'quota exhausted',
    );
  });

  it('explains the failures a user can do something about', () => {
    expect(describeScheduleFailure({ status: 404 })).toBe('this schedule no longer exists');
    expect(describeScheduleFailure({ status: 409 })).toBe('this schedule is already running');
    expect(describeScheduleFailure(new Error('  '))).toBe('AGI Cloud gave no reason');
    expect(isRecoverableScheduleFailure({ status: 404 })).toBe(false);
    expect(isRecoverableScheduleFailure({ status: 500 })).toBe(true);
  });
});

describe('schedules tree', () => {
  it('renders a schedule with its own id, status icon and open command', () => {
    const item = new ScheduleTreeItem(makeSchedule());

    expect(item.id).toBe('sched_1');
    expect(item.label).toBe('Morning digest');
    expect(item.contextValue).toBe('scheduleActive');
    expect(item.command?.arguments).toEqual(['sched_1']);
    expect(String(item.tooltip)).toContain('America/Chicago');
    expect(String(item.tooltip)).toContain('3 runs so far');
  });

  it('asks the user to sign in rather than showing an empty list', async () => {
    const provider = new SchedulesTreeProvider(() => Promise.resolve({ status: 'signed-out' }));
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Sign in to see your schedules');
      expect(notice?.command?.command).toBe('agi-workforce.signIn');
    } finally {
      provider.dispose();
    }
  });

  it('offers a retry with the reason when the listing fails', async () => {
    const client = { listSchedules: vi.fn().mockRejectedValue({ status: 503, message: 'down' }) };
    const provider = new SchedulesTreeProvider(() => Promise.resolve({ status: 'ready', client }));
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Schedules could not be loaded');
      expect(notice?.command?.command).toBe('agi-workforce.refreshSchedules');
    } finally {
      provider.dispose();
    }
  });

  it('only accepts a tree item that carries a schedule', () => {
    expect(readScheduleCommandArgument(new ScheduleTreeItem(makeSchedule()))?.id).toBe('sched_1');
    expect(readScheduleCommandArgument({ task: { id: '' } })).toBeUndefined();
    expect(readScheduleCommandArgument('sched_1')).toBeUndefined();
  });
});

describe('schedule actions', () => {
  const host = { onChanged: vi.fn() };

  beforeEach(() => {
    vi.mocked(vscode.window.showWarningMessage).mockReset().mockResolvedValue(undefined);
    vi.mocked(vscode.window.showQuickPick).mockReset().mockResolvedValue(undefined);
    vi.mocked(vscode.window.showInformationMessage).mockReset().mockResolvedValue(undefined);
    vi.mocked(vscode.window.showErrorMessage).mockReset().mockResolvedValue(undefined);
    host.onChanged.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pauses through the hosted endpoint and refreshes the view', async () => {
    const client = { setScheduleEnabled: vi.fn().mockResolvedValue(makeSchedule()) };

    await setScheduleEnabledInteractively(client, makeSchedule(), false, host);

    expect(client.setScheduleEnabled).toHaveBeenCalledWith('sched_1', false);
    expect(host.onChanged).toHaveBeenCalled();
  });

  it('resumes with the opposite flag', async () => {
    const client = { setScheduleEnabled: vi.fn().mockResolvedValue(makeSchedule()) };

    await setScheduleEnabledInteractively(client, makeSchedule(), true, host);

    expect(client.setScheduleEnabled).toHaveBeenCalledWith('sched_1', true);
  });

  it('spends nothing when the run-now confirmation is declined', async () => {
    const client = { runNow: vi.fn() };

    await runScheduleNowInteractively(client, makeSchedule(), host);

    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    expect(client.runNow).not.toHaveBeenCalled();
  });

  it('names the account and its allowance before running one early', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Run it now');
    const client = { runNow: vi.fn().mockResolvedValue({ run: makeRun(), replay: false }) };

    await runScheduleNowInteractively(client, makeSchedule(), host);

    const detail = vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[1] as {
      detail?: string;
    };
    expect(detail?.detail).toContain('usage allowance');
    expect(detail?.detail).toContain('does not replace the next scheduled run');
    const [scheduleId, idempotencyKey] = client.runNow.mock.calls[0] as [string, string];
    expect(scheduleId).toBe('sched_1');
    expect(idempotencyKey).not.toBe('');
  });

  it('says a schedule has not run yet instead of showing an empty picker', async () => {
    const client = { listRuns: vi.fn().mockResolvedValue({ runs: [], hasMore: false }) };

    await showScheduleRuns(client, makeSchedule(), host);

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showInformationMessage).mock.calls[0]?.[0]).toContain(
      'has not run yet',
    );
  });

  it('lists the run history newest first with each runs outcome', async () => {
    const client = {
      listRuns: vi
        .fn()
        .mockResolvedValue({ runs: [makeRun(), makeRun({ id: 'run_0', status: 'failed' })] }),
    };

    await showScheduleRuns(client, makeSchedule(), host);

    expect(client.listRuns).toHaveBeenCalledWith('sched_1', { limit: 20, offset: 0 });
    const items = vi.mocked(vscode.window.showQuickPick).mock.calls[0]?.[0] as {
      label: string;
    }[];
    expect(items).toHaveLength(2);
    expect(items[0]?.label).toContain('Succeeded');
    expect(items[1]?.label).toContain('Failed');
  });

  it('points at the web list for editing, not a fabricated per-schedule page', () => {
    expect(schedulesWebUrl('https://agiworkforce.com')).toBe(
      'https://agiworkforce.com/chat/schedules?from=vscode-extension',
    );
  });
});

describe('schedules client', () => {
  it('carries the account token and the surface on every schedules request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ schedules: [], pagination: { limit: 25, offset: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchImpl);

    await createExtensionSchedulesClient('account-token').listSchedules({ limit: 25, offset: 0 });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/schedules?limit=25&offset=0');
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer account-token');
    expect(headers['x-agi-surface']).toBe('vscode');
    vi.unstubAllGlobals();
  });
});

describe('schedules manifest', () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
    contributes: {
      commands: { command: string; icon?: string }[];
      views: { 'agi-workforce-sidebar': { id: string; name: string }[] };
    };
  };

  it('no longer contributes a schedules tree beside the chat', () => {
    expect(
      manifest.contributes.views['agi-workforce-sidebar'].find(
        (entry) => entry.id === SCHEDULES_VIEW_ID,
      ),
    ).toBeUndefined();
  });

  it('declares every schedule command the surface invokes, each with an icon', () => {
    const declared = manifest.contributes.commands;
    for (const command of [
      'agi-workforce.showSchedules',
      'agi-workforce.refreshSchedules',
      'agi-workforce.openSchedulesOnWeb',
      PAUSE_SCHEDULE_COMMAND,
      RESUME_SCHEDULE_COMMAND,
      RUN_SCHEDULE_NOW_COMMAND,
      SHOW_SCHEDULE_RUNS_COMMAND,
    ]) {
      expect(declared.find((entry) => entry.command === command)?.icon).toBeTruthy();
    }
  });

  it('shows pause only on an active row and resume only on a paused one', () => {
    const matcher = (command: string) =>
      SCHEDULE_ROW_ACTIONS.find((action) => action.command === command);

    expect(matcher(PAUSE_SCHEDULE_COMMAND)?.matches('scheduleActive')).toBe(true);
    expect(matcher(PAUSE_SCHEDULE_COMMAND)?.matches('schedulePaused')).toBe(false);
    expect(matcher(RESUME_SCHEDULE_COMMAND)?.matches('schedulePaused')).toBe(true);
    for (const command of [RUN_SCHEDULE_NOW_COMMAND, SHOW_SCHEDULE_RUNS_COMMAND]) {
      expect(matcher(command)?.matches('scheduleActive')).toBe(true);
    }
  });

  it('keeps refresh and open-on-web on the schedules surface', () => {
    expect(SCHEDULE_TITLE_ACTIONS.map((action) => action.command)).toEqual([
      'agi-workforce.refreshSchedules',
      'agi-workforce.openSchedulesOnWeb',
    ]);
  });
});
