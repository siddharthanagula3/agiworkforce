export const TEMPORARY_CHAT_LABEL = 'Temporary chat';

export const TEMPORARY_CHAT_SHARE_REFUSAL =
  'A temporary chat cannot be shared. Turn off temporary chat to keep it, then share it.';

export const TEMPORARY_CHAT_NOT_SAVED = 'Messages in a temporary chat are not saved.';

/**
 * What the product promises a temporary chat does, in the order a user meets
 * it. Every clause is kept by code, not by this string: history by
 * `persistConversationMessage` refusing a temporary conversation, search by
 * the `is_temporary` filters in `/api/search`, the retrieval index and the sync
 * pull, memory by `resolveInteractiveTurnContext` leaving it out of a temporary turn,
 * the Library by `media_assets.temporary_chat` and the purge cron behind it, and
 * connectors by `withoutStandingApprovals` on a temporary turn. Change a clause
 * here only with the code that keeps it.
 */
export const TEMPORARY_CHAT_RETENTION_NOTE =
  "Won't be saved to your history or show up in search, and skips memory. Files you attach " +
  'stay out of your Library, ' +
  'and a connector asks before every call even where you saved Always allow. ' +
  'A connector call still reaches that service, which keeps its own record.';

/** The one line that is always on screen next to the control, not on hover. */
export const TEMPORARY_CHAT_PRIVACY_EXPLANATION =
  'Stays out of your history, search, memory and Library.';

export const TEMPORARY_CHAT_END_LABEL = 'End temporary chat';

/**
 * Ending is the one exit that is not ordinary navigation: a temporary chat
 * keeps no messages anywhere, so there is nothing to come back to.
 */
export const TEMPORARY_CHAT_END_CONFIRMATION = {
  title: 'End this temporary chat?',
  description:
    'A temporary chat is never written to your history, so ending it is the end of it: every ' +
    'message goes, on this device and any other, and nobody can reopen or restore it. Copy ' +
    'out anything you still need first.',
  confirmLabel: 'End and discard',
} as const;

export const TEMPORARY_CHAT_PROJECT_REFUSAL =
  'A temporary chat cannot be part of a project. Turn off temporary chat, or start the chat outside the project.';

export const LOCAL_MODEL_PROJECT_REFUSAL =
  "Chats with a model on this device are temporary and can't be saved in a project.";

export const TEMPORARY_CHAT_PROJECT_NOTICE =
  "Temporary chat isn't available in projects. This chat will be saved to the project.";

export function temporaryChatAllowedIn(projectId: string | null | undefined): boolean {
  return !projectId;
}

export function resolveNewChatTemporary(
  pendingChoice: boolean | null,
  defaultTemporary: boolean,
  projectId: string | null | undefined,
): boolean {
  return temporaryChatAllowedIn(projectId) && (pendingChoice ?? defaultTemporary);
}
