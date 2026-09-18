import 'server-only';

import type { ProviderMessage, StreamChunk } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { matchDenylistedUpload, sha256Hex } from './hash-denylist';
import { inspectImageBytes, type ImageStructureRejection } from './image-structure';
import { recordModerationEvent } from './reporting';
import { resolveOutputClassifierModel } from './output-classifier-model';
import type { ModerationCategory } from './text-classifier';

export const GENERATED_OUTPUT_REFUSAL =
  'The generated result was withheld because it violates the AGI Workforce usage policy. Nothing was saved to your library.';

export const UPLOADED_IMAGE_REFUSAL =
  'The image you supplied could not be read as a valid image and was not sent to any model.';

export type GeneratedMediaKind = 'image' | 'video';

export type OutputModerationReason = 'output_hash_denylist' | 'output_classifier';

export interface GeneratedMediaModerationInput {
  userId: string;
  media: GeneratedMediaKind;
  operation: string;
  bytes: Uint8Array;
  mimeType?: string | undefined;
  prompt?: string | undefined;
  storageKey?: string | undefined;
  signal?: AbortSignal | undefined;
}

export type GeneratedMediaModeration =
  | { allowed: true; contentSha256: string }
  | {
      allowed: false;
      refusal: string;
      reason: OutputModerationReason;
      categories: readonly string[];
      ruleIds: readonly string[];
      contentSha256: string;
    };

export interface UploadedImageModeration {
  allowed: boolean;
  reason?: ImageStructureRejection;
}

const CLASSIFIER_TIMEOUT_MS = 12_000;
const CLASSIFIER_MAX_BYTES = 6 * 1024 * 1024;

const CLASSIFIER_SYSTEM =
  'You are a content safety classifier for generated media. Reply with one line of JSON and nothing else: ' +
  '{"verdict":"allow"|"block","categories":[...]}. Use "block" only when the image depicts sexual content involving a minor, ' +
  'a real identifiable person in a sexual or defamatory situation, or step-usable instructions for a weapon capable of mass casualties. ' +
  'Categories must be drawn from: csae, likeness, wmd, illegal_weapons, targeted_violence.';

const CLASSIFIER_CATEGORIES: readonly ModerationCategory[] = [
  'csae',
  'likeness',
  'wmd',
  'illegal_weapons',
  'targeted_violence',
];

// A format this parser does not know (HEIC, AVIF, TIFF) is passed to the
// provider rather than refused; only a recognised format that fails its own
// parse, markup dressed as an image, or an unusable size is a refusal.
export function moderateUploadedImage(bytes: Uint8Array): UploadedImageModeration {
  const verdict = inspectImageBytes(bytes);
  if (verdict.valid || verdict.reason === 'unknown_format') return { allowed: true };
  return { allowed: false, reason: verdict.reason };
}

export async function moderateGeneratedMedia(
  input: GeneratedMediaModerationInput,
): Promise<GeneratedMediaModeration> {
  const contentSha256 = sha256Hex(input.bytes);

  const hashMatch = matchDenylistedUpload(input.bytes);
  if (hashMatch.matched) {
    return refuse(input, {
      reason: 'output_hash_denylist',
      categories: ['known_illegal_media'],
      ruleIds: [`managed-${input.media}.output.hash-denylist`],
      contentSha256,
      ...(hashMatch.listLabel ? { listLabel: hashMatch.listLabel } : {}),
    });
  }

  const classified = await classifyGeneratedImage(input);
  if (classified && classified.verdict === 'block') {
    return refuse(input, {
      reason: 'output_classifier',
      categories: classified.categories,
      ruleIds: [`managed-${input.media}.output.classifier`],
      contentSha256,
    });
  }

  return { allowed: true, contentSha256 };
}

function refuse(
  input: GeneratedMediaModerationInput,
  detail: {
    reason: OutputModerationReason;
    categories: readonly string[];
    ruleIds: readonly string[];
    contentSha256: string;
    listLabel?: string;
  },
): GeneratedMediaModeration {
  recordModerationEvent({
    surface: 'generated-output',
    action: 'block',
    categories: detail.categories,
    ruleIds: [...detail.ruleIds, `operation:${input.operation}`],
    userId: input.userId,
    contentSha256: detail.contentSha256,
    ...(input.prompt !== undefined ? { text: input.prompt } : {}),
    ...(input.storageKey !== undefined ? { storageKey: input.storageKey } : {}),
    ...(detail.listLabel !== undefined ? { listLabel: detail.listLabel } : {}),
  });
  return {
    allowed: false,
    refusal: GENERATED_OUTPUT_REFUSAL,
    reason: detail.reason,
    categories: detail.categories,
    ruleIds: detail.ruleIds,
    contentSha256: detail.contentSha256,
  };
}

interface ClassifierVerdict {
  verdict: 'allow' | 'block';
  categories: ModerationCategory[];
}

async function classifyGeneratedImage(
  input: GeneratedMediaModerationInput,
): Promise<ClassifierVerdict | null> {
  if (input.media !== 'image') return null;
  if (input.bytes.length > CLASSIFIER_MAX_BYTES) return null;

  const model = resolveOutputClassifierModel();
  if (!model) return null;

  const mediaType = input.mimeType ?? 'image/png';
  const messages: ProviderMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            mediaType,
            data: Buffer.from(input.bytes).toString('base64'),
          },
        },
        { type: 'text', text: 'Classify this generated image. JSON only.' },
      ],
    },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
  input.signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const adapter = buildServerProviderAdapter(model.providerId);
    let text = '';
    for await (const chunk of adapter.stream(
      {
        model: model.apiModelId,
        messages,
        system: CLASSIFIER_SYSTEM,
        maxOutputTokens: 128,
        temperature: 0,
      },
      controller.signal,
    )) {
      const delta = textDelta(chunk);
      if (delta) text += delta;
      if (text.length > 4096) break;
    }
    return parseClassifierVerdict(text);
  } catch (error) {
    // Fail open on classifier transport: the deterministic checks above already
    // ran, and a provider outage must not block every generation on the platform.
    logger.warn(
      { error, modelId: model.catalogModelId },
      '[moderation] output classifier was unavailable',
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function textDelta(chunk: StreamChunk): string | null {
  return chunk.type === 'text-delta' ? chunk.delta : null;
}

export function parseClassifierVerdict(raw: string): ClassifierVerdict | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  if (record['verdict'] !== 'block' && record['verdict'] !== 'allow') return null;

  const rawCategories = Array.isArray(record['categories']) ? record['categories'] : [];
  const categories = CLASSIFIER_CATEGORIES.filter((category) => rawCategories.includes(category));
  return { verdict: record['verdict'], categories };
}
