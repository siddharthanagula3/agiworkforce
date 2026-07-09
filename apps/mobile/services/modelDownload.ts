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
import {
  ensureMultimodalArtifacts,
  ChecksumMismatchError,
  type FileSystemDeps,
} from '@agiworkforce/local-llm';
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
  /**
   * Vision projector (mmproj) second artifact for multimodal GGUF models.
   * When all three fields are present, the mmproj is downloaded side-by-side
   * as `<modelPath>.mmproj.gguf` (the convention the vision routing service
   * reads) and both files are checksum-verified before the install record is
   * written. Values come straight from the OnDeviceModel catalog entry.
   */
  mmprojUrl?: string;
  mmprojChecksum?: string;
  mmprojSizeBytes?: number;
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
  assertHttpsUrl(opts.downloadUrl);

  const mmprojFieldCount = [opts.mmprojUrl, opts.mmprojChecksum, opts.mmprojSizeBytes].filter(
    (v) => v !== undefined,
  ).length;
  if (mmprojFieldCount > 0 && mmprojFieldCount < 3) {
    throw new ModelDownloadError(
      'network_error',
      'Multimodal download requires mmprojUrl, mmprojChecksum, and mmprojSizeBytes together.',
    );
  }
  if (opts.mmprojUrl) {
    assertHttpsUrl(opts.mmprojUrl);
    if (!SHA256_HEX.test(opts.mmprojChecksum ?? '')) {
      throw new ModelDownloadError(
        'checksum_mismatch',
        'Vision projector checksum must be a SHA-256 hex digest.',
      );
    }
    if (!Number.isSafeInteger(opts.mmprojSizeBytes) || (opts.mmprojSizeBytes ?? 0) <= 0) {
      throw new ModelDownloadError(
        'storage_full',
        'Vision projector file size must be a positive safe integer.',
      );
    }
  }
}

function assertHttpsUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
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

/**
 * Side-by-side vision projector path. MUST stay `<basePath>.mmproj.gguf` — the
 * vision routing service (features/image/services/vision.ts) derives this same
 * sibling path from InstalledModel.local_path to decide whether the on-device
 * VL route is runnable.
 */
