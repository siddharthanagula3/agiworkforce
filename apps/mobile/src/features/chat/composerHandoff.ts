import type { Attachment } from './components/AttachmentPreview';
import type { ChatInputHandle } from './components/ChatInput';

const staged = new Map<string, Attachment[]>();
const stagedText = new Map<string, string[]>();

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

export function stageComposerText(key: string, text: string): void {
  if (!key || !text.trim()) return;
  const pending = stagedText.get(key) ?? [];
  if (pending.includes(text)) return;
  stagedText.set(key, [...pending, text]);
}

export function takeComposerText(key: string): string {
  if (!key) return '';
  const pending = stagedText.get(key);
  if (!pending) return '';
  stagedText.delete(key);
  return pending.join('\n\n');
}

export function adoptComposerHandoff(
  key: string | undefined,
  composer: ChatInputHandle | null,
): void {
  if (!key || !composer) return;
  const attachments = takeComposerAttachments(key);
  if (attachments.length > 0) composer.addAttachments(attachments);
  if (!composer.restoreText) return;
  const text = takeComposerText(key);
  if (text) composer.restoreText(text);
}

export function clearComposerHandoff(): void {
  staged.clear();
  stagedText.clear();
}
