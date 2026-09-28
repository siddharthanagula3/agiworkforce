import 'server-only';

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  isChatImageMimeType,
  parseInteractiveCardDelta,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import {
  canUseBillingPlanCapability,
  EDIT_IMAGE_TOOL_NAME,
  GENERATE_IMAGE_TOOL_NAME,
  IMAGE_CARD_KIND,
  IMAGE_CARD_MAX_IMAGES,
  IMAGE_TOOL_PROMPT_MAX_LENGTH,
  INTERACTIVE_CARD_SCHEMA_VERSION,
  type ImageCardImage,
  type ImageCardOperation,
  type InteractiveCard,
} from '@agiworkforce/types';
import { createManagedMediaIdempotencyKey, type ManagedMediaSurface } from '@agiworkforce/utils';

import { withMediaJobSpan } from '@/lib/observability/media-telemetry';
import { latestConversationImageAssetId } from '@/lib/server/media-assets';
import { isImageStorageConfigured } from '@/lib/server/media-storage';
import {
  evaluateModelAccessForOrganization,
  modelPolicyRefusalInit,
} from '@/lib/services/model-policy-gate';
import {
  getDefaultProvider,
  IMAGE_ASPECT_RATIOS_BY_API,
  isProviderAvailable,
  resolveImageCatalogModel,
  type ImageProvider,
} from './image-generation-provider';
import { generateManagedImage, type ManagedImageModelAsk } from './managed-image-generation';

const IMAGE_TOOL_SURFACES: Readonly<Record<string, ManagedMediaSurface>> = {
  web: 'web',
  desktop: 'desktop',
  mobile: 'mobile',
};
const EDIT_PROVIDER: ImageProvider = 'openai';
const MEDIA_ASSET_URL_PATTERN =
  /^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const DATA_URL_BASE64_PATTERN = /^data:([^;,]+);base64,(.+)$/i;
const OPERATION_ID_LENGTH = 32;
const WITHDRAWN_STATUSES: ReadonlySet<number> = new Set([402, 403]);
const GENERATED_HEADLINE = 'Generated image';
const EDITED_HEADLINE = 'Edited image';
const FAILURE_FALLBACK = 'The image service did not answer.';

export interface ImageChatToolOffer {
  edit: boolean;
  aspectRatios: readonly string[];
}

export interface ImageChatToolContext {
  toolCallId: string;
  requestId: string;
  userId: string;
  organizationId: string | null;
  db: DatabaseAdapter;
  surface: string | null;
  conversationId: string | null;
  latestAttachedImage: () => string | null;
}

export type ImageChatToolOutcome =
  | { ok: true; content: string; card: InteractiveCard }
  | { ok: false; content: string; unavailable: boolean };

interface ImagePipelinePayload {
  success?: boolean;
  images?: Array<{ url?: string }>;
  catalog_model?: string;
  error?: string | { message?: string };
}

const GenerateImageInputSchema = z.object({
  prompt: z.string().trim().min(1).max(IMAGE_TOOL_PROMPT_MAX_LENGTH),
  aspect_ratio: z.string().trim().min(1).optional(),
});

const EditImageInputSchema = z.object({
  prompt: z.string().trim().min(1).max(IMAGE_TOOL_PROMPT_MAX_LENGTH),
  image_asset_id: z.string().uuid().optional(),
});

function editCapableModel(): boolean {
  if (!isProviderAvailable(EDIT_PROVIDER)) return false;
  return supportsManagedMediaImageEdit(resolveImageCatalogModel(EDIT_PROVIDER)?.imageApi);
}

export function imageChatToolOffer(
  planTier: string | null | undefined,
  surface: string,
): ImageChatToolOffer | null {
  if (!IMAGE_TOOL_SURFACES[surface]) return null;
  if (!canUseBillingPlanCapability(planTier, 'image_generation')) return null;
  if (!isImageStorageConfigured()) return null;
  let provider: ImageProvider;
  try {
    provider = getDefaultProvider();
  } catch {
    return null;
  }
  const model = resolveImageCatalogModel(provider);
  if (!model) return null;
  return {
    edit: editCapableModel(),
    aspectRatios: [...IMAGE_ASPECT_RATIOS_BY_API[model.imageApi]],
  };
}

