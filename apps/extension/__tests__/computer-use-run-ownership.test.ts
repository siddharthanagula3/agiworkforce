import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getMessagePolicy } from '../src/background/policy';
import {
  ComputerUseRunCancelledError,
  ComputerUseRunCoordinator,
  ComputerUseStartCoordinator,
} from '../src/features/computer-use/runOwnership';

const OWNER_A = { accountId: 'user-a', authIncarnation: 'session-a' } as const;
const OWNER_B = { accountId: 'user-b', authIncarnation: 'session-b' } as const;
const here = dirname(fileURLToPath(import.meta.url));
const backgroundSource = readFileSync(resolve(here, '../src/background.ts'), 'utf8');
const sidePanelSource = readFileSync(resolve(here, '../src/side_panel.ts'), 'utf8');

describe('computer-use run ownership coordinator', () => {
  it('supersedes A atomically and makes every delayed A broadcast stale', () => {
    const coordinator = new ComputerUseRunCoordinator();
    const runA = coordinator.begin({
      runId: 'run-a',
      generation: 1,
      tabId: 11,
      windowId: 4,
      tabIntentUrl: 'https://example.com/a',
      authOwner: OWNER_A,
      credential: 'credential-a',
    });
    const publish = vi.fn();

    const runB = coordinator.begin({
      runId: 'run-b',
      generation: 2,
      tabId: 12,
      windowId: 4,
      tabIntentUrl: 'https://example.com/b',
      authOwner: OWNER_B,
      credential: 'credential-b',
    });

    if (coordinator.isCurrent(runA)) publish('stale-a-result');
    if (coordinator.isCurrent(runB)) publish('current-b-result');

    expect(runA.controller.signal.aborted).toBe(true);
    expect(runA.controller.signal.reason).toBeInstanceOf(ComputerUseRunCancelledError);
    expect(runA.initialCredential).toBe('credential-a');
    expect(coordinator.getActive()).toBe(runB);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith('current-b-result');
  });

  it('does not let a stale panel stop the newer run', () => {
    const coordinator = new ComputerUseRunCoordinator();
    coordinator.begin({
      runId: 'run-a',
      generation: 1,
      tabId: 11,
      tabIntentUrl: 'https://example.com/a',
      authOwner: OWNER_A,
      credential: 'credential-a',
    });
    const runB = coordinator.begin({
      runId: 'run-b',
      generation: 2,
      tabId: 12,
      tabIntentUrl: 'https://example.com/b',
      authOwner: OWNER_B,
      credential: 'credential-b',
    });

    expect(coordinator.cancel('user_stopped', 'run-a')).toBeNull();
    expect(coordinator.isCurrent(runB)).toBe(true);
    expect(runB.controller.signal.aborted).toBe(false);
  });

  it('tracks the completion promise instead of detaching unowned work', () => {
    const coordinator = new ComputerUseRunCoordinator();
    const run = coordinator.begin({
      runId: 'run-a',
      generation: 1,
      tabId: 11,
      tabIntentUrl: 'https://example.com/a',
      authOwner: OWNER_A,
      credential: 'credential-a',
    });
    const completion = Promise.resolve('done');

    coordinator.trackCompletion(run, completion);

    expect(run.completion).toBe(completion);
  });
});

describe('computer-use deferred admission ownership', () => {
  it('teardown cancels the exact pending start before deferred admission can adopt it', async () => {
    const starts = new ComputerUseStartCoordinator();
    const runs = new ComputerUseRunCoordinator();
    const runId = 'cu_run_pending-a';
    const generation = 1;
    starts.begin(runId, generation);

    let releaseAdmission!: () => void;
    const admissionGate = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    const deferredAdmission = admissionGate.then(() => {
      if (!starts.isCurrent(runId, generation)) return null;
      starts.cancel(runId);
      return runs.begin({
        runId,
        generation,
        tabId: 11,
        tabIntentUrl: 'https://example.com/a',
        authOwner: OWNER_A,
        credential: 'credential-a',
      });
    });

    expect(starts.cancel(runId)?.runId).toBe(runId);
    releaseAdmission();

    await expect(deferredAdmission).resolves.toBeNull();
    expect(runs.getActive()).toBeNull();
  });

  it('a stale panel cannot cancel a newer pending admission', () => {
    const starts = new ComputerUseStartCoordinator();
    starts.begin('cu_run_pending-b', 2);

    expect(starts.cancel('cu_run_pending-a')).toBeNull();
    expect(starts.isCurrent('cu_run_pending-b', 2)).toBe(true);
  });
});

describe('computer-use cancellation policy', () => {
  it('accepts CANCEL_COMPUTER_USE only from a trusted extension page', () => {
    expect(getMessagePolicy('CANCEL_COMPUTER_USE')).toEqual({
      senderClass: 'extension-page-only',
      allowsCrossTab: true,
    });
  });

  it('reasserts Managed Cloud owner and tab intent before credential egress', () => {
    expect(backgroundSource).toMatch(
      /const context = await getManagedCloudAuthContext\(\)[\s\S]*sameManagedCloudOwner\(lease\.authOwner, context\.owner\)/,
    );
    expect(backgroundSource).toMatch(
      /resolveOwnedCredential:\s*\(\)\s*=>\s*assertComputerUseOwnership\(lease\)/,
    );
    expect(backgroundSource).toMatch(/tab\.url !== lease\.tabIntentUrl[\s\S]*tab_intent_changed/);
  });

  it('cancels the prior auth incarnation before managed-owner cleanup', () => {
    expect(backgroundSource).toMatch(
      /sameManagedCloudOwner\(computerUseLease\.authOwner, previousOwner\)[\s\S]*cancelActiveComputerUseRun\('account_changed'/,
    );
  });

  it('publishes the old run stop when a replacement start supersedes it', () => {
    expect(backgroundSource).toContain("cancelActiveComputerUseRun('superseded');");
    expect(backgroundSource).not.toContain(
      "cancelActiveComputerUseRun('superseded', undefined, false)",
    );
  });

  it('wires the panel-owned id through pending admission into the active lease', () => {
    expect(sidePanelSource).toMatch(
      /requestedRunId = `cu_run_\$\{crypto\.randomUUID\(\)\}`[\s\S]*setRunState\(true, requestedRunId\)[\s\S]*type: 'AGI_START_COMPUTER_USE',[\s\S]*runId: requestedRunId/,
    );
    expect(backgroundSource).toMatch(
      /computerUseStarts\.begin\(cuRunId, startGeneration\)[\s\S]*clearPendingComputerUseStart\(cuRunId\)[\s\S]*const lease = computerUseRuns\.begin\(\{[\s\S]*runId: cuRunId/,
    );
  });
});
