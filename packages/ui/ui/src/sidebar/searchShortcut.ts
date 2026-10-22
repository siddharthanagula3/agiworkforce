// Not Cmd/Ctrl+K: the command palette claims that in the capture phase, so it
// never reaches search. Exported so the key binding and this badge cannot drift.
export const OPEN_SEARCH_SHORTCUT = {
  key: 'F',
  ctrl: true,
  meta: true,
  shift: true,
} as const;

export const TOGGLE_SIDEBAR_SHORTCUT = {
  key: 'B',
  ctrl: true,
  meta: true,
} as const;
