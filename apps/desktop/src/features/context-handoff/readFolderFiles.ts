/**
 * Reads the files a Cloud user selected from a picked folder, without widening
 * the app's persistent filesystem permissions.
 *
 * ## Why not the usual file-ops command
 *
 * `fsReadFileContent` routes through `check_file_permission`, which gates on
 * `settings.allowed_directories` and denies when that list does not contain the
 * path. Cloud mode deliberately never adds the picked folder to that list (see
 * `hooks/useFolderSelection.ts`), so the app-level command is the wrong tool
 * here by construction — using it would mean re-introducing exactly the
 * persistent capability grant Cloud is designed to avoid.
 *
 * The Tauri dialog plugin already grants read scope to the specific path the
 * user chose in the picker, for that session only. Reading through
 * `@tauri-apps/plugin-fs` therefore stays inside what the user just consented
 * to at the OS level, and grants nothing beyond it.
 */
import { readFile } from '@tauri-apps/plugin-fs';
import type { FolderCandidate } from './folderCandidates';

export interface ApprovedFolderFile {
  candidate: FolderCandidate;
  /** Exactly the bytes that will upload — frozen at read time. */
  file: File;
  /**
   * Text handed to the secret scanner. Binary files get a bounded descriptor
   * instead of their bytes: scanning a PNG for credentials finds nothing useful
   * and would put megabytes of noise through the redactor.
   */
  content: string;
}

/** MIME types whose bytes are meaningfully scannable as text. */
function isScannableAsText(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/typescript'
  );
}

/**
 * Read each candidate into a `File`. One failed read does not abort the batch —
 * a file deleted between listing and confirmation is an ordinary race, and
 * dropping it is better than failing the whole selection. The caller compares
 * lengths to report anything that vanished.
 */
export async function readFolderFiles(
  candidates: readonly FolderCandidate[],
): Promise<ApprovedFolderFile[]> {
  const approved: ApprovedFolderFile[] = [];

  for (const candidate of candidates) {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(candidate.path);
    } catch (error) {
      console.error('[readFolderFiles] Failed to read %s:', candidate.relativePath, error);
      continue;
    }

    // Name the file by its ROOT-RELATIVE path so the upload never carries the
    // user's home directory or username.
    const file = new File([bytes as BlobPart], candidate.relativePath, {
      type: candidate.mimeType,
    });

    const content = isScannableAsText(candidate.mimeType)
      ? new TextDecoder().decode(bytes)
      : `[${candidate.mimeType} · ${bytes.byteLength} bytes]`;

    approved.push({ candidate, file, content });
  }

  return approved;
}
