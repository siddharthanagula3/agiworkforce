/**
 * REMOVED (AUDIT-FIX CMP-31).
 *
 * `FocusModeButtons` was exported from the Composer barrel with no render site
 * anywhere in the repo -- a five-way mode switcher no surface mounted. Its
 * contents are deleted; this file is kept only because the working tree cannot
 * unlink files. Nothing imports it: it is no longer in
 * `apps/web/features/chat/components/Composer/index.ts`.
 *
 * The desktop surface keeps its own, LIVE focus-mode control
 * (`apps/desktop/src/features/chat/FocusModeButtons.tsx`), which is unrelated
 * to this dead web copy.
 */
export {};