function mmprojFilePath(modelId: string, format: ModelFormat): string {
  return `${modelFilePath(modelId, format)}.mmproj.gguf`;
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

function hasActiveDownload(modelId: string): boolean {
  for (const key of _activeDownloads.keys()) {
    if (key === modelId || key.startsWith(`${modelId}::`)) return true;
  }
  return false;
}

export function cancelDownload(modelId: string): void {
  for (const [key, d] of _activeDownloads) {
    if (key === modelId || key.startsWith(`${modelId}::`)) {
      d.pauseAsync().catch(() => undefined);
      _activeDownloads.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Single-file resumable download (shared by the base model and mmproj paths)
// ---------------------------------------------------------------------------

/**
 * Download one file with HTTP-Range resume support. Persists the opaque
 * resumeData token to `<destPath>.partial` on failure and restores it on the
 * next attempt. Throws ModelDownloadError with the same kind mapping the
 * single-file path always used. Deletes the partial marker on success.
 */
async function downloadFileWithResume(params: {
  activeKey: string;
  url: string;
  destPath: string;
  onBytes?: (written: number, total: number) => void;
}): Promise<void> {
  const { activeKey, url, destPath, onBytes } = params;
  const resumePath = `${destPath}.partial`;

  let resumeData: string | undefined;
  const partialInfo = await getInfoAsync(resumePath);
  if (partialInfo.exists && (partialInfo as FileInfo & { size?: number }).size) {
    resumeData = await readAsStringAsync(resumePath, {
      encoding: EncodingType.UTF8,
    }).catch(() => undefined);
  }

  const progressCallback = onBytes
    ? ({ totalBytesWritten, totalBytesExpectedToWrite }: DownloadProgressData) => {
        onBytes(totalBytesWritten, totalBytesExpectedToWrite ?? 0);
      }
    : undefined;

  const downloadResumable: DownloadResumable = resumeData
    ? createDownloadResumable(url, destPath, {}, progressCallback, resumeData)
    : createDownloadResumable(url, destPath, {}, progressCallback);

  _activeDownloads.set(activeKey, downloadResumable);

  let result: FileSystemDownloadResult | undefined;
  try {
    result = await downloadResumable.downloadAsync();
  } catch (err) {
    // Save resume state for next attempt. createDownloadResumable expects the
    // OPAQUE resumeData token string (used to set the HTTP Range header), not the
    // whole serialized DownloadPauseState object — storing the full JSON broke
    // HTTP Range resume (download restarted from 0).
    try {
      const snapshot = await downloadResumable.savable();
      if (snapshot && snapshot.resumeData) {
        await writeAsStringAsync(resumePath, snapshot.resumeData, {
          encoding: EncodingType.UTF8,
        });
      }
    } catch {
      // Best-effort
    }
    _activeDownloads.delete(activeKey);

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

  _activeDownloads.delete(activeKey);

  if (!result || (result.status !== 200 && result.status !== 206)) {
    throw new ModelDownloadError(
      'network_error',
      `Download failed: server returned ${result?.status ?? 'unknown status'}`,
    );
  }

  // Clean up the partial file on success
  await deleteAsync(resumePath, { idempotent: true });
}

/**
 * FileSystemDeps adapter over expo-file-system for the shared
 * `ensureMultimodalArtifacts` orchestration in @agiworkforce/local-llm
 * (exists-skip, corrupt-file re-download, delete-on-mismatch semantics).
 */
function expoFileSystemDeps(modelId: string): FileSystemDeps {
  return {
    fileExists: async (path) => (await getInfoAsync(path)).exists === true,
    sha256OfFile,
    deleteFile: async (path) => deleteAsync(path, { idempotent: true }),
    downloadToFile: async (url, dest, onFraction) => {
      await downloadFileWithResume({
        activeKey: `${modelId}::${dest}`,
        url,
        destPath: dest,
        onBytes: (written, total) => {
          if (total > 0) onFraction?.(written / total);
        },
      });
    },
  };
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

  if (hasActiveDownload(modelId)) {
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

  // Speed-tracking progress wrapper shared by both branches.
  let startTime = Date.now();
  let lastBytes = 0;
  const reportBytes = (written: number, total: number): void => {
    if (!onProgress) return;
    const now = Date.now();
    const elapsedSec = (now - startTime) / 1000;
    const speedBps = elapsedSec > 0 ? (written - lastBytes) / elapsedSec : 0;
    lastBytes = written;
    startTime = now;
    onProgress(written, total, speedBps);
  };

  if (opts.mmprojUrl && opts.mmprojChecksum && opts.mmprojSizeBytes) {
    // Multimodal path: base GGUF + side-by-side mmproj vision projector, both
    // checksum-verified via the shared local-llm orchestration (idempotent
    // exists-skip, corrupt re-download, delete-on-mismatch).
    const mmprojPath = mmprojFilePath(modelId, format);
    const totalBytes = fileSizeBytes + opts.mmprojSizeBytes;
    try {
      await ensureMultimodalArtifacts({
        artifacts: {
          model: { url: downloadUrl, checksum, sizeBytes: fileSizeBytes },
          mmproj: {
            url: opts.mmprojUrl,
            checksum: opts.mmprojChecksum,
            sizeBytes: opts.mmprojSizeBytes,
          },
        },
        modelPath: destPath,
        mmprojPath,
        deps: expoFileSystemDeps(modelId),
        onProgress: (fraction) => reportBytes(Math.round(fraction * totalBytes), totalBytes),
      });
    } catch (err) {
      if (err instanceof ChecksumMismatchError) {
        throw new ModelDownloadError(
          'checksum_mismatch',
          `Integrity check failed for ${displayName}. The downloaded file is corrupt. Please try again.`,
        );
      }
      throw err; // ModelDownloadError kinds from downloadFileWithResume pass through.
    }
  } else {
    await downloadFileWithResume({
      activeKey: modelId,
      url: downloadUrl,
      destPath,
      onBytes: (written, total) => reportBytes(written, total > 0 ? total : fileSizeBytes),
    });

    // Checksum verification
    const actualChecksum = await sha256OfFile(destPath);
    if (actualChecksum.toLowerCase() !== checksum.toLowerCase()) {
      await deleteAsync(destPath, { idempotent: true });
      throw new ModelDownloadError(
        'checksum_mismatch',
        `Integrity check failed for ${displayName}. The downloaded file is corrupt. Please try again.`,
      );
    }
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
