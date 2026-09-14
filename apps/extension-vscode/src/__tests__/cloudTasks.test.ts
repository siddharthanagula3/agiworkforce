import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as vscode from 'vscode';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  CLOUD_TASKS_REFRESH_INTERVAL_MS,
  CloudRunTreeItem,
  CloudTasksTreeProvider,
} from '../features/cloud-tasks/cloudTasksTree';
import {
  buildCloudRunDetailItems,
  cloudRunWebUrl,
  decideCloudRunApproval,
  describeCloudRunFailure,
  type CloudRunDetailClient,
} from '../features/cloud-tasks/cloudRunDetail';
import {
  APPROVE_CLOUD_TASK_COMMAND,
  REJECT_CLOUD_TASK_COMMAND,
  decideCloudRunApprovalInteractively,
  isRecoverableCloudRunFailure,
  readCloudRunCommandArgument,
} from '../features/cloud-tasks/cloudRunApproval';
import {
  cloudRunDescription,
  cloudRunQuietLabel,
  readCloudRunSteps,
} from '../features/cloud-tasks/cloudRunPresentation';
import { CLOUD_TASK_ROW_ACTIONS } from '../features/surfaces';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');

function makeRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    userId: 'user_1',
    requestId: 'req_00000001',
    conversationId: 'conv_1',
    conversationTitle: 'Migrate the billing ledger',
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'running',
    provider: 'anthropic',
    model: 'model-under-test',
    lastEventSequence: 4,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: '2026-09-13T11:00:00.000Z',
    updatedAt: '2026-09-13T11:58:00.000Z',
    ...overrides,
  };
}

const PENDING_APPROVAL = {
  requestedAt: '2026-09-13T11:58:00.000Z',
  toolCalls: [
    { toolCallId: 'call_1', name: 'run_command', argsPreview: 'pnpm db:migrate -- apply' },
  ],
};

function makeDetailClient(run: CloudAgentRun, events: AgentEventEnvelope[] = []) {
  return {
    getRun: vi.fn().mockResolvedValue({ run, events, nextAfterSequence: run.lastEventSequence }),
    resumeRun: vi.fn().mockResolvedValue(undefined),
    cancelRun: vi.fn().mockResolvedValue(run),
  } satisfies CloudRunDetailClient & Record<string, unknown>;
}

describe('cloud task presentation', () => {
  it('names the state, the age and the quiet time the server measured', () => {
    const description = cloudRunDescription(makeRun({ staleForMs: 90_000 }), NOW);

    expect(description).toBe('Running · updated 2m ago · quiet 1m');
  });

  it('says nothing about quiet time when the server reports none', () => {
    expect(cloudRunQuietLabel(makeRun())).toBeUndefined();
  });

  it('never claims a settled run is quiet', () => {
    expect(
      cloudRunQuietLabel(
        makeRun({
          state: 'completed',
          completedAt: '2026-09-13T11:59:00.000Z',
          staleForMs: 60_000,
        }),
      ),
    ).toBeUndefined();
  });

  it('reads one plan step per progress id and keeps the latest status', () => {
    const events = [
      envelope(0, {
        type: 'progress-update',
        progressId: 'p1',
        summary: 'Read the schema',
        status: 'running',
      }),
      envelope(1, {
        type: 'progress-update',
        progressId: 'p2',
        summary: 'Write the migration',
        status: 'running',
      }),
      envelope(2, {
        type: 'progress-update',
        progressId: 'p1',
        summary: 'Read the schema',
        status: 'completed',
      }),
    ];

    expect(readCloudRunSteps(events)).toEqual([
      { id: 'p1', summary: 'Read the schema', status: 'completed' },
      { id: 'p2', summary: 'Write the migration', status: 'running' },
    ]);
  });
});

