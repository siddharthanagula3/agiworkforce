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
 * The dedicated native reader accepts an opaque picker-created grant plus one
 * root-relative path. The renderer cannot nominate the root; the native side
 * resolves the read beneath its retained directory capability.
 */
import { MAX_CHAT_ATTACHMENT_BYTES } from '@agiworkforce/cloud-contracts';
import type { FolderCandidate } from './folderCandidates';
import { readCloudHandoffFile } from './cloudHandoffGrant';

export interface ApprovedFolderFile {
  candidate: FolderCandidate;
  /** Exactly the bytes that will upload — frozen at read time. */
  file: File;
  /** SHA-256 of the exact immutable bytes carried by `file`. */
  checksumSha256: string;
  /** Whether the original bytes were meaningfully inspected for secrets. */
  secretScanStatus: 'scanned' | 'unscanned-binary';
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

function scanInputForBytes(
  bytes: Uint8Array,
  mimeType: string,
): Pick<ApprovedFolderFile, 'content' | 'secretScanStatus'> {
  const descriptor = `[${mimeType} · ${bytes.byteLength} bytes]`;
  if (!isScannableAsText(mimeType)) {
    return { content: descriptor, secretScanStatus: 'unscanned-binary' };
  }

  try {
    const hasUtf16LeBom = bytes[0] === 0xff && bytes[1] === 0xfe;
    const hasUtf16BeBom = bytes[0] === 0xfe && bytes[1] === 0xff;
    const encoding = hasUtf16LeBom ? 'utf-16le' : hasUtf16BeBom ? 'utf-16be' : 'utf-8';
    const content = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    // NULs are a reliable sign of unsupported/binary encodings when no BOM
    // selected UTF-16. Never award a clean scan badge to replacement data.
    if (content.includes('\0') || content.includes('\uFFFD')) {
      return { content: descriptor, secretScanStatus: 'unscanned-binary' };
    }
    return { content, secretScanStatus: 'scanned' };
  } catch {
    return { content: descriptor, secretScanStatus: 'unscanned-binary' };
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  // Copy into an ArrayBuffer owned by this operation. Tauri's Uint8Array may
  // be a view into a larger buffer, and hashing that backing buffer would bind
  // bytes that are not part of the approved File.
  const source = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Read each candidate into a `File`. One failed read does not abort the batch —
 * a file deleted between listing and confirmation is an ordinary race, and
 * dropping it is better than failing the whole selection. The caller compares
 * lengths to report anything that vanished.
 */
export async function readFolderFiles(
  folderGrantId: string,
  candidates: readonly FolderCandidate[],
): Promise<ApprovedFolderFile[]> {
  const approved: ApprovedFolderFile[] = [];

  for (const candidate of candidates) {
    let bytes: Uint8Array;
    try {
      bytes = await readCloudHandoffFile(folderGrantId, candidate.relativePath);
    } catch (error) {
      console.error('[readFolderFiles] Failed to read %s:', candidate.relativePath, error);
      continue;
    }

    // The glob result is only a listing-time snapshot. A file can become empty
    // or grow beyond the upload limit before this read; use the bytes we will
    // actually upload as authority and fail closed on either case.
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
      console.warn(
        '[readFolderFiles] Dropped %s because its read-time size is outside attachment limits.',
        candidate.relativePath,
      );
      continue;
    }

    const actualCandidate: FolderCandidate = {
      ...candidate,
      byteCount: bytes.byteLength,
    };

    // Name the file by its ROOT-RELATIVE path so the upload never carries the
    // user's home directory or username.
    const file = new File([bytes as BlobPart], actualCandidate.relativePath, {
      type: actualCandidate.mimeType,
    });

    const scanInput = scanInputForBytes(bytes, actualCandidate.mimeType);

    approved.push({
      candidate: actualCandidate,
      file,
      checksumSha256: await sha256Bytes(bytes),
      ...scanInput,
    });
  }

  return approved;
}
