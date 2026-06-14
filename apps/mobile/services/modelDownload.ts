/**
 * Model file download service — resumable, integrity-checked, Wi-Fi-aware.
 *
 * Downloads model files from a URL into the app documents directory under
 * `models/<modelId>/`. Supports HTTP Range-based resume on network drop.
 * SHA-256 checksum is verified after download completes. On success the
 * record is written to the `installed_models` SQLCipher table.
 *
 * Wi-Fi-only enforcement uses @react-native-community/netinfo. The default
 * is wifiOnly=true because model files are large (1–10 GB+).
 *
 * No network calls happen outside this service. All file I/O uses
 * expo-file-system/legacy. No plaintext user content is stored here.
 */

import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  readAsStringAsync,
  writeAsStringAsync,
  createDownloadResumable,
  EncodingType,
  type FileInfo,
  type DownloadResumable,
  type FileSystemDownloadResult,
  type DownloadProgressData,
} from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
// It hashes raw bytes correctly; expo-crypto's digestStringAsync hashes the string representation.
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { insertInstalledModel, getInstalledModel } from '@/storage/installedModels';
import type { InstalledModel, ModelRuntime, ModelFormat } from '@/storage/types';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type ModelDownloadErrorKind =
  | 'wifi_required'
  | 'checksum_mismatch'
  | 'storage_full'
  | 'network_error'
  | 'cancelled'
  | 'already_installed';

