import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  readAsStringAsync,
  writeAsStringAsync,
  createDownloadResumable,
  getFreeDiskStorageAsync,
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
  reportProgressBySteps,
  ChecksumMismatchError,
  type FileSystemDeps,
} from '@agiworkforce/local-llm';
import {
  deleteInstalledModel,
  insertInstalledModel,
  getInstalledModel,
  removeInstalledModel,
} from '@/storage/installedModels';
import {
  deleteExecutorchPresetFiles,
  executorchPresetForModel,
  isExecutorchRecord,
  releaseExecutorchPreset,
} from '@/services/executorchModels';
import type { InstalledModel, ModelRuntime, ModelFormat } from '@/storage/types';

export type ModelDownloadErrorKind =
  | 'wifi_required'
  | 'offline'
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

/**
 * Every kind but `network_error` carries a message this module wrote; a network
 * failure wraps transport text, so callers show their own copy for it.
 */
export function appAuthoredDownloadMessage(error: unknown): string | null {
  if (!(error instanceof ModelDownloadError) || error.kind === 'network_error') return null;
  return error.message;
}

export const MODEL_BUSY_REMOVAL_MESSAGE = 'This model is replying now. Try again when it finishes.';

export class ModelRemovalError extends Error {
  constructor() {
    super(MODEL_BUSY_REMOVAL_MESSAGE);
    this.name = 'ModelRemovalError';
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

const FREE_SPACE_HEADROOM_BYTES = 256 * 1024 * 1024;

export const CELLULAR_CONSENT_SETTING_PATH = 'Settings, Storage, Download over cellular';

async function assertNetworkAllowed(wifiOnly: boolean): Promise<void> {
  const state = await NetInfo.fetch();
  if (state.isConnected === false) {
    throw new ModelDownloadError(
      'offline',
      'This device is offline, so the download cannot start. Reconnect and try again.',
    );
  }
  if (!wifiOnly) return;
  if (state.type === 'wifi') return;
  throw new ModelDownloadError(
    'wifi_required',
    `This download needs Wi-Fi. Connect to Wi-Fi, or turn on ${CELLULAR_CONSENT_SETTING_PATH} to use mobile data.`,
  );
}

function formatGigabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Free space is checked before the first byte is written, so an oversized model
 * fails with the real number instead of a mid-download write error.
 */
export async function assertFreeSpaceFor(requiredBytes: number): Promise<void> {
  let freeBytes: number;
  try {
    freeBytes = await getFreeDiskStorageAsync();
  } catch {
    return;
  }
  if (!Number.isFinite(freeBytes) || freeBytes < 0) return;
  const needed = requiredBytes + FREE_SPACE_HEADROOM_BYTES;
  if (freeBytes >= needed) return;
  throw new ModelDownloadError(
    'storage_full',
    `This model needs ${formatGigabytes(needed)} free and this device has ${formatGigabytes(freeBytes)}. Free up space and try again.`,
  );
}

export async function assertDownloadAllowed(params: {
  wifiOnly: boolean;
  requiredBytes: number;
}): Promise<void> {
  await assertNetworkAllowed(params.wifiOnly);
  await assertFreeSpaceFor(params.requiredBytes);
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

async function sha256OfFile(fileUri: string, assertNotCancelled?: () => void): Promise<string> {
  const info = await getInfoAsync(fileUri);
  if (!info.exists) throw new Error(`File not found: ${fileUri}`);
  const fileSizeBytes = (info as FileInfo & { size?: number }).size ?? 0;

  const hasher = nobleSha256.create();

  const CHUNK_BYTES = 3 * 1024 * 1024;
  let offset = 0;

  while (offset < fileSizeBytes) {
    assertNotCancelled?.();
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

const _installGenerations = new Map<string, number>();

function installGeneration(modelId: string): number {
  return _installGenerations.get(modelId) ?? 0;
}

export function cancelDownload(modelId: string): void {
  _installGenerations.set(modelId, installGeneration(modelId) + 1);
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
  assertNotCancelled: () => void;
  onBytes?: (written: number, total: number) => void;
}): Promise<void> {
  const { activeKey, url, destPath, assertNotCancelled, onBytes } = params;
  const resumePath = `${destPath}.partial`;

  let resumeData: string | undefined;
  const partialInfo = await getInfoAsync(resumePath);
  if (partialInfo.exists && (partialInfo as FileInfo & { size?: number }).size) {
    resumeData = await readAsStringAsync(resumePath, {
      encoding: EncodingType.UTF8,
    }).catch(() => undefined);
  }
  assertNotCancelled();

  const progressCallback = onBytes
    ? ({ totalBytesWritten, totalBytesExpectedToWrite }: DownloadProgressData) => {
        onBytes(totalBytesWritten, totalBytesExpectedToWrite ?? 0);
      }
    : undefined;

  const downloadResumable: DownloadResumable = resumeData
    ? createDownloadResumable(url, destPath, {}, progressCallback, resumeData)
    : createDownloadResumable(url, destPath, {}, progressCallback);

  _activeDownloads.set(activeKey, downloadResumable);
  const releaseActive = (): boolean => {
    if (_activeDownloads.get(activeKey) !== downloadResumable) return true;
    _activeDownloads.delete(activeKey);
    return false;
  };

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
    } catch (saveError) {
      console.warn('[modelDownload] Could not keep the partial download to resume:', saveError);
    }
    const cancelled = releaseActive();

    const msg = err instanceof Error ? err.message : String(err);
    if (cancelled || msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
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

  if (releaseActive()) throw new ModelDownloadError('cancelled', 'Download was cancelled.');

  if (!result || (result.status !== 200 && result.status !== 206)) {
    throw new ModelDownloadError(
      'network_error',
      `Download failed: server returned ${result?.status ?? 'unknown status'}`,
    );
  }

  await deleteAsync(resumePath, { idempotent: true });
}

function expoFileSystemDeps(modelId: string, assertNotCancelled: () => void): FileSystemDeps {
  return {
    fileExists: async (path) => (await getInfoAsync(path)).exists === true,
    sha256OfFile: (path) => sha256OfFile(path, assertNotCancelled),
    deleteFile: async (path) => deleteAsync(path, { idempotent: true }),
    downloadToFile: async (url, dest, onFraction) => {
      await downloadFileWithResume({
        activeKey: `${modelId}::${dest}`,
        url,
        destPath: dest,
        assertNotCancelled,
        onBytes: (written, total) => {
          if (total > 0) onFraction?.(written / total);
        },
      });
    },
  };
}

function cancellableDeps(deps: FileSystemDeps, assertNotCancelled: () => void): FileSystemDeps {
  return {
    fileExists: async (path) => {
      const exists = await deps.fileExists(path);
      assertNotCancelled();
      return exists;
    },
    sha256OfFile: async (path) => {
      const digest = await deps.sha256OfFile(path);
      assertNotCancelled();
      return digest;
    },
    deleteFile: async (path) => {
      await deps.deleteFile(path);
      assertNotCancelled();
    },
    downloadToFile: async (url, dest, onFraction) => {
      await deps.downloadToFile(url, dest, onFraction);
      assertNotCancelled();
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

  const generation = installGeneration(modelId);
  const assertNotCancelled = (): void => {
    if (installGeneration(modelId) !== generation) {
      throw new ModelDownloadError('cancelled', 'Download was cancelled.');
    }
  };

  const existing = await getInstalledModel(modelId);
  assertNotCancelled();
  if (existing?.local_path) {
    const info = await getInfoAsync(existing.local_path);
    assertNotCancelled();
    if (info.exists) {
      throw new ModelDownloadError('already_installed', `Model ${modelId} is already installed`);
    }
  }

  await assertDownloadAllowed({
    wifiOnly,
    requiredBytes: fileSizeBytes + (opts.mmprojSizeBytes ?? 0),
  });
  assertNotCancelled();

  await ensureDir(modelDir(modelId));
  assertNotCancelled();

  const destPath = modelFilePath(modelId, format);

  let startTime = Date.now();
  let lastBytes = 0;
  let latest = { written: 0, total: 0 };
  const showBytes = reportProgressBySteps(() => {
    if (!onProgress) return;
    const { written, total } = latest;
    const now = Date.now();
    const elapsedSec = (now - startTime) / 1000;
    const speedBps = elapsedSec > 0 ? (written - lastBytes) / elapsedSec : 0;
    lastBytes = written;
    startTime = now;
    onProgress(written, total, speedBps);
  });
  const reportBytes = (written: number, total: number): void => {
    if (!onProgress) return;
    latest = { written, total };
    showBytes(total > 0 ? written / total : 0);
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
        deps: cancellableDeps(expoFileSystemDeps(modelId, assertNotCancelled), assertNotCancelled),
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
      assertNotCancelled,
      onBytes: (written, total) => reportBytes(written, total > 0 ? total : fileSizeBytes),
    });

    assertNotCancelled();

    const actualChecksum = await sha256OfFile(destPath, assertNotCancelled);
    assertNotCancelled();
    if (actualChecksum.toLowerCase() !== checksum.toLowerCase()) {
      await deleteAsync(destPath, { idempotent: true });
      throw new ModelDownloadError(
        'checksum_mismatch',
        `Integrity check failed for ${displayName}. The downloaded file is corrupt. Please try again.`,
      );
    }
  }

  assertNotCancelled();

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
  if (installGeneration(modelId) !== generation) {
    await removeInstalledModel(modelId).catch(() => undefined);
    throw new ModelDownloadError('cancelled', 'Download was cancelled.');
  }

  return record;
}

const REMOVAL_UNSUPPORTED =
  'This model does not have a supported file-removal method here yet. The model will remain installed.';

function executorchRemovalUnsupportedReason(model: InstalledModel): string | null {
  if (
    model.id.length === 0 ||
    model.id.length > MAX_MODEL_ID_CHARS ||
    !/^[a-zA-Z0-9._-]+$/.test(model.id) ||
    model.local_path !== null ||
    !executorchPresetForModel(model.id)
  ) {
    return REMOVAL_UNSUPPORTED;
  }
  return null;
}

export function modelRemovalUnsupportedReason(model: InstalledModel): string | null {
  if (isExecutorchRecord(model)) return executorchRemovalUnsupportedReason(model);
  const unsupported = REMOVAL_UNSUPPORTED;
  if (
    !documentDirectory ||
    model.runtime !== 'local' ||
    model.format !== 'gguf' ||
    model.id.length === 0 ||
    model.id.length > MAX_MODEL_ID_CHARS ||
    !/^[a-zA-Z0-9._-]+$/.test(model.id) ||
    model.id === '.' ||
    model.id === '..' ||
    model.local_path !== modelFilePath(model.id, 'gguf')
  ) {
    return unsupported;
  }

  if (model.capabilities !== null) {
    try {
      const capabilities: unknown = JSON.parse(model.capabilities);
      if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
        return unsupported;
      }
      const managedBy = (capabilities as Record<string, unknown>).managedBy;
      if (managedBy !== undefined && managedBy !== 'llama.rn') return unsupported;
    } catch {
      return unsupported;
    }
  }
  return null;
}

async function deleteExecutorchModel(current: InstalledModel): Promise<void> {
  const preset = executorchPresetForModel(current.id)!;
  try {
    releaseExecutorchPreset(preset);
  } catch {
    throw new ModelRemovalError();
  }
  await deleteExecutorchPresetFiles(preset);
  await deleteInstalledModel(current.id);
}

export async function deleteDownloadedModel(expected: InstalledModel): Promise<void> {
  const unsupported = modelRemovalUnsupportedReason(expected);
  if (unsupported) throw new Error(unsupported);

  const current = await getInstalledModel(expected.id);
  const identityFields = [
    'id',
    'runtime',
    'format',
    'local_path',
    'installed_at',
    'sha256',
    'size_bytes',
    'capabilities',
  ] as const;
  if (
    !current ||
    modelRemovalUnsupportedReason(current) ||
    identityFields.some((field) => current[field] !== expected[field])
  ) {
    throw new Error('The installed model changed. Refresh Storage before trying again.');
  }
  if (isExecutorchRecord(current)) {
    await deleteExecutorchModel(current);
    return;
  }
  await deleteAsync(modelDir(current.id), { idempotent: true });
}

export async function getModelStorageBytes(): Promise<number> {
  const info = await getInfoAsync(MODELS_DIR);
  if (!info.exists) return 0;
  return (info as FileInfo & { size?: number }).size ?? 0;
}
