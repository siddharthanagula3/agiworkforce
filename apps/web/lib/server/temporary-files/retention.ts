import 'server-only';

/**
 * The window a temporary chat's files live for. The same 30 days the
 * conversation gets (0218), because a file that arrived in a temporary chat is
 * part of that chat and nothing else.
 */
export const TEMPORARY_CHAT_RETENTION_DAYS = 30;

export const TEMPORARY_FILE_PURGE_BATCH = 500;

/**
 * What the public pages promise about a temporary chat's files. The purge below
 * is what makes it true; a change here is a change to what is claimed, so the
 * claim and the enforcement are read from one place.
 */
export const TEMPORARY_FILE_RETENTION_CLAIM =
  'A file uploaded to or generated in a temporary chat is never listed in the Library and is hard-deleted, bytes and row together, about 30 days after it arrives, on the same clock as the conversation. It does not pass through the 30-day Library recovery window, because it was never a Library file. Saving one to the Library is an explicit action that takes it out of the temporary chat and onto the ordinary Library clock. A workspace legal hold that covers the file keeps it until the hold is released.';

export function temporaryFileCutoff(nowMs: number = Date.now()): Date {
  return new Date(nowMs - TEMPORARY_CHAT_RETENTION_DAYS * 86_400_000);
}
