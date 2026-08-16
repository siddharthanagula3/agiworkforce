
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
  imageUri: string;
  question: string;
  onToken?: (token: string) => void;
}

export interface VisionResult {
  text: string;
  route: VisionRoute;
  ttftMs: number;
}

interface RunnableVisionModel {
  modelId: string;
  displayName: string;
  modelPath?: string;
  mmprojPath?: string;
}

function mmprojSiblingPath(modelPath: string): string {
  return `${modelPath}.mmproj.gguf`;
}

async function fileExists(uri: string): Promise<boolean> {
  try {
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

async function resolveInstalledMultimodalModel(): Promise<RunnableVisionModel | null> {
  if (typeof listInstalledModels !== 'function') return null;
  if (typeof getModelById !== 'function' || typeof isMultimodalModel !== 'function') return null;

  const installed = await listInstalledModels().catch(() => []);
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

export async function resolveVisionRoute(): Promise<VisionRoute> {
  const vl = await resolveInstalledMultimodalModel();
  if (vl) {
    return { kind: 'vl-pack', modelId: vl.modelId, displayName: vl.displayName };
  }
  return { kind: 'ocr-fallback', displayName: 'AGI Standard (OCR)' };
}

async function runNativeOCR(imageUri: string): Promise<string> {
  try {
    const result = await recognizeText(imageUri);
    return result.text;
  } catch {
    // Native OCR module unavailable or failed
  }
  return '';
}

export async function runVisionQuery(query: VisionQuery): Promise<VisionResult> {
  const t0 = Date.now();

  const vl = await resolveInstalledMultimodalModel();
  if (vl) {
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
