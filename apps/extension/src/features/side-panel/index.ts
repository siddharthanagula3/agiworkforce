/**
 * side-panel feature barrel — markdown renderer + voice input.
 *
 * Exports:
 *   - markdown: renderMarkdown, sanitizeHtml, ensureDomPurifyHook
 *   - voice: setupVoiceInput
 *
 * Note: side_panel.ts (the MV3 entry point) stays at src root per
 * vite.config.ts rollupOptions.input constraint.
 */
export * from './markdown';
export * from './voice';
