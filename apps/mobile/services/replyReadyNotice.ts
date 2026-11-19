import { AppState } from 'react-native';

import { notificationAllowedOnceReadable } from './notificationGate';

export const REPLY_READY_TITLE = 'Your reply is ready';
export const REPLY_READY_BODY = 'Tap to open the chat.';

function appIsInForeground(): boolean {
  return AppState.currentState === 'active';
}

export async function announceReplyReadyInBackground(conversationId: string): Promise<boolean> {
  if (appIsInForeground()) return false;
  try {
    if (!(await notificationAllowedOnceReadable('chat_message'))) return false;
    if (appIsInForeground()) return false;
    const { scheduleLocalNotification } = await import('./notifications');
    await scheduleLocalNotification({
      title: REPLY_READY_TITLE,
      body: REPLY_READY_BODY,
      type: 'chat_message',
      conversationId,
    });
    return true;
  } catch (error) {
    console.warn('[replyReadyNotice] could not schedule the reply notice', error);
    return false;
  }
}
