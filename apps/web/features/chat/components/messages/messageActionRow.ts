/**
 * Touch viewports get a 44px control; pointer viewports (sm and up, where the
 * row is hover-revealed) keep a compact 32px button. `touch-manipulation`
 * removes the tap delay.
 *
 * Lives here rather than in MessageBubble so a control rendered into the row,
 * such as the variant pager, is sized by the same value.
 */
export const ACTION_BUTTON_SIZE = 'h-11 w-11 touch-manipulation sm:h-8 sm:w-8';

export const ACTION_ROW_MIN_HEIGHT = 'min-h-11 sm:min-h-8';

export const ACTION_ICON_SIZE = 'h-4.5 w-4.5';

/** Same size, applied to a control whose icon this file's host cannot reach. */
export const ACTION_ICON_SIZE_DESCENDANT = '[&_svg]:h-4.5 [&_svg]:w-4.5';

export const ACTION_BUTTON_TONE =
  'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)]';
