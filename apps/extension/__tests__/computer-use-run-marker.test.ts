import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  COMPUTER_USE_RUN_MARKER_KEY,
  markComputerUseRunEnded,
  markComputerUseRunStarted,
  markComputerUseRunTab,
  recoverLostComputerUseRun,
  WORKER_RESTARTED_REASON,
  type ComputerUseRunMarker,
  type LostRunCleanup,
  type RunMarkerStorage,
} from '../src/features/computer-use/runMarker';
import { describeCancellationReason } from '../src/features/side-panel/computerUsePanel';

function memoryStorage(): RunMarkerStorage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (items) => {
      Object.assign(data, structuredClone(items));
    },
    remove: async (key) => {
      delete data[key];
    },
  };
}

function cleanup(): LostRunCleanup & { [K in keyof LostRunCleanup]: ReturnType<typeof vi.fn> } {
  return {
    stopInputWatch: vi.fn(async () => undefined),
    detachDebugger: vi.fn(async () => {
      throw new Error('Debugger is not attached to the tab with id: 41.');
    }),
    ungroupTab: vi.fn(async () => undefined),
    announce: vi.fn(),
  };
}

const RUN = { runId: 'cu_run_lost', runGeneration: 7, tabIds: [41] };

describe('a browser task that dies with the worker', () => {
  it('is found by the next worker, which releases its tabs and tells the panel', async () => {
    const storage = memoryStorage();
    await markComputerUseRunStarted(RUN, storage);
    await markComputerUseRunTab(RUN.runId, 41, true, storage);
    await markComputerUseRunTab(RUN.runId, 52, false, storage);

    const steps = cleanup();
    const recovered = await recoverLostComputerUseRun(steps, storage);

    const expected: ComputerUseRunMarker = { ...RUN, tabIds: [41, 52], groupedTabId: 41 };
    expect(recovered).toEqual(expected);
    expect(steps.stopInputWatch.mock.calls).toEqual([[41], [52]]);
    expect(steps.detachDebugger.mock.calls).toEqual([[41], [52]]);
    expect(steps.ungroupTab.mock.calls).toEqual([[41]]);
    expect(steps.announce).toHaveBeenCalledWith(expected);
    expect(storage.data[COMPUTER_USE_RUN_MARKER_KEY]).toBeUndefined();
    expect(await recoverLostComputerUseRun(cleanup(), storage)).toBeNull();
  });

  it('leaves nothing behind for a run that ended normally', async () => {
    const storage = memoryStorage();
    await markComputerUseRunStarted(RUN, storage);
    await markComputerUseRunEnded(RUN.runId, storage);
    await markComputerUseRunTab(RUN.runId, 41, true, storage);

    const steps = cleanup();
    expect(await recoverLostComputerUseRun(steps, storage)).toBeNull();
    expect(steps.announce).not.toHaveBeenCalled();
  });

  it('does not let an older run clear the marker of the run that replaced it', async () => {
    const storage = memoryStorage();
    await markComputerUseRunStarted(RUN, storage);
    await markComputerUseRunStarted({ ...RUN, runId: 'cu_run_newer' }, storage);
    await markComputerUseRunEnded(RUN.runId, storage);

    expect(storage.data[COMPUTER_USE_RUN_MARKER_KEY]).toMatchObject({ runId: 'cu_run_newer' });
  });

  it('discards a malformed marker without acting on it', async () => {
    const storage = memoryStorage();
    storage.data[COMPUTER_USE_RUN_MARKER_KEY] = { runId: 'not a run', tabIds: ['x'] };
    const steps = cleanup();
    expect(await recoverLostComputerUseRun(steps, storage)).toBeNull();
    expect(steps.stopInputWatch).not.toHaveBeenCalled();
    expect(storage.data[COMPUTER_USE_RUN_MARKER_KEY]).toBeUndefined();
  });

  it('gives the panel words for a run the worker lost', () => {
    expect(describeCancellationReason(WORKER_RESTARTED_REASON)).toContain('Start the task again');
  });

  it('is wired into the worker: recovered before any new run starts, tracked for each run', () => {
    const background = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
      'utf8',
    );
    expect(background).toMatch(
      /^const lostComputerUseRunRecovery = recoverLostComputerUseRun\(\{/m,
    );
    const start = background.slice(
      background.indexOf("case 'AGI_START_COMPUTER_USE'"),
      background.indexOf("case 'START_DOWNLOAD'"),
    );
    expect(start.indexOf('await lostComputerUseRunRecovery;')).toBeGreaterThan(-1);
    expect(start.indexOf('await lostComputerUseRunRecovery;')).toBeLessThan(
      start.indexOf('computerUseRuns.begin('),
    );
    expect(start).toContain('void markComputerUseRunStarted({');
    expect(start).toContain('() => markComputerUseRunEnded(lease.runId)');
  });
});
