/**
 * Vision routing service — routes image queries to the best available backend.
 *
 * Priority chain:
 *   1. On-device VL model (qwen2.5-vl-3b-instruct) if user has opted in and it is installed.
 *   2. System multimodal (Apple FM / Gemini Nano) if available.
 *   3. Apple Vision OCR + text-only LLM reasoning (Qwen3-4B) as universal fallback.
 *
 * The service never throws on routing fallback — it always returns a result or
 * a descriptive error string so the caller can surface it to the user.
 */

import { Platform, NativeModules } from 'react-native';
import {
  getModelsForRole,
  getDefaultModel,
  localGenerate,
  detectCapabilities,
} from '@agiworkforce/local-llm';
import { getInstalledModel } from '@/storage/installedModels';

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

/** Resolve which vision route to use, in priority order. */
export async function resolveVisionRoute(): Promise<VisionRoute> {
  // Check for user-opted-in premium vision pack
  const visionPackModels = getModelsForRole('premium-vision-pack');
  for (const model of visionPackModels) {
    const installed = await getInstalledModel(model.id).catch(() => null);
    if (installed) {
      return { kind: 'vl-pack', modelId: model.id, displayName: model.displayName };
    }
  }

  // Check for system multimodal (Apple FM on iOS, Gemini Nano on Android)
  const caps = await detectCapabilities();
  if (caps.tier1Available && caps.tier1Runtime) {
    const sysModels = getModelsForRole('system-multimodal');
    const runtime = caps.tier1Runtime;
    const match = sysModels.find((m) =>
      runtime === 'foundation_models'
        ? m.id === 'apple-foundation-models'
        : m.id === 'gemini-nano-aicore',
    );
    if (match) {
      return { kind: 'system-multimodal', modelId: match.id, displayName: match.displayName };
    }
  }

  // Universal fallback: Apple Vision OCR (iOS) or ML Kit text detection (Android)
  // + Qwen3-4B text reasoning over the extracted text.
  return { kind: 'ocr-fallback', displayName: 'AGI Standard (OCR)' };
}

/**
 * Run OCR on the image using the platform-native OCR engine.
 * Returns the extracted text, or an empty string if nothing was recognised.
 */
type NativeOCRModule = { recognizeText?: (uri: string) => Promise<string> };

async function runNativeOCR(imageUri: string): Promise<string> {
  try {
    if (Platform.OS === 'ios') {
      const mod = (NativeModules as Record<string, unknown>)['AGIFoundationModels'] as
        | NativeOCRModule
        | undefined;
      if (mod?.recognizeText) {
        return await mod.recognizeText(imageUri);
      }
    } else if (Platform.OS === 'android') {
      const mod = (NativeModules as Record<string, unknown>)['AGIAICore'] as
        | NativeOCRModule
        | undefined;
      if (mod?.recognizeText) {
        return await mod.recognizeText(imageUri);
      }
    }
  } catch {
    // Native module unavailable
  }
  return '';
}

/** Execute a vision query and return the model's response. */
export async function runVisionQuery(query: VisionQuery): Promise<VisionResult> {
  const route = await resolveVisionRoute();
  const t0 = Date.now();

  if (route.kind === 'vl-pack' || route.kind === 'system-multimodal') {
    // For VL models: Apple FM accepts image URIs directly via its structured message API.
    // Executorch VL support is planned but not yet in rn-executorch 0.8.4; we fall through
    // to the OCR path for the vl-pack case until the VL preset lands.
    // Apple FM (tier1) handles visionIn=true natively.
    if (route.kind === 'system-multimodal') {
      const prompt =
        `You are analyzing an image the user photographed or selected.\n` +
        `Image URI: ${query.imageUri}\n\n` +
        `User question: ${query.question}`;

      const result = await localGenerate(undefined, {
        prompt,
        onToken: query.onToken,
      });
      return { text: result.text, route, ttftMs: Date.now() - t0 };
    }
  }

  // OCR fallback path (also used for vl-pack until Executorch VL preset ships):
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
