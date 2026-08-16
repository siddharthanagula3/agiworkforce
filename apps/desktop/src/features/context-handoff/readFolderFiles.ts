import { MAX_CHAT_ATTACHMENT_BYTES } from '@agiworkforce/cloud-contracts';
import type { FolderCandidate } from './folderCandidates';
import { readCloudHandoffFile } from './cloudHandoffGrant';

export interface ApprovedFolderFile {
  candidate: FolderCandidate;
  file: File;
  checksumSha256: string;
  secretScanStatus: 'scanned' | 'unscanned-binary';
  content: string;
}

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
    if (content.includes('\0') || content.includes('\uFFFD')) {
      return { content: descriptor, secretScanStatus: 'unscanned-binary' };
    }
    return { content, secretScanStatus: 'scanned' };
  } catch {
    return { content: descriptor, secretScanStatus: 'unscanned-binary' };
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const source = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
