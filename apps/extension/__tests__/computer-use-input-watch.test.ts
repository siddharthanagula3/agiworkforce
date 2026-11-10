import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createRunInputWatch } from '../src/features/computer-use/inputWatch';
import { ComputerUseRunCoordinator } from '../src/features/computer-use/runOwnership';

const OWNER = { accountId: 'user-a', authIncarnation: 'session-a' } as const;
const here = dirname(fileURLToPath(import.meta.url));
const backgroundSource = readFileSync(resolve(here, '../src/background.ts'), 'utf8');

function beginRun(coordinator: ComputerUseRunCoordinator, runId: string, tabId: number) {
  return coordinator.begin({
    runId,
    generation: 1,
    tabId,
    windowId: 4,
    tabIntentUrl: `https://example.com/${tabId}`,
    authOwner: OWNER,
    credential: `credential-${runId}`,
  });
}

function switchTo(
  coordinator: ComputerUseRunCoordinator,
  run: ReturnType<typeof beginRun>,
  id: number,
) {
  coordinator.setActionInFlight(run, true);
  const transition = coordinator.beginTabTransition(run, id);
  coordinator.commitTabTransition(run, transition, `https://example.com/${id}`);
}

describe('physical-input observation follows the run-owned tab', () => {
  it('arms the destination and retires the origin when a switch commits', () => {
    const coordinator = new ComputerUseRunCoordinator();
    const send = vi.fn();
    const run = beginRun(coordinator, 'run-a', 11);
    const watch = createRunInputWatch({
      lease: run,
      activeRun: () => coordinator.getActive(),
      send,
    });

    watch.start();
    const previous = run.tabId;
    switchTo(coordinator, run, 12);
    watch.retarget(previous);

    expect(send.mock.calls).toEqual([
      [11, true],
      [12, true],
      [11, false],
    ]);
  });

  it('does nothing when the committed tab is the one already watched', () => {
    const coordinator = new ComputerUseRunCoordinator();
    const send = vi.fn();
    const run = beginRun(coordinator, 'run-a', 11);
    const watch = createRunInputWatch({
      lease: run,
      activeRun: () => coordinator.getActive(),
      send,
    });

    watch.retarget(run.tabId);

    expect(send).not.toHaveBeenCalled();
  });

  it('stops watching both the current and the initial tab on completion', () => {
    const coordinator = new ComputerUseRunCoordinator();
    const send = vi.fn();
    const run = beginRun(coordinator, 'run-a', 11);
    const watch = createRunInputWatch({
      lease: run,
      activeRun: () => coordinator.getActive(),
      send,
    });
    switchTo(coordinator, run, 12);

    watch.stop(11);

    expect(send.mock.calls).toEqual([
      [12, false],
      [11, false],
    ]);
  });

  it('lets a finished run leave a tab that a newer run now watches alone', () => {
    const coordinator = new ComputerUseRunCoordinator();
    const send = vi.fn();
    const older = beginRun(coordinator, 'run-a', 11);
    const olderWatch = createRunInputWatch({
      lease: older,
      activeRun: () => coordinator.getActive(),
      send,
    });
    const newer = beginRun(coordinator, 'run-b', 11);
    createRunInputWatch({ lease: newer, activeRun: () => coordinator.getActive(), send });

    olderWatch.stop(11);

    expect(send).not.toHaveBeenCalled();
  });

  it('still stops a tab that the newer run drives elsewhere', () => {
    const coordinator = new ComputerUseRunCoordinator();
    const send = vi.fn();
    const older = beginRun(coordinator, 'run-a', 11);
    const olderWatch = createRunInputWatch({
      lease: older,
      activeRun: () => coordinator.getActive(),
      send,
    });
    beginRun(coordinator, 'run-b', 21);

    olderWatch.stop(11);

    expect(send.mock.calls).toEqual([[11, false]]);
  });

  it('is installed on the committed task-tab transition and on completion', () => {
    expect(backgroundSource).toMatch(
      /commitTabTransition\(lease, transition, url\);\s*inputWatch\.retarget\(previousTabId\);/,
    );
    expect(backgroundSource).toMatch(
      /const cleanupActions: Array<\(\) => unknown> = \[\s*\(\) => inputWatch\.stop\(cuTabId\),/,
    );
    expect(backgroundSource).not.toContain('watchComputerUseUserInput(cuTabId, false)');
  });
});
