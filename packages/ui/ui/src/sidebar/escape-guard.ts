/**
 * Radix's dismissable layer listens for Escape on `document` in the CAPTURE
 * phase, and a drawer or modal layer mounts before any transient layer the
 * sidebar opens inside it. Same node, same phase, earlier registration, so a
 * row menu or an inline rename field cannot suppress the dismissal from its
 * own handler: Escape tore the whole drawer down under both. Declining the
 * dismissal here leaves the inner layer's own later listener to close just
 * itself; the next Escape finds no transient layer and closes the drawer.
 */

export const MENU_PANEL_ATTRIBUTE = 'data-ui-menu-panel';
export const INLINE_EDIT_ATTRIBUTE = 'data-ui-inline-edit';

const TRANSIENT_LAYER_SELECTOR = `[${MENU_PANEL_ATTRIBUTE}], [${INLINE_EDIT_ATTRIBUTE}]`;

export function isMenuPanelOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(`[${MENU_PANEL_ATTRIBUTE}]`) !== null;
}

export function isInlineEditActive(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(`[${INLINE_EDIT_ATTRIBUTE}]`) !== null;
}

export function isTransientSidebarLayerOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(TRANSIENT_LAYER_SELECTOR) !== null;
}

export function keepOpenForMenuEscape(event: Pick<KeyboardEvent, 'preventDefault'>): void {
  if (isTransientSidebarLayerOpen()) event.preventDefault();
}
