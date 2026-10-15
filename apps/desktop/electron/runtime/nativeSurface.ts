import {
  dialog,
  Notification,
  type BrowserWindow,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type NotificationConstructorOptions,
} from 'electron';
import { headAndTail, visibleLines } from './dialogText';

const TITLE_SHOWN = { head: 160, tail: 40 };
const MESSAGE_SHOWN = { head: 400, tail: 200 };
const DETAIL_SHOWN = { head: 9_000, tail: 3_000 };
const BUTTON_SHOWN = { head: 60, tail: 20 };
const NOTIFICATION_BODY_SHOWN = { head: 500, tail: 200 };

function shown(text: string, caps: { head: number; tail: number }): string {
  return headAndTail(visibleLines(text), caps);
}

function shownOrAbsent(
  text: string | undefined,
  caps: { head: number; tail: number },
): string | undefined {
  return text === undefined ? undefined : shown(text, caps);
}

function withoutAbsent<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

/**
 * The text of a native dialog as it is drawn: nothing in it hides or reorders
 * what follows, and none of it runs past what a dialog can show without
 * saying so. Every dialog goes through this, so text that reached one without
 * being marked where it was built is still marked here.
 */
export function nativeMessageText(options: MessageBoxOptions): MessageBoxOptions {
  return withoutAbsent({
    ...options,
    message: shown(options.message, MESSAGE_SHOWN),
    title: shownOrAbsent(options.title, TITLE_SHOWN),
    detail: shownOrAbsent(options.detail, DETAIL_SHOWN),
    checkboxLabel: shownOrAbsent(options.checkboxLabel, TITLE_SHOWN),
    buttons: options.buttons?.map((label) => shown(label, BUTTON_SHOWN)),
  });
}

/**
 * The one way this app raises a native dialog. A dialog drawn by the
 * operating system is where a person decides what a page, an agent or a phone
 * may do, so its text is never handed over as it arrived.
 */
export function showNativeMessage(
  window: BrowserWindow | null,
  options: MessageBoxOptions,
): Promise<MessageBoxReturnValue> {
  const text = nativeMessageText(options);
  return window ? dialog.showMessageBox(window, text) : dialog.showMessageBox(text);
}

export function nativeNotificationText(
  options: NotificationConstructorOptions,
): NotificationConstructorOptions {
  return withoutAbsent({
    ...options,
    title: shownOrAbsent(options.title, TITLE_SHOWN),
    subtitle: shownOrAbsent(options.subtitle, TITLE_SHOWN),
    body: shownOrAbsent(options.body, NOTIFICATION_BODY_SHOWN),
    actions: options.actions?.map((action) => ({
      ...action,
      ...(action.text === undefined ? {} : { text: shown(action.text, BUTTON_SHOWN) }),
    })),
  });
}

/** The one way this app raises a notification, for the same reason. */
export function createNativeNotification(options: NotificationConstructorOptions): Notification {
  return new Notification(nativeNotificationText(options));
}
