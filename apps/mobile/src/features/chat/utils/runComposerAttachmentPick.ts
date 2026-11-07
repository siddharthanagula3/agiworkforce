import type { Attachment } from '../components/AttachmentPreview';
import type { ComposerAttachmentScope } from '../useComposerAttachmentScope';

export interface ComposerAttachmentOperation extends ComposerAttachmentScope {
  addAttachments: (items: Attachment[]) => void;
}

export async function runComposerAttachmentPick(
  operation: ComposerAttachmentOperation | null | undefined,
  pick: (scope: ComposerAttachmentScope) => Promise<Attachment[]>,
  onError: (error: unknown) => void,
): Promise<void> {
  if (!operation?.isCurrent()) return;
  try {
    const attachments = await pick(operation);
    if (operation.isCurrent() && attachments.length > 0) operation.addAttachments(attachments);
  } catch (error) {
    if (operation.isCurrent()) onError(error);
  }
}
