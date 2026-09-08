'use client';

import { useEffect, useState } from 'react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import {
  INCOMPLETE_TURN_GRACE_MS,
  isWithinIncompleteTurnGracePeriod,
  resolveTurnErrorNotice,
} from '../lib/turn-error-notice';

export interface TurnErrorNoticeOptions {
  lastMessage: ChatMessage | undefined | null;
  isLoading: boolean;
  turnError: string | null | undefined;
}

export function useTurnErrorNotice({
  lastMessage,
  isLoading,
  turnError,
}: TurnErrorNoticeOptions): string | null {
  const reportedTurnError = turnError?.trim() ? turnError.trim() : null;

  const [pastGracePeriod, setPastGracePeriod] = useState(
    () => !isWithinIncompleteTurnGracePeriod(lastMessage, Date.now()),
  );
  useEffect(() => {
    const createdAt = lastMessage?.createdAt;
    const withinGrace = lastMessage
      ? isWithinIncompleteTurnGracePeriod(lastMessage, Date.now())
      : false;
    if (!withinGrace || !createdAt) {
      setPastGracePeriod(true);
      return;
    }
    setPastGracePeriod(false);
    const sentAtMs = new Date(createdAt).getTime();
    const remainingMs = INCOMPLETE_TURN_GRACE_MS - (Date.now() - sentAtMs);
    const timer = setTimeout(() => setPastGracePeriod(true), Math.max(0, remainingMs));
    return () => clearTimeout(timer);
  }, [lastMessage]);

  return resolveTurnErrorNotice({ lastMessage, isLoading, reportedTurnError, pastGracePeriod });
}
