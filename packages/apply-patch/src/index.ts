/**
 * @agiworkforce/apply-patch
 *
 * Lift of OpenClaw's `apply_patch` tool format — parser + applicator —
 * with a minimal `FSBridge` abstraction so callers can target real disk,
 * Tauri-scoped filesystems, S3, or sandbox bridges without forking the
 * patch logic.
 *
 * The patch format is:
 *
 * ```
 * *** Begin Patch
 * *** Add File: path/to/new.txt
 * +line one
 * +line two
 * *** Update File: path/to/edit.ts
 * @@ optional context @@
 * -old line
 * +new line
 *  unchanged context line
 * *** Delete File: path/to/old.txt
 * *** End Patch
 * ```
 *
 * Update hunks support increasingly-relaxed line matching (exact → trimEnd
 * → trim → unicode-punctuation-normalized) so models that quote slightly
 * mangled context lines still match.
 *
 * Ported from OpenClaw `src/agents/apply-patch.ts` + `apply-patch-update.ts`
 * (MIT, Peter Steinberger). See THIRD_PARTY_LICENSES.md at repo root.
 *
 * @packageDocumentation
 */

import { applyUpdateHunkToContents } from './apply-update';
import { nodeFSBridge } from './node-fs-bridge';
import { parsePatch } from './parse';
import type { ApplyPatchOptions, ApplyPatchResult, FSBridge, Hunk } from './types';

export type {
  ApplyPatchOptions,
  ApplyPatchResult,
  ApplyPatchSummary,
  AddFileHunk,
  DeleteFileHunk,
  UpdateFileHunk,
  UpdateFileChunk,
  Hunk,
  FSBridge,
} from './types';
export { parsePatch } from './parse';
export { applyUpdateHunkToContents } from './apply-update';
export { nodeFSBridge } from './node-fs-bridge';

/**
 * Parse and apply a patch to the filesystem accessed via `fs`. Returns a
 * summary of what changed. Throws on any error (missing context, file not
 * found for update/delete, etc.) — apply-patch is intentionally
 * all-or-nothing per hunk; partial-on-error is the caller's choice if they
 * want to roll back.
 */
export async function applyPatch(
  patchText: string,
  options: ApplyPatchOptions = {},
): Promise<ApplyPatchResult> {
  const fs = options.fs ?? nodeFSBridge({ ...(options.cwd ? { cwd: options.cwd } : {}) });
  const hunks = parsePatch(patchText);
  if (hunks.length === 0) {
    throw new Error('No files were modified.');
  }

  const summary = { added: [] as string[], modified: [] as string[], deleted: [] as string[] };
  const changelog: string[] = [];

  for (const hunk of hunks) {
    options.signal?.throwIfAborted?.();
    await applyHunk(fs, hunk);
    switch (hunk.kind) {
      case 'add':
        summary.added.push(hunk.path);
        changelog.push(`A ${hunk.path}`);
        break;
      case 'delete':
        summary.deleted.push(hunk.path);
        changelog.push(`D ${hunk.path}`);
        break;
      case 'update':
        summary.modified.push(hunk.path);
        changelog.push(hunk.movePath ? `M ${hunk.path} -> ${hunk.movePath}` : `M ${hunk.path}`);
        break;
    }
  }

  return { summary, text: changelog.join('\n') };
}

async function applyHunk(fs: FSBridge, hunk: Hunk): Promise<void> {
  switch (hunk.kind) {
    case 'add': {
      if (await fs.exists(hunk.path)) {
        throw new Error(`Cannot add ${hunk.path}: file already exists.`);
      }
      await fs.writeFile(hunk.path, hunk.contents);
      return;
    }
    case 'delete': {
      await fs.remove(hunk.path);
      return;
    }
    case 'update': {
      const original = await fs.readFile(hunk.path);
      const updated = applyUpdateHunkToContents(hunk.path, original, hunk.chunks);
      const target = hunk.movePath ?? hunk.path;
      await fs.writeFile(target, updated);
      if (hunk.movePath && hunk.movePath !== hunk.path) {
        await fs.remove(hunk.path);
      }
      return;
    }
  }
}
