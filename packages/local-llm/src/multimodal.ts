// Multimodal (vision) support for tier-3 llama.rn GGUF models.
//
// A vision GGUF model ships as TWO artifacts: the base weights (`downloadUrl`)
// and a separate mmproj vision projector (`mmprojUrl`). llama.rn loads the base
// model via `initLlama` (with `ctx_shift:false`) and then attaches the projector
// via `context.initMultimodal({ path })`. Image input is only effective once the
// projector is installed AND `initMultimodal` returns true.
//
// This module holds the PURE logic (no native/expo dependency) so it is fully
// unit-testable: artifact resolution, effective-capability gating, download +
// checksum-verify orchestration (native FS primitives injected), and the
// llama.rn multimodal message assembly. The mobile app provides the real
// expo-file-system / expo-crypto primitives; tier-3 provides the native context.

import type { OnDeviceModel } from '@agiworkforce/types';

export interface MultimodalArtifact {
  url: string;
  /** SHA-256 hex digest (lowercase, 64 chars). */
  checksum: string;
  sizeBytes: number;
}

export interface MultimodalArtifacts {
  model: MultimodalArtifact;
  mmproj: MultimodalArtifact;
}

/**
 * Resolve the base-GGUF + mmproj artifact pair for a multimodal llama.rn model.
 * Returns null when the model is not an mmproj-backed vision model (missing any
 * of the six required fields), so callers can never half-download a vision pack.
 */
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

/** True when the model is an mmproj-backed llama.rn vision model. */
export function isMultimodalModel(model: OnDeviceModel): boolean {
  return resolveMultimodalArtifacts(model) !== null;
}

/**
 * True when a catalog model can be downloaded and run through the tier-3
 * llama.rn GGUF path with VERIFIED artifacts: base url + sha256 + size, and —
 * for vision models — the full mmproj triple as well. This is the installability
 * predicate the mobile picker/installer uses for llama-rn-only rows (mirror of
 * the `executorchPreset` requirement on the tier-2 path).
 */
export function hasRunnableGgufArtifacts(model: OnDeviceModel): boolean {
  if (model.format !== 'gguf') return false;
  if (!model.supportedRuntimes.includes('llama-rn')) return false;
  if (!model.downloadUrl || !model.checksum || !model.fileSizeBytes) return false;
  if (model.capabilities.visionIn) return resolveMultimodalArtifacts(model) !== null;
  return true;
}

/**
 * Effective vision capability. Per restructure §8: `visionIn` is true only when
 * the mmproj projector artifact is actually installed. The catalog `visionIn`
 * flag is the NOMINAL capability; this is the honest, installed-state capability
 * used to decide routing and to avoid false "vision available" badges.
 */
export function effectiveVisionIn(
  model: OnDeviceModel,
  state: { mmprojInstalled: boolean },
): boolean {
  return Boolean(model.capabilities.visionIn) && state.mmprojInstalled;
}

function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase().replace(/^sha256:/, '');
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

/**
 * Native filesystem primitives, injected by the mobile app (expo-file-system +
 * expo-crypto). Keeping them injected makes the orchestration below testable in
 * Node with mocks — real hardware only supplies the implementations.
 */
export interface FileSystemDeps {
  fileExists: (path: string) => Promise<boolean>;
  /** Lowercase 64-char SHA-256 hex of the file at `path`. */
  sha256OfFile: (path: string) => Promise<string>;
  downloadToFile: (
    url: string,
    destPath: string,
    onProgress?: (fraction: number) => void,
  ) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
}

/**
 * Ensure a single artifact exists at `destPath` with a verified checksum.
 * - If present with a matching digest, does nothing (idempotent).
 * - If present but the digest differs (partial/corrupt), deletes and re-downloads.
 * - After download, re-verifies; on mismatch deletes the file and throws so a
 *   corrupt artifact is never left on disk or handed to the runtime.
 */
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

/**
 * Download + verify BOTH artifacts (base GGUF, then mmproj) to the given paths,
 * reporting size-weighted aggregate progress across the two files. Returns the
 * on-disk paths, ready to hand to `tier3LoadMultimodalModel`. Throws (and leaves
 * nothing corrupt) if either checksum fails.
 */
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

// --- llama.rn multimodal message assembly -----------------------------------

export type LlamaContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlamaContentPart[];
}

/**
 * Build llama.rn completion messages. When the current turn carries images, the
 * user message content becomes the `[{type:'text'}, {type:'image_url'}, ...]`
 * array llama.rn's multimodal path expects; otherwise it stays a plain string
 * (identical shape to the text-only path). Image URIs may be `file://` paths or
 * `data:` base64 URLs — both are accepted by llama.rn.
 */
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
