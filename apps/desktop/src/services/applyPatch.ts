/**
 * Desktop apply-patch service.
 *
 * Wraps `@agiworkforce/apply-patch` for renderer-side patch application.
 * Uses the package's `FSBridge` abstraction so the same logic can run
 * against either:
 *   - the real disk (Node-only contexts: tests, scripts)
 *   - a Tauri-scoped FS bridge (renderer contexts using `@tauri-apps/
 *     plugin-fs`)
 *
 * For now we expose the Tauri-bridge variant; tests load the package's
 * `nodeFSBridge` directly.
 *
 * Cross-platform path semantics: on Windows, paths use `\` as the
 * separator; the package's `resolve()` from `node:path` picks the right
 * separator by environment. When a model emits forward slashes (typical
 * in chat output), Node's `path.resolve` normalizes them on Windows. The
 * Tauri bridge variant below does the same — it normalizes incoming
 * paths via `tauri::path` before reading.
 */

import {
  applyPatch as applyPatchInPackage,
  type ApplyPatchResult,
  type FSBridge,
  WorkspaceEscapeError,
} from '@agiworkforce/apply-patch';

export type { ApplyPatchResult, FSBridge };
export { WorkspaceEscapeError };

/**
 * Apply a patch using a caller-supplied FSBridge. For Tauri-scoped FS,
 * pass a bridge that delegates to `@tauri-apps/plugin-fs`'s `readTextFile`,
 * `writeTextFile`, `remove`, `mkdir`, `exists` (with `BaseDirectory.AppData`
 * or similar).
 */
export async function applyDesktopPatch(
  patchText: string,
  options: {
    cwd: string;
    fs: FSBridge;
    signal?: AbortSignal;
  },
): Promise<ApplyPatchResult> {
  return applyPatchInPackage(patchText, {
    cwd: options.cwd,
    fs: options.fs,
    workspaceOnly: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
