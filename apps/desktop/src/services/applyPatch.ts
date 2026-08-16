
import {
  applyPatch as applyPatchInPackage,
  type ApplyPatchResult,
  type FSBridge,
  WorkspaceEscapeError,
} from '@agiworkforce/apply-patch';

export type { ApplyPatchResult, FSBridge };
export { WorkspaceEscapeError };

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
