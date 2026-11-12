import { COMPUTER_USE_RUN_ID_PATTERN } from './runOwnership';

export const COMPUTER_USE_RUN_MARKER_KEY = 'agi_cu_run_in_progress';
export const WORKER_RESTARTED_REASON = 'worker_restarted';
const MAX_MARKED_TABS = 64;

export interface ComputerUseRunMarker {
  runId: string;
  runGeneration: number;
  tabIds: number[];
  groupedTabId?: number;
}

export interface RunMarkerStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface LostRunCleanup {
  stopInputWatch(tabId: number): Promise<unknown>;
  detachDebugger(tabId: number): Promise<unknown>;
  ungroupTab(tabId: number): Promise<unknown>;
  announce(marker: ComputerUseRunMarker): void;
}

function sessionArea(): RunMarkerStorage {
  return {
    get: (key) => chrome.storage.session.get(key) as Promise<Record<string, unknown>>,
    set: (items) => chrome.storage.session.set(items),
    remove: (key) => chrome.storage.session.remove(key),
  };
}

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

function isTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function parseComputerUseRunMarker(value: unknown): ComputerUseRunMarker | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const runId = candidate['runId'];
  const runGeneration = candidate['runGeneration'];
  const tabIds = candidate['tabIds'];
  const groupedTabId = candidate['groupedTabId'];
  if (typeof runId !== 'string' || !COMPUTER_USE_RUN_ID_PATTERN.test(runId)) return null;
  if (typeof runGeneration !== 'number' || !Number.isSafeInteger(runGeneration)) return null;
  if (!Array.isArray(tabIds) || tabIds.length === 0 || !tabIds.every(isTabId)) return null;
  return {
    runId,
    runGeneration,
    tabIds: [...new Set(tabIds)].slice(0, MAX_MARKED_TABS),
    ...(isTabId(groupedTabId) ? { groupedTabId } : {}),
  };
}

async function readMarker(storage: RunMarkerStorage): Promise<ComputerUseRunMarker | null> {
  const stored = await storage.get(COMPUTER_USE_RUN_MARKER_KEY);
  return parseComputerUseRunMarker(stored?.[COMPUTER_USE_RUN_MARKER_KEY]);
}

export function markComputerUseRunStarted(
  marker: ComputerUseRunMarker,
  storage: RunMarkerStorage = sessionArea(),
): Promise<void> {
  return serialized(() => storage.set({ [COMPUTER_USE_RUN_MARKER_KEY]: marker }));
}

export function markComputerUseRunTab(
  runId: string,
  tabId: number,
  grouped = false,
  storage: RunMarkerStorage = sessionArea(),
): Promise<void> {
  return serialized(async () => {
    const marker = await readMarker(storage);
    if (!marker || marker.runId !== runId || !isTabId(tabId)) return;
    await storage.set({
      [COMPUTER_USE_RUN_MARKER_KEY]: {
        ...marker,
        tabIds: [...new Set([...marker.tabIds, tabId])].slice(0, MAX_MARKED_TABS),
        ...(grouped ? { groupedTabId: tabId } : {}),
      },
    });
  });
}

export function markComputerUseRunEnded(
  runId: string,
  storage: RunMarkerStorage = sessionArea(),
): Promise<void> {
  return serialized(async () => {
    const marker = await readMarker(storage);
    if (marker && marker.runId !== runId) return;
    await storage.remove(COMPUTER_USE_RUN_MARKER_KEY);
  });
}

/**
 * A marker found when the worker starts belongs to a run that died with the
 * previous worker: no run survives its worker. The run's tabs are released and
 * its panel is told at once instead of waiting on a watchdog.
 */
export function recoverLostComputerUseRun(
  cleanup: LostRunCleanup,
  storage: RunMarkerStorage = sessionArea(),
): Promise<ComputerUseRunMarker | null> {
  return serialized(async () => {
    const stored = await storage.get(COMPUTER_USE_RUN_MARKER_KEY);
    if (stored?.[COMPUTER_USE_RUN_MARKER_KEY] === undefined) return null;
    await storage.remove(COMPUTER_USE_RUN_MARKER_KEY);
    const marker = parseComputerUseRunMarker(stored[COMPUTER_USE_RUN_MARKER_KEY]);
    if (!marker) return null;
    const attempt = (step: () => Promise<unknown>): Promise<unknown> =>
      Promise.resolve().then(step);
    const { groupedTabId } = marker;
    await Promise.allSettled([
      ...marker.tabIds.flatMap((tabId) => [
        attempt(() => cleanup.stopInputWatch(tabId)),
        attempt(() => cleanup.detachDebugger(tabId)),
      ]),
      ...(groupedTabId === undefined ? [] : [attempt(() => cleanup.ungroupTab(groupedTabId))]),
    ]);
    cleanup.announce(marker);
    return marker;
  });
}
