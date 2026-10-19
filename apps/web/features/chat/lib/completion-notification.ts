export const AGI_WORK_DONE_TITLE = 'AGI Work finished';
export const RESEARCH_DONE_TITLE = 'Your research report is ready';
export const REPLY_DONE_TITLE = 'Your reply is ready';

export interface CompletedTurn {
  workMode?: string | undefined;
  research?: boolean | undefined;
  reply?: { role: string; error?: boolean | undefined; content?: string | undefined } | undefined;
  conversationTitle?: string | undefined;
  untitled: string;
}

/**
 * The heading of the desktop notification for a turn that finished while the
 * app was in the background, or null when nothing worth announcing arrived.
 */
export function completionNotificationTitle(turn: CompletedTurn): string | null {
  if (turn.workMode === 'agiwork') return AGI_WORK_DONE_TITLE;
  if (turn.research) return RESEARCH_DONE_TITLE;
  const answered =
    turn.reply?.role === 'assistant' && !turn.reply.error && Boolean(turn.reply.content);
  if (!answered) return null;
  return turn.conversationTitle && turn.conversationTitle !== turn.untitled
    ? turn.conversationTitle
    : REPLY_DONE_TITLE;
}
