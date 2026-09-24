export {
  CHAT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
  isChatImageMimeType,
  isSupportedChatAttachment,
  normalizeChatDocumentMimeType,
  resolveChatAttachmentMimeType,
} from '@agiworkforce/cloud-contracts';

/**
 * One wording for a file that is not in the turn, wherever it was stopped.
 *
 * The server hydrator already wrote this note for a stored asset it could not
 * resolve. The composer had no equivalent: it refused a file locally, showed a
 * toast, and sent the typed message unchanged, so a prompt that said "summarise
 * the attached file" reached a model with no attachment and no way to know one
 * was missing, and the model invented the contents. Both sides name the file
 * and say why here, so neither the reader nor the model has to guess.
 */
export const CHAT_ATTACHMENT_UNAVAILABLE_NOTES = {
  removed: 'was removed from your Library. Attach it again to include it.',
  unreadable: 'could not be loaded. Attach it again to include it.',
  unsupported: 'is not a file type this chat can read.',
  foreign: 'is not available to this account.',
  over_budget: 'was left out because this conversation has reached its attachment limit.',
  empty: 'is empty. Add content to the file and attach it again.',
  too_large: 'is larger than this chat can send.',
  too_many: 'was left out because this message already carries as many files as it can.',
} as const;

export type ChatAttachmentUnavailableReason = keyof typeof CHAT_ATTACHMENT_UNAVAILABLE_NOTES;

export interface UnavailableChatAttachment {
  filename: string;
  reason: ChatAttachmentUnavailableReason;
}

export function unavailableChatAttachmentNote(
  filename: string,
  reason: ChatAttachmentUnavailableReason,
): string {
  return `[attachment unavailable: ${filename} ${CHAT_ATTACHMENT_UNAVAILABLE_NOTES[reason]}]`;
}

/**
 * The refusals a composer is holding, as the lines the outgoing turn carries.
 * Empty when nothing was refused, so a caller can append unconditionally.
 */
export function unavailableChatAttachmentNotes(
  refusals: readonly UnavailableChatAttachment[],
): string[] {
  return refusals.map((refusal) => unavailableChatAttachmentNote(refusal.filename, refusal.reason));
}
