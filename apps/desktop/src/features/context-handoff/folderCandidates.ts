/**
 * Folder → attachment candidate selection for Managed Cloud.
 *
 * When a Cloud user picks a folder, the folder itself grants nothing (see
 * `hooks/useFolderSelection.ts`). What actually leaves the device is a bounded
 * set of files riding the composer's ordinary attachment upload. This module
 * turns a raw glob listing into that candidate set.
 *
 * ## Why the caps are applied here rather than at upload
 *
 * The upload path already enforces `MAX_CHAT_ATTACHMENT_COUNT` and
 * `MAX_CHAT_ATTACHMENT_BYTES`. Applying them again at selection time is not
 * belt-and-braces — it is the difference between a consent sheet that tells the
 * truth and one that does not. A sheet offering 400 files when 10 can be sent
 * asks the user to approve a payload the system will silently refuse, which
 * makes the approval meaningless.
 *
 * ## Why this module is pure
 *
 * No Tauri import, deliberately. `DesktopShellV3.test.tsx` mocks
 * `lib/tauri-mock` with a bare `invoke: vi.fn()` returning `undefined`, so any
 * module that reached for `globSearch` during a shell render would throw on
 * `result.matches`. Keeping the selection logic free of I/O also makes it
 * testable against hand-built fixtures with no mocks at all.
 */
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  resolveChatAttachmentMimeType,
} from '@agiworkforce/cloud-contracts';
import type { GlobMatch } from '../../api/codeSearch';

export interface FolderCandidate {
  /** Root-relative native listing path; never an ambient filesystem authority. */
  path: string;
  /**
   * Root-relative path. Doubles as the stable id AND the uploaded file name, so
   * the payload never carries the user's home directory or username.
   */
  relativePath: string;
  mimeType: string;
  byteCount: number;
}

/**
 * Filter a glob listing down to files the attachment pipeline can actually
 * accept. Directories, empty files, oversized files, and types with no
 * resolvable MIME are dropped up front rather than surfaced and then rejected.
 *
 * Order is preserved from the caller — the picker-owned native listing returns
 * most-recently-modified first, which is the most useful default for "what am
 * I working on".
 */
export function toFolderCandidates(matches: readonly GlobMatch[]): FolderCandidate[] {
  const candidates: FolderCandidate[] = [];
  for (const match of matches) {
    // `**/*` matches directories too.
    if (!match.isFile) continue;
    // A zero-byte file carries no context; an oversized one cannot be uploaded.
    if (match.sizeBytes <= 0 || match.sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) continue;
    const mimeType = resolveChatAttachmentMimeType(match.relativePath, '');
    if (!mimeType) continue;
    candidates.push({
      path: match.path,
      relativePath: match.relativePath,
      mimeType,
      byteCount: match.sizeBytes,
    });
  }
  return candidates;
}

export interface DefaultSelectionResult {
  selected: FolderCandidate[];
  /** Candidates left unselected because a cap was reached. */
  omittedForCap: number;
}

/**
 * Greedy default selection under BOTH caps, in candidate order.
 *
 * Deliberately greedy rather than "largest first" or "smallest first": the
 * caller's order is recency, and a user scanning the sheet expects the files
 * they just touched to be the ones pre-ticked. `omittedForCap` lets the sheet
 * say plainly how many were left out instead of silently truncating.
 */
export function selectDefaultCandidates(
  candidates: readonly FolderCandidate[],
): DefaultSelectionResult {
  const selected: FolderCandidate[] = [];
  let totalBytes = 0;
  let omittedForCap = 0;

  for (const candidate of candidates) {
    if (selected.length >= MAX_CHAT_ATTACHMENT_COUNT) {
      omittedForCap += 1;
      continue;
    }
    if (totalBytes + candidate.byteCount > MAX_CHAT_ATTACHMENT_BYTES) {
      omittedForCap += 1;
      continue;
    }
    selected.push(candidate);
    totalBytes += candidate.byteCount;
  }

  return { selected, omittedForCap };
}

/** Total bytes of a candidate set — the number the consent sheet shows. */
export function totalBytes(candidates: readonly FolderCandidate[]): number {
  return candidates.reduce((sum, candidate) => sum + candidate.byteCount, 0);
}

/**
 * Whether a selection can still be sent. The sheet's confirm button reads this
 * rather than re-deriving the rule, so the button and the upload agree.
 */
export function isSelectionWithinCaps(candidates: readonly FolderCandidate[]): boolean {
  return (
    candidates.length > 0 &&
    candidates.length <= MAX_CHAT_ATTACHMENT_COUNT &&
    totalBytes(candidates) <= MAX_CHAT_ATTACHMENT_BYTES
  );
}
