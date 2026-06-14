/**
 * Vision routing service — routes image queries to the best available backend.
 *
 * Current Local Mode route:
 *   1. Native OCR over the selected image.
 *   2. Local text-only LLM reasoning over the extracted text.
 *
 * Do not advertise on-device VL or Apple/Gemini image input until the native
 * bridge exposes an actual image parameter and the route is verified manually.
 *
 * The service never throws on routing fallback — it always returns a result or
 * a descriptive error string so the caller can surface it to the user.
 */

import { getDefaultModel, localGenerate } from '@agiworkforce/local-llm';
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

/** Resolve which vision route to use, in priority order. */
export async function resolveVisionRoute(): Promise<VisionRoute> {
  // The current local inference API accepts text prompts only. Until the Apple
  // Foundation Models / AICore bridge exposes a real image input, keep this
  // route honest and use native OCR plus local text reasoning.
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
  const route = await resolveVisionRoute();
  const t0 = Date.now();

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
