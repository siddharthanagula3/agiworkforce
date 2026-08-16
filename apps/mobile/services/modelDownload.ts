
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
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import {
  ensureMultimodalArtifacts,
  ChecksumMismatchError,
  type FileSystemDeps,
} from '@agiworkforce/local-llm';
import { insertInstalledModel, getInstalledModel } from '@/storage/installedModels';
import type { InstalledModel, ModelRuntime, ModelFormat } from '@/storage/types';

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

export interface ModelDownloadOpts {
  modelId: string;
  displayName: string;
  downloadUrl: string;
  checksum: string;
  fileSizeBytes: number;
  runtime: ModelRuntime;
  format: ModelFormat;
  capabilities?: string;
  wifiOnly?: boolean;
  onProgress?: (downloaded: number, total: number, speedBps: number) => void;
  mmprojUrl?: string;
  mmprojChecksum?: string;
  mmprojSizeBytes?: number;
}

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

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

function base64ChunkToBytes(b64: string): Uint8Array {
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

async function sha256OfFile(fileUri: string): Promise<string> {
  const info = await getInfoAsync(fileUri);
  if (!info.exists) throw new Error(`File not found: ${fileUri}`);
  const fileSizeBytes = (info as FileInfo & { size?: number }).size ?? 0;

  const hasher = nobleSha256.create();

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

  await deleteAsync(resumePath, { idempotent: true });
}

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

  const existing = await getInstalledModel(modelId);
  if (existing?.local_path) {
    const info = await getInfoAsync(existing.local_path);
    if (info.exists) {
      throw new ModelDownloadError('already_installed', `Model ${modelId} is already installed`);
    }
  }

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
      throw err;
    }
  } else {
    await downloadFileWithResume({
      activeKey: modelId,
      url: downloadUrl,
      destPath,
      onBytes: (written, total) => reportBytes(written, total > 0 ? total : fileSizeBytes),
    });

    const actualChecksum = await sha256OfFile(destPath);
    if (actualChecksum.toLowerCase() !== checksum.toLowerCase()) {
      await deleteAsync(destPath, { idempotent: true });
      throw new ModelDownloadError(
        'checksum_mismatch',
        `Integrity check failed for ${displayName}. The downloaded file is corrupt. Please try again.`,
      );
    }
  }

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

export async function deleteDownloadedModel(modelId: string, _format: ModelFormat): Promise<void> {
  await deleteAsync(modelDir(modelId), { idempotent: true });
  // DB row removed by caller via storage/installedModels.deleteInstalledModel
}

export async function getModelStorageBytes(): Promise<number> {
  const info = await getInfoAsync(MODELS_DIR);
  if (!info.exists) return 0;
  return (info as FileInfo & { size?: number }).size ?? 0;
}
