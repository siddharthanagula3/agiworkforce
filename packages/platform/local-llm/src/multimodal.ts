
import type { OnDeviceModel } from '@agiworkforce/types';
import type { DeviceCapabilities } from './types';

export const MULTIMODAL_MIN_RAM_MB = 3500;

export function hasSufficientRAMForMultimodal(
  totalRAMMB: DeviceCapabilities['totalRAMMB'],
): boolean {
  return totalRAMMB >= MULTIMODAL_MIN_RAM_MB;
}

export interface MultimodalArtifact {
  url: string;
  checksum: string;
  sizeBytes: number;
}

export interface MultimodalArtifacts {
  model: MultimodalArtifact;
  mmproj: MultimodalArtifact;
}

export function resolveMultimodalArtifacts(model: OnDeviceModel): MultimodalArtifacts | null {
  if (!model.capabilities.visionIn) return null;
  if (!model.supportedRuntimes.includes('llama-rn')) return null;
  if (!model.downloadUrl || !model.checksum || !model.fileSizeBytes) return null;
  if (!model.mmprojUrl || !model.mmprojChecksum || !model.mmprojSizeBytes) return null;
  return {
    model: { url: model.downloadUrl, checksum: model.checksum, sizeBytes: model.fileSizeBytes },
    mmproj: {
      url: model.mmprojUrl,
      checksum: model.mmprojChecksum,
      sizeBytes: model.mmprojSizeBytes,
    },
  };
}

export function isMultimodalModel(model: OnDeviceModel): boolean {
  return resolveMultimodalArtifacts(model) !== null;
}

export function hasRunnableGgufArtifacts(model: OnDeviceModel): boolean {
  if (model.format !== 'gguf') return false;
  if (!model.supportedRuntimes.includes('llama-rn')) return false;
  if (!model.downloadUrl || !model.checksum || !model.fileSizeBytes) return false;
  if (model.capabilities.visionIn) return resolveMultimodalArtifacts(model) !== null;
  return true;
}

export function effectiveVisionIn(
  model: OnDeviceModel,
  state: { mmprojInstalled: boolean },
): boolean {
  return Boolean(model.capabilities.visionIn) && state.mmprojInstalled;
}

export function effectiveTier2VisionIn(
  model: OnDeviceModel,
  state: { modelInstalled: boolean },
): boolean {
  return (
    Boolean(model.capabilities.visionIn) &&
    model.supportedRuntimes.includes('executorch') &&
    Boolean(model.executorchPreset) &&
    state.modelInstalled
  );
}

function normalizeHex(hex: string): string {
  return hex
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, '');
}

function equalsHex(a: string, b: string): boolean {
  return normalizeHex(a) === normalizeHex(b);
}

export class ChecksumMismatchError extends Error {
  constructor(
    readonly url: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `Checksum mismatch for ${url}: expected sha256 ${normalizeHex(expected)}, got ${normalizeHex(actual)}`,
    );
    this.name = 'ChecksumMismatchError';
  }
}

export interface FileSystemDeps {
  fileExists: (path: string) => Promise<boolean>;
  sha256OfFile: (path: string) => Promise<string>;
  downloadToFile: (
    url: string,
    destPath: string,
    onProgress?: (fraction: number) => void,
  ) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
}

export async function ensureVerifiedArtifact(params: {
  artifact: MultimodalArtifact;
  destPath: string;
  deps: FileSystemDeps;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const { artifact, destPath, deps, onProgress } = params;

  if (await deps.fileExists(destPath)) {
    const existing = await deps.sha256OfFile(destPath);
    if (equalsHex(existing, artifact.checksum)) {
      onProgress?.(1);
      return;
    }
    await deps.deleteFile(destPath);
  }

  await deps.downloadToFile(artifact.url, destPath, onProgress);

  const digest = await deps.sha256OfFile(destPath);
  if (!equalsHex(digest, artifact.checksum)) {
    await deps.deleteFile(destPath).catch(() => undefined);
    throw new ChecksumMismatchError(artifact.url, artifact.checksum, digest);
  }
}

export interface MultimodalInstallResult {
  modelPath: string;
  mmprojPath: string;
}

export async function ensureMultimodalArtifacts(params: {
  artifacts: MultimodalArtifacts;
  modelPath: string;
  mmprojPath: string;
  deps: FileSystemDeps;
  onProgress?: (fraction: number) => void;
}): Promise<MultimodalInstallResult> {
  const { artifacts, modelPath, mmprojPath, deps, onProgress } = params;

  const totalBytes = artifacts.model.sizeBytes + artifacts.mmproj.sizeBytes;
  const modelWeight = artifacts.model.sizeBytes / totalBytes;
  const report = (fraction: number, base: number, weight: number): void => {
    onProgress?.(Math.max(0, Math.min(1, base + fraction * weight)));
  };

  await ensureVerifiedArtifact({
    artifact: artifacts.model,
    destPath: modelPath,
    deps,
    onProgress: (f) => report(f, 0, modelWeight),
  });
  await ensureVerifiedArtifact({
    artifact: artifacts.mmproj,
    destPath: mmprojPath,
    deps,
    onProgress: (f) => report(f, modelWeight, 1 - modelWeight),
  });

  onProgress?.(1);
  return { modelPath, mmprojPath };
}

export type LlamaContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlamaContentPart[];
}

export function buildMultimodalMessages(opts: {
  systemPrompt?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  prompt: string;
  images?: string[];
}): LlamaMessage[] {
  const out: LlamaMessage[] = [];
  if (opts.systemPrompt) out.push({ role: 'system', content: opts.systemPrompt });
  for (const m of opts.messages ?? []) out.push({ role: m.role, content: m.content });

  const images = opts.images ?? [];
  if (images.length > 0) {
    const parts: LlamaContentPart[] = [{ type: 'text', text: opts.prompt }];
    for (const uri of images) parts.push({ type: 'image_url', image_url: { url: uri } });
    out.push({ role: 'user', content: parts });
  } else {
    out.push({ role: 'user', content: opts.prompt });
  }
  return out;
}
