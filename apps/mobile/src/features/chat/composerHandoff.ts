import type { Attachment } from './components/AttachmentPreview';

const staged = new Map<string, Attachment[]>();

export function stageComposerAttachments(key: string, attachments: Attachment[]): void {
  if (!key || attachments.length === 0) return;
  staged.set(key, [...(staged.get(key) ?? []), ...attachments]);
}

export function takeComposerAttachments(key: string): Attachment[] {
  if (!key) return [];
  const attachments = staged.get(key);
  if (!attachments) return [];
  staged.delete(key);
  return attachments;
}

export function clearComposerAttachments(): void {
  staged.clear();
}
