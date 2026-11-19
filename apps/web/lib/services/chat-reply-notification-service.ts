import 'server-only';

import { logger } from '@/lib/logger';
import { sendPushToUser } from './push-notification-service';

export const CHAT_REPLY_READY_TITLE = 'Your reply is ready';
export const CHAT_REPLY_READY_BODY = 'Tap to open the chat.';

export interface ChatReplyRun {
  userId: string;
  id: string;
  conversationId: string | null;
  originSurface: string;
  workMode: string;
}

export function isPhoneChatReply(
  run: ChatReplyRun,
  event: string,
): run is ChatReplyRun & { conversationId: string } {
  return (
    event === 'completed' &&
    run.workMode === 'chat' &&
    run.originSurface === 'mobile' &&
    typeof run.conversationId === 'string' &&
    run.conversationId !== ''
  );
}

export async function notifyChatReplyReady(
  run: ChatReplyRun & { conversationId: string },
): Promise<{ pushed: boolean }> {
  try {
    const result = await sendPushToUser(
      run.userId,
      {
        title: CHAT_REPLY_READY_TITLE,
        body: CHAT_REPLY_READY_BODY,
        data: { type: 'chat_message', conversationId: run.conversationId, runId: run.id },
      },
      { expo: true, web: false },
    );
    return { pushed: result.sent > 0 };
  } catch (error) {
    logger.warn({ error, runId: run.id }, '[notifications] chat reply notice failed');
    return { pushed: false };
  }
}