describe('cloud tasks tree', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders one item per run and opens it through the cloud task command', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const provider = new CloudTasksTreeProvider(() =>
      Promise.resolve({
        status: 'ready',
        client: { listRuns: vi.fn().mockResolvedValue({ runs: [run], nextCursor: null }) },
      }),
    );

    const [item] = (await provider.getChildren()) as CloudRunTreeItem[];

    expect(item?.label).toBe('Migrate the billing ledger');
    expect(item?.contextValue).toBe('cloudRunPendingApproval');
    expect(item?.command).toEqual({
      command: 'agi-workforce.openCloudTask',
      title: 'Open Cloud Task',
      arguments: [run.id],
    });
    provider.dispose();
  });

  it('offers sign-in instead of an empty list when no account is connected', async () => {
    const provider = new CloudTasksTreeProvider(() => Promise.resolve({ status: 'signed-out' }));

    const [item] = await provider.getChildren();

    expect(item?.label).toBe('Sign in to see your cloud tasks');
    expect(item?.command).toEqual({
      command: 'agi-workforce.signIn',
      title: 'Sign in to AGI Cloud',
    });
    provider.dispose();
  });

  it('reports a failed listing instead of claiming the account has no tasks', async () => {
    const provider = new CloudTasksTreeProvider(() =>
      Promise.resolve({
        status: 'ready',
        client: { listRuns: vi.fn().mockRejectedValue(new Error('HTTP 503: upstream is down')) },
      }),
    );

    const [item] = await provider.getChildren();

    expect(item?.label).toBe('Cloud tasks could not be loaded');
    expect(item?.tooltip).toBe('HTTP 503: upstream is down');
    provider.dispose();
  });

  it('polls only while the view is visible', () => {
    const provider = new CloudTasksTreeProvider(() => Promise.resolve({ status: 'signed-out' }));
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);

    vi.advanceTimersByTime(CLOUD_TASKS_REFRESH_INTERVAL_MS * 2);
    expect(changed).not.toHaveBeenCalled();

    provider.setAutoRefreshEnabled(true);
    vi.advanceTimersByTime(CLOUD_TASKS_REFRESH_INTERVAL_MS * 2);
    expect(changed).toHaveBeenCalledTimes(2);

    provider.setAutoRefreshEnabled(false);
    vi.advanceTimersByTime(CLOUD_TASKS_REFRESH_INTERVAL_MS * 2);
    expect(changed).toHaveBeenCalledTimes(2);
    provider.dispose();
  });
});

describe('cloud task detail', () => {
  it('sends one approval decision per pending tool call', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const client = makeDetailClient(run);

    await expect(decideCloudRunApproval(client, run, 'approved')).resolves.toBe(true);

    expect(client.resumeRun).toHaveBeenCalledWith(
      run.id,
      [{ toolCallId: 'call_1', decision: 'approved' }],
      {},
    );
  });

  it('sends nothing when the run has no pending approval', async () => {
    const run = makeRun();
    const client = makeDetailClient(run);

    await expect(decideCloudRunApproval(client, run, 'approved')).resolves.toBe(false);
    expect(client.resumeRun).not.toHaveBeenCalled();
  });

  it('offers approve, reject, stop and the web link for a blocked run', () => {
    const run = makeRun({ state: 'awaiting_input', pendingApproval: PENDING_APPROVAL });

    const actions = buildCloudRunDetailItems(run, []).map((item) => item.action);

    expect(actions.filter((action) => action !== undefined)).toEqual([
      'approve',
      'reject',
      'cancel',
      'open-web',
    ]);
  });

  it('does not offer to stop a run that already finished', () => {
    const run = makeRun({ state: 'completed', completedAt: '2026-09-13T11:59:00.000Z' });

    const actions = buildCloudRunDetailItems(run, []).map((item) => item.action);

    expect(actions).not.toContain('cancel');
  });

  it('links a run to its conversation, and to the task list when it has none', () => {
    expect(cloudRunWebUrl(makeRun(), 'https://agiworkforce.com')).toBe(
      'https://agiworkforce.com/chat/conv_1?from=vscode-extension',
    );
    expect(cloudRunWebUrl(makeRun({ conversationId: null }), 'https://agiworkforce.com')).toBe(
      'https://agiworkforce.com/tasks?from=vscode-extension',
    );
  });

  it('explains a decision another device already answered', () => {
    expect(describeCloudRunFailure(Object.assign(new Error('HTTP 409'), { status: 409 }))).toBe(
      'another device already answered this one',
    );
    expect(describeCloudRunFailure(Object.assign(new Error('HTTP 410'), { status: 410 }))).toBe(
      'the approval expired, so the task cannot continue from it',
    );
  });
});

function envelope(sequence: number, event: AgentEventEnvelope['event']): AgentEventEnvelope {
  return { turnId: 'turn_1', sequence, event } as AgentEventEnvelope;
}

