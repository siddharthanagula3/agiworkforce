export interface CloudHistoryLoad {
  readonly conversationId: string;
  leafChanged: boolean;
}

const activeLoads = new Map<string, CloudHistoryLoad>();
const listeners = new Set<(loading: boolean) => void>();

export function publishCloudHistoryLoading(): void {
  for (const listener of listeners) listener(activeLoads.size > 0);
}

export function subscribeCloudHistoryLoading(listener: (loading: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function beginCloudHistoryLoad(conversationId: string): CloudHistoryLoad {
  const load = { conversationId, leafChanged: false };
  activeLoads.set(conversationId, load);
  publishCloudHistoryLoading();
  return load;
}

export function isCloudHistoryLoadCurrent(load: CloudHistoryLoad): boolean {
  return activeLoads.get(load.conversationId) === load;
}

export function finishCloudHistoryLoad(load: CloudHistoryLoad): void {
  if (!isCloudHistoryLoadCurrent(load)) return;
  activeLoads.delete(load.conversationId);
  publishCloudHistoryLoading();
}

export function invalidateCloudHistoryLoad(conversationId: string): void {
  activeLoads.delete(conversationId);
}

export function invalidateAllCloudHistoryLoads(): void {
  activeLoads.clear();
}

export function recordCloudHistoryLeafWrite(conversationId: string): void {
  const load = activeLoads.get(conversationId);
  if (load) load.leafChanged = true;
}
