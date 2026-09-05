/**
 * One failure gets one notice. The transcript owns it whenever there is a turn
 * to attach it to; the page-level banner is the fallback for the states that
 * render no transcript at all, and rendering both said the same thing twice.
 */
export type TurnFailurePlacement = 'inline' | 'banner' | 'none';

export interface TurnFailureNoticeInput {
  error: string | null | undefined;
  transcriptMounted: boolean;
  paywallOwnsTurn: boolean;
}

export interface TurnFailureNotice {
  placement: TurnFailurePlacement;
  message: string | null;
}

const NO_NOTICE: TurnFailureNotice = { placement: 'none', message: null };

export function resolveTurnFailureNotice({
  error,
  transcriptMounted,
  paywallOwnsTurn,
}: TurnFailureNoticeInput): TurnFailureNotice {
  const message = typeof error === 'string' && error.trim() ? error.trim() : null;
  if (message === null || paywallOwnsTurn) return NO_NOTICE;
  return { placement: transcriptMounted ? 'inline' : 'banner', message };
}
