/**
 * in-page-panel feature barrel.
 *
 * Floating launcher + slide-in panel injected into web pages via the
 * content script. Shadow DOM isolated. CSP-safe (no inline handlers,
 * no external asset fetches).
 *
 * Primary entry point for content.ts: setupInPagePanel().
 */
export * from './setup';
export * from './launcher';
export * from './pageActions';
export * from './panel';
export * from './panelStyles';
