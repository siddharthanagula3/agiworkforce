/**
 * Vision routing service — routes image queries to the best available backend.
 *
 * Local Mode routes, in priority order:
 *   1. On-device VL pack (tier-3 llama.rn multimodal): used ONLY when a
 *      multimodal GGUF model AND its mmproj vision projector are both installed
 *      on disk. This passes the real image into the model via `images` +
 *      `mmprojPath` (llama.rn `initMultimodal`). Effective vision is gated on the
 *      projector actually being present — never on a catalog flag alone (§8).
 *   2. Tier-2 ExecuTorch VLM (single .pte, projector embedded): used only when
 *      the model is actually installed
 *      (`effectiveTier2VisionIn`). The image rides `images` into tier-2's
 *      `mediaPath` plumbing; no mmproj pair exists on this tier.
 *   3. Native OCR over the image + local text-only LLM reasoning (fallback).
 *
 * The VL route stays dormant until the mobile GGUF+mmproj install path lands and
 * writes the artifacts to disk; today that path is device-QA-gated, so real
 * devices resolve to OCR. The routing is honest about which one actually ran.
 *
 * The service never throws on routing fallback — it always returns a result or
 * a descriptive error string so the caller can surface it to the user.
 */

import {
  effectiveTier2VisionIn,
  getDefaultModel,
  getModelById,
  isMultimodalModel,
  localGenerate,
} from '@agiworkforce/local-llm';
import { listInstalledModels } from '@/storage/installedModels';
import { recognizeText } from './ocr';

export type VisionRoute =
  | { kind: 'vl-pack'; modelId: string; displayName: string }
  | { kind: 'system-multimodal'; modelId: string; displayName: string }
  | { kind: 'ocr-fallback'; displayName: string };

export interface VisionQuery {
  /** Local file URI of the image. */
  imageUri: string;
  /** User's question about the image. */
  question: string;
  /** Token callback for streaming. */
  onToken?: (token: string) => void;
}

export interface VisionResult {
  text: string;
  route: VisionRoute;
  /** Rough time-to-first-token in ms (best-effort). */
  ttftMs: number;
}

interface RunnableVisionModel {
  modelId: string;
  displayName: string;
  /**
   * Tier-3 GGUF fields. Absent for a tier-2 ExecuTorch VLM, whose artifacts
   * are preset-cached by the module — the selector routes those by `modelId`.
   */
  modelPath?: string;
  mmprojPath?: string;
}

/**
 * Convention for where the mmproj projector is stored relative to the base GGUF.
 * The (future) GGUF install path writes `<base>.gguf` and `<base>.gguf.mmproj.gguf`
 * side by side; keeping the convention here means the VL route lights up
 * automatically once that path lands, with no further change to this file.
 */
function mmprojSiblingPath(modelPath: string): string {
  return `${modelPath}.mmproj.gguf`;
}

/** Best-effort file existence check via expo-file-system (legacy API). */
async function fileExists(uri: string): Promise<boolean> {
  try {
    // Lazy require so unit tests / non-native runtimes never fail at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('expo-file-system/legacy') as {
      getInfoAsync: (u: string) => Promise<{ exists?: boolean }>;
    };
    if (typeof fs?.getInfoAsync !== 'function') return false;
    const info = await fs.getInfoAsync(uri);
    return Boolean(info?.exists);
  } catch {
    return false;
  }
}

/**
 * Find an installed on-device multimodal model whose base weights AND mmproj
 * projector are both present on disk. Returns null when none is runnable — in
 * which case the caller uses the OCR fallback. Defensive against partial module
 * mocks (the OCR fallback test mocks `@agiworkforce/local-llm` and storage).
 */
