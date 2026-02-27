// Stub for desktop-only task metadata
export function deriveTaskMetadata(_message: string) {
  return { taskType: 'chat', priority: 'normal', tags: [] as string[] };
}
