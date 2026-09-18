import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { agentTaskStateLabel, type AgentTaskState } from '@agiworkforce/types';
import {
  BRING_CLOUD_BRANCH_IN,
  buildCloudTaskHandoffDraft,
  describeDirtyOverwrite,
  handleContextHandoffUri,
  parseCloudTaskHandoffQuery,
  pullCloudResultIntoCheckout,
  VSCODE_CLOUD_TASK_HANDOFF_PATH,
  type CloudResultPullHost,
  type CloudTaskHandoff,
  type LocalCheckoutRepository,
} from '../features/context-handoff';
import { cloudRunStateLabel } from '../features/cloud-tasks/cloudRunPresentation';

const HANDOFF: CloudTaskHandoff = {
  runId: 'run_12345678',
  goal: 'fix the flaky clock test',
  plan: ['read the fixture', 'pin the clock'],
  branch: 'agi/fix-the-flaky-test',
};

function cloudUri(query: string): vscode.Uri {
  return vscode.Uri.parse(`vscode://agi.agi-workforce${VSCODE_CLOUD_TASK_HANDOFF_PATH}?${query}`);
}

function repository(dirtyPaths: string[]): LocalCheckoutRepository {
  return {
    rootPath: '/workspace',
    dirtyPaths,
    fetch: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
  };
}

function host(
  repo: LocalCheckoutRepository | null,
  confirm = false,
): CloudResultPullHost & { confirmOverwrite: ReturnType<typeof vi.fn> } {
  return {
    findRepository: vi.fn().mockResolvedValue(repo),
    confirmOverwrite: vi.fn().mockResolvedValue(confirm),
    report: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(vscode.window.showWarningMessage).mockReset().mockResolvedValue(undefined);
  vi.mocked(vscode.window.showInformationMessage).mockReset().mockResolvedValue(undefined);
});

