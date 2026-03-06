// Stub for desktop-only task metadata

export function deriveTaskMetadata(_message: string, _attachments?: any) {
  return { taskType: 'chat', priority: 'normal', tags: [] as string[] };
}
