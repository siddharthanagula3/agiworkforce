
export function deriveTaskMetadata(_message: string, _attachments?: any) {
  return { taskType: 'chat', priority: 'normal', tags: [] as string[] };
}
