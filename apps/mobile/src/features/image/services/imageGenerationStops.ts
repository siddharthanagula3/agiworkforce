const STOPPED_OPERATION_LIMIT = 64;
const stoppedOperations = new Set<string>();

export function rememberStoppedImageGeneration(operationId: string): void {
  stoppedOperations.delete(operationId);
  stoppedOperations.add(operationId);
  while (stoppedOperations.size > STOPPED_OPERATION_LIMIT) {
    const oldest = stoppedOperations.values().next().value;
    if (oldest === undefined) break;
    stoppedOperations.delete(oldest);
  }
}

export function isImageGenerationStopped(operationId: string): boolean {
  return stoppedOperations.has(operationId);
}

export function clearStoppedImageGenerations(): void {
  stoppedOperations.clear();
}
