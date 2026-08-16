import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  resolveChatAttachmentMimeType,
} from '@agiworkforce/cloud-contracts';
import type { GlobMatch } from '../../api/codeSearch';

export interface FolderCandidate {
  path: string;
  relativePath: string;
  mimeType: string;
  byteCount: number;
}

export function toFolderCandidates(matches: readonly GlobMatch[]): FolderCandidate[] {
  const candidates: FolderCandidate[] = [];
  for (const match of matches) {
    if (!match.isFile) continue;
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
  omittedForCap: number;
}

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

export function totalBytes(candidates: readonly FolderCandidate[]): number {
  return candidates.reduce((sum, candidate) => sum + candidate.byteCount, 0);
}

export function isSelectionWithinCaps(candidates: readonly FolderCandidate[]): boolean {
  return (
    candidates.length > 0 &&
    candidates.length <= MAX_CHAT_ATTACHMENT_COUNT &&
    totalBytes(candidates) <= MAX_CHAT_ATTACHMENT_BYTES
  );
}
