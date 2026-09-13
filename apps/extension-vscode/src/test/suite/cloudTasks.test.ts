import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  CloudRunTreeItem,
  CloudTasksTreeProvider,
} from '../../features/cloud-tasks/cloudTasksTree';
import {
  buildCloudRunDetailItems,
  decideCloudRunApproval,
} from '../../features/cloud-tasks/cloudRunDetail';

declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function suiteSetup(fn: () => void | Promise<void>): void;

const CLOUD_TASKS_VIEW_ID = 'agi-workforce.cloudTasks';

const TWO_MINUTES_MS = 120_000;

const RUN = {
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
  lastEventSequence: 2,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: new Date(Date.now() - 10 * TWO_MINUTES_MS).toISOString(),
  updatedAt: new Date(Date.now() - TWO_MINUTES_MS).toISOString(),
  staleForMs: 90_000,
  pendingApproval: {
    requestedAt: new Date(Date.now() - TWO_MINUTES_MS).toISOString(),
    toolCalls: [
      { toolCallId: 'call_1', name: 'run_command', argsPreview: 'pnpm db:migrate -- apply' },
    ],
  },
} as unknown as Parameters<typeof buildCloudRunDetailItems>[0];

suite('AGI Workforce cloud tasks', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(extension, 'extension agiworkforce.agi-workforce not found');
    if (!extension.isActive) await extension.activate();
  });

  test('the cloud tasks view is contributed and its commands are registered', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.agi-workforce-sidebar');
    await vscode.commands.executeCommand(`${CLOUD_TASKS_VIEW_ID}.focus`);

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'agi-workforce.showCloudTasks',
      'agi-workforce.refreshCloudTasks',
      'agi-workforce.openCloudTask',
      'agi-workforce.openCloudTasksOnWeb',
      'agi-workforce.approveCloudTask',
      'agi-workforce.rejectCloudTask',
    ]) {
      assert.ok(commands.includes(command), `${command} must be registered`);
    }
  });

  test('a running run with a pending approval renders, and approving it calls the client', async () => {
    const resumed: unknown[] = [];
    const client = {
      listRuns: () => Promise.resolve({ runs: [RUN], nextCursor: null }),
      getRun: () => Promise.resolve({ run: RUN, events: [], nextAfterSequence: 2 }),
      resumeRun: (runId: string, approvals: unknown) => {
        resumed.push({ runId, approvals });
        return Promise.resolve();
      },
      cancelRun: () => Promise.resolve(RUN),
    };

    const provider = new CloudTasksTreeProvider(() => Promise.resolve({ status: 'ready', client }));
    try {
      const children = await provider.getChildren();
      const item = children[0];
      assert.ok(item instanceof CloudRunTreeItem, 'the view must render the run as a tree item');
      assert.strictEqual(item.label, 'Migrate the billing ledger');
      assert.strictEqual(item.description, 'Running · updated 2m ago · quiet 1m');
      assert.strictEqual(item.contextValue, 'cloudRunPendingApproval');
      assert.deepStrictEqual(item.command?.arguments, [RUN.id]);

      const actions = buildCloudRunDetailItems(RUN, []).map((entry) => entry.action);
      assert.deepStrictEqual(
        actions.filter((action) => action !== undefined),
        ['approve', 'reject', 'cancel', 'open-web'],
      );

      const sent = await decideCloudRunApproval(client, RUN, 'approved');
      assert.strictEqual(sent, true);
      assert.deepStrictEqual(resumed, [
        { runId: RUN.id, approvals: [{ toolCallId: 'call_1', decision: 'approved' }] },
      ]);
    } finally {
      provider.dispose();
    }
  });
});