describe('cloud task inline approval', () => {
  beforeEach(() => {
    vi.mocked(vscode.window.showWarningMessage).mockReset().mockResolvedValue(undefined);
    vi.mocked(vscode.window.showInputBox).mockReset().mockResolvedValue(undefined);
    vi.mocked(vscode.window.showErrorMessage).mockReset().mockResolvedValue(undefined);
    vi.mocked(vscode.window.showInformationMessage).mockReset().mockResolvedValue(undefined);
  });

  it('reads the run off the tree item the inline button hands the command', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const provider = new CloudTasksTreeProvider(() =>
      Promise.resolve({
        status: 'ready',
        client: { listRuns: vi.fn().mockResolvedValue({ runs: [run], nextCursor: null }) },
      }),
    );
    const [item] = (await provider.getChildren()) as CloudRunTreeItem[];

    expect(readCloudRunCommandArgument(item)?.id).toBe(run.id);
    expect(readCloudRunCommandArgument(undefined)).toBeUndefined();
    expect(readCloudRunCommandArgument({ run: { id: '' } })).toBeUndefined();
    provider.dispose();
  });

  it('names the tools before it lets the cloud run them, and sends nothing when declined', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const client = makeDetailClient(run);
    const onChanged = vi.fn();

    await decideCloudRunApprovalInteractively(client, run, 'approved', { onChanged });

    const [question, options] = vi.mocked(vscode.window.showWarningMessage).mock.calls[0] ?? [];
    expect(question).toBe('Let this task run run_command?');
    expect((options as { modal?: boolean; detail?: string }).modal).toBe(true);
    expect((options as { detail: string }).detail).toContain('cannot be taken back');
    expect((options as { detail: string }).detail).toContain('pnpm db:migrate -- apply');
    expect(client.resumeRun).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('sends the approval once the consequence is confirmed', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const client = makeDetailClient(run);
    const onChanged = vi.fn();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Approve and continue');

    await decideCloudRunApprovalInteractively(client, run, 'approved', { onChanged });

    expect(client.resumeRun).toHaveBeenCalledWith(
      run.id,
      [{ toolCallId: 'call_1', decision: 'approved' }],
      {},
    );
    expect(vscode.window.withProgress).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it('carries an optional rejection reason to the run as guidance', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const client = makeDetailClient(run);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('  run it on staging first  ');

    await decideCloudRunApprovalInteractively(client, run, 'rejected', { onChanged: vi.fn() });

    expect(client.resumeRun).toHaveBeenCalledWith(
      run.id,
      [{ toolCallId: 'call_1', decision: 'rejected' }],
      { guidance: 'run it on staging first' },
    );
  });

  it('rejects without guidance when the reason is left empty, and keeps waiting on escape', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const empty = makeDetailClient(run);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('');
    await decideCloudRunApprovalInteractively(empty, run, 'rejected', { onChanged: vi.fn() });
    expect(empty.resumeRun).toHaveBeenCalledWith(
      run.id,
      [{ toolCallId: 'call_1', decision: 'rejected' }],
      {},
    );

    const escaped = makeDetailClient(run);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
    await decideCloudRunApprovalInteractively(escaped, run, 'rejected', { onChanged: vi.fn() });
    expect(escaped.resumeRun).not.toHaveBeenCalled();
  });

  it('offers a retry that resends the same decision after a transient failure', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const client = makeDetailClient(run);
    client.resumeRun
      .mockRejectedValueOnce(new Error('HTTP 503: upstream is down'))
      .mockResolvedValueOnce(undefined);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Approve and continue');
    vi.mocked(vscode.window.showErrorMessage).mockResolvedValueOnce('Retry');

    await decideCloudRunApprovalInteractively(client, run, 'approved', { onChanged: vi.fn() });

    expect(client.resumeRun).toHaveBeenCalledTimes(2);
    expect(vi.mocked(vscode.window.showErrorMessage).mock.calls[0]?.[0]).toContain(
      'HTTP 503: upstream is down',
    );
  });

  it('does not offer a retry for a decision another device already answered', async () => {
    const run = makeRun({ pendingApproval: PENDING_APPROVAL });
    const client = makeDetailClient(run);
    client.resumeRun.mockRejectedValue(Object.assign(new Error('HTTP 409'), { status: 409 }));
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Approve and continue');

    await decideCloudRunApprovalInteractively(client, run, 'approved', { onChanged: vi.fn() });

    expect(vi.mocked(vscode.window.showErrorMessage).mock.calls[0]).toHaveLength(1);
    expect(isRecoverableCloudRunFailure(Object.assign(new Error('x'), { status: 410 }))).toBe(
      false,
    );
  });

  it('says the decision is gone instead of sending one for a run that moved on', async () => {
    const run = makeRun();
    const client = makeDetailClient(run);

    await decideCloudRunApprovalInteractively(client, run, 'approved', { onChanged: vi.fn() });

    expect(client.resumeRun).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showInformationMessage).mock.calls[0]?.[0]).toContain(
      'no longer waiting',
    );
  });

  it('contributes both inline actions on a run that is waiting for one', () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
      contributes: { commands: { command: string; icon?: string }[] };
    };
    const declared = manifest.contributes.commands.map((entry) => entry.command);

    for (const command of [APPROVE_CLOUD_TASK_COMMAND, REJECT_CLOUD_TASK_COMMAND]) {
      expect(declared).toContain(command);
      expect(manifest.contributes.commands.find((e) => e.command === command)?.icon).toBeTruthy();
      const action = CLOUD_TASK_ROW_ACTIONS.find((entry) => entry.command === command);
      expect(action?.matches('cloudRunPendingApproval')).toBe(true);
      expect(action?.matches('cloudRun')).toBe(false);
    }
  });
});