export class ModelDownloadError extends Error {
  readonly kind: ModelDownloadErrorKind;
  constructor(kind: ModelDownloadErrorKind, message: string) {
    super(message);
    this.name = 'ModelDownloadError';
    this.kind = kind;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelDownloadOpts {
  modelId: string;
  displayName: string;
  downloadUrl: string;
  /** SHA-256 hex string from the catalog */
  checksum: string;
  fileSizeBytes: number;
  runtime: ModelRuntime;
  format: ModelFormat;
  capabilities?: string;
  /** Abort download on non-Wi-Fi connection. Defaults to true. */
  wifiOnly?: boolean;
  /** Called during download: bytes downloaded so far, total bytes, speed in bytes/s */
  onProgress?: (downloaded: number, total: number, speedBps: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODELS_DIR = `${documentDirectory}models/`;
const MAX_MODEL_ID_CHARS = 96;
const SHA256_HEX = /^[0-9a-f]{64}$/i;

function modelDir(modelId: string): string {
  const safe = modelId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${MODELS_DIR}${safe}/`;
}

function assertValidDownloadOptions(opts: ModelDownloadOpts): void {
  if (opts.modelId.length === 0 || opts.modelId.length > MAX_MODEL_ID_CHARS) {
    throw new ModelDownloadError(
      'network_error',
      `Invalid model id length; expected 1-${MAX_MODEL_ID_CHARS} characters.`,
    );
  }
  if (!SHA256_HEX.test(opts.checksum)) {
    throw new ModelDownloadError(
      'checksum_mismatch',
      'Model checksum must be a SHA-256 hex digest.',
    );
  }
  if (!Number.isSafeInteger(opts.fileSizeBytes) || opts.fileSizeBytes <= 0) {
    throw new ModelDownloadError(
      'storage_full',
      'Model file size must be a positive safe integer.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(opts.downloadUrl);
  } catch {
    throw new ModelDownloadError('network_error', 'Model download URL is invalid.');
  }
  if (parsed.protocol !== 'https:') {
    throw new ModelDownloadError('network_error', 'Model downloads must use HTTPS.');
  }
}

function modelFilePath(modelId: string, format: ModelFormat): string {
  const ext = format === 'gguf' ? 'gguf' : format === 'pte' ? 'pte' : 'bin';
  return `${modelDir(modelId)}model.${ext}`;
}

function resumeFilePath(modelId: string, format: ModelFormat): string {
  return `${modelFilePath(modelId, format)}.partial`;
}

async function ensureDir(dir: string): Promise<void> {
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function checkWifi(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.type === 'wifi' && state.isConnected === true;
}

// Base64 alphabet for the decoder below.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

/**
 * Decode a base64 string chunk to raw bytes without using `atob`.
 * `atob` is not safe for large strings on Hermes (OOM risk) and also
 * returns a Latin-1 string rather than a Uint8Array.
 */
function base64ChunkToBytes(b64: string): Uint8Array {
  // Strip padding
  const stripped = b64.replace(/=+$/, '');
  const outLen = Math.floor((stripped.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  for (let i = 0; i < stripped.length; i += 4) {
    const a = B64_LOOKUP[stripped.charCodeAt(i)] ?? 0;
    const b = B64_LOOKUP[stripped.charCodeAt(i + 1)] ?? 0;
    const c = B64_LOOKUP[stripped.charCodeAt(i + 2)] ?? 0;
    const d = B64_LOOKUP[stripped.charCodeAt(i + 3)] ?? 0;
    out[outIdx++] = (a << 2) | (b >> 4);
    if (i + 2 < stripped.length) out[outIdx++] = ((b & 0xf) << 4) | (c >> 2);
    if (i + 3 < stripped.length) out[outIdx++] = ((c & 0x3) << 6) | d;
  }
  return out.subarray(0, outIdx);
}

/**
 * Compute SHA-256 of a file on disk over raw bytes.
 *
 * Reads the file in 4 MB base64 chunks (each 4 MB of base64 ≈ 3 MB raw),
 * decodes each chunk to Uint8Array, and feeds to @noble/hashes streaming
 * SHA-256. This keeps peak JS heap well below model file size even for
 * multi-GB downloads.
 *
 * expo-file-system/legacy `readAsStringAsync` with `position` + `length`
 * (Base64 encoding mode) reads a slice of the file in bytes.
 */
async function sha256OfFile(fileUri: string): Promise<string> {
  const info = await getInfoAsync(fileUri);
  if (!info.exists) throw new Error(`File not found: ${fileUri}`);
  const fileSizeBytes = (info as FileInfo & { size?: number }).size ?? 0;

  const hasher = nobleSha256.create();

  // Read in 3 MB raw chunks (= 4 MB base64 chars).
  const CHUNK_BYTES = 3 * 1024 * 1024;
  let offset = 0;

  while (offset < fileSizeBytes) {
    const length = Math.min(CHUNK_BYTES, fileSizeBytes - offset);
    const b64Chunk = await readAsStringAsync(fileUri, {
      encoding: EncodingType.Base64,
      position: offset,
      length,
    });
    hasher.update(base64ChunkToBytes(b64Chunk));
    offset += length;
  }

  const digest = hasher.digest();
  let hex = '';
  for (let i = 0; i < digest.length; i++) {
    hex += (digest[i] as number).toString(16).padStart(2, '0');
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Active download map (allows cancellation)
// ---------------------------------------------------------------------------

const _activeDownloads = new Map<string, DownloadResumable>();

export function cancelDownload(modelId: string): void {
  const d = _activeDownloads.get(modelId);
  if (d) {
    d.pauseAsync().catch(() => undefined);
    _activeDownloads.delete(modelId);
  }
}

// ---------------------------------------------------------------------------
// Main download function
// ---------------------------------------------------------------------------

export async function downloadModel(opts: ModelDownloadOpts): Promise<InstalledModel> {
  assertValidDownloadOptions(opts);

  const {
    modelId,
    displayName,
    downloadUrl,
    checksum,
    fileSizeBytes,
    runtime,
    format,
    capabilities,
    wifiOnly = true,
    onProgress,
  } = opts;

  if (_activeDownloads.has(modelId)) {
    throw new ModelDownloadError('already_installed', `Model ${modelId} is already downloading`);
  }

  // Idempotency — if already fully installed return the record
  const existing = await getInstalledModel(modelId);
  if (existing?.local_path) {
    const info = await getInfoAsync(existing.local_path);
    if (info.exists) {
      throw new ModelDownloadError('already_installed', `Model ${modelId} is already installed`);
    }
  }

  // Wi-Fi gate
  if (wifiOnly) {
    const isWifi = await checkWifi();
    if (!isWifi) {
      throw new ModelDownloadError(
        'wifi_required',
        'Wi-Fi connection required to download models. Connect to Wi-Fi or disable the Wi-Fi-only setting.',
      );
    }
  }

  await ensureDir(modelDir(modelId));

  const destPath = modelFilePath(modelId, format);
  const resumePath = resumeFilePath(modelId, format);

  // Check for an existing partial download to resume
  let resumeData: string | undefined;
  const partialInfo = await getInfoAsync(resumePath);
  if (partialInfo.exists && (partialInfo as FileInfo & { size?: number }).size) {
    resumeData = await readAsStringAsync(resumePath, {
      encoding: EncodingType.UTF8,
    }).catch(() => undefined);
  }

  let startTime = Date.now();
  let lastBytes = 0;

  const progressCallback = onProgress
    ? ({ totalBytesWritten, totalBytesExpectedToWrite }: DownloadProgressData) => {
        const now = Date.now();
        const elapsedSec = (now - startTime) / 1000;
        const speedBps = elapsedSec > 0 ? (totalBytesWritten - lastBytes) / elapsedSec : 0;
        lastBytes = totalBytesWritten;
        startTime = now;
        onProgress(totalBytesWritten, totalBytesExpectedToWrite ?? fileSizeBytes, speedBps);
      }
    : undefined;

  const downloadResumable: DownloadResumable = resumeData
    ? createDownloadResumable(downloadUrl, destPath, {}, progressCallback, resumeData)
    : createDownloadResumable(downloadUrl, destPath, {}, progressCallback);

  _activeDownloads.set(modelId, downloadResumable);

  let result: FileSystemDownloadResult | undefined;
  try {
    result = await downloadResumable.downloadAsync();
  } catch (err) {
    // Save resume state for next attempt
    try {
      const snapshot = await downloadResumable.savable();
      if (snapshot) {
        await writeAsStringAsync(resumePath, JSON.stringify(snapshot), {
          encoding: EncodingType.UTF8,
        });
      }
    } catch {
      // Best-effort
    }
    _activeDownloads.delete(modelId);

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
      throw new ModelDownloadError('cancelled', 'Download was cancelled.');
    }
    if (msg.toLowerCase().includes('disk') || msg.toLowerCase().includes('space')) {
      throw new ModelDownloadError(
        'storage_full',
        'Not enough storage space to download this model.',
      );
    }
    throw new ModelDownloadError('network_error', `Download failed: ${msg}`);
  }

  _activeDownloads.delete(modelId);

  if (!result || (result.status !== 200 && result.status !== 206)) {
    throw new ModelDownloadError(
      'network_error',
      `Download failed: server returned ${result?.status ?? 'unknown status'}`,
    );
  }

  // Clean up the partial file on success
  await deleteAsync(resumePath, { idempotent: true });

  // Checksum verification
  const actualChecksum = await sha256OfFile(destPath);
  if (actualChecksum.toLowerCase() !== checksum.toLowerCase()) {
    await deleteAsync(destPath, { idempotent: true });
    throw new ModelDownloadError(
      'checksum_mismatch',
      `Integrity check failed for ${displayName}. The downloaded file is corrupt. Please try again.`,
    );
  }

  // Record in SQLCipher
  const record: InstalledModel = {
    id: modelId,
    display_name: displayName,
    runtime,
    format,
    size_bytes: fileSizeBytes,
    sha256: checksum,
    local_path: destPath,
    installed_at: Date.now(),
    last_used_at: null,
    capabilities: capabilities ?? null,
  };

  await insertInstalledModel(record);

  return record;
}

// ---------------------------------------------------------------------------
// Delete a downloaded model from disk
// ---------------------------------------------------------------------------

export async function deleteDownloadedModel(modelId: string, _format: ModelFormat): Promise<void> {
  await deleteAsync(modelDir(modelId), { idempotent: true });
  // DB row removed by caller via storage/installedModels.deleteInstalledModel
}

// ---------------------------------------------------------------------------
// Storage usage estimate for installed models directory
// ---------------------------------------------------------------------------

export async function getModelStorageBytes(): Promise<number> {
  const info = await getInfoAsync(MODELS_DIR);
  if (!info.exists) return 0;
  return (info as FileInfo & { size?: number }).size ?? 0;
}