describe('cloud to local handoff', () => {
  it('carries the goal, the plan and the branch into the composer', async () => {
    const target = { prefillComposer: vi.fn(), reveal: vi.fn().mockResolvedValue(undefined) };
    const uri = cloudUri(
      'runId=run_12345678&goal=fix%20the%20flaky%20clock%20test&plan=read%20the%20fixture&plan=pin%20the%20clock&branch=agi%2Ffix-the-flaky-test',
    );

    await expect(handleContextHandoffUri(uri, target)).resolves.toBe(true);

    expect(parseCloudTaskHandoffQuery(uri.query)).toEqual(HANDOFF);
    const draft = target.prefillComposer.mock.calls[0]?.[0] as string;
    expect(draft).toContain('run_12345678');
    expect(draft).toContain('fix the flaky clock test');
    expect(draft).toContain('agi/fix-the-flaky-test');
    expect(draft).toContain('- read the fixture');
    expect(draft).toContain('- pin the clock');
    expect(draft).toBe(buildCloudTaskHandoffDraft(HANDOFF));
  });

  it('refuses a link that names no task instead of placing an empty draft', async () => {
    const target = { prefillComposer: vi.fn(), reveal: vi.fn().mockResolvedValue(undefined) };

    await expect(handleContextHandoffUri(cloudUri('branch=agi%2Ffix'), target)).resolves.toBe(
      false,
    );

    expect(target.prefillComposer).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('drops a branch name that is not one rather than passing it to git', () => {
    expect(parseCloudTaskHandoffQuery('runId=run_1&branch=agi%2Ffix%3B%20rm%20-rf%20%2F')).toEqual({
      runId: 'run_1',
      goal: '',
      plan: [],
      branch: null,
    });
  });

  it('never moves the checkout just because a link was opened', async () => {
    const target = { prefillComposer: vi.fn(), reveal: vi.fn().mockResolvedValue(undefined) };
    const pullHost = host(repository([]));

    await handleContextHandoffUri(
      cloudUri('runId=run_1&branch=agi%2Ffix'),
      target,
      async () => pullHost,
    );

    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    expect(pullHost.findRepository).not.toHaveBeenCalled();
  });

  it('brings the branch in when the reader asks for it', async () => {
    const target = { prefillComposer: vi.fn(), reveal: vi.fn().mockResolvedValue(undefined) };
    const repo = repository([]);
    const pullHost = host(repo);
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
      BRING_CLOUD_BRANCH_IN as never,
    );

    await handleContextHandoffUri(
      cloudUri('runId=run_1&branch=agi%2Ffix'),
      target,
      async () => pullHost,
    );

    expect(repo.checkout).toHaveBeenCalledWith('agi/fix');
  });
});

describe('the dirty working tree guard', () => {
  it('asks before a branch switch could discard uncommitted work, and stops on no', async () => {
    const repo = repository(['src/a.ts', 'src/b.ts']);
    const pullHost = host(repo, false);

    await expect(pullCloudResultIntoCheckout(HANDOFF, pullHost)).resolves.toEqual({
      status: 'cancelled',
    });

    expect(pullHost.confirmOverwrite).toHaveBeenCalledWith(
      ['src/a.ts', 'src/b.ts'],
      'agi/fix-the-flaky-test',
    );
    expect(repo.fetch).not.toHaveBeenCalled();
    expect(repo.checkout).not.toHaveBeenCalled();
  });

  it('proceeds once the reader accepts the named consequence', async () => {
    const repo = repository(['src/a.ts']);

    await expect(pullCloudResultIntoCheckout(HANDOFF, host(repo, true))).resolves.toEqual({
      status: 'pulled',
      branch: 'agi/fix-the-flaky-test',
    });
    expect(repo.fetch).toHaveBeenCalledOnce();
    expect(repo.checkout).toHaveBeenCalledWith('agi/fix-the-flaky-test');
  });

  it('asks nothing when the checkout is clean', async () => {
    const repo = repository([]);
    const pullHost = host(repo);

    await expect(pullCloudResultIntoCheckout(HANDOFF, pullHost)).resolves.toMatchObject({
      status: 'pulled',
    });
    expect(pullHost.confirmOverwrite).not.toHaveBeenCalled();
  });

  it('names the files at stake and says the loss cannot be undone', () => {
    const { message, detail } = describeDirtyOverwrite(['src/a.ts', 'src/b.ts'], 'agi/fix');
    expect(message).toContain('agi/fix');
    expect(detail).toContain('cannot be undone');
    expect(detail).toContain('src/a.ts');
    expect(detail).toContain('src/b.ts');
  });

  it('refuses when there is no repository or no branch, without touching anything', async () => {
    await expect(pullCloudResultIntoCheckout(HANDOFF, host(null))).resolves.toEqual({
      status: 'no-repository',
    });
    await expect(
      pullCloudResultIntoCheckout({ ...HANDOFF, branch: null }, host(repository([]))),
    ).resolves.toEqual({ status: 'no-branch' });
  });

  it('reports a failed checkout rather than claiming the workspace moved', async () => {
    const repo = repository([]);
    repo.checkout = vi.fn().mockRejectedValue(new Error('local changes would be overwritten'));

    await expect(pullCloudResultIntoCheckout(HANDOFF, host(repo))).resolves.toMatchObject({
      status: 'failed',
      reason: 'local changes would be overwritten',
    });
  });
});

/**
 * One vocabulary for cloud task state across surfaces. The web task list reads
 * the same `agentTaskStateLabel`, so a word added on one surface and not the
 * other fails here instead of on a user's screen.
 */
describe('cloud task state reads the same here as on the web', () => {
  const STATES: AgentTaskState[] = [
    'queued',
    'planning',
    'running',
    'resuming',
    'awaiting_approval',
    'awaiting_input',
    'paused',
    'ready_for_review',
    'completed',
    'partial',
    'failed',
    'timed_out',
    'cancelled',
    'archived',
  ];

  it.each(STATES)('says the same word for %s', (state) => {
    expect(cloudRunStateLabel(state)).toBe(agentTaskStateLabel(state));
  });
});