function generateImageToolDefinition(aspectRatios: readonly string[]) {
  return {
    type: 'function' as const,
    function: {
      name: GENERATE_IMAGE_TOOL_NAME,
      description:
        "Create an image from a description and show it to the user in the chat. Use it when the user asks for a picture, illustration, logo, poster, icon or photo-style image, or asks you to draw or visualize something. Write the prompt as a complete, specific description of the image, including subject, setting, style, composition and any text that must appear in it. The image appears in the chat by itself, so afterwards reply in a sentence or two without describing it at length or repeating a link. Each image uses the account's credits.",
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            maxLength: IMAGE_TOOL_PROMPT_MAX_LENGTH,
            description: 'The full description of the image to create.',
          },
          aspect_ratio: {
            type: 'string',
            enum: [...aspectRatios],
            description:
              'The shape of the image, width to height. Leave it out for a square image unless the user asked for a shape or the subject clearly needs one.',
          },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
    },
  };
}

function editImageToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: EDIT_IMAGE_TOOL_NAME,
      description:
        "Change an existing image and show the result to the user in the chat. Use it when the user asks to change, restyle, fix, extend or add to an image they attached or one made earlier in this conversation. Write the prompt as the full intended result, saying what should change and what should stay the same. The result appears in the chat by itself, so afterwards reply briefly. Each edit uses the account's credits.",
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            maxLength: IMAGE_TOOL_PROMPT_MAX_LENGTH,
            description: 'The full description of the edited image.',
          },
          image_asset_id: {
            type: 'string',
            description:
              'The asset_id of the image to change, as returned by an earlier generate_image or edit_image call. Leave it out to change the image the user attached to this message, or else the latest image made in this conversation.',
          },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
    },
  };
}

export function imageChatToolDefinitions(offer: ImageChatToolOffer) {
  return offer.edit
    ? [generateImageToolDefinition(offer.aspectRatios), editImageToolDefinition()]
    : [generateImageToolDefinition(offer.aspectRatios)];
}

export function latestTurnImage(input: {
  turnAttachments?: readonly { mimeType: string; base64: string }[];
  messages: readonly { role: string; content: unknown }[];
}): string | null {
  const lastUser = [...input.messages].reverse().find((message) => message.role === 'user');
  const inline = Array.isArray(lastUser?.content)
    ? (lastUser.content as Array<{ type?: unknown; image_url?: { url?: unknown } }>)
        .flatMap((part) => {
          const url = part.type === 'image_url' ? part.image_url?.url : undefined;
          const match = typeof url === 'string' ? DATA_URL_BASE64_PATTERN.exec(url) : null;
          return match?.[1] && match[2] && isChatImageMimeType(match[1]) ? [match[2]] : [];
        })
        .at(-1)
    : undefined;
  if (inline) return inline;
  const attached = (input.turnAttachments ?? [])
    .filter((attachment) => isChatImageMimeType(attachment.mimeType))
    .at(-1);
  return attached?.base64 ?? null;
}

function operationId(context: ImageChatToolContext): string {
  return createHash('sha256')
    .update(`${context.requestId}:${context.toolCallId}`)
    .digest('base64url')
    .slice(0, OPERATION_ID_LENGTH);
}

async function modelPolicyRefusal(
  context: ImageChatToolContext,
  model: ManagedImageModelAsk,
): Promise<NextResponse | null> {
  const decision = await evaluateModelAccessForOrganization(
    context.db,
    context.organizationId,
    model,
  );
  if (decision.allowed) return null;
  return NextResponse.json(
    { error: { message: decision.reason, type: 'invalid_request_error', code: decision.code } },
    modelPolicyRefusalInit(decision),
  );
}

async function runImagePipeline(
  context: ImageChatToolContext,
  surface: ManagedMediaSurface,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: ImagePipelinePayload }> {
  const response = await withMediaJobSpan({ media: 'image' }, () =>
    generateManagedImage({
      userId: context.userId,
      startTime: Date.now(),
      headers: {},
      scope: async () => ({
        db: context.db,
        userId: context.userId,
        organizationId: context.organizationId,
      }),
      readBody: async () => body,
      idempotencyKey: createManagedMediaIdempotencyKey({
        surface,
        operation: 'image',
        operationId: operationId(context),
      }),
      modelPolicyRefusal: (model) => modelPolicyRefusal(context, model),
    }),
  );
  const payload = (await response.json().catch(() => ({}))) as ImagePipelinePayload;
  return { status: response.status, payload };
}

function failureMessage(payload: ImagePipelinePayload): string {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message ?? FAILURE_FALLBACK;
}

function deliveredImages(payload: ImagePipelinePayload): ImageCardImage[] {
  return (payload.images ?? [])
    .flatMap((image) => {
      const assetId = image.url ? MEDIA_ASSET_URL_PATTERN.exec(image.url)?.[1] : undefined;
      return assetId && image.url ? [{ assetId, url: image.url }] : [];
    })
    .slice(0, IMAGE_CARD_MAX_IMAGES);
}

