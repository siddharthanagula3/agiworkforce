/**
 * AUDIT-FIX GOV-38: message action buttons were `h-7 w-7`, a 28px target,
 * below the 44px minimum, across every site in the action row. Touch viewports
 * now get a true 44px control; pointer viewports (sm and up, where the row is
 * hover-revealed anyway) keep a compact 32px button. `touch-manipulation`
 * removes the 300ms tap delay that made the small targets feel unresponsive.
 *
 * Lives here rather than in MessageBubble so a control rendered INTO the row.
 * the variant pager, can be sized by the same value instead of a copy of it.
 */
export const ACTION_BUTTON_SIZE = 'h-11 w-11 touch-manipulation sm:h-8 sm:w-8';

export const ACTION_ROW_MIN_HEIGHT = 'min-h-11 sm:min-h-8';

export const ACTION_ICON_SIZE = 'h-4.5 w-4.5';

/** Same size, applied to a control whose icon this file's host cannot reach. */
export const ACTION_ICON_SIZE_DESCENDANT = '[&_svg]:h-4.5 [&_svg]:w-4.5';

export const ACTION_BUTTON_TONE =
  'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)]';
