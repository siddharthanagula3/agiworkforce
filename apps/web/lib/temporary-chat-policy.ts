export const TEMPORARY_CHAT_LABEL = 'Temporary chat';

export const TEMPORARY_CHAT_SHARE_REFUSAL =
  'A temporary chat cannot be shared. Turn off temporary chat to keep it, then share it.';

/**
 * What the product promises a temporary chat does, in the order a user meets
 * it. Every clause is kept by code, not by this string: history by the turns
 * that write no `web_messages` rows, memory by `enrichManagedMemoryContext`
 * returning early on `isTemporary`, the Library by `media_assets.temporary_chat`
 * and the purge cron behind it, and connectors by `withoutStandingApprovals`
 * on a temporary turn. Change a clause here only with the code that keeps it.
 */
export const TEMPORARY_CHAT_RETENTION_NOTE =
  "Won't be saved to your history and skips memory. Files you attach stay out of your " +
  'Library, and a connector asks before every call even where you saved Always allow. ' +
  'A connector call still reaches that service, which keeps its own record.';

/** The one line that is always on screen next to the control, not on hover. */
export const TEMPORARY_CHAT_PRIVACY_EXPLANATION = 'Stays out of your history, memory and Library.';

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