function imageCard(
  context: ImageChatToolContext,
  toolName: string,
  body: {
    operation: ImageCardOperation;
    prompt: string;
    images: ImageCardImage[];
    aspectRatio?: string;
    model?: string;
  },
): InteractiveCard | null {
  const card = parseInteractiveCardDelta({
    card: {
      schemaVersion: INTERACTIVE_CARD_SCHEMA_VERSION,
      cardId: context.toolCallId,
      kind: IMAGE_CARD_KIND,
      createdAt: new Date().toISOString(),
      fallback: {
        headline: body.operation === 'generate' ? GENERATED_HEADLINE : EDITED_HEADLINE,
        text: body.prompt,
      },
      producedBy: { toolCallId: context.toolCallId, toolName },
      body,
    },
  });
  return card?.recognized && card.kind === IMAGE_CARD_KIND ? card : null;
}

async function editSource(
  context: ImageChatToolContext,
  imageAssetId: string | undefined,
): Promise<{ asset_id: string } | { b64_json: string } | null> {
  if (imageAssetId) return { asset_id: imageAssetId };
  const attached = context.latestAttachedImage();
  if (attached) return { b64_json: attached };
  if (!context.conversationId) return null;
  const latest = await latestConversationImageAssetId(
    context.userId,
    context.conversationId,
    context.db,
  );
  return latest ? { asset_id: latest } : null;
}

function refused(content: string, unavailable = false): ImageChatToolOutcome {
  return { ok: false, content, unavailable };
}

export async function executeImageChatTool(
  toolName: string,
  args: Record<string, unknown>,
  context: ImageChatToolContext,
): Promise<ImageChatToolOutcome> {
  const surface = context.surface ? IMAGE_TOOL_SURFACES[context.surface] : undefined;
  if (!surface) return refused('Images cannot be made in this app.', true);

  const operation: ImageCardOperation = toolName === EDIT_IMAGE_TOOL_NAME ? 'edit' : 'generate';
  let prompt: string;
  let request: Record<string, unknown>;
  let aspectRatio: string | undefined;
  if (operation === 'generate') {
    const parsed = GenerateImageInputSchema.safeParse(args);
    if (!parsed.success) {
      return refused(
        `${GENERATE_IMAGE_TOOL_NAME} needs a non-empty "prompt" of at most ${IMAGE_TOOL_PROMPT_MAX_LENGTH} characters, with an optional "aspect_ratio".`,
      );
    }
    prompt = parsed.data.prompt;
    aspectRatio = parsed.data.aspect_ratio;
    request = { prompt, ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}) };
  } else {
    const parsed = EditImageInputSchema.safeParse(args);
    if (!parsed.success) {
      return refused(
        `${EDIT_IMAGE_TOOL_NAME} needs a non-empty "prompt" of at most ${IMAGE_TOOL_PROMPT_MAX_LENGTH} characters, and "image_asset_id" when given must be an asset_id from an earlier image result.`,
      );
    }
    const source = await editSource(context, parsed.data.image_asset_id);
    if (!source) {
      return refused(
        'There is no image to change: the user attached none to this message and none was made earlier in this conversation. Ask the user to attach the image.',
      );
    }
    prompt = parsed.data.prompt;
    request = { prompt, operation: 'edit', provider: EDIT_PROVIDER, source_image: source };
  }
  if (context.conversationId) request['conversation_id'] = context.conversationId;

  const { status, payload } = await runImagePipeline(context, surface, request);
  if (!payload.success) {
    return refused(
      `The image was not made: ${failureMessage(payload)} Tell the user why in a sentence and do not describe an image that was not made.`,
      WITHDRAWN_STATUSES.has(status),
    );
  }

  const images = deliveredImages(payload);
  const card =
    images.length > 0
      ? imageCard(context, toolName, {
          operation,
          prompt,
          images,
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(payload.catalog_model ? { model: payload.catalog_model } : {}),
        })
      : null;
  if (!card) {
    return refused(
      "The image was made and saved to the user's Library, but it could not be shown in this chat. Tell the user it is in their Library.",
    );
  }

  const ids = images.map((image) => image.assetId).join(', ');
  const made = operation === 'generate' ? 'Created' : 'Edited';
  return {
    ok: true,
    card,
    content: `${made} ${images.length === 1 ? 'the image' : `${images.length} images`} and showed ${images.length === 1 ? 'it' : 'them'} to the user in the chat (asset_id ${ids}). Do not repeat a link or describe the image at length; reply in a sentence or two.`,
  };
}