async function resolveInstalledMultimodalModel(): Promise<RunnableVisionModel | null> {
  if (typeof listInstalledModels !== 'function') return null;
  if (typeof getModelById !== 'function' || typeof isMultimodalModel !== 'function') return null;

  const installed = await listInstalledModels().catch(() => []);
  // Pass 1 (preferred): tier-3 llama.rn GGUF+mmproj pack.
  for (const entry of installed) {
    if (!entry.local_path) continue;

    let catalogModel;
    try {
      catalogModel = getModelById(entry.id);
    } catch {
      catalogModel = undefined;
    }
    if (!catalogModel) continue;

    let multimodal = false;
    try {
      multimodal = isMultimodalModel(catalogModel);
    } catch {
      multimodal = false;
    }
    if (!multimodal) continue;

    const mmprojPath = mmprojSiblingPath(entry.local_path);
    if (!(await fileExists(entry.local_path))) continue;
    if (!(await fileExists(mmprojPath))) continue;

    return {
      modelId: entry.id,
      displayName: catalogModel.displayName,
      modelPath: entry.local_path,
      mmprojPath,
    };
  }

  // Pass 2: tier-2 ExecuTorch VLM (single .pte with embedded projector).
  // Effective vision requires the model to actually be
  // installed — the ExecuTorch module preset-caches the artifacts itself, so
  // the installed_models record (format 'pte', no local_path) is the install
  // evidence here.
  if (typeof effectiveTier2VisionIn === 'function') {
    for (const entry of installed) {
      if (entry.format !== 'pte') continue;

      let catalogModel;
      try {
        catalogModel = getModelById(entry.id);
      } catch {
        catalogModel = undefined;
      }
      if (!catalogModel) continue;

      let tier2Vision = false;
      try {
        tier2Vision = effectiveTier2VisionIn(catalogModel, { modelInstalled: true });
      } catch {
        tier2Vision = false;
      }
      if (!tier2Vision) continue;

      return {
        modelId: entry.id,
        displayName: catalogModel.displayName,
      };
    }
  }

  return null;
}

/** Resolve which vision route to use, in priority order. */
export async function resolveVisionRoute(): Promise<VisionRoute> {
  const vl = await resolveInstalledMultimodalModel();
  if (vl) {
    return { kind: 'vl-pack', modelId: vl.modelId, displayName: vl.displayName };
  }
  // No runnable on-device VL model installed — use native OCR + local text
  // reasoning. This is the honest route on every device until the GGUF+mmproj
  // install path ships.
  return { kind: 'ocr-fallback', displayName: 'AGI Standard (OCR)' };
}

/**
 * Run OCR on the image using the existing native OCR service.
 * Returns the extracted text, or an empty string if nothing was recognised.
 */
async function runNativeOCR(imageUri: string): Promise<string> {
  try {
    const result = await recognizeText(imageUri);
    return result.text;
  } catch {
    // Native OCR module unavailable or failed
  }
  return '';
}

/** Execute a vision query and return the model's response. */
export async function runVisionQuery(query: VisionQuery): Promise<VisionResult> {
  const t0 = Date.now();

  // Preferred path: a real on-device VL model with its mmproj installed.
  const vl = await resolveInstalledMultimodalModel();
  if (vl) {
    // Tier-3 routes by modelPath + mmprojPath; tier-2 routes by modelId (the
    // selector resolves its ExecuTorch preset — images ride into mediaPath).
    const result = await localGenerate(vl.modelPath, {
      modelId: vl.modelId,
      prompt: query.question,
      images: [query.imageUri],
      ...(vl.mmprojPath ? { mmprojPath: vl.mmprojPath } : {}),
      onToken: query.onToken,
    });
    return {
      text: result.text,
      route: { kind: 'vl-pack', modelId: vl.modelId, displayName: vl.displayName },
      ttftMs: Date.now() - t0,
    };
  }

  // OCR fallback path:
  const ocrText = await runNativeOCR(query.imageUri);

  const prompt = ocrText
    ? `The user photographed an image. Here is the text extracted via OCR:\n\n` +
      `---\n${ocrText}\n---\n\n` +
      `User question: ${query.question}\n\n` +
      `Answer the user's question based on the image content above.`
    : `The user photographed an image but no text was detected by OCR. ` +
      `User question: ${query.question}\n\n` +
      `Explain that the image couldn't be analysed (no text detected) and suggest the user try a clearer photo or a cloud vision model.`;

  const defaultModel = getDefaultModel();
  const result = await localGenerate(defaultModel.id, {
    modelId: defaultModel.id,
    prompt,
    onToken: query.onToken,
  });

  return {
    text: result.text,
    route: { kind: 'ocr-fallback', displayName: 'AGI Standard (OCR)' },
    ttftMs: Date.now() - t0,
  };
}

/** Human-readable label shown in the PerformanceChip for the active route. */
export function visionRouteLabel(route: VisionRoute): string {
  switch (route.kind) {
    case 'vl-pack':
      return route.displayName;
    case 'system-multimodal':
      return route.displayName;
    case 'ocr-fallback':
      return route.displayName;
  }
}
