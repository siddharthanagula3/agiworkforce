import type { ShortcutChord } from '@agiworkforce/unified-chat';

/**
 * Steps a local coding session's permissions through Ask, Auto and Plan from
 * its message box. Local coding sessions exist only inside the desktop shell,
 * so the chord is listed with the shell's own and never in a browser.
 *
 * Not Shift+Tab: inside a text field that is how a keyboard user moves focus
 * backwards. Chrome claims this chord for its profile menu, which the shell
 * does not have.
 */
export const CODE_AGENT_MODE_CYCLE_SHORTCUT = {
  key: 'M',
  ctrl: true,
  meta: true,
  shift: true,
} as const satisfies ShortcutChord;

export const CODE_AGENT_MODE_CYCLE_ROW = {
  id: 'code-agent-mode-cycle',
  description: 'In a coding session, switch permissions between Ask, Auto and Plan',
  accelerator: 'CommandOrControl+Shift+M',
} as const;
